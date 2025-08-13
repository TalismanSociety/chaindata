import { BALANCE_MODULES, SolSplTokenConfig } from '@talismn/balances'
import { ChainConnectorSolStub } from '@talismn/chain-connectors'
import { SolNetwork, Token, TokenId, TokenType } from '@talismn/chaindata-provider'
import { isSolanaAddress } from '@talismn/crypto'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'

import { fetchCoins } from '../../shared/coingecko'
import { FILE_INPUT_NETWORKS_SOLANA, FILE_MODULE_CACHE_SOL_SPL, FILE_SOL_TOKENS_PREBUILD } from '../../shared/constants'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { SolNetworksConfigFileSchema } from '../../shared/schemas'
import { SolTokensPreBuildFileSchema } from '../../shared/schemas/SolTokensPreBuild'
import { writeJsonFile } from '../../shared/writeFile'

type CacheEntry = { id: string } & Record<string, unknown>
type TokenCache = Partial<Record<TokenType, Record<TokenId, CacheEntry>>>

export const fetchSolTokens = async () => {
  const prevSolTokens = parseJsonFile(FILE_SOL_TOKENS_PREBUILD, SolTokensPreBuildFileSchema)
  const solNetworks = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)

  const arSolSplCache = parseJsonFile<CacheEntry[]>(FILE_MODULE_CACHE_SOL_SPL)
  const splCache = keyBy(arSolSplCache, (t) => t.id)

  const coins = await fetchCoins()

  // consider only solana mainnet tokens
  const allCgMainnetTokensConfig = coins
    .filter((c) => c.platforms?.solana && isSolanaAddress(c.platforms.solana))
    .map((c) => ({
      networkId: 'solana-mainnet',
      mintAddress: c.platforms.solana,
      coingeckoId: c.id,
    }))

  console.log('found %s cg tokens', allCgMainnetTokensConfig.length)
  const cgMainnetTokensConfig = allCgMainnetTokensConfig //.slice(0, 3000)

  let results: Token[] = prevSolTokens.slice()

  for (const network of solNetworks) {
    const connector = new ChainConnectorSolStub(network as SolNetwork)

    for (const mod of BALANCE_MODULES.filter((mod) => mod.platform === 'solana')) {
      console.log(`Fetching tokens for module ${mod.type} on network ${network.id}`)

      try {
        switch (mod.type) {
          case 'sol-native': {
            const tokens = await mod.fetchTokens({
              networkId: network.id,
              tokens: [network.nativeCurrency ?? {}],
              cache: {},
              connector,
            })
            results = results.filter((t) => t.networkId !== network.id || t.type !== mod.type).concat(...tokens)
            break
          }
          case 'sol-spl': {
            const tokenConfigs = mod.type === 'sol-spl' ? (network.tokens?.[mod.type] ?? []) : []

            // for mainnet spl tokens, enrich with coingecko tokens list
            if (mod.type === 'sol-spl' && network.id === 'solana-mainnet') {
              const newConfigs = keyBy(network.tokens?.['sol-spl'], (c) => c.mintAddress)
              for (const cgToken of cgMainnetTokensConfig) {
                newConfigs[cgToken.mintAddress] = assign(
                  {
                    mintAddress: cgToken.mintAddress,
                    coingeckoId: cgToken.coingeckoId,
                  },
                  newConfigs[cgToken.mintAddress],
                ) as SolSplTokenConfig
              }

              // replace content of the array
              tokenConfigs.splice(0, tokenConfigs.length, ...Object.values(newConfigs))
            }

            const tokens = await mod.fetchTokens({
              networkId: network.id,
              tokens: tokenConfigs,
              cache: splCache,
              connector,
            })

            // merge fetched tokens with previous ones
            results = results.filter((t) => t.networkId !== network.id || t.type !== mod.type).concat(...tokens)
            break
          }
        }
      } catch (cause) {
        console.warn(
          'Failed to fetch tokens for module %s on network %s: %s',
          mod.type,
          network.id,
          (cause as Error).message,
        )
        continue // if it fails we want to skip this module and continue with the next one
      }
    }
  }

  console.log('Fetched %s solana tokens', results.length)

  await writeJsonFile(
    FILE_MODULE_CACHE_SOL_SPL,
    values(splCache).sort((a, b) => a.id.localeCompare(b.id)),
  )

  await writeJsonFile(
    FILE_SOL_TOKENS_PREBUILD,
    results.sort((a, b) => a.id.localeCompare(b.id)),
    {
      schema: SolTokensPreBuildFileSchema,
    },
  )
}
