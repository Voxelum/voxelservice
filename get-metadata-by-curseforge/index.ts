/* eslint-disable @typescript-eslint/no-unused-vars */
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import got from "got";
import * as AZS from "azure-storage";
import { Forge } from "@xmcl/mod-parser";

function createResponse(bin: string, created: boolean, body: boolean) {
    return {
        status: created ? 201 : 200,
        body: body ? bin : undefined,
        headers: body ? {
            "Content-Type": "application/json",
        } : {},
    };
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, metaIn?: string): Promise<void> {
    const { project, file } = req.query;
    const head = req.method === "HEAD";
    context.log(`Query ${req.method} project=${project} file=${file}`);

    if (metaIn) {
        context.log(`Found file project=${project} file=${file}`);
        context.res = createResponse(metaIn, false, !head);
    } else {
        try {
            context.log(`Not Found for project=${project} file=${file}. Download a new one`);
            const buffer = await got.get(`https://www.curseforge.com/minecraft/mc-mods/${project}/download/${file}/file`, { encoding: null }).buffer();

            const metadata = await Forge.readModMetaData(buffer);
            context.log(JSON.stringify(metadata, null, 4));
            const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);

            await Promise.all(metadata.map((m) =>  // modid:version -> mod metadata with curseforge project & file
                new Promise((resolve, reject) => {
                    serv.createBlockBlobFromText("mods", `${m.modid}/${m.version}.json`, JSON.stringify({ ...m, curseforge: { project, file } }), (err, result) => {
                        if (err) { reject(err); }
                        else { resolve(result); }
                    });
                })
            ));

            context.res = createResponse(JSON.stringify(metadata), true, !head);
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
