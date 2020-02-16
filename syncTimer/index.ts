import axios from 'axios'
import * as cheerio from 'cheerio'
import { AzureFunction } from '@azure/functions'

const FORGE_URL = 'https://bmclapi2.bangbang93.com/forge/promos'
const FABRIC_URL = 'https://meta.fabricmc.net/v2/versions'
const NEWS_URL = 'https://authentication.x-speed.cc/mcbbsNews'
const VANILLA_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'

interface ForgeVersion {
  installer: {
    md5: string
    path: string
  }
  universal: {
    md5: string
    path: string
  }
  mcversion: string
  version: string
}

const fn: AzureFunction = async ctx => {
  const time = new Date()
  ctx.log('Sync start time:', new Date().toISOString())

  ctx.log('[sync] Loading mcbbs data...')
  const $ = cheerio.load((await axios('https://www.mcbbs.net/forum.php')).data)
  ctx.bindings.mcbbsData = $('.slideshow li').map((_, { children: c }) => {
    const a = $(c[0])
    const url = a.attr('href')
    return {
      url: url.includes('mcbbs.net') ? url : 'https://www.mcbbs.net/' + URL,
      title: $(c[1]).text(),
      img: a.children('img').attr('src')
    }
  })
  ctx.log('[sync] Loaded mcbbs data')

  try {
    ctx.log('[sync] Loading news data...')
    ctx.bindings.newsData = JSON.stringify((await axios(NEWS_URL)).data.slice(0, 6))
    ctx.log('[sync] Loaded news data')
  } catch (e) {
    ctx.log.error('[sync]Fail to load news data', e)
  }

  ctx.log('[sync] Loading fabric data...')
  const { data: fabric } = await axios(FABRIC_URL)
  const fabricMap = {}
  fabric.mappings.forEach(({ gameVersion: gv, version: v }) => !(gv in fabricMap) && (fabricMap[gv] = v))
  ctx.log('[sync] Loaded fabric data')

  ctx.log('[sync] Loading forge data...')
  const { data: forge } = await axios(FORGE_URL)
  const forgeMap: Record<string, ForgeVersion> = {}
  forge.forEach(({ name, build }) => {
    if (!build) return
    const { version, mcversion, files } = build
    if (mcversion in forgeMap && !name.includes('recommended')) return
    const universal = files.find(it => it.category === 'universal' && it.format === 'jar')
    const installer = files.find(it => it.category === 'installer' && it.format === 'jar')
    if (!universal || !installer) return
    const path = `/maven/net/minecraftforge/forge/${mcversion}-${version}/forge-${mcversion}-${version}-`
    forgeMap[mcversion] = {
      mcversion,
      version,
      universal: { md5: universal.hash, path: path + 'universal.jar' },
      installer: { md5: installer.hash, path: path + 'installer.jar' }
    }
  })
  ctx.log('[sync] Loaded forge data')

  ctx.log('[sync] Loading vanilla data...')
  const { data } = await axios(VANILLA_URL)
  const result = {
    latest: {
      ...data.latest,
      fabricLoader: fabric.loader[0].version
    },
    versions: data.versions.map(({ id, type, releaseTime: time }) => {
      const ret: any = {
        id,
        type,
        time: new Date(time).valueOf(),
      }
      const fabric = fabricMap[id]
      if (fabric) ret.fabric = fabric
      const forge = forgeMap[id]
      if (forge) ret.forge = forge
      return ret
    })
  }
  try {
    ctx.bindings.vanillaData = JSON.stringify(result)
  } catch (e) {
    console.error(`Fail to assign vanillaData`)
    console.error(e)
  }
  ctx.log('[sync] Loaded vanilla data')

  const end = new Date()
  ctx.log('Sync end time:', end.toISOString())
  ctx.log('Used time:', (end.getTime() - time.getTime()) + 'ms')
}

export default fn
