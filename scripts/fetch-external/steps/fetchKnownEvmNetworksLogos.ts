import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE } from '../../shared/constants'
import { getConsolidatedKnownEthNetworks } from '../../shared/getConsolidatedEthNetworksOverrides'
import { parseJsonFile } from '../../shared/parseFile'
import { KnownEthNetworkIcon, KnownEthNetworkIconsFileSchema } from '../../shared/schemas/KnownEthNetworkIconCache'
import { writeJsonFile } from '../../shared/writeFile'

// IPFS hashes that cant be found on github
const KNOWN_UNAVAILABLE_IPFS_HASHES: string[] = [
  'QmbU86AmMYhDTwDzJWLtrLAURqepXinJbVhXUJq5BaWqCp',
  'bafkreifpbnvzcnl3badp6uig64fxxnf5tquw2ujyxqa5r2r36wuwd3yo5m',
  'bafkreiehdja4bvfvcagywn32zj6rvc5eicnwsdtvrsgwil52y4palgtnrq',
  'bafkreib5kb73tb5fdvikhxe7nlnf4mmlfcfpsslalaplqfihypcmudlal4',
  'QmW46cmj2fRUbfy3Fz9kyhm33BpXnNXZ4KW3vmK1z4Mg19',
  'bafkreibiwnnehj2j3tbla2yvvama6p7tfxvjfeqymw6ptoecoxb66glhkm',
  'QmVwYkRWgXgoYDPgBFntxWYFquKusuMMVc8TG5hrEVnXLV',
  'bafkreidgb2du22hxgj23jhyi2gipiovejn75cp6agmrklhxclu63v5pjxu',
  'bafkreifrqrkoeenmx6wja2rj5o6sj3mtn5veyvx7dis6mba4bycd7yziba',
  'bafkreid7wspejxmvsqkycru3lnfppgqre6zavkyw4vklnzrhoiycqsjzpa',
  'Qmegd2hkWhyKjyUuQQ2vMauaj3N5J89kEPqN6YNT6s64zT',
  'Qmb7FZMjv6k25vDjNwfpksjsriwrLh7PVsT93eBWzC5pCY',
  'QmTDaiJnZdwDhxLUjtx1qaNJ5VmKdK9xJoqGr7ubV1EXWW',
  'QmSxps298BQUSGihkHy3sF5k8FRX7DqgfCJfJnZgjQs7bf',
  'QmQFqkzi97UKJqmC8KRcFieCuC7KXk4G42j7j5PSF4ByWg',
  'QmYofWFKyp1ewqn1oZgU9csyfxv1D742kMqNkysx7yRzEm',
  'QmXTzkZKgRHrkxJyP9FZwHTgmk2ovC9b1vrsfhHc6jvjzF',
  'QmexytQkcC8yXzEjv3mbaZyxcy7v8vEEPmii2JZQAyGjqM',
  'QmatZHCTvWWvgLJRphDGuCUv49mWLB3VM5gzGY4uRkzZbe',
  'QmWCg8qEUtUBWvk7UMJZ7kkqg9SMs63k5Np6hfguZ7btob',
  'QmQqicvzrLaPyDzLCm4mJofTbcdH7xKJrnZYF5ptCyAoTE',
  'QmVHCbprTiCen4496EnAKedtJPxYLZXBE1gDusVa23y8kg',
  'bafkreigor7jjj7q4pczpz5wsj2fhdmkmx7o3r7yp35tcrz2verfkgucymi',
  'bafkreicy275qnnvxzjocl33blzw26orv3rkygqbb4sqwtx5bc2m3hazmre',
  'QmV14XgxgayF2Chw3HUGPNQ2iLzh9jAUxNL1LAECpZohVp',
  'Qmay8Z3yhJR4st6iAVmqTdM6nFc9zYSPq4tucDaiPheAjE',
  'bafybeigpqflfjdeovryzeqcw42chsqtoed6ommcilepi7hnarqf34rat7i',
  'bafkreiawfldsm6h56ug2md3hp6xeos3xoyqt6gnw4mepz2f6lzi6xcygli',
  'QmceqNgqPdKXQqGBs8JGLUNUTeKEi69jmQNjXjTd6zfjHP',
  'bafkreigvlt7py3h7ehy75x3w2ksmncfj57xt6giyfkhoue2vlrnfokezse',
  'QmZsXYnR5C25v99xZs7Zzk5UUwiCidpGwSzejb21M66fuT',
  'QmV34vcJ1sDpUyDJkskLv77H99Nxn8qRf6TvscJcywYwG6',
  'bafybeic234jzphpt7pg2jjosi3zohllbjhz6e5gc2snda4uzrmv6cwfbvi',
  'QmaNKnYTZRGnhzFyRYeBKwXbPQz6uDPK7PPuPGCMXSNFYW',
  'QmVAQiumxDxuEW7HdeRW8NiRKVpXVnQumwSW44Uq6py1k7',
  'bafkreienf63hqo2stiq2wqiprvhowrv3cvhjeko2u3h5vcvjby5ix6ud7a',
  'bafkreibm26mwdgzt4e3c5wr5sfee644cnjsye2mgkajhfzsyu3wglrecd4',
  'QmcLm4CYi4bEmz6C6yxNxDomXNyR9umE5P71YB7QMFkz9G',
  'QmYmx1KEFtAuCpA8VDq5B7WvbDVYGvXkZjBkmZTSQMsYCX',
]

