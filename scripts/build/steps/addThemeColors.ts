import { Logger } from '@subsquid/logger'
import { BlockHandlerContext } from '@subsquid/substrate-processor'
import axios from 'axios'
import { extractColors } from 'extract-colors'
import sharp from 'sharp'
import tinycolor from 'tinycolor2'
import { EntityManager } from 'typeorm'

import { Chain, EvmNetwork, Token } from '../model'
import { githubChainLogoUrl, githubTokenLogoUrl, githubUnknownTokenLogoUrl } from './_constants'
import { processorSharedData } from './_sharedData'

export const addThemeColors = async ({ store, log }: BlockHandlerContext<EntityManager>) => {
  const { userDefinedThemeColors } = processorSharedData

  const chains = await store.find(Chain, {
    loadRelationIds: { disableMixedMap: true },
  })
  const evmNetworks = await store.find(EvmNetwork, {
    loadRelationIds: { disableMixedMap: true },
  })
  const tokens = await store.find(Token, {
    loadRelationIds: { disableMixedMap: true },
  })

  for (const chain of chains) {
    let themeColor = chain.themeColor ?? '#000000'
    let userDefined = userDefinedThemeColors.chains.get(chain.id)

    if (typeof userDefined === 'string') themeColor = userDefined
    else if (typeof chain.logo === 'string')
      themeColor = (await extractDominantLogoColor(log, 'chain', chain.id, chain.logo)) ?? themeColor

    await store.update(Chain, { id: chain.id }, { themeColor })
  }

  for (const evmNetwork of evmNetworks) {
    let themeColor = evmNetwork.themeColor ?? '#000000'
    let userDefined = userDefinedThemeColors.evmNetworks.get(evmNetwork.id)

    if (typeof userDefined === 'string') themeColor = userDefined
    else if (typeof evmNetwork.logo === 'string')
      themeColor = (await extractDominantLogoColor(log, 'evmNetwork', evmNetwork.id, evmNetwork.logo)) ?? themeColor

    await store.update(EvmNetwork, { id: evmNetwork.id }, { themeColor })
  }

  for (const token of tokens) {
    const data = token.data as { logo?: string; themeColor?: string }

    let themeColor = data.themeColor ?? '#000000'
    let userDefined = userDefinedThemeColors.tokens.get(token.id)

    if (typeof userDefined === 'string') themeColor = userDefined
    else if (typeof data.logo === 'string')
      themeColor = (await extractDominantLogoColor(log, 'token', token.id, data.logo)) ?? themeColor

    data.themeColor = themeColor

    await store.update(Token, { id: token.id }, { data })
  }
}

const extractDominantLogoColor = async (log: Logger, entityType: string, entityId: string, logoUrl: string) => {
  if (logoUrl === githubUnknownTokenLogoUrl) return '#505050'
  if (
    logoUrl === githubChainLogoUrl('karura') ||
    logoUrl === githubChainLogoUrl('karura-testnet') ||
    logoUrl === githubTokenLogoUrl('kar')
  )
    return '#f93d43'

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
    log.warn(error, String(cause))
  }
}
