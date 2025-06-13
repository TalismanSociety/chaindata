import z from 'zod/v4'

import { TokenBase } from './TokenBase'

export const SubForeignAssetsTokenDef = TokenBase.extend({
  type: z.literal('substrate-foreignassets'),
  platform: z.literal('polkadot'),
  onChainId: z.string(),
  isFrozen: z.boolean().optional(),
  existentialDeposit: z.string(),
})
export type SubForeignAssetsToken = z.infer<typeof SubForeignAssetsTokenDef>
