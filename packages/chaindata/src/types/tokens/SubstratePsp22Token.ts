import z from 'zod/v4'

import { TokenBase } from './TokenBase'

export const SubPsp22TokenDef = TokenBase.extend({
  type: z.literal('substrate-psp22'),
  platform: z.literal('polkadot'),
  existentialDeposit: z.string(),
  contractAddress: z.string(),
})
export type SubPsp22Token = z.infer<typeof SubPsp22TokenDef>
