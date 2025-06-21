import { z } from 'zod/v4'

export const DotBalancesConfigTypes = z.enum([
  'substrate-assets',
  'substrate-psp22',
  'substrate-tokens',
  'substrate-foreignassets',
])

export const EthBalancesConfigTypes = z.enum(['evm-erc20', 'evm-uniswapv2'])
