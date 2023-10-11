import { existsSync } from 'node:fs'

import { Chain, EvmNetwork } from '@talismn/chaindata-provider'

import { UNKNOWN_TOKEN_LOGO_URL, getAssetUrlFromPath } from '../../shared/util'
import { sharedData } from './_sharedData'

type TokenDef = {
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
  const allBalanceConfigs = [
    ...sharedData.chains.flatMap((chain) => (chain as ChainWithBalancesConfig).balancesConfig),
    ...sharedData.evmNetworks.flatMap((network) => (network as EvmNetworkWithBalancesConfig).balancesConfig),
  ]

  const tokens = [] as TokenDef[]

  for (const mod of allBalanceConfigs) {
    if ('tokens' in mod.moduleConfig) tokens.push(...mod.moduleConfig.tokens)
    else tokens.push(mod.moduleConfig)
  }

  for (const token of tokens) {
    if (!token.logo && token.coingeckoId) {
      const logoPath = `./assets/tokens/coingecko/${token.coingeckoId}.webp`
      if (existsSync(logoPath)) token.logo = getAssetUrlFromPath(logoPath)
    }
    if (!token.logo) token.logo = UNKNOWN_TOKEN_LOGO_URL
  }
}
