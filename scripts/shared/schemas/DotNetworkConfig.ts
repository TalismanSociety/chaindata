import {
  SubAssetsTokenConfigSchema,
  SubForeignAssetsTokenConfigSchema,
  SubPsp22TokenConfigSchema,
  SubTokensTokenConfigSchema,
} from '@talismn/balances'
import { DotNetworkSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

const DotTokensConfigSchema = z.strictObject({
  'substrate-assets': z.array(SubAssetsTokenConfigSchema).optional(),
  'substrate-psp22': z.array(SubPsp22TokenConfigSchema).optional(),
  'substrate-foreignassets': z.array(SubForeignAssetsTokenConfigSchema).optional(),
  'substrate-tokens': z.array(SubTokensTokenConfigSchema).optional(),
})

export const DotNetworkConfigSchema = z.strictObject({
  // keep only fields that we want to override from config
  ...DotNetworkSchema.omit({
    account: true, // determined from metadata
    genesisHash: true, // determined from rpcs,
    nativeTokenId: true, // computed automatically
    specName: true, // fetched from rpc
    specVersion: true, // fetched from rpc
    prefix: true, // determined from metadata
    platform: true, // always polkadot
    topology: true, // fetched from rpc
  }).partial().shape,
  // required fields
  ...DotNetworkSchema.pick({
    id: true,
    rpcs: true,
  }).shape,
  nativeTokenId: DotNetworkSchema.shape.nativeTokenId.optional(), // allow override for interlay, mangata, kintsugi
  relay: z.string().nonempty().optional(), // relay chain id, if this is a parachain
  nativeCurrency: DotNetworkSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: DotNetworkSchema.shape.balancesConfig.optional(),
  tokens: DotTokensConfigSchema.optional(),
})

export const DotNetworksConfigFileSchema = z.array(DotNetworkConfigSchema)

export type DotNetworkConfig = z.infer<typeof DotNetworkConfigSchema>