// @dev: temporarily uncomment this to force check etag and redownload if changed
// by default, we dont want to check because it takes about 5 minutes alone
const FORCE_CACHE_CHECK = false

export const fetchKnownEvmNetworksLogos = async () => {
  const knownEthNetworks = getConsolidatedKnownEthNetworks()
  const evmNetworksIconsCache = parseJsonFile<KnownEthNetworkIcon[]>(
    FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE,
    KnownEthNetworkIconsFileSchema,
  )

  const processedIcons = new Set<string>()

  const unavailableHashes = new Set<string>()

  for (const evmNetwork of knownEthNetworks.filter((n) => n.icon && !n.logo)) {
    if (processedIcons.has(evmNetwork.icon!)) continue

    try {
      const icon = evmNetwork.icon as string
      processedIcons.add(icon)

      let cache: Partial<KnownEthNetworkIcon> | undefined = evmNetworksIconsCache.find((c) => c.icon === icon) // ?? ({ icon } as EvmNetworkIconCache)
      if (!FORCE_CACHE_CHECK && cache) continue

      // create empty cache entry
      cache = { icon }

      // Download icon definition (json with ipfs url and size)
      const responseIconJson = await fetch(
        `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/icons/${evmNetwork.icon}.json`,
        // return 304 if etag is the same, so we don't download the same file again
        { headers: cache?.etag ? { 'If-None-Match': cache.etag } : undefined },
      )
      if (!responseIconJson.ok) {
        //only 304 is expected, warn for others
        if (responseIconJson.status !== 304)
          console.warn('Failed to fetch icon json for', evmNetwork.name, evmNetwork.id, responseIconJson.status)
        continue
      }

      const etag = responseIconJson.headers.get('etag')
      const iconJson = await responseIconJson.json()

      if (!etag) {
        console.log('Skipping icon because etag is missing for', evmNetwork.name, evmNetwork.id)
        continue
      }
      cache.etag = etag

      const fileDesc =
        Array.isArray(iconJson) && (iconJson[0] as { url: string; width: number; height: number; format: string })
      if (!fileDesc) {
        console.log(
          'Skipping icon because fileDesc is not an array or has no valid entries for',
          evmNetwork.name,
          evmNetwork.id,
        )
        continue
      }

      if (!fileDesc.url.startsWith('ipfs://')) throw new Error('URL is not the expected format : ' + fileDesc.url)

      // Download the image
      const ipfsHash = fileDesc.url.substring('ipfs://'.length)

      if (KNOWN_UNAVAILABLE_IPFS_HASHES.includes(ipfsHash)) {
        continue
      } else {
        let downloadUrl = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/iconsDownload/${ipfsHash}`

        // @dev: if consistent error, copy the hash from the url and add it to KNOWN_UNAVAILABLE_IPFS_HASHES
        console.log('downloading', downloadUrl)

        const responseIconImage: Response | null = await fetch(downloadUrl)

        if (!responseIconImage.ok || !responseIconImage.body) {
          console.warn(
            `Failed to download icon for ${evmNetwork.name} (${evmNetwork.id})`,
            downloadUrl,
            responseIconImage.status,
          )
          unavailableHashes.add(ipfsHash)
          continue
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

        console.log('writing icon to', destination)
        await writeFile(destination, new Uint8Array(buffer))
        cache.path = relativePath
      }

      // if it worked, then add the entry to the cache file
      if (!evmNetworksIconsCache.includes(cache as Required<KnownEthNetworkIcon>))
        evmNetworksIconsCache.push(cache as Required<KnownEthNetworkIcon>)

      // Save cache to disk
      evmNetworksIconsCache.sort((a, b) => a.icon.localeCompare(b.icon))

      await writeJsonFile(FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, evmNetworksIconsCache, {
        schema: KnownEthNetworkIconsFileSchema,
      })
    } catch (err) {
      console.error(
        `Failed to update icon cache for ${evmNetwork.name} (${evmNetwork.id})`,
        (err as any).message ?? err,
      )
    }
  }

  if (unavailableHashes.size) {
    console.log('Unavailable IPFS hashes (plz update in fetchKnownEvmNetworksLogos.ts):')
    console.log(Array.from(unavailableHashes))
  }
}
