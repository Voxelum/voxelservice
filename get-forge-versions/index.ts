import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as AZS from "azure-storage";
import { basename } from "path";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const { minecraft, forge, size = "200" } = req.query;
    context.log(`${req.method} ${minecraft} ${forge}`);

    const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);
    if (!minecraft && !forge) {
        context.res = {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Missing Minecraft Version" })
        };
    } else if (!!minecraft && !forge) {
        const result = await new Promise<AZS.BlobService.ListBlobsResult>((resolve, reject) => {
            serv.listBlobsSegmentedWithPrefix("forge", `versions/${minecraft}`, null, { maxResults: Number.parseInt(size, 10) }, (err, result) => {
                if (err) { reject(err); }
                else { resolve(result); }
            });
        });

        context.res = {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(result.entries.map((e) => basename(e.name))),
        };
    } else if (!minecraft && !!forge) {
        context.res = {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Missing Minecraft Version" })
        };
    } else {
        try {
            const result = await new Promise<string>((resolve, reject) => {
                serv.getBlobToText("forge", `versions/${minecraft}/${forge}`, (err, result) => {
                    if (err) { reject(err); }
                    else { resolve(result); }
                });
            });
            context.res = {
                status: 200,
                headers: {
                    "Content-Type": "application/json"
                },
                body: result,
            };
        } catch (e) {
            context.res = {
                status: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ error: "NotFound" }),
            };
        }
    }
};

export default httpTrigger;
