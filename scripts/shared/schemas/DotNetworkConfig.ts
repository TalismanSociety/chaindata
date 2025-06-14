import { DotNetworkSchema } from '@talismn/chaindata'
import { z } from 'zod/v4'

import { DotBalancesConfigTypes } from './shared'

export const DotNetworkConfigSchema = z.strictObject({
  ...DotNetworkSchema.omit({
    relayId: true, // determine which relay by checking api.consts.parachainSystem.relayChainGenesisHash
    paraId: true, // fetch from api.query.parachainInfo.parachainId
  }).partial().shape,
  ...DotNetworkSchema.pick({
    id: true,
    // name: true,  // can be determined from networkSpecs
    rpcs: true,
  }).shape,
  nativeCurrency: DotNetworkSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: z.partialRecord(DotBalancesConfigTypes, z.any()).optional(),
})

export const DotNetworksConfigFileSchema = z.array(DotNetworkConfigSchema)

export type DotNetworkConfig = z.infer<typeof DotNetworkConfigSchema>
