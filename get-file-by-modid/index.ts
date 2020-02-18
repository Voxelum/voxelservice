import { AzureFunction, Context, HttpRequest } from "@azure/functions"

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, metaIn: string): Promise<void> {
    if (metaIn) {
        const metadata = JSON.parse(metaIn);
        const { project, file } = metadata.curseforge;
        context.res = {
            status: 301,
            headers: {
                "Location": `https://voxelauncher.blob.core.windows.net/curseforge/${project}/${file}`,
            },
        }
    } else {
        context.res = {
            status: 404,
        };
    }
};

export default httpTrigger;
