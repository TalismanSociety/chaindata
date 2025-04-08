import { readFileSync } from 'node:fs'

import { EvmNetwork } from '@talismn/chaindata-provider'

const json = readFileSync('./pub/v2/evmNetworks/all.json', 'utf-8')
const evmNetworks = JSON.parse(json) as EvmNetwork[]

console.log('%d networks', evmNetworks.length)

const results = evmNetworks
  .map((evmNetwork) => {
    const { id, name, erc20aggregator, balancesConfig, isDefault, forceScan } = evmNetwork
    const erc20Module = balancesConfig.find((m) => m.moduleType === 'evm-erc20') as any
    const tokens = erc20Module?.moduleConfig?.tokens.length ?? 0

    // if default or forcescan, need an aggregator because of Asset Discovery in the wallet
    const needed = isDefault || forceScan ? 'YES' : ''

    return {
      id,
      name,
      tokens,
      erc20aggregator,
      needed,
    }
  })
  .filter((a) => a.tokens)
  .sort((a, b) => b.tokens - a.tokens)

console.table(results)
