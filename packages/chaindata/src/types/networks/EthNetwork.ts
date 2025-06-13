import z from 'zod/v4'

import { EthereumAddressDef } from '../shared'
import { NetworkBaseDef } from './NetworkBase'

const ContractName = z.enum(['Erc20Aggregator', 'Multicall3'])

export const EthNetworkDef = NetworkBaseDef.extend({
  platform: z.literal('ethereum'),
  substrateChainId: z.string().optional(),
  preserveGasEstimate: z.boolean().optional(),
  rpcs: z.array(z.url({ protocol: /^https?$/ })),
  feeType: z.enum(['legacy', 'eip-1559']).optional(),
  l2FeeType: z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('op-stack'),
    }),
    z.strictObject({
      type: z.literal('scroll'),
      l1GasPriceOracle: EthereumAddressDef,
    }),
  ]),
  contracts: z.partialRecord(ContractName, EthereumAddressDef).optional(),
})
export type EthNetwork = z.infer<typeof EthNetworkDef>
