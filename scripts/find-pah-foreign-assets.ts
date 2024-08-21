import { readFile } from 'node:fs/promises'

import { pah } from '@polkadot-api/descriptors'
import omit from 'lodash/omit'
import { Binary, createClient } from 'polkadot-api'
import { getWsProvider } from 'polkadot-api/ws-provider/node'

const wsUrl = 'wss://asset-hub-polkadot-rpc.dwellir.com'

const main = async () => {
  const chaindata = JSON.parse(await readFile('data/chaindata.json', { encoding: 'utf8' }))
  const polkadotAssetHubForeignAssets =
    chaindata.find((chain: any) => chain.id === 'polkadot-asset-hub')?.balancesConfig?.['substrate-foreignassets']
      ?.tokens ?? []
  const getExisting = (key: string) => polkadotAssetHubForeignAssets.find((token: any) => token.onChainId === key)

  const client = createClient(getWsProvider(wsUrl))
  const api = client.getTypedApi(pah)

  const assets = await api.query.ForeignAssets.Asset.getEntries()
  const metadata = await api.query.ForeignAssets.Metadata.getEntries()

  const metadatas = new Map(metadata.map((item) => [papiStringify(item.keyArgs[0]), item.value]))

  for (const asset of assets) {
    const key = papiStringify(asset.keyArgs[0])
    const existing = getExisting(key)
    const metadata = metadatas.get(key)
    if (metadata) {
      console.log(
        JSON.stringify(
          {
            onChainId: key,
            symbol: metadata.symbol.asText(),
            ...omit(existing ?? {}, ['onChainId', 'symbol']),
          },
          null,
          2,
        ) + ',',
      )

      continue
    }

    console.log(
      JSON.stringify(
        {
          onChainId: key,
          symbol: 'NO_METADATA',
          ...omit(existing ?? {}, ['onChainId']),
        },
        null,
        2,
      ) + ',',
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

const papiStringify = (
  value: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  space?: string | number,
): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replacer = (_key: string, value: any) => {
    if (typeof value === 'bigint') return `bigint:${String(value)}`
    if (value instanceof Binary) return `hex:${value.asHex()}`
    return value
  }

  return JSON.stringify(value, replacer, space)
}
