/* eslint-disable @typescript-eslint/no-unused-vars */
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import got from "got";
import * as AZS from "azure-storage";
import { Forge, Fabric } from "@xmcl/mod-parser";

function createResponse(filename: string, bin: Buffer, created: boolean, body: boolean) {
    return {
        status: created ? 201 : 200,
        isRaw: true,
        body: body ? bin : undefined,
        headers: body ? {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename=${filename}`,
        } : {},
    };
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, blobIn?: Buffer): Promise<void> {
    const { project, file } = req.query;
    const head = req.method === "HEAD";
    context.log(`Query ${req.method} project=${project} file=${file}`);

    if (blobIn) {
        context.log(`Found file project=${project} file=${file}`);
        context.res = createResponse(file, blobIn, false, !head);
    } else {
        try {
            context.log(`Not Found for project=${project} file=${file}. Download a new one`);
            const url = await got.get(`https://addons-ecs.forgesvc.net/api/v2/addon/${project}/file/${file}/download-url`).text()
            const buffer = await got.get(url, { responseType:'buffer' }).buffer();
            const metadata = await Forge.readModMetaData(buffer);
            context.log(JSON.stringify(metadata, null, 4));

            const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);
            for (const m of metadata) { // modid:version -> mod metadata with curseforge project & file
                await new Promise((resolve, reject) => {
                    context.log(`Store ${project}/${file} -> ${m.modid}/${m.version}.json.`);
                    serv.createBlockBlobFromText("mods", `${m.modid}/${m.version}.json`, JSON.stringify({ ...m, curseforge: { project, file } }), (err, result) => {
                        if (err) { reject(err); }
                        else { resolve(result); }
                    });
                });
            }

            context.res = createResponse(file, buffer, true, !head);
            context.bindings.blobOut = buffer; // cursforge project & file -> mod file
            context.bindings.metaOut = JSON.stringify(metadata); // cursforge project & file -> mod metadata
        } catch (e) {
            context.log.error("Error");
            context.log.error(e);
            context.res = {
                status: 500,
                body: !head ? JSON.stringify(e) : undefined,
            };
        }
    }
};

export default httpTrigger;
