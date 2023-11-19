import { Chain, EvmNetwork } from '@talismn/chaindata-provider'

import { setTokenLogo } from '../../shared/setTokenLogo'
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
