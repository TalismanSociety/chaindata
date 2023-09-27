import { PromisePool } from '@supercharge/promise-pool'
import { githubUnknownTokenLogoUrl } from '@talismn/chaindata-provider'
import axios from 'axios'
import { extractColors } from 'extract-colors'
import sharp from 'sharp'
import tinycolor from 'tinycolor2'

import { PROCESS_CONCURRENCY } from '../constants'
import { sharedData } from './_sharedData'

export const addThemeColors = async () => {
  const { chains, evmNetworks, userDefinedThemeColors } = sharedData

  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(chains)
    .process(async (chain, index) => {
      chain.themeColor = chain.themeColor ?? '#000000'

      const userDefined = userDefinedThemeColors.chains.get(chain.id)
      if (typeof userDefined === 'string') {
        chain.themeColor = userDefined
        return
      }

      if (typeof chain.logo === 'string') {
        console.log(`Extracting theme color from logo for chain ${index + 1} of ${chains.length} (${chain.id})`)
        chain.themeColor = (await extractDominantLogoColor('chain', chain.id, chain.logo)) ?? chain.themeColor
        return
      }
    })

  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(evmNetworks)
    .process(async (evmNetwork, index) => {
      evmNetwork.themeColor = evmNetwork.themeColor ?? '#000000'

      const userDefined = userDefinedThemeColors.evmNetworks.get(evmNetwork.id)
      if (typeof userDefined === 'string') {
        evmNetwork.themeColor = userDefined
        return
      }

      if (typeof evmNetwork.logo === 'string') {
        console.log(
          `Extracting theme color from logo for evmNetwork ${index + 1} of ${evmNetworks.length} (${evmNetwork.name})`
        )
        evmNetwork.themeColor =
          (await extractDominantLogoColor('evmNetwork', evmNetwork.id, evmNetwork.logo)) ?? evmNetwork.themeColor
        return
      }
    })
}

const extractDominantLogoColor = async (entityType: string, entityId: string, logoUrl: string) => {
  if (logoUrl === githubUnknownTokenLogoUrl) return '#505050'

  try {
    const resp = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    })
    if (resp.status === 200) {
      const { data: svgData } = resp

      // example using @resvg/resvg-js (doesn't work with coingecko pngs)
      // const resvg = new Resvg(svgData)
      // const { pixels, width, height } = resvg.render()
      // const rawData = new Uint8ClampedArray(pixels)

      const [rawData, { width, height }] = await new Promise<[Uint8ClampedArray, sharp.OutputInfo]>((resolve, reject) =>
        sharp(Buffer.from(svgData, 'binary'))
          .toFormat('raw')
          .toBuffer((error, data, info) => {
            if (error) return reject(error)
            resolve([new Uint8ClampedArray(data.buffer), info])
          })
      )

      const colors = await extractColors(
        { data: rawData, width, height },
        {
          pixels: 10000,
          distance: 0.4,
          splitPower: 10,
          hueDistance: 0.083333333,
          saturationDistance: 0.2,
          lightnessDistance: 0.2,
        }
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
  } catch (cause) {
    const error = new Error(`Failed to extract themeColor from ${entityType} ${entityId} logo (${logoUrl})`)
    console.warn(error, String(cause))
  }
}
