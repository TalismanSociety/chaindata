import { existsSync } from 'node:fs'

import fromPairs from 'lodash/fromPairs'

import { assetPathPrefix, getAssetUrlFromPath } from './assetUrl'
import { FILE_INPUT_COINGECKO_OVERRIDES } from './constants'
import { parseYamlFile } from './parseFile'
import { CoingeckoOverridesFileSchema } from './schemas/CoingeckoOverrides'

export const getTokenLogoUrl = (
  logo: string | undefined,
  coingeckoId: string | undefined,
  symbol: string | undefined,
) => {
  // if logo is set and is not a relative path, assume it's a good full url
  if (logo && !logo.startsWith(assetPathPrefix)) return logo

  // if logo is relative and exists, perfect
  if (logo && logo.startsWith(assetPathPrefix) && existsSync(logo)) return getAssetUrlFromPath(logo)

  // fallback to coingeckoId if provided
  const cgPath = getCoingeckoTokenAssetPath(coingeckoId)
  if (cgPath) return getAssetUrlFromPath(cgPath)

  // try to find a match in /assets/tokens/ folder
  if (symbol)
    for (const ext of ['svg', 'webp', 'png']) {
      const symbolPath = `./assets/tokens/${symbol.toLowerCase()}.${ext}`
      if (existsSync(symbolPath)) return getAssetUrlFromPath(symbolPath)
    }

  return undefined
}

let COINGECKO_LOGO_OVERRIDES: Record<string, string | undefined> | null = null

const getCoingeckoTokenAssetPath = (coingeckoId: string | undefined) => {
  if (!coingeckoId) return undefined

  if (COINGECKO_LOGO_OVERRIDES === null) {
    const overrides = parseYamlFile(FILE_INPUT_COINGECKO_OVERRIDES, CoingeckoOverridesFileSchema)
    COINGECKO_LOGO_OVERRIDES = fromPairs(overrides.map((override) => [override.id, override.logo]))
  }

  if (COINGECKO_LOGO_OVERRIDES[coingeckoId] && existsSync(COINGECKO_LOGO_OVERRIDES[coingeckoId]))
    return COINGECKO_LOGO_OVERRIDES[coingeckoId]

  const cgPath = `./assets/tokens/coingecko/${coingeckoId}.webp`
  if (existsSync(cgPath)) return cgPath

  return undefined
}

export const getNetworkLogoUrl = (
  logo: string | undefined,
  id: string | undefined,
  nativeToken: {
    logo?: string
    symbol?: string
    coingeckoId?: string
  },
) => {
  // if logo is set and is not a relative path, assume it's a good full url
  if (logo && !logo.startsWith(assetPathPrefix)) return logo

  // if logo is relative and exists, perfect
  if (logo && logo.startsWith(assetPathPrefix) && existsSync(logo)) return getAssetUrlFromPath(logo)

  // try to find a match in /assets/chains/ folder
  if (id)
    for (const ext of ['svg', 'webp', 'png']) {
      const symbolPath = `./assets/chains/${id}.${ext}`
      if (existsSync(symbolPath)) return getAssetUrlFromPath(symbolPath)
    }

  // use native token logo if available
  return getTokenLogoUrl(nativeToken.logo, nativeToken.coingeckoId, nativeToken.symbol)
}
