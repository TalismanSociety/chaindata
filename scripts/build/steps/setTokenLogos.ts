import { existsSync } from 'node:fs'

import { Chain, EvmNetwork } from '@talismn/chaindata-provider'

import { UNKNOWN_TOKEN_LOGO_URL, getAssetUrlFromPath } from '../../shared/util'
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
  for (const network of networks) {
    for (const mod of network.balancesConfig) {
      const tokens = [] as TokenDef[]
      if ('tokens' in mod.moduleConfig) tokens.push(...mod.moduleConfig.tokens)
      else tokens.push(mod.moduleConfig)

      for (const token of tokens) {
        // resolve hardcoded logo path
        if (token.logo && !token.logo.startsWith('https://') && existsSync(token.logo))
          token.logo = getAssetUrlFromPath(token.logo)

        // for substrate native, ignore symbol, prefer chain's logo or coingecko id
        if (mod.moduleType === 'substrate-native') {
          const logoPath = `./assets/chains/${network.id}.svg`
          if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
        }
        // for others resolve by symbol (unsafe - ex. should ETH on testnets use the official ETH icon?)
        else if (!token.logo?.startsWith('https://') && token.symbol) {
          const logoPath = `./assets/tokens/${token.symbol.toLocaleLowerCase()}.svg`
          if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
        }

        // resolve by coingecko id
        if (!token.logo?.startsWith('https://') && token.coingeckoId) {
          const logoPath = `./assets/tokens/coingecko/${token.coingeckoId}.webp`
          if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
        }

        if (!token.logo?.startsWith('https://')) token.logo = UNKNOWN_TOKEN_LOGO_URL
      }
    }
  }
}
