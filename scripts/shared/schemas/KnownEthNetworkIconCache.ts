import z from 'zod/v4'

export const KnownEthNetworkIconSchema = z.strictObject({
  icon: z.string().nonempty(),
  etag: z.string().nonempty(),
  path: z.string().nonempty(),
})

export type KnownEthNetworkIcon = z.infer<typeof KnownEthNetworkIconSchema>

export const KnownEthNetworkIconsFileSchema = z.array(KnownEthNetworkIconSchema)
