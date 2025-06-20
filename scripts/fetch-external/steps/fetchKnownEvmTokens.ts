import { EvmErc20TokenConfig, EvmErc20TokenConfigSchema } from '@talismn/balances'

import { FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { KnownEthNetworksFileSchema } from '../../shared/schemas'
import { parseJsonFile, writeJsonFile } from '../../shared/util'
import { fetchAssetPlatforms, fetchCoins } from '../coingecko'

export const fetchKnownEvmTokens = async () => {
  const assetPlatforms = await fetchAssetPlatforms()
  const coins = await fetchCoins()

  const knownEvmNetworks = parseJsonFile(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)

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
            if (!evmNetwork.tokens) evmNetwork.tokens = {}
            if (!evmNetwork.tokens['evm-erc20']) {
              evmNetwork.tokens['evm-erc20'] = []
            }

            const token: EvmErc20TokenConfig = {
              // symbol will be fetched from chain later in fetchErc20TokenSymbols.ts
              coingeckoId: coin.id,
              name: coin.name,
              contractAddress: contractAddress as `0x${string}`,
            }

            if (!EvmErc20TokenConfigSchema.safeParse(token).success) {
              console.warn(
                `Token ${token.name} (${token.contractAddress}) does not match EvmErc20TokenConfigSchema, skipping`,
              )
              console.log(token)
              continue
            }

            const existingIdx =
              evmNetwork.tokens['evm-erc20']?.findIndex((t: typeof token) => t.contractAddress === contractAddress) ??
              -1

            if (evmNetwork.tokens['evm-erc20'] && existingIdx !== -1)
              evmNetwork.tokens['evm-erc20'][existingIdx] = token
            else evmNetwork.tokens['evm-erc20']?.push(token)
          }
        }
      }
    }
  }

  await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, knownEvmNetworks, {
    schema: KnownEthNetworksFileSchema,
    format: true,
  })
}
