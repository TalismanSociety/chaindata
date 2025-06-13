import z from 'zod/v4'

import { EthereumAddressDef } from '../shared'
import { EvmErc20TokenDef } from './EvmErc20Token'

export const EvmUniswapV2TokenDef = EvmErc20TokenDef.extend({
  type: z.literal('evm-uniswapv2'),
  symbol0: z.string().nonempty(),
  symbol1: z.string().nonempty(),
  decimals0: z.int().min(0),
  decimals1: z.int().min(0),
  tokenAddress0: EthereumAddressDef,
  tokenAddress1: EthereumAddressDef,
  coingeckoId0: z.string().optional(),
  coingeckoId1: z.string().optional(),
})
export type EvmUniswapV2Token = z.infer<typeof EvmUniswapV2TokenDef>

export const CustomEvmUniswapV2TokenDef = EvmUniswapV2TokenDef.extend({
  isCustom: z.literal(true),
})

export type CustomEvmUniswapV2Token = z.infer<typeof CustomEvmUniswapV2TokenDef>
