import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as AZS from "azure-storage";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, mapping?: string): Promise<void> {
    const { forge } = req.query;
    context.log(`${req.method} ${forge}`);

    if (mapping) {
        context.log("Exists");
        const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);
        try {
            const exists = await new Promise<boolean | undefined>((resolve, reject) => {
                serv.doesBlobExist("forge", `data/${mapping}`, (err, r) => {
                    if (err) { reject(err); }
                    else { resolve(r.exists); }
                });
            });
            if (exists) {
                context.res = {
                    status: 302,
                    headers: {
                        Location: `https://voxelauncher.blob.core.windows.net/forge/data/${mapping}`
                    },
                };
            } else {
                context.res = {
                    status: 404,
                };
            }
        } catch (e) {
            context.log.error(e);
            context.res = {
                status: 404,
            };
        }
    } else {
        context.res = {
            status: 404,
        };
    }
};

export default httpTrigger;
