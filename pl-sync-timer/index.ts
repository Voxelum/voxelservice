import got from "got";
import urlJoin = require("url-join");
import * as cheerio from "cheerio";
import { AzureFunction } from "@azure/functions";

const FORGE_URL = "https://bmclapi2.bangbang93.com/forge/promos";
const FABRIC_URL = "https://meta.fabricmc.net/v2/versions";
const VANILLA_URL = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

interface ForgeVersion {
  installer: string;
  universal: string;
  version: string;
}

interface FabricData {
    loader: { version: string };
    mappings: Array<{
        gameVersion: string;
        version: string;
    }>;
}

interface ForgeData {
    name: string;
    build: {
        version: string;
        mcversion: string;
        files: Array<{ category: string; format: string; hash: string }>;
    };
}

interface VanillaData {
    latest: any;
    versions: Array<{ id: string; type: string; releaseTime: string }>;
}

const fn: AzureFunction = async (ctx) => {
    const time = new Date();
    ctx.log("Sync start time:", new Date().toISOString());

    ctx.log("[sync] Loading mcbbs data...");
    let $ = cheerio.load(await got("https://www.mcbbs.net/forum.php").text());
    const slides = $(".slideshow li").map((_, { children: c }) => {
        const a = $(c[0]);
        const url = a.attr("href");
        return {
            url: url.includes("mcbbs.net") ? url : urlJoin("https://www.mcbbs.net/", url),
            title: $(c[1]).text(),
            img: a.children("img").attr("src")
        };
    }).get();
    ctx.log("[sync] Loaded mcbbs data");

    ctx.log("[sync] Loaded news data");
    $ = cheerio.load(await got("https://www.mcbbs.net/forum-news-1.html").text());
    const news: Array<{ time: string; title: string; classify: string; link: string }> = [];
    $("tbody[id^=normalthread]").each((_, it) => {
        const item = $(it);
        const a = item.find("tr > th > a.xst");
        const title = a.text();
        if (title == null) { return true; }

        const span = item.find("tr > td.by > em > span");
        let time = span.html();
        if (time.includes("<span title=")) { time = span.find("span").attr("title"); }

        if (news.push({
            time,
            title: title.replace(/&amp;/g, "&"),
            classify: item.find("tr > th > em > a").text(),
            link: urlJoin("http://www.mcbbs.net/", a.attr("href"))
        }) >= 5) { return false; }
    });
    ctx.log("[sync] Loaded news data");

    try {
        ctx.bindings.mcbbsData = JSON.stringify({ slides, news });
    } catch (e) {
        console.error("Fail to assign mcbbsData");
        console.error(e);
    }

    ctx.log("[sync] Loading fabric data...");
    const fabric = await got(FABRIC_URL).json<FabricData>();
    const fabricMap = {};
    fabric.mappings.forEach(({ gameVersion: gv, version: v }) => !(gv in fabricMap) && (fabricMap[gv] = v));
    ctx.log("[sync] Loaded fabric data");

    ctx.log("[sync] Loading forge data...");
    const forge = await got(FORGE_URL).json<ForgeData[]>();
    const forgeMap: Record<string, ForgeVersion> = {};
    forge.forEach(({ name, build }) => {
        if (!build) { return; }
        const { version, mcversion, files } = build;
        if (mcversion in forgeMap && !name.includes("recommended")) { return; }
        const universal = files.find((it) => it.category === "universal" && it.format === "jar");
        const installer = files.find((it) => it.category === "installer" && it.format === "jar");
        if (!universal || !installer) { return; }
        forgeMap[mcversion] = {
            version,
            universal: universal.hash,
            installer: installer.hash
        };
    });
    ctx.log("[sync] Loaded forge data");

    ctx.log("[sync] Loading vanilla data...");
    const { latest, versions } = await got(VANILLA_URL).json<VanillaData>();
    const result = {
        latest: {
            ...latest,
            fabricLoader: fabric.loader[0].version
        },
        versions: versions.map(({ id, type, releaseTime: time }) => {
            const ret: any = { id, time: new Date(time).valueOf() };
            switch (type) {
                case "old_alpha":
                case "old_beta":
                    ret.type = "old";
                    break;
                case "release":
                    break;
                default:
                    ret.type = type;
            }
            const fabric = fabricMap[id];
            if (fabric) { ret.fabric = fabric; }
            const forge = forgeMap[id];
            if (forge) { ret.forge = forge; }
            return ret;
        })
    };
    try {
        ctx.bindings.vanillaData = JSON.stringify(result);
    } catch (e) {
        console.error("Fail to assign vanillaData");
        console.error(e);
    }
    ctx.log("[sync] Loaded vanilla data");

    const end = new Date();
    ctx.log("Sync end time:", end.toISOString());
    ctx.log("Used time:", (end.getTime() - time.getTime()) + "ms");
};

export default fn;
