import { readFile, writeFile } from 'node:fs/promises'

import groupBy from 'lodash/groupBy'

const main = async () => {
  const allChains = new Map<string, { id?: string; name?: string }>(
    JSON.parse((await readFile('dist/chains/all.json')).toString('utf8')).map((chain: any) => [chain.id, chain]),
  )
  const allTokens = new Map<string, { id?: string; symbol?: string; chain?: { id?: string }; coingeckoId?: string }>(
    JSON.parse((await readFile('dist/tokens/all.json')).toString('utf8')).map((token: any) => [token.id, token]),
  )
  const missing = [...allTokens.values()]
    .filter((token) => (token.coingeckoId === undefined ? false : true))
    .map((token) => ({ ...token, chainId: token.chain?.id }))
  const byChain = groupBy(missing, 'chainId')

  const rows = [
    ['Chain Name', 'Token Symbol'].join(','),
    ...Object.entries(byChain).flatMap(([chainId, tokens]) =>
      tokens
        .sort((a, b) => (a.symbol ?? 'z').toLocaleLowerCase().localeCompare((b.symbol ?? 'z').toLocaleLowerCase()))
        .map((token) => [allChains.get(chainId)?.name, token?.symbol].join(',')),
    ),
  ]

  // write updated files
  await writeFile('missing-coingeckoIds.csv', rows.join('\n'))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
