import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { FILE_KNOWN_EVM_NETWORKS, PRETTIER_CONFIG } from '../../shared/constants'
import { ConfigEvmNetwork } from '../../shared/types.legacy'
import { KnownEthNetworkConfig, KnownEthNetworkConfigDef } from '../../shared/types.v4'
import { validateNetworks } from '../../shared/validateNetworks'
import { fetchAssetPlatforms, fetchCoins } from '../coingecko'

export const fetchKnownEvmTokens = async () => {
  const assetPlatforms = await fetchAssetPlatforms()
  const coins = await fetchCoins()

  const knownEvmNetworks: KnownEthNetworkConfig[] = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8'))
  validateNetworks(knownEvmNetworks, KnownEthNetworkConfigDef)

  for (const assetPlatform of assetPlatforms)
    if (!!assetPlatform.native_coin_id) {
      const evmNetwork = knownEvmNetworks.find(
        (evmNetwork) => evmNetwork.id === assetPlatform.chain_identifier?.toString(),
      )
      if (!evmNetwork) continue

      evmNetwork.nativeCurrency.coingeckoId = assetPlatform.native_coin_id as string
    }

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
              symbol: coin.symbol, // most symbols are inacurate, but are fixed in step fetchErc20TokensSymbols
              coingeckoId: coin.id,
              name: coin.name,
              contractAddress,
            }

            const existingIdx =
              evmNetwork.balancesConfig['evm-erc20'].tokens?.findIndex(
                (t: typeof token) => t.contractAddress === contractAddress,
              ) ?? -1

            if (evmNetwork.balancesConfig['evm-erc20'].tokens && existingIdx !== -1)
              evmNetwork.balancesConfig['evm-erc20'].tokens[existingIdx] = token
            else evmNetwork.balancesConfig['evm-erc20'].tokens?.push(token)
          }
        }
      }
    }
  }

  validateNetworks(knownEvmNetworks, KnownEthNetworkConfigDef)
  await writeFile(
    FILE_KNOWN_EVM_NETWORKS,
    await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )
}
