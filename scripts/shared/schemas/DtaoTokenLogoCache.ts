import z from 'zod/v4'

export const DtaoTokenLogoSchema = z.strictObject({
  networkId: z.string().nonempty(),
  netuid: z.uint32(),
  /** normalized url the image was downloaded from */
  url: z.string().nonempty(),
  etag: z.string().nonempty().optional(),
  lastModified: z.string().nonempty().optional(),
  /** first 8 chars of the sha256 of the webp buffer */
  hash: z.string().nonempty(),
  path: z.string().nonempty(),
})

export type DtaoTokenLogo = z.infer<typeof DtaoTokenLogoSchema>

export const DtaoTokenLogosFileSchema = z.array(DtaoTokenLogoSchema)
