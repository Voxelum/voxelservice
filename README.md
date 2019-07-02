# Voxel Services

Provide some service for two purpose.

1. Pretty **SLOW** download speed in China mainland on curseforge, and JRE (bangbang API is broken)
2. Query mod file & curseforge project by `modid:version`

*This server is curretly hosted on azure Asia-East*

## API

Base url is `http://voxelauncher.azurewebsites.net/api/v1` for version 1.

### Get Curseforge File

#### By Project Id & File Id

GET `http://voxelauncher.azurewebsites.net/api/v1/curseforge/file/{projectId}/{fileId}`

This will first query server if we have cache the jar file.

If so, it will directly give you the jar file.

If not, it will download the mod jar file from curseforge website and read the metadata of it; then return it to you.

The status code `200` means we have cached it, and `201` means we just download it. 

##### Where is the Project Id

In project url: `https://www.curseforge.com/minecraft/mc-mods/{projectId}`

##### Where is the File Id

In download file url: `https://www.curseforge.com/minecraft/mc-mods/{projectId}/files/{fileId}`

##### Who want to use this

People live in China Mainland, and want to download curseforge file.

#### By Mod Id & Mod Version

GET `http://voxelauncher.azurewebsites.net/api/v1/mods/file/{modid}/{version}`

This will check if we have store any mod metadata json (with curseforge info) matching this.

If so, it will return the jar file according to the metadata.

If not, it will return `404`.

*Notice in current design, this only works unless someone have download the metadata by `/api/curseforge/file` or I upload the metadata manually. If nothing above happen, you won't be able to get anything.*

##### When to use this? Who cares? 

This is the case that a launcher only have the ip of a forge server. The launcher might ping the server and get the mod list from the server. The mod list encode each mod in `modid:version` format.

So, in this case, your launcher could take this info to download the mod jar to play this server.

### Get Java 

GET `http://voxelauncher.azurewebsites.net/api/v1/jre/{os}/{arch}`

The `os` can be `win` or `osx`. The `arch` can be `86` or `64`.

The download jre file is a lzma file which is identical with Mojang official source in amazon cloud.

#### Who want to use this

People live in China Mainland, and want to download jre for Minecraft in fly.

## Some Questions People Might Ask

Q. Can we get list of files for a Curseforge Project?

> No, I'm not going to implement this. The api aim to serve the case like curseforge modpack. 

Q. What if I cannot find mod jar by modid:version?

> Then you can find the curseforge project & file firstly. Then, take a query to the /curseforge/file api to get the file ready in server. This will make the modid:version work. 

Q. What if my mod is not on curseforge?

> Upload it to curseforge. This benefits people and me. OR, you have some special cases. Then, you could open an issue here and I might handle it for you.

Q. I have other suggestion to API

> Open an issue to discuss it.

