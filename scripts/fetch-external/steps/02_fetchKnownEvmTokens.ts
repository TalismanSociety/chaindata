import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { COINGECKO_API_KEY } from '../../build/constants'
import { TalismanEvmNetwork } from '../types'

type CoingeckoAssetPlatform = {
  id: string
  chain_identifier: number | null
  name: string
  shortname: string
}

type CoingeckoCoin = {
  id: string
  symbol: string
  name: string
  platforms: Record<string, string>
}

// docs mentions api key can be set in header, but if there is a query string then header are ignored
// => always specify api key in query string
const DEFAULT_URL_PARAMS = COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : undefined

const fetchAssetPlatforms = async () => {
  const urlParams = new URLSearchParams(DEFAULT_URL_PARAMS)

  const resAssetPlatforms = await fetch('https://api.coingecko.com/api/v3/asset_platforms?' + urlParams.toString())
  const assetPlatforms = (await resAssetPlatforms.json()) as CoingeckoAssetPlatform[]

  // TODO for debugging only, remove when ready
  await writeFile(
    'dist/assetPlatforms.json',
    await prettier.format(JSON.stringify(assetPlatforms, null, 2), {
      parser: 'json',
    }),
  )

  return assetPlatforms
}

const fetchCoins = async () => {
  const urlParams = new URLSearchParams(DEFAULT_URL_PARAMS)
  urlParams.set('include_platform', 'true')

  const resCoins = await fetch('https://api.coingecko.com/api/v3/coins/list?' + urlParams)
  const coins = (await resCoins.json()) as CoingeckoCoin[]

  // TODO for debugging only, remove when ready
  await writeFile(
    'dist/coins.json',
    await prettier.format(JSON.stringify(coins, null, 2), {
      parser: 'json',
    }),
  )

  return coins
}

export const fetchKnownEvmTokens = async () => {
  const assetPlatforms = await fetchAssetPlatforms()
  const coins = await fetchCoins()

  const knownEvmNetworks = JSON.parse(await readFile('known-evm-networks.json', 'utf-8')) as TalismanEvmNetwork[]

  for (const coin of coins) {
    if (coin.platforms) {
      for (const [platformId, contractAddress] of Object.entries(coin.platforms)) {
        const platform = assetPlatforms.find((platform) => platform.id === platformId)
        if (platform && contractAddress?.startsWith('0x')) {
          const evmNetwork = knownEvmNetworks.find(
            (evmNetwork) => evmNetwork.id === platform.chain_identifier?.toString(),
          )
          if (evmNetwork) {
            if (!evmNetwork.balancesConfig) evmNetwork.balancesConfig = {}
            if (!evmNetwork.balancesConfig['evm-erc20']) {
              evmNetwork.balancesConfig['evm-erc20'] = {
                tokens: [],
              }
            }

            const token = {
              symbol: coin.symbol, // most symbols are inacurate, but are fixed in step 3
              coingeckoId: coin.id,
              contractAddress,
            }

            const existingIdx = evmNetwork.balancesConfig['evm-erc20'].tokens.findIndex(
              (t) => t.contractAddress === contractAddress,
            )
            if (existingIdx !== -1) evmNetwork.balancesConfig['evm-erc20'].tokens[existingIdx] = token
            else evmNetwork.balancesConfig['evm-erc20'].tokens.push(token)
          }
        }
      }
    }
  }

  await writeFile(
    'known-evm-networks.json',
    await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
      parser: 'json',
    }),
  )
}
