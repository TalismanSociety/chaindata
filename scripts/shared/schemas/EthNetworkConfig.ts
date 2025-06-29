import { EvmErc20TokenConfigSchema, EvmNativeTokenConfigSchema, EvmUniswapV2TokenConfigSchema } from '@talismn/balances'
import { EthNetworkSchema, NetworkBaseSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

const EthTokensConfigSchema = z.strictObject({
  'evm-erc20': z.array(EvmErc20TokenConfigSchema).optional(),
  'evm-uniswapv2': z.array(EvmUniswapV2TokenConfigSchema).optional(),
})

export const EthNetworkConfigSchema = z.strictObject({
  ...EthNetworkSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true, rpcs: true }).shape,
  nativeCurrency: NetworkBaseSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: EthNetworkSchema.shape.balancesConfig,
  tokens: EthTokensConfigSchema.optional(),
})

export const EthNetworksConfigFileSchema = z.array(EthNetworkConfigSchema)

export type EthNetworkConfig = z.infer<typeof EthNetworkConfigSchema>
