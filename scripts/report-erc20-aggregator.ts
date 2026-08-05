import type { Chaindata } from '@talismn/chaindata-provider'

import { FILE_OUTPUT_CHAINDATA } from './shared/constants'
import { parseJsonFile } from './shared/parseFile'

const chaindata = parseJsonFile<Chaindata>(FILE_OUTPUT_CHAINDATA)
const evmNetworks = chaindata.networks.filter((n) => n.platform === 'ethereum')
const erc20Tokens = chaindata.tokens.filter((n) => n.type === 'evm-erc20')

console.log('%d networks', evmNetworks.length)

const results = evmNetworks
  .map((network) => {
    const { id, name, isDefault, forceScan } = network
    const tokens = erc20Tokens.filter((t) => t.networkId === id).length
    const erc20Aggregator = network.contracts?.Erc20Aggregator

    // if default or forcescan, need an aggregator because of Asset Discovery in the wallet
    const needed = isDefault || forceScan ? 'YES' : ''

    return {
      id,
      name,
      tokens,
      erc20Aggregator,
      needed,
    }
  })
  .filter((a) => a.tokens)
  .sort((a, b) => b.tokens - a.tokens)

console.table(results)
