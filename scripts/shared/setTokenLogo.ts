import { existsSync } from 'node:fs'

import { UNKNOWN_TOKEN_LOGO_URL, assetUrlPrefix, getAssetPathFromUrl, getAssetUrlFromPath } from './util'

export type TokenDef = {
  symbol?: string
  coingeckoId?: string
  logo?: string
}

const logoExists = (logoUrlOrRelativePath?: string) => {
  if (!logoUrlOrRelativePath) return false
  try {
    if (logoUrlOrRelativePath.startsWith(assetUrlPrefix) && existsSync(getAssetPathFromUrl(logoUrlOrRelativePath)))
      return true
    if (!logoUrlOrRelativePath.startsWith('https://') && existsSync(logoUrlOrRelativePath)) return true
  } catch (err) {
    // ignore
  }
  return false
}

// TODO: Clean this up a bit. Need to clarify with @0xKheops the new approach we had in mind for Talisman-defined logos.
// TODO: We need to run this on `chain.balancesConfig` in order to convert `./path/to/token` to `https://github/path/to/token`, but `balancesConfig`
//       is used in metadata generation, so this needs to be run as part of the `fetch-external` flow. However, it also needs to be run
//       as part of the `build` flow in order to react to balancesConfig changes by chaindata maintainers.
//       Solution: Figure out a better way to handle this & do a small refactor.
export const setTokenLogo = (token: TokenDef, chainId: string | undefined, moduleType: string) => {
  // reset if unknown
  if (token.logo === UNKNOWN_TOKEN_LOGO_URL) delete token.logo

  // resolve hardcoded logo relative path
  if (token.logo && !token.logo.startsWith('https://') && existsSync(token.logo))
    token.logo = getAssetUrlFromPath(token.logo)

  // for substrate native, ignore symbol, prefer chain's logo or coingecko id
  // ignore logo only if it doesn't exist, it may have been set by metadata update based on a naming convention
  if (!logoExists(token.logo) && moduleType === 'substrate-native') {
    if (typeof chainId === 'string') {
      const logoPath = `./assets/chains/${chainId}.svg`
      if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
    }
  }

  // for others resolve by symbol (unsafe - ex. should ETH on testnets use the official ETH icon?)
  if (moduleType !== 'substrate-native' && !token.logo?.startsWith('https://') && token.symbol) {
    const logoPath = `./assets/tokens/${token.symbol.toLocaleLowerCase()}.svg`
    if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
  }

  // resolve by coingecko id
  if (!token.logo?.startsWith('https://') && token.coingeckoId) {
    const logoPath = `./assets/tokens/coingecko/${token.coingeckoId}.webp`
    if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
  }
  if (!token.logo?.startsWith('https://')) token.logo = UNKNOWN_TOKEN_LOGO_URL

  if (token.logo?.startsWith(assetUrlPrefix) && !existsSync(getAssetPathFromUrl(token.logo))) {
    token.logo = UNKNOWN_TOKEN_LOGO_URL

    if (token.symbol) {
      const logoPath = `./assets/tokens/${token.symbol.toLocaleLowerCase()}.svg`
      if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
    }
  }
}
