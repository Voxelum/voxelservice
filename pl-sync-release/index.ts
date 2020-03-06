/* eslint-disable @typescript-eslint/no-unused-vars */
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import got from "got";
import { Client, SFTPWrapper } from "ssh2";
import { pipeline, finished } from "stream";
import { promisify } from "util";

interface GHReleases {
    body: string;
    name: string;
    assets: {
        name: string;
        browser_download_url: string;
    }[];
}

function getDestPath(version: string, a: GHReleases["assets"][number]) {
    return `/var/www/download/pl/${version}/${a.name}`;
}

const finishedStream = promisify(finished);

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, blobIn?: Buffer): Promise<void> {
    const { ref, token } = req.query;
    if (token !== process.env.PL_RELEASE_TOKEN) {
        context.res = {
            status: 400,
        };
        return;
    }
    context.log(`${req.method} ${ref}`);

    const gh = got.extend({
        host: "https://api.github.com",
    });

    const version = ref.substring("refs/tags/".length);

    const result: GHReleases = await gh(`/repos/Apisium/PureLauncher/releases/tags/${version}`).json();

    const client = new Client();
    client.connect({
        host: process.env.SFTP_IP,
        username: process.env.SFTP_USERNAME,
        password: process.env.SFTP_PASSWORD,
    });
    await new Promise((resolve) => { client.on("ready", resolve); });
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => { client.sftp((err, sftp) => { if (err) { reject(err); } else { resolve(sftp); } }); });
    await Promise.all(result.assets.map(async (a) => {
        const stream = pipeline(
            got.stream(a.browser_download_url),
            sftp.createWriteStream(getDestPath(result.name, a)),
        );
        return finishedStream(stream);
    }));

    context.res = {
        status: 200,
    };
};

export default httpTrigger;
