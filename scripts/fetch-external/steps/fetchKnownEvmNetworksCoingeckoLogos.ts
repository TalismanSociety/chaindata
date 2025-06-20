import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { EthNetworkConfig, KnownEthNetworksFileSchema } from '../../shared/schemas'
import { parseJsonFile, writeJsonFile } from '../../shared/util'
import { fetchAssetPlatforms } from '../coingecko'

/**
 * Fetches missing evm networks logos from Coingecko.
 * If an image requires an update, delete the image file so its fetched again on next run.
 */
export const fetchKnownEvmNetworksCoingeckoLogos = async () => {
  const knownEvmNetworks = parseJsonFile<EthNetworkConfig[]>(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)

  const assetPlatforms = await fetchAssetPlatforms()

  let shouldSave = false

  for (const network of knownEvmNetworks) {
    try {
      const assetPlatform = assetPlatforms.find(
        (ap) => ap.chain_identifier !== null && String(ap.chain_identifier) === network.id,
      )
      if (assetPlatform?.image.large) {
        const relativeLogoPath = `./assets/chains/known/${network.id}.webp`
        if (await ensureWebpLogoFromUrl(relativeLogoPath, assetPlatform.image.large)) {
          network.logo = relativeLogoPath
          shouldSave = true
        }
      }
    } catch (err) {
      console.warn('failed to set logo for %s - %s', network.id, network.name, err)
    }
  }

  //validateNetworks(knownEvmNetworks, KnownEthNetworkConfigDef)

  if (shouldSave) {
    await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, knownEvmNetworks, { schema: KnownEthNetworksFileSchema, format: true })
    // await writeFile(
    //   FILE_KNOWN_EVM_NETWORKS,
    //   await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
    //     ...PRETTIER_CONFIG,
    //     parser: 'json',
    //   }),
    // )
  }
}

export const ensureWebpLogoFromUrl = async (relativePath: string, url: string) => {
  if (!relativePath || !url) return false

  try {
    if (!relativePath.endsWith('.webp')) throw new Error('Filename should end with .webp')

    const logoPath = path.resolve(relativePath)
    if (existsSync(logoPath)) return true // already there, consider valid

    const responseImg = await fetch(url)
    if (!responseImg.ok) throw new Error(`${responseImg.status} - ${responseImg.statusText}`)
    const responseBuffer = await responseImg.arrayBuffer()

    const img = sharp(responseBuffer)
    const { width, height } = await img.metadata()
    if (!width || !height || width > 256 || height > 256) img.resize(256, 256, { fit: 'contain' })

    const webpBuffer = await img.webp().toBuffer()

    await writeFile(logoPath, new Uint8Array(webpBuffer))

    return true
  } catch (err) {
    console.warn('Failed to download %s: %s', (err as Error).message)
    return false
  }
}
