// import { EvmErc20TokenConfigSchema, EvmNativeTokenConfigSchema, EvmUniswapV2TokenConfigSchema } from '@talismn/balances'
// import z from 'zod/v4'

// // const EthTokenConfigSchema = z.discriminatedUnion('type', [
// //   z
// //     .strictObject({
// //       type: z.literal('evm-native'),
// //     })
// //     .extend(EvmNativeTokenConfigSchema.shape),

// //   z
// //     .strictObject({
// //       type: z.literal('evm-erc20'),
// //     })
// //     .extend(EvmErc20TokenConfigSchema.shape),

// //   z
// //     .strictObject({
// //       type: z.literal('evm-uniswapv2'),
// //     })
// //     .extend(EvmUniswapV2TokenConfigSchema.shape),
// // ])

// export type EthTokenConfig = z.infer<typeof EthTokenConfigSchema>
