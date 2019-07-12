import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as got from "got"
import * as AZS from "azure-storage";
import { AnnotationVisitor, ClassReader, ClassVisitor, Opcodes } from "java-asm";
import * as JSZip from 'jszip';
class AVisitor extends AnnotationVisitor {
    constructor(readonly map: { [key: string]: any }) { super(Opcodes.ASM5); }
    public visit(s: string, o: any) {
        this.map[s] = o;
    }
}
class KVisitor extends ClassVisitor {
    public fields: any = {};
    private className: string = "";
    public constructor(readonly map: { [key: string]: any }) {
        super(Opcodes.ASM5);
    }
    visit(version: number, access: number, name: string, signature: string, superName: string, interfaces: string[]): void {
        this.className = name;
    }
    public visitField(access: number, name: string, desc: string, signature: string, value: any) {
        if (this.className === "Config") {
            this.fields[name] = value;
        }
        return null;
    }

    public visitAnnotation(desc: string, visible: boolean): AnnotationVisitor | null {
        if (desc === "Lnet/minecraftforge/fml/common/Mod;" || desc === "Lcpw/mods/fml/common/Mod;") { return new AVisitor(this.map); }
        return null;
    }
}

function createResponse(bin: string, created: boolean, body: boolean) {
    return {
        status: created ? 201 : 200,
        body: body ? bin : undefined,
        headers: body ? {
            "Content-Type": "application/json",
        } : {},
    }
}
async function asmMetaData(zip: JSZip, modidTree: any) {
    for (const key in zip.files) {
        if (key.endsWith(".class")) {
            const data = await zip.files[key].async("nodebuffer");
            const metaContainer: any = {};
            const visitor = new KVisitor(metaContainer);
            new ClassReader(data).accept(visitor);
            if (Object.keys(metaContainer).length === 0) {
                if (visitor.fields && visitor.fields.OF_NAME) {
                    metaContainer.modid = visitor.fields.OF_NAME;
                    metaContainer.name = visitor.fields.OF_NAME;
                    metaContainer.mcversion = visitor.fields.MC_VERSION;
                    metaContainer.version = `${visitor.fields.OF_EDITION}_${visitor.fields.OF_RELEASE}`;
                    metaContainer.description = "OptiFine is a Minecraft optimization mod. It allows Minecraft to run faster and look better with full support for HD textures and many configuration options.";
                    metaContainer.authorList = ["sp614x"];
                    metaContainer.url = "https://optifine.net";
                    metaContainer.isClientOnly = true;
                }
            }
            const modid = metaContainer.modid;
            let modMeta = modidTree[modid];
            if (!modMeta) {
                modMeta = {};
                modidTree[modid] = modMeta;
            }

            for (const propKey in metaContainer) {
                modMeta[propKey] = metaContainer[propKey];
            }
        }
    }
}

async function jsonMetaData(zip: JSZip, modidTree: any) {
    try {
        const meta = await zip.file("mcmod.info").async("nodebuffer").then((buf) => JSON.parse(buf.toString().trim()));
        if (meta instanceof Array) {
            for (const m of meta) { modidTree[m.modid] = m; }
        } else {
            modidTree[meta.modid] = meta;
        }
    } catch (e) { }
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, metaIn?: string): Promise<void> {
    const { project, file } = req.query;
    const head = req.method === "HEAD";
    context.log(`${req.method} ${project} ${file}`);

    if (metaIn) {
        context.log("Exists");
        context.res = createResponse(metaIn, false, !head);
    } else {
        try {
            context.log("Download new");
            const { body } = await got.get(`https://www.curseforge.com/minecraft/mc-mods/${project}/download/${file}/file`, { encoding: null } as got.GotBodyOptions<null>);
            const buffer = body as any as Buffer;

            const zip = await JSZip.loadAsync(buffer);
            const tree = {};
            await jsonMetaData(zip, tree);
            await asmMetaData(zip, tree);
            const modids = Object.keys(tree);
            if (modids.length === 0) { throw { type: "NonmodTypeFile" }; }
            const metadata = modids.map((k) => tree[k])
                .filter((m) => m.modid !== undefined);
            context.res = createResponse(JSON.stringify(metadata), true, !head);
            context.bindings.metaOut = JSON.stringify(metadata); // cursforge project & file -> mod metadata

            const serv = AZS.createBlobService(process.env.AzureWebJobsStorage);

            await Promise.all(metadata.map(m =>  // modid:version -> mod metadata with curseforge project & file
                new Promise((resolve, reject) => {
                    serv.createBlockBlobFromText("mods", `${m.modid}/${m.version}.json`, JSON.stringify({ ...m, curseforge: { project, file } }), (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                })
            ));
        } catch (e) {
            context.log.error("Error");
            context.log.error(e);
            context.res = {
                status: 500,
                body: !head ? JSON.stringify(e) : undefined,
            }
        }
    }
};

export default httpTrigger;
