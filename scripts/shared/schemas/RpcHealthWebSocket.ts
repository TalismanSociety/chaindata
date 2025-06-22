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
  z.object({ status: z.literal('MEH'), error: z.string(), since: DateSchema }),
  z.object({ status: z.literal('NOK'), error: z.string(), since: DateSchema }),
])

export type RpcHealth = z.infer<typeof RpcHealthSchema>

export const RpcHealthFileSchema = z.partialRecord(z.url(), RpcHealthSchema)
