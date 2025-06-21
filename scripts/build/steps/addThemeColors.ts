import { readFile } from 'node:fs/promises'
import { parse } from 'node:path'

import { PromisePool } from '@supercharge/promise-pool'
import { NetworkSchema } from '@talismn/chaindata-provider'
import { extractColors } from 'extract-colors'
import sharp from 'sharp'
import tinycolor from 'tinycolor2'
import { z } from 'zod/v4'

import {
  FILE_OUTPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_NETWORKS_POLKADOT,
  PROCESS_CONCURRENCY,
} from '../../shared/constants'
import { getAssetPathFromUrl, parseJsonFile, writeJsonFile } from '../../shared/util'

const DEFAULT_THEME_COLOR = '#505050'

export const addThemeColors = async () => {
  await updateNetworksFile(FILE_OUTPUT_NETWORKS_POLKADOT)
  await updateNetworksFile(FILE_OUTPUT_NETWORKS_ETHEREUM)
}

const NetworksFileSchema = z.array(NetworkSchema)

const updateNetworksFile = async (filepath: string) => {
  const networks = parseJsonFile(filepath, NetworksFileSchema)

  const results = await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(networks)
    .process(async (network, index) => {
      if (network.themeColor) return false

      try {
        network.themeColor = await extractDominantLogoColor(network.logo)
      } catch (cause) {
        console.error(`Failed to extract themeColor from network ${network.id} logo (${network.logo})`, cause)
        network.themeColor = DEFAULT_THEME_COLOR
      }

      return true
    })

  const updates = results.results.filter((result) => result === true)
  console.log(`${updates.length} theme colors were updated in ${parse(filepath).name} file.`)

  if (updates.length) await writeJsonFile(filepath, networks, { schema: NetworksFileSchema })
}

const extractDominantLogoColor = async (logoUrl: string | undefined) => {
  if (!logoUrl) return DEFAULT_THEME_COLOR

  const buffer = await readFile(getAssetPathFromUrl(logoUrl), { encoding: null })

  // example using @resvg/resvg-js (doesn't work with coingecko pngs)
  // const resvg = new Resvg(svgData)
  // const { pixels, width, height } = resvg.render()
  // const rawData = new Uint8ClampedArray(pixels)

  const [rawData, { width, height }] = await new Promise<[Uint8ClampedArray, sharp.OutputInfo]>((resolve, reject) =>
    sharp(buffer)
      .toFormat('raw')
      .toBuffer((error, data, info) => {
        if (error) return reject(error)
        resolve([new Uint8ClampedArray(data.buffer), info])
      }),
  )

  const colors = await extractColors(
    { data: rawData, width, height },
    {
      pixels: 10000,
      distance: 0.4,
      hueDistance: 0.083333333,
      saturationDistance: 0.2,
      lightnessDistance: 0.2,
    },
  )

  const mostReadable =
    colors
      .map((color) => color.hex)
      // exclude shades of grey
      .filter((color) => tinycolor(color).toHsv().s !== 0)
      // compare to the background color used in the portfolio behind these colors
      .sort((a, b) => tinycolor.readability('#1a1a1a', b) - tinycolor.readability('#1a1a1a', a))[0] ?? '#ffffff'

  return mostReadable
}
