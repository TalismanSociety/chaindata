import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import prettier from 'prettier'
import sharp from 'sharp'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, PRETTIER_CONFIG } from '../../shared/constants'
import { ConfigEvmNetwork, EvmNetworkIconCache } from '../../shared/types'

// IPFS hashes that cant be found on github
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
  'QmRvHRuhfQgDRyGgt6vCoHqjZW2Dir7siowYnBpR5BRSej',
  'qmxhs7fvjanzwm14vjpbnmklre32gsiy9chsarrnbtfa1n',
  'QmVgFqXA3kkCrVYGcWFF7Mhx8JUSe9vSCauNamuKWSvCym',
  'QmdWZ1frB47fr3tw31xE68C2Vocaw5Ef53LQ5WDNdNnNyG',
  'QmeucqvcreQk8nnSRUiHo3QTvLoYYB7shJTKXj5Tk6BtWi',
  'QmPgpWfGsAZ5UHekWFR8rioadVe3Wox8idFyeVxuv9N4Vo',
  'QmahJhdaLfGwBStQ9q9K4Mc73vLNqFV1otWCsT2ZKsMavv',
  'QmUTDMvoY7JgDs9sZuuBhsyJz6B2dNfc5jj6xUj355be2C',
  'QmY4vp1mJoGpUiuWbRVenNiDZC17wSyyueGPK9A5QyK1M2',
  'QmSj6SSWmBiRjnjZQPb17kvhGDmB9xAGRkG13RwPuXLTCT',
  'QmYV6beVVg3iS9RGPno7GAASpgjyBDoKmWGUcvAKe2nXWK',
  'QmNMuNBwg9opKvsnrDaoYBP743LeddeooQupVYjpBXf7d7',
  'QmWcaVLcPYBxi76HYJc4qudLJwXtfNCDJieLHAs632jMEA',
  'QmdDeCjjYSG5FEAxzAuERXnS3AbeZvqSFVTn9x7UbrQeuT',
  'QAZt75XixnEtFzqHTrJa8kJkV4ccXWaXqeMeqM8BcBomQc',
  'QmcwGGWyemrFUZPriS3PqxLUoT7vdtS7FqNY5fAaoTG27Q',
  'Qmbk23C5vXpGBfq8SuPXR1PrfWER2m8w6LGqBkhXAvxia9',
  'QmTEnk2fosqbY6HQW5vySrLGbopJfeni9ThZ6R9sVefbnq',
  'QmRwyxmvNEJBJwXDFAAGSaoUqTLjdthwzhKx3rjyKRR6ZL',
  'Qmbk23C5vZpGBfq8SuPXR1PrfWER2m8w6LGqBkhXAvxia1',
  'QmAbz7VfGvf6NVHezuBy5HpJTCi1gEshBxxdDdfVXNQ8Bt',
  'QmRb2rWanyBTKS5KyrmrbXPNy9zovpxfLRxz9FPPiuRgfg',
  'QmbySJWaSQxzL3F4zvpKYaNvMjHsX2qUyWTv2kpitq9dW8',
  'QmSuVbbBRAnquu3EsbsFgEMNgM8bTpiVKns2CCBVM6c2aJ',
  'QmTY2Z7AEEWxmzQyh7DFG8fyR3w6Y166GDJfi6o3xo6GgV',
  'QmeGtXdTHHMnf6rWUWFcefMGaVp7dJ6SWNgxgbVgm9YHTZ',
  'QmdwQDr6vmBtXmK2TmknkEuZNoaDqTasFdZdu3DRw8b2ws',
  'QmbgWUbQMgc4ASEjN7HcNU7yfgPahYaTeogNLfzvWmcYEJ',
  'QmaNywdCUrHoe3grk3hhHXrsTgc3tHVpt2ZaoRYoNkgEvc',
  'bafybeiaqaphacy5swvtyxw56ma5f5iewjcqspbgxr5l6ln2433liyw2djy',
  'bafybeiaqaphacy5swvtyxw56ma5f5iewjcqspbgxr5l6ln2433liyw2djy',
]

// @dev: temporarily uncomment this to force check etag and redownload if changed
// by default, we dont want to check because it takes about 5 minutes alone
const FORCE_CACHE_CHECK = false

export const fetchKnownEvmNetworksLogos = async () => {
  const knownEvmNetworks = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8')) as ConfigEvmNetwork[]
  const evmNetworksIconsCache = JSON.parse(
    await readFile(FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, 'utf-8'),
  ) as EvmNetworkIconCache[]

  const processedIcons = new Set<string>()

  for (const evmNetwork of knownEvmNetworks.filter((n) => n.icon && !n.logo)) {
    if (processedIcons.has(evmNetwork.icon!)) continue

    try {
      const icon = evmNetwork.icon as string
      processedIcons.add(icon)

      const cache = evmNetworksIconsCache.find((c) => c.icon === icon) ?? ({ icon } as EvmNetworkIconCache)
      if (!FORCE_CACHE_CHECK && cache) continue

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
        let downloadUrl = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/iconsDoanload/${ipfsHash}`

        // @dev: if consistent error, copy the hash from the url and add it to KNOWN_UNAVAILABLE_IPFS_HASHES
        console.log('downloading', downloadUrl)

        const responseIconImage: Response | null = await fetch(downloadUrl)

        if (!responseIconImage.ok || !responseIconImage.body) {
          console.warn(
            `Failed to download icon for ${evmNetwork.name} (${evmNetwork.id})`,
            downloadUrl,
            responseIconImage.status,
          )
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

        await writeFile(destination, new Uint8Array(buffer))
        cache.path = relativePath
      }

      // if it worked, then add the entry to the cache file
      if (!evmNetworksIconsCache.includes(cache as Required<EvmNetworkIconCache>)) evmNetworksIconsCache.push(cache)

      // Save cache to disk
      evmNetworksIconsCache.sort((a, b) => a.icon.localeCompare(b.icon))
      await writeFile(
        FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE,
        await prettier.format(JSON.stringify(evmNetworksIconsCache, null, 2), {
          ...PRETTIER_CONFIG,
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
