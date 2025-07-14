import keyBy from 'lodash/keyBy'

import { fetchCoins } from '../../shared/coingecko'
import { FILE_DOT_TOKENS_PREBUILD, FILE_ETH_TOKENS_PREBUILD } from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { EthTokensPreBuildFileSchema } from '../../shared/schemas/EthTokensPreBuild'
import { writeJsonFile } from '../../shared/writeFile'

export const fetchTokenNames = async () => {
  const dotTokens = parseJsonFile(FILE_DOT_TOKENS_PREBUILD, DotTokensPreBuildFileSchema)
  const ethTokens = parseJsonFile(FILE_ETH_TOKENS_PREBUILD, EthTokensPreBuildFileSchema)

  const coins = await fetchCoins()
  const coinsById = keyBy(coins, (c) => c.id)

  for (const token of [...dotTokens, ...ethTokens]) {
    if (!token.coingeckoId) continue
    if (token.name !== token.symbol) continue

    const coin = coinsById[token.coingeckoId]
    if (!coin || coin.name === token.name) continue

    token.name = coin.name
  }

  await writeJsonFile(FILE_DOT_TOKENS_PREBUILD, dotTokens, {
    schema: DotTokensPreBuildFileSchema,
  })
  await writeJsonFile(FILE_ETH_TOKENS_PREBUILD, ethTokens, {
    schema: EthTokensPreBuildFileSchema,
  })
}
