import { EvmErc20Token } from '@talismn/balances'

import { sharedData } from './_sharedData'

export const removeInvalidErc20Tokens = async () => {
  const { evmNetworks } = sharedData

  evmNetworks.forEach((evmNetwork) => {
    const erc20ModuleConfig = evmNetwork.balancesConfig.find((m) => m.moduleType === 'evm-erc20')?.moduleConfig as
      | { tokens: EvmErc20Token[] }
      | undefined
    if (!erc20ModuleConfig) return

    erc20ModuleConfig.tokens = erc20ModuleConfig.tokens.filter(
      (token) => typeof token.decimals === 'number' && !!token.symbol && !!token.contractAddress,
    )
  })
}
