import { existsSync } from 'node:fs'

import { Chain, EvmNetwork } from '@talismn/chaindata-provider'

import { UNKNOWN_TOKEN_LOGO_URL, assetUrlPrefix, getAssetPathFromUrl, getAssetUrlFromPath } from '../../shared/util'
import { sharedData } from './_sharedData'

type TokenDef = {
  symbol?: string
  coingeckoId?: string
  logo?: string
}

type BalancesConfig = {
  moduleType: string
  moduleConfig: TokenDef | { tokens: TokenDef[] }
}

type ChainWithBalancesConfig = Chain & {
  balancesConfig: BalancesConfig[]
}
type EvmNetworkWithBalancesConfig = EvmNetwork & {
  balancesConfig: BalancesConfig[]
}

export const setTokenLogos = async () => {
  const networks = [
    ...(sharedData.chains as ChainWithBalancesConfig[]),
    ...(sharedData.evmNetworks as EvmNetworkWithBalancesConfig[]),
  ]

  // update logos in balancesConfig
  for (const network of networks) {
    for (const mod of network.balancesConfig) {
      const tokens: TokenDef[] = []
      if ('tokens' in mod.moduleConfig) tokens.push(...mod.moduleConfig.tokens)
      else tokens.push(mod.moduleConfig)

      for (const token of tokens) {
        setTokenLogo(token, network.id, mod.moduleType)
      }
    }
  }

  // update logos in tokens.json
  for (const token of sharedData.tokens) {
    setTokenLogo(token, token.chain?.id ?? token.evmNetwork?.id, token.type)
  }
}

// TODO: Clean this up a bit. Need to clarify with @0xKheops the new approach we had in mind for Talisman-defined logos.
const setTokenLogo = (token: TokenDef, chainId: string | undefined, moduleType: string) => {
  // reset if unknown
  if (token.logo === UNKNOWN_TOKEN_LOGO_URL) delete token.logo

  if (token.logo && !token.logo.startsWith('https://') && existsSync(token.logo))
    // resolve hardcoded logo path
    token.logo = getAssetUrlFromPath(token.logo)

  // for substrate native, ignore symbol, prefer chain's logo or coingecko id
  if (moduleType === 'substrate-native') {
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
