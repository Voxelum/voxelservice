/* eslint-disable @typescript-eslint/camelcase */
import { AzureFunction, HttpRequest } from "@azure/functions";
import { lt } from "semver";

const DEFAULT = {
    version: "0.0.0",
    java: {
        windows: {
            x86: {
                hash: "5cc3bd6ce3654f7752b768cc4b819bf69254ebe6",
                urls: [
                    "https://dl.pl.apisium.cn/download/java/java1.8.0_51-win32-x86.zip",
                    "https://github.com/Apisium/JavaMirror/releases/download/1.8.0_51/java1.8.0_51-win32-x86.zip",
                ]
            },
            x64: {
                hash: "b3135f7f5e34fac3b3f1bd6f8a1a3b3f7c57babd",
                urls: [
                    "https://dl.pl.apisium.cn/download/java/java1.8.0_51-win32-x64.zip",
                    "https://github.com/Apisium/JavaMirror/releases/download/1.8.0_51/java1.8.0_51-win32-x64.zip",
                ]
            }
        }
    },
    exeUrls: [
        "https://dl.pl.apisium.cn/download/pl/{version}/PureLauncher-v{version}.exe",
        "https://github.com/Apisium/PureLauncher/releases/download/{version}/pure-launcher-{version}.exe",
    ],
    asarUrls: [
        "https://dl.pl.apisium.cn/download/pl/{version}/PureLauncher-v{version}.asar",
        "https://github.com/Apisium/PureLauncher/releases/download/{version}/app.asar",
    ],
    launchingImage: [
        "https://dl.pl.apisium.cn/download/image/launching.webp",
        "https://github.com/Apisium/PureLauncherOfficialWebsite/releases/download/0.0.0/launching.webp",
    ],
    launchingImageSha1: "d47c0f93bdcd2096fba011436baf4c2bcd1f2a80"
};

const fn: AzureFunction = (ctx, req: HttpRequest, pureLauncherMetadata = JSON.stringify(DEFAULT)) => {
    if (req.body.token !== process.env.PURE_LAUNCHER_TOKEN) {
        ctx.res = { success: false, error: "Token is wrong!" };
        return;
    }
    const data = JSON.parse(pureLauncherMetadata);
    const version = req.body.version;
    if (!version || lt(version, data.version)) {
        ctx.res = { success: false, error: "Version is wrong!" };
        return;
    }
    try {
        const json = { ...DEFAULT, version };
        ctx.bindings.pureLauncherMetadata = JSON.stringify(json);
        ctx.res = { body: { success: true } };
    } catch (e) {
        console.error("Fail to assign vanillaData");
        console.error(e);
        ctx.res = { success: false, error: "Fail to assign pureLauncherMetadata!" };
    }
};

export default fn;
