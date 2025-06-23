import z from 'zod/v4'

const DateSchema = z.union([z.string(), z.date()]).transform((val, ctx) => {
  const date = new Date(val)
  if (isNaN(date.getTime())) {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid date string',
    })
    return z.NEVER
  }
  return date
})

const RpcHealthSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('OK') }),
  z.object({ status: z.literal('MEH'), error: z.string() }),
  z.object({ status: z.literal('NOK'), error: z.string() }),
])

export type RpcHealth = z.infer<typeof RpcHealthSchema>

export const NetworkRpcHealthSchema = z.strictObject({
  networkId: z.string().nonempty(),
  rpc: z.url(),
  health: RpcHealthSchema,
  timestamp: DateSchema,
})

export type NetworkRpcHealth = z.infer<typeof NetworkRpcHealthSchema>

export const NetworkRpcHealthFileSchema = z.array(NetworkRpcHealthSchema)

export type NetworkRpcHealthCache = z.infer<typeof NetworkRpcHealthFileSchema>
