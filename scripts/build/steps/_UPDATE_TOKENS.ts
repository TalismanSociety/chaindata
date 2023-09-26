// import { BlockHandlerContext } from '@subsquid/substrate-processor'
// import { EntityManager } from 'typeorm'

// import { Token } from '../model'
// import { processorSharedData } from './_sharedData'

// TODO: Put something like this into the wallet, but based on the BalanceModuleConfig for each chain

// export const updateTokensFromGithub = async ({ store }: BlockHandlerContext<EntityManager>) => {
//   const { githubTokens } = processorSharedData

//   // override symbol / decimals / coingeckoId for tokens
//   for (const githubToken of githubTokens) {
//     const token = await store.findOne(Token, {
//       where: { id: githubToken.id },
//       loadRelationIds: { disableMixedMap: true },
//     })

//     if (!token || !token.data) continue

//     if (typeof githubToken.symbol === 'string') (token.data as any).symbol = githubToken.symbol
//     if (typeof githubToken.decimals === 'number') (token.data as any).decimals = githubToken.decimals
//     if (typeof githubToken.coingeckoId === 'string' || githubToken.coingeckoId === null)
//       (token.data as any).coingeckoId = githubToken.coingeckoId
//     if (typeof githubToken.dcentName === 'string' || githubToken.dcentName === null)
//       (token.data as any).dcentName = githubToken.dcentName
//     if (typeof githubToken.mirrorOf === 'string') (token.data as any).mirrorOf = githubToken.mirrorOf
//     else delete (token.data as any).mirrorOf

//     // used to override the auto-calculated theme color
//     if (typeof githubToken.themeColor === 'string')
//       processorSharedData.userDefinedThemeColors.tokens.set(githubToken.id, githubToken.themeColor)

//     await store.save(token)
//   }
// }

export {}
