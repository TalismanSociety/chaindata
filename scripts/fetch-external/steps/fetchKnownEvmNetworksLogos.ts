import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import prettier from 'prettier'
import sharp from 'sharp'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE } from '../../shared/constants'
import { ConfigEvmNetwork, EvmNetworkIconCache } from '../../shared/types'

// Dead IPFS hashes, not worth trying to download these
const KNOWN_UNAVAILABLE_IPFS_HASHES = [
  'QmcM8kHNsNYoitt5S3kLThyrKVFTZo3k2rgnume6tnNroQ',
  'QmbUcDQHCvheYQrWk9WFJRMW5fTJQmtZqkoGUed4bhCM7T',
  'Qmd7omPxrehSuxHHPMYd5Nr7nfrtjKdRJQEhDLfTb87w8G',
  'QmUVJ7MLCEAfq3pHVPFLscqRMiyAY5biVgTkeDQCmAhHNS',
  'QmaGd5L9jGPbfyGXBFhu9gjinWJ66YtNrXq8x6Q98Eep9e',
  'QmS9kDKr1rgcz5W55yCQVfFs1vRTCneaLHt1t9cBizpqpH',
  'QmXGJevyPHHKT28hDfsJ9Cq2DQ2bAavdie37MEwFQUVCQz',
  'QmXbsQe7QsVFZJZdBmbZVvS6LgX9ZFoaTMBs9MiQXUzJTw',
  'QmcM8kHNsNYoitt5S3kLThyrKVFTZo3k2rgnume6tnNroQ',
  'QmUkFZC2ZmoYPTKf7AHdjwRPZoV2h1MCuHaGM4iu8SNFpi',
  'QmatP9qMHEYoXqRDyHMTyjYRQa6j6Gk7pmv1QLxQkvpGRP',
  'QmdP1sLnsmW9dwnfb1GxAXU1nHDzCvWBQNumvMXpdbCSuz',
  'QmPtiJGaApbW3ATZhPW3pKJpw3iGVrRGsZLWhrDKF9ZK18',
  'QmbkCVC5vZpVAfq8SuPXR9PhpTRS2m8w6LGqBkhXAvmie6',
  'Qmf3GYbPXmTDpSP6t7Ug2j5HjEwrY5oGhBDP7d4TQHvGnG',
  'QmdW7XfRgeyoaHXEvXp8MaVteonankR32CxhL3K5Yc2uQM',
  'QmUU784i1ZHDNwgXvt9weZmq6YbHHkyXvuDS7r4iDzao72',
]

async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeout: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  })
  clearTimeout(id)

  return response
}

