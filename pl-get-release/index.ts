import { AzureFunction } from "@azure/functions";

interface Manifest {
    downloads: [string, string];
    asar: [string, string];
}

interface LatestManifest {
    version: string;
}

const fn: AzureFunction = async (ctx) => {
    const latest: LatestManifest = ctx.bindings.latestManifest;
    const manifest: Manifest = ctx.bindings.manifest;
    const { ext, gfw } = ctx.req.query;
    const { version } = latest;
    const { downloads, asar } = manifest;

    ctx.log(`Query version ${ext}, gfw: ${gfw}`);

    try {
        const urls = ext === "asar" ? downloads : asar;
        const location: string = gfw ? urls[0] : urls[1];
        const resolvedLocation = location.replace("{ext}", ext).replace("{version}", version);
        ctx.log(`URL: ${resolvedLocation}`);
        ctx.res = {
            code: 302,
            headers: {
                Location: resolvedLocation,
            }
        };
    } catch (e) {
        ctx.log("Error:");
        ctx.log.error(e);
        ctx.res = {
            code: 404,
        };
    }
    ctx.done(null, ctx.res);
};

export default fn;
