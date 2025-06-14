import { DotNetworkSchema } from '@talismn/chaindata'
import { z } from 'zod/v4'

import { DotBalancesConfigTypes } from './shared'

export const DotNetworkConfigSchema = z.strictObject({
  // keep only fields that we want to override from config
  ...DotNetworkSchema.omit({
    relayId: true, // determined from metadata
    paraId: true, // fetched from chain
    isRelay: true, // determined from metadata
    account: true, // determined from metadata
    genesisHash: true, // determined from rpcs,
    nativeTokenId: true, // computed automatically
    specName: true, // fetched from rpc
    specVersion: true, // fetched from rpc
    prefix: true, // determined from metadata
    platform: true, // always polkadot
  }).partial().shape,
  // required fields
  ...DotNetworkSchema.pick({
    id: true,
    // name: true,  // can be determined from networkSpecs
    rpcs: true,
  }).shape,
  relay: z.string().nonempty().optional(), // relay chain id, if this is a parachain
  nativeCurrency: DotNetworkSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: z.partialRecord(DotBalancesConfigTypes, z.any()).optional(),
})

export const DotNetworksConfigFileSchema = z.array(DotNetworkConfigSchema)

export type DotNetworkConfig = z.infer<typeof DotNetworkConfigSchema>
