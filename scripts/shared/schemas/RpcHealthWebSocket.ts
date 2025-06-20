import z from 'zod/v4'

const WsRpcHealthSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('OK') }),
  z.object({ status: z.literal('MEH'), error: z.string(), since: z.date() }),
  z.object({ status: z.literal('NOK'), error: z.string(), since: z.date() }),
])

export type WsRpcHealth = z.infer<typeof WsRpcHealthSchema>

export const WsRpcHealthFileSchema = z.partialRecord(z.url({ protocol: /^wss?$/ }), WsRpcHealthSchema)

type File = z.infer<typeof WsRpcHealthFileSchema>