export const fetchKnownEvmNetworksLogos = async () => {
  const knownEvmNetworks = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8')) as ConfigEvmNetwork[]
  const evmNetworksIconsCache = JSON.parse(
    await readFile(FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, 'utf-8'),
  ) as EvmNetworkIconCache[]

  const processedIcons = new Set<string>()

  for (const evmNetwork of knownEvmNetworks.filter((n) => n.icon)) {
    if (processedIcons.has(evmNetwork.icon!)) continue

    try {
      const icon = evmNetwork.icon as string
      processedIcons.add(icon)

      const cache = evmNetworksIconsCache.find((c) => c.icon === icon) ?? ({ icon } as EvmNetworkIconCache)

      // Download icon definition (json with ipfs url and size)
      const responseIconJson = await fetch(
        `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/icons/${evmNetwork.icon}.json`,
        // return 304 if etag is the same, so we don't download the same file again
        { headers: cache.etag ? { 'If-None-Match': cache.etag } : undefined },
      )
      if (!responseIconJson.ok) {
        //only 304 is expected, warn for others
        if (responseIconJson.status !== 304)
          console.warn('Failed to fetch icon json for', evmNetwork.name, evmNetwork.id, responseIconJson.status)
        continue
      }

      const etag = responseIconJson.headers.get('etag')
      const iconJson = await responseIconJson.json()

      if (!etag) continue
      cache.etag = etag

      const fileDesc =
        Array.isArray(iconJson) && (iconJson[0] as { url: string; width: number; height: number; format: string })
      if (!fileDesc) continue

      if (!fileDesc.url.startsWith('ipfs://')) throw new Error('URL is not the expected format : ' + fileDesc.url)

      // Download the image
      const ipfsHash = fileDesc.url.substring('ipfs://'.length)
      if (KNOWN_UNAVAILABLE_IPFS_HASHES.includes(ipfsHash)) cache.path = './assets/chains/unknown.svg'
      else {
        let downloadUrl = `https://ipfs.io/ipfs/${ipfsHash}`
        // edge cases
        if (downloadUrl === 'https://ipfs.io/ipfs/bafybeie7jzlzlpz7c3a3oh4x5joej23dj2qf3cexmchjyc72hv3fblcaja')
          downloadUrl = 'https://ipfs.io/ipfs/bafybeie7jzlzlpz7c3a3oh4x5joej23dj2qf3cexmchjyc72hv3fblcaja/mintara.png'
        if (downloadUrl === 'https://ipfs.io/ipfs/bafybeiadlvc4pfiykehyt2z67nvgt5w4vlov27olu5obvmryv4xzua4tae')
          downloadUrl =
            'https://ipfs.io/ipfs/bafybeiadlvc4pfiykehyt2z67nvgt5w4vlov27olu5obvmryv4xzua4tae/logo-128px.png'
        if (downloadUrl === 'https://ipfs.io/ipfs/bafybeib75gwytvblyvjpfminitr3i6mpat3a624udfsqsl5nysf5vuuvie')
          downloadUrl = 'https://ipfs.io/ipfs/bafybeib75gwytvblyvjpfminitr3i6mpat3a624udfsqsl5nysf5vuuvie/bnb-icon2.png'
        if (downloadUrl === 'https://ipfs.io/ipfs/QmVb682D4mUXkKNP28xxJDNgSYbDLvEc3kVYx7TQxEa6Cw')
          downloadUrl = 'https://ipfs.io/ipfs/QmVb682D4mUXkKNP28xxJDNgSYbDLvEc3kVYx7TQxEa6Cw/zkfair.jpg'

        // @dev: if consistent error, copy the hash from the url and add it to KNOWN_UNAVAILABLE_IPFS_HASHES
        console.log('downloading', downloadUrl)

        let responseIconImage: Response | null = null
        try {
          responseIconImage = await fetchWithTimeout(downloadUrl, undefined, 10_000)
        } catch (err1) {
          // ignore
        }

        if (!responseIconImage || !responseIconImage.ok || !responseIconImage.body) {
          // some don't exist on ipfs.io but exist on cloudflare-ipfs.com
          const alternateDownloadUrl = downloadUrl.replace('https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/')
          console.log('downloading', alternateDownloadUrl)
          responseIconImage = await fetchWithTimeout(alternateDownloadUrl, undefined, 10_000)
          if (!responseIconImage.ok || !responseIconImage.body) {
            console.warn(
              `Failed to download icon for ${evmNetwork.name} (${evmNetwork.id})`,
              downloadUrl,
              responseIconImage.status,
            )
            continue
          }
        }

        let buffer: any = await responseIconImage.arrayBuffer()

        if (fileDesc.format !== 'svg') {
          const img = sharp(buffer)
          // most images are huge, resize them to 256x256 which should be sufficient for the wallet
          if (fileDesc.height > 256 || fileDesc.width > 256) img.resize(256, 256, { fit: 'contain' })
          buffer = await img.webp().toBuffer()
        }

        const filename = `${icon}.${fileDesc.format === 'svg' ? 'svg' : 'webp'}`
        const relativePath = `./assets/chains/known/${filename}`
        const destination = path.resolve(relativePath)

        await writeFile(destination, Buffer.from(buffer))
        cache.path = relativePath
      }

      // if it worked, then add the entry to the cache file
      if (!evmNetworksIconsCache.includes(cache as Required<EvmNetworkIconCache>)) evmNetworksIconsCache.push(cache)

      // Save cache to disk
      evmNetworksIconsCache.sort((a, b) => a.icon.localeCompare(b.icon))
      await writeFile(
        FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE,
        await prettier.format(JSON.stringify(evmNetworksIconsCache, null, 2), {
          parser: 'json',
        }),
      )
    } catch (err) {
      console.error(
        `Failed to update icon cache for ${evmNetwork.name} (${evmNetwork.id})`,
        (err as any).message ?? err,
      )
    }
  }
}
