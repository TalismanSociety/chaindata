import { DotNetworkDef, EthNetworkDef, SubTokensTokenDef, TokenDef } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

export const DotBalancesConfigTypes = z.enum([
  'substrate-assets',
  'substrate-psp22',
  'substrate-tokens',
  'substrate-foreignassets',
])

export const DotNetworkConfigDef = z.object({
  ...DotNetworkDef.omit({
    relayId: true, // determine which relay by checking api.consts.parachainSystem.relayChainGenesisHash
    paraId: true, // fetch from api.query.parachainInfo.parachainId
  }).partial().shape,
  ...DotNetworkDef.pick({
    id: true,
    // name: true,  // can fallback to official name from api.rpc.system.chain
    rpcs: true,
  }).shape,
  nativeCurrency: DotNetworkDef.shape.nativeCurrency.partial().optional(),
  balancesConfig: z.partialRecord(DotBalancesConfigTypes, z.any()).optional(),
})
export const DotNetworksConfigFileSchema = z.array(DotNetworkConfigDef)
export type DotNetworkConfig = z.infer<typeof DotNetworkConfigDef>

export const EthBalancesConfigTypes = z.enum(['evm-erc20', 'evm-uniswapv2'])
export const EthNetworkConfigDef = z.object({
  ...EthNetworkDef.partial().shape,
  ...EthNetworkDef.pick({ id: true, rpcs: true }).shape,
  balancesConfig: z.partialRecord(EthBalancesConfigTypes, z.any()).optional(),
})
export const EthNetworksConfigFileSchema = z.array(EthNetworkConfigDef)
export type EthNetworkConfig = z.infer<typeof EthNetworkConfigDef>

export const KnownEthNetworkConfigDef = z.object({
  ...EthNetworkDef.partial().shape,
  ...EthNetworkDef.pick({ id: true, rpcs: true }).shape,
  nativeCurrency: EthNetworkDef.shape.nativeCurrency,
  icon: z.string().optional(),
  balancesConfig: z.partialRecord(EthBalancesConfigTypes, z.any()).optional(),
})
export type KnownEthNetworkConfig = z.infer<typeof KnownEthNetworkConfigDef>

export const KnownEthNetworksFileSchema = z.array(KnownEthNetworkConfigDef)

export const KnownEthNetworkOverridesDef = z.object({
  ...KnownEthNetworkConfigDef.partial().shape,
  ...KnownEthNetworkConfigDef.pick({ id: true }).shape,
  nativeCurrency: EthNetworkDef.shape.nativeCurrency.partial().optional(),
})
export const KnownEthNetworksOverridesFileSchema = z.array(KnownEthNetworkOverridesDef)
export type KnownEthNetworkOverrides = z.infer<typeof KnownEthNetworkOverridesDef>
