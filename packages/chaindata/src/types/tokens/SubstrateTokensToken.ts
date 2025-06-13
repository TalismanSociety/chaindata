import z from 'zod/v4'

import { TokenBase } from './TokenBase'

export const SubTokensTokenDef = TokenBase.extend({
  type: z.literal('substrate-tokens'),
  platform: z.literal('polkadot'),
  onChainId: z.union([z.string(), z.number()]),
  existentialDeposit: z.string(),
})
export type SubTokensToken = z.infer<typeof SubTokensTokenDef>
