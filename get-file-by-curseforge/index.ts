import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as got from "got"
import { Forge } from "ts-minecraft";
import * as AZS from "azure-storage";

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

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, blobIn?: Buffer): Promise<void> {
    const { project, file } = req.query;
    const head = req.method === "HEAD";
    context.log(`${req.method} ${project} ${file}`);

    if (blobIn) {
        context.res = createResponse(file, blobIn, false, !head);
    } else {
        try {
            const { body } = await got.get(`https://www.curseforge.com/minecraft/mc-mods/${project}/download/${file}/file`, { encoding: null } as got.GotBodyOptions<null>);
            const buffer = body as any as Buffer;
            const metadata = await Forge.meta(buffer);
            context.res = createResponse(file, buffer, true, !head);
            context.bindings.blobOut = buffer; // cursforge project & file -> mod file
            context.bindings.metaOut = JSON.stringify(metadata); // cursforge project & file -> mod metadata

            const serv = AZS.createBlobService();

            for (const m of metadata) { // modid:version -> mod metadata with curseforge project & file
                await new Promise((resolve, reject) => {
                    serv.createBlockBlobFromText("mods", `${m.modid}/${m.version}.json`, JSON.stringify({ ...m, curseforge: { project, file } }), (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            }
        } catch (e) {
            context.log.error(e);
            context.res = {
                status: 500,
                body: !head ? JSON.stringify(e) : undefined,
            }
        }
    }
};

export default httpTrigger;
