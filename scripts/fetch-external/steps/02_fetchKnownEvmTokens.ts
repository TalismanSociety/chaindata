import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { TalismanEvmNetwork } from '../../shared/types'
import { fetchAssetPlatforms, fetchCoins } from '../coingecko'

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
