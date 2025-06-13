import { DotNetworkSchema, EthNetworkSchema } from '@talismn/chaindata'
import { z } from 'zod/v4'

export const DotBalancesConfigTypes = z.enum([
  'substrate-assets',
  'substrate-psp22',
  'substrate-tokens',
  'substrate-foreignassets',
])

export const DotNetworkConfigSchema = z.strictObject({
  ...DotNetworkSchema.omit({
    relayId: true, // determine which relay by checking api.consts.parachainSystem.relayChainGenesisHash
    paraId: true, // fetch from api.query.parachainInfo.parachainId
  }).partial().shape,
  ...DotNetworkSchema.pick({
    id: true,
    // name: true,  // can fallback to official name from api.rpc.system.chain
    rpcs: true,
  }).shape,
  nativeCurrency: DotNetworkSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: z.partialRecord(DotBalancesConfigTypes, z.any()).optional(),
})
export const DotNetworksConfigFileSchema = z.array(DotNetworkConfigSchema)
export type DotNetworkConfig = z.infer<typeof DotNetworkConfigSchema>

export const EthBalancesConfigTypes = z.enum(['evm-erc20', 'evm-uniswapv2'])
export const EthNetworkConfigSchema = z.strictObject({
  ...EthNetworkSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true, rpcs: true }).shape,
  balancesConfig: z.partialRecord(EthBalancesConfigTypes, z.any()).optional(),
})
export const EthNetworksConfigFileSchema = z.array(EthNetworkConfigSchema)
export type EthNetworkConfig = z.infer<typeof EthNetworkConfigSchema>

export const KnownEthNetworkConfigSchema = z.strictObject({
  ...EthNetworkSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true, rpcs: true }).shape,
  nativeCurrency: EthNetworkSchema.shape.nativeCurrency,
  icon: z.string().optional(),
  balancesConfig: z.partialRecord(EthBalancesConfigTypes, z.any()).optional(),
})
export type KnownEthNetworkConfig = z.infer<typeof KnownEthNetworkConfigSchema>

export const KnownEthNetworksFileSchema = z.array(KnownEthNetworkConfigSchema)

export const KnownEthNetworkOverridesDef = z.strictObject({
  ...KnownEthNetworkConfigSchema.partial().shape,
  ...KnownEthNetworkConfigSchema.pick({ id: true }).shape,
  nativeCurrency: EthNetworkSchema.shape.nativeCurrency.partial().optional(),
})
export const KnownEthNetworksOverridesFileSchema = z.array(KnownEthNetworkOverridesDef)
export type KnownEthNetworkOverrides = z.infer<typeof KnownEthNetworkOverridesDef>
