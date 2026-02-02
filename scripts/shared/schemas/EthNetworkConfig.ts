import { EvmErc20TokenConfigSchema, EvmUniswapV2TokenConfigSchema } from '@talismn/balances'
import { EthNetworkSchema, NetworkBaseSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

const EthTokensConfigSchema = z.strictObject({
  'evm-erc20': z.array(EvmErc20TokenConfigSchema).optional(),
  'evm-uniswapv2': z.array(EvmUniswapV2TokenConfigSchema).optional(),
})

// Schema for networks-ethereum.yaml - only id is required, everything else is optional
// This allows both full network definitions and sparse overrides in a single file
export const EthNetworkConfigSchema = z.strictObject({
  ...EthNetworkSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true }).shape, // only id is required
  rpcs: EthNetworkSchema.shape.rpcs.optional(), // rpcs are optional (will come from chainlist)
  nativeCurrency: NetworkBaseSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: EthNetworkSchema.shape.balancesConfig,
  tokens: EthTokensConfigSchema.optional(),
  // Additional fields from chainlist that may be useful for overrides
  icon: z.string().optional(),
  shortName: z.string().optional(),
})

export const EthNetworksConfigFileSchema = z.array(EthNetworkConfigSchema)

export type EthNetworkConfig = z.infer<typeof EthNetworkConfigSchema>
