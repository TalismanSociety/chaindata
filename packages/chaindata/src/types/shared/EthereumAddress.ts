import z from 'zod/v4'

// // this breaks schema generation
// export const EthereumAddressDef = z.custom<`0x${string}`>(
//   (val) => typeof val === 'string' && /^0x[a-fA-F0-9]{40}$/.test(val),
// )

export const EthereumAddressDef = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid Ethereum address' })
  .transform((val) => val as `0x${string}`)
