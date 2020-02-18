import { AzureFunction, HttpRequest } from "@azure/functions"
import { lt } from "semver"

const DEFAULT = {
    version: "0.0.0",
    exeUrl: "https://dl.pl.apisium.cn/download/pl/0.0.0/PureLauncher-v0.0.0.exe",
    asarUrl: "https://dl.pl.apisium.cn/download/pl/0.0.0/PureLauncher-v0.0.0.asar"
}

const fn: AzureFunction = (ctx, req: HttpRequest, pureLauncherMetadata = JSON.stringify(DEFAULT)) => {
    if (req.body.token !== process.env.PURE_LAUNCHER_TOKEN) {
        ctx.res = { success: false, error: "Token is wrong!" }
        return
    }
    const data = JSON.parse(pureLauncherMetadata)
    const version = req.body.version
    if (!version || lt(version, data.version)) {
        ctx.res = { success: false, error: "Version is wrong!" }
        return
    }
    try {
        ctx.bindings.pureLauncherMetadata = JSON.stringify({
            version,
            exeUrl: `https://dl.pl.apisium.cn/download/pl/${version}/PureLauncher-v${version}.exe`,
            asarUrl: `https://dl.pl.apisium.cn/download/pl/${version}/PureLauncher-v${version}.asar`
        })
        ctx.res = { body: { success: true } }
    } catch (e) {
        console.error("Fail to assign vanillaData")
        console.error(e)
        ctx.res = { success: false, error: "Fail to assign pureLauncherMetadata!" }
    }
}

export default fn
