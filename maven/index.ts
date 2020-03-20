import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import got from "got";
import { basename } from "path";
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
    };
}

function getResourceBuffer(path: string) {
    const url = `http://files.minecraftforge.net/maven/${path}`;
    return got(url, { encoding: null }).buffer();
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const { path } = req.query;
    const head = req.method === "HEAD";
    context.log(`METHOD: ${req.method};`);
    context.log(`Query forge maven on ${path}`);
    const filename = basename(path);
    const isForge = path.startsWith("net/minecraftforge/forge/");
    if (isForge) {
        context.res = { status: 404 };
        return;
    }

    const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);
    const resourceExisted = await new Promise<boolean>((resolve, reject) => {
        serv.doesBlobExist("maven", path, (e, result) => {
            if (e) { reject(e); }
            else {
                if (typeof result === "boolean") {
                    resolve(result);
                } else {
                    resolve(result.exists);
                }
            }
        });
    });
    if (resourceExisted) {
        context.log("Resource existed");
        if (head) {
            context.res = {
                status: 200,
            };
        } else {
            context.res = {
                status: 302,
                headers: { location: `https://xmcl.blob.core.windows.net/maven/${path}` }
            };
        }
    } else {
        context.log("Cannot find resource. Cache it from forge.");
        try {
            const buf = await getResourceBuffer(path);
            context.bindings.binOut = buf;
            context.res = createResponse(filename, buf, true, true);
        } catch (e) {
            context.res = {
                status: 404,
            };
        }
    }
};

export default httpTrigger;
