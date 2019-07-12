import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as got from "got"
import * as AZS from "azure-storage";
import * as JSZip from 'jszip';
import { basename } from "path";
import * as crypto from "crypto";
import * as stream from "stream";

function createResponse(filename: string, bin: Buffer, created: boolean, body: boolean) {
    return {
        status: created ? 201 : 200,
        isRaw: true,
        body: body ? bin : undefined,
        headers: body ? {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename=${filename}`,
        } : {},
    }
}

function createReadable(buffer: Buffer) {
    let offset = 0;
    return new stream.Readable({
        read(size) {
            if (offset + size > buffer.length) {
                this.push(null);
                return;
            }
            this.push(buffer.slice(offset, offset + size));
            offset += size;
        }
    });
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, blobIn?: Buffer): Promise<void> {
    const { path } = req.query;
    const head = req.method === "HEAD";
    context.log(`${req.method} ${path}`);
    const file = basename(path);
    const isForge = path.startsWith("net/minecraftforge/forge/");

    async function cacheData(serv: AZS.BlobService, zip: JSZip, id: string, side: "client" | "server") {
        const lzm = await zip.file(`data/${side}.lzma`).async("nodebuffer");
        const hash = crypto.createHash("sha256").update(lzm).digest("hex");
        const exists = await new Promise((resolve, reject) => {
            serv.doesBlobExist("forge", `data/${hash}`, (e, r) => {
                if (e) { resolve(e) }
                else { resolve(r.exists); }
            })
        })
        if (!exists) {
            await new Promise((resolve, reject) => {
                serv.createBlockBlobFromStream("forge", `data/${hash}`,
                    createReadable(lzm),
                    lzm.length,
                    (err) => {
                        if (err) { reject(err) }
                        else { resolve(); }
                    }
                );
            });
        }
        await new Promise((resolve, reject) => {
            serv.createBlockBlobFromText("forge", `data/${side}/${id}`, hash, (err) => {
                if (err) { reject(err); }
                else { resolve(); }
            });
        })
    }

    if (blobIn) {
        context.log("Exists");
        context.res = createResponse(file, blobIn, false, !head);
    } else {
        try {
            if (isForge) {
                context.log("Download new forge");
                const isInstaller = path.endsWith("installer.jar");
                const isUniversal = path.endsWith("universal.jar");
                const url = `http://file.minecraftforge.net/maven/${path}`;
                const { body } = await got.get(url, { encoding: null } as got.GotBodyOptions<null>);
                const buffer = body as any as Buffer;

                context.res = createResponse(file, buffer, true, !head);
                context.bindings.binOut = buffer;

                if (!isUniversal && !isInstaller) return;

                const zip = await JSZip.loadAsync(buffer);
                const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);

                try {
                    const json = await zip.file("version.json").async("nodebuffer").then(b => b.toString()).then(JSON.parse);
                    const id = json.id;
                    const mcversion = json.inheritsFrom;
                    const newForge = Number.parseInt(mcversion.split(".")[1], 10) >= 13;

                    if (isInstaller && newForge) { // new forge use install profile to install, therefore cache it
                        try {
                            // cache install_profile
                            const installProfile = await zip.file("install_profile.json").async("nodebuffer").then(b => b.toString()).then(JSON.parse);
                            await new Promise((resolve, reject) => {
                                serv.createBlockBlobFromText("forge", `install_profiles/${id}`, installProfile, (err) => {
                                    if (err) { reject(err) }
                                    else { resolve() }
                                });
                            });

                            // cache data
                            cacheData(serv, zip, id, "client");
                            cacheData(serv, zip, id, "server");

                            // handle strange built-in maven things
                            const mavenThings = zip.filter((file) => file.startsWith("maven/"));
                            const buffers = await Promise.all(mavenThings.map(m => m.async("nodebuffer")));

                            for (let i = 0; i < mavenThings.length; ++i) {
                                const m = mavenThings[i];
                                const b = buffers[i];
                                await new Promise((resolve, reject) => {
                                    serv.createBlockBlobFromStream("maven", m.name.substring(m.name.indexOf("/") + 1),
                                        createReadable(b),
                                        b.length,
                                        (err) => {
                                            if (err) { reject(err) }
                                            else { resolve(); }
                                        }
                                    );
                                });
                            }
                        } catch (e) {
                            context.log.error(`Cannot extract install_profile from ${id} with path ${path}.`);
                            context.log.error(e);
                        }
                    }

                    if (!newForge && !isInstaller) { // old forge can be installed directly, add download info
                        const lib = json.libraries.find(l => l.name.startsWith("net.minecraftforge:forge"));
                        lib.downloads = {
                            artifact: {
                                size: buffer.length,
                                sha1: crypto.createHash("sha1").update(buffer).digest("hex"),
                                path,
                                url,
                            }
                        }
                    }

                    await new Promise((resolve, reject) => {
                        serv.createBlockBlobFromText("forge", `versions/${mcversion}/${id}`, JSON.stringify({ ...json }), (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    });
                } catch (e) {
                    context.log.error(`Cannot parse forge jar in path ${path}.`)
                    context.log.error(e);
                }
            } else {
                context.res = {
                    status: 404
                }
            }
        } catch (e) {
            context.log.error("Error");
            context.log.error(e);
            context.res = {
                status: 500,
                body: !head ? JSON.stringify(e) : undefined,
            }
        }
    }
};

export default httpTrigger;
