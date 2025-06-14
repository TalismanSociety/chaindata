import { z } from 'zod/v4'

export const HexStringSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]+$/)
  .transform((val) => val as `0x${string}`)

export const DotBalancesConfigTypes = z.enum([
  'substrate-assets',
  'substrate-psp22',
  'substrate-tokens',
  'substrate-foreignassets',
])

export const EthBalancesConfigTypes = z.enum(['evm-erc20', 'evm-uniswapv2'])
