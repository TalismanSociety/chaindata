import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE } from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { KnownEthNetworkConfig, KnownEthNetworksFileSchema } from '../../shared/schemas'
import { KnownEthNetworkIcon, KnownEthNetworkIconsFileSchema } from '../../shared/schemas/KnownEthNetworkIconCache'
import { writeJsonFile } from '../../shared/writeFile'

/** Chainlist icons are available at this CDN using the chainSlug */
const CHAINLIST_ICONS_CDN = 'https://icons.llamao.fi/icons/chains/rsz_'
const CHAINLIST_ICONS_SIZE = '?w=256'

// @dev: temporarily uncomment this to force check etag and redownload if changed
// by default, we dont want to check because it takes a while
const FORCE_CACHE_CHECK = false

export const fetchKnownEvmNetworksLogos = async () => {
  const knownEthNetworks = parseJsonFile<KnownEthNetworkConfig[]>(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)
  const evmNetworksIconsCache = parseJsonFile<KnownEthNetworkIcon[]>(
    FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE,
    KnownEthNetworkIconsFileSchema,
  )

  const processedIcons = new Set<string>()
  const failedNetworks: Array<{ id: string; name: string; reason: string }> = []

  for (const evmNetwork of knownEthNetworks.filter((n: KnownEthNetworkConfig) => n.chainSlug && !n.logo)) {
    const chainSlug = evmNetwork.chainSlug!
    if (processedIcons.has(chainSlug)) continue

    try {
      processedIcons.add(chainSlug)

      let cache: Partial<KnownEthNetworkIcon> | undefined = evmNetworksIconsCache.find((c) => c.icon === chainSlug)
      if (!FORCE_CACHE_CHECK && cache) continue

      // create empty cache entry
      cache = { icon: chainSlug }

      // Chainlist icons are available via llamao.fi CDN
      const iconUrl = `${CHAINLIST_ICONS_CDN}${chainSlug}.jpg${CHAINLIST_ICONS_SIZE}`

      // Fetch the icon with conditional request if we have an etag
      const response = await fetch(iconUrl, {
        headers: cache?.etag ? { 'If-None-Match': cache.etag } : undefined,
      })

      if (!response.ok) {
        if (response.status !== 304) {
          failedNetworks.push({
            id: evmNetwork.id,
            name: evmNetwork.name ?? chainSlug,
            reason: `${response.status}`,
          })
        }
        continue
      }

      const etag = response.headers.get('etag')
      if (!etag) {
        console.log('Skipping icon because etag is missing for', evmNetwork.name, evmNetwork.id)
        continue
      }
      cache.etag = etag

      const buffer = await response.arrayBuffer()

      // Convert to webp and resize if needed
      const img = sharp(Buffer.from(buffer))
      const metadata = await img.metadata()
      if ((metadata.height ?? 0) > 256 || (metadata.width ?? 0) > 256) {
        img.resize(256, 256, { fit: 'contain' })
      }
      const webpBuffer = await img.webp().toBuffer()

      const filename = `${chainSlug}.webp`
      const relativePath = `./assets/chains/known/${filename}`
      const destination = path.resolve(relativePath)

      console.log('writing icon to', destination)
      await writeFile(destination, new Uint8Array(webpBuffer))
      cache.path = relativePath

      // if it worked, then add the entry to the cache file
      if (!evmNetworksIconsCache.includes(cache as Required<KnownEthNetworkIcon>))
        evmNetworksIconsCache.push(cache as Required<KnownEthNetworkIcon>)

      // Save cache to disk
      evmNetworksIconsCache.sort((a, b) => a.icon.localeCompare(b.icon))

      await writeJsonFile(FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, evmNetworksIconsCache, {
        schema: KnownEthNetworkIconsFileSchema,
      })
    } catch (err) {
      failedNetworks.push({
        id: evmNetwork.id,
        name: evmNetwork.name ?? chainSlug,
        reason: (err as Error).message ?? String(err),
      })
    }
  }

  if (failedNetworks.length) {
    console.log(`Failed to fetch icon for ${failedNetworks.length} networks:`)
    for (const { id, name, reason } of failedNetworks) {
      console.log(`Failed to fetch icon for ${name} ${id} ${reason}`)
    }
  }
}
