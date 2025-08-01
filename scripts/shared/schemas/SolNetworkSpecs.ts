import { SolNetworkSchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

export const SolNetworkSpecsSchema = z.strictObject({
  id: z.string().nonempty(),
  genesisHash: SolNetworkSchema.shape.genesisHash,
})

export type SolNetworkSpecs = z.infer<typeof SolNetworkSpecsSchema>

export const SolNetworkSpecsFileSchema = z.array(SolNetworkSpecsSchema)
