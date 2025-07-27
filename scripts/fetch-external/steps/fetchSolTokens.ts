import { BALANCE_MODULES, deriveMiniMetadataId, SolSplTokenConfig } from '@talismn/balances'
import { ChainConnectorDotStub, ChainConnectorSolStub } from '@talismn/chain-connectors'
import { DotNetwork, DotToken, NetworkId, SolNetwork, Token, TokenId, TokenType } from '@talismn/chaindata-provider'
import { isSolanaAddress } from '@talismn/crypto'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
import toPairs from 'lodash/toPairs'
import values from 'lodash/values'

import { CoingeckoCoin, fetchCoins } from '../../shared/coingecko'
import { FILE_INPUT_NETWORKS_SOLANA, FILE_MODULE_CACHE_SOL_SPL, FILE_SOL_TOKENS_PREBUILD } from '../../shared/constants'
import { getRpcProvider } from '../../shared/getRpcProvider'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { DotNetworkConfig, DotNetworkSpecs, SolNetworksConfigFileSchema } from '../../shared/schemas'
import { DotNetworkMetadataExtract } from '../../shared/schemas/DotNetworkMetadataExtract'
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

      // const tokenConfigs = mod.type === 'sol-spl' ? (network.tokens?.[mod.type] ?? []) : []

      // // for mainnet spl tokens, enright with coingecko data
      // if (mod.type === 'sol-spl' && network.id === 'solana-mainnet') {
      //   const newConfigs = keyBy(network.tokens?.['sol-spl'], (c) => c.mintAddress)
      //   for (const cgToken of cgMainnetTokensConfig) {
      //     newConfigs[cgToken.mintAddress] = assign(
      //       {
      //         mintAddress: cgToken.mintAddress,
      //         symbol: cgToken.symbol,
      //         name: cgToken.name,
      //         coingeckoId: cgToken.coingeckoId,
      //       },
      //       newConfigs[cgToken.mintAddress],
      //     ) as SolSplTokenConfig
      //   }

      //   // replace content of the array
      //   tokenConfigs.splice(0, tokenConfigs.length, ...Object.values(newConfigs))
      // }

      // // if (mod.type !== 'sol-spl') continue // only SPL tokens for now

      // //  const connector = new ChainConnectorSolStub(network as SolNetwork)
      // const tokens = await mod.fetchTokens({
      //   networkId: network.id,
      //   tokens: mod.type === 'sol-native' ? [network.nativeCurrency ?? {}] : tokenConfigs,
      //   cache: mod.type === 'sol-spl' ? splCache : {},
      //   connector,
      // })

      // // merge fetched tokens with previous ones
      // results = results.filter((t) => t.networkId !== network.id || t.type !== mod.type).concat(...tokens)
      // const existingTokens = prevSolTokens.filter((t) => t.networkId === network.id && t.type === mod.type)
      // const mergedTokens = [...existingTokens, ...tokens]
      // prevSolTokens.push(...mergedTokens)
    }
  }

  // const mainnet = solNetworks.find((n) => n.id === 'solana-mainnet') as SolNetwork
  // for (const mod of BALANCE_MODULES.filter((mod) => mod.platform === 'solana')) {
  //   const tokensConfig = mod.type === 'sol-native' ? (mainnet.tokens?.['sol-spl'] ?? []) : []
  // }

  // const mod = BALANCE_MODULES.find((m) => m.platform === 'solana' && m.type === 'sol-spl')
  // if (!mod) throw new Error('SPL module not found')

  // const tokens = await mod.fetchTokens({
  //   networkId: 'solana-mainnet',
  //   tokens: cgMainnetTokensConfig,
  //   cache: keyBy(arSolSplCache, (t) => t.id),
  //   connector: new ChainConnectorSolStub(mainnet),
  // })

  await writeJsonFile(
    FILE_MODULE_CACHE_SOL_SPL,
    values(splCache).sort((a, b) => a.id.localeCompare(b.id)),
    // .filter((entry) => !!entry)
    // .sort((a, b) => {
    //   if (!a.id || !b.id) {
    //     console.log({ a, b })
    //     throw new Error('Invalid cache entry found')
    //   }
    //   return a.id.localeCompare(b.id)
    // }),
  )

  await writeJsonFile(
    FILE_SOL_TOKENS_PREBUILD,
    results.sort((a, b) => a.id.localeCompare(b.id)),
    {
      schema: SolTokensPreBuildFileSchema,
    },
  )

  // const networksToUpdate = dotNetworks
  //   .map((network) => ({
  //     network,
  //     miniMetadatas: metadataExtractsById[network.id]?.miniMetadatas,
  //     rpcs: getRpcsByStatus(network.id, 'polkadot', 'OK'),
  //     specs: specsById[network.id] as DotNetworkSpecs | undefined,
  //     tokens: tokensByNetwork[network.id] ?? [],
  //     coins,
  //   }))
  //   .filter((args): args is FetchDotNetworkTokensArgs => {
  //     const { rpcs, specs, miniMetadatas } = args
  //     if (!rpcs || !rpcs.length) {
  //       // console.warn('No rpcs available for network %s, skipping fetchDotTokens', args.network.id)
  //       return false // no rpcs available for this network - cant be updated
  //     }
  //     if (!specs) {
  //       console.warn('No specs available for network %s, skipping fetchDotTokens', args.network.id)
  //       return false // no specs available for this network - cant be updated
  //     }
  //     if (!miniMetadatas) {
  //       console.warn('No miniMetadatas available for network %s, skipping fetchDotTokens', args.network.id)
  //       return false // no specs available for this network - cant be updated
  //     }
  //     return true // all gud!
  //   })

  // const result = await PromisePool.withConcurrency(4)
  //   .for(networksToUpdate)
  //   .process((network) =>
  //     withTimeout(
  //       () => fetchDotNetworkTokens(network),
  //       30_000,
  //       'Failed to fetch metadata extract for ' + network.network.id,
  //     ),
  //   )

  // for (const error of result.errors) console.warn(error.message)
  // console.log(
  //   'fetchDotTokens processed %s networks (success:%s errors:%s)',
  //   networksToUpdate.length,
  //   result.results.length,
  //   result.errors.length,
  // )

  // // override tokens only for networks that succeeded
  // for (const [networkId, tokens] of result.results) tokensByNetwork[networkId] = tokens

  // const data = values(tokensByNetwork)
  //   .flat()
  //   .sort((a, b) => a.id.localeCompare(b.id))

  // await writeJsonFile(FILE_DOT_TOKENS_PREBUILD, data, {
  //   schema: DotTokensPreBuildFileSchema,
  // })
}

type FetchDotNetworkTokensArgs = {
  network: DotNetworkConfig
  rpcs: string[]
  specs: DotNetworkSpecs
  miniMetadatas: DotNetworkMetadataExtract['miniMetadatas']
  tokens: DotToken[]
  coins: CoingeckoCoin[]
}

const fetchDotNetworkTokens = async ({
  network,
  specs,
  rpcs,
  miniMetadatas,
  tokens: prevTokens,
  coins,
}: FetchDotNetworkTokensArgs): Promise<[NetworkId, Token[]]> => {
  console.log('Fetching tokens for network %s', network.id)

  const provider = getRpcProvider(rpcs)

  try {
    await provider.isReady

    const connector = new ChainConnectorDotStub(network as DotNetwork)

    const newTokens: Record<string, any> = {}

    for (const mod of BALANCE_MODULES.filter((mod) => mod.platform === 'polkadot')) {
      try {
        const source = mod.type as keyof DotNetworkConfig['balancesConfig']
        const chainId = network.id

        const { specVersion } = specs.runtimeVersion

        const miniMetadataId = deriveMiniMetadataId({
          source,
          chainId,
          specVersion,
        })

        const miniMetadata = miniMetadatas[miniMetadataId]

        if (!miniMetadata)
          throw new Error(`Up to date MiniMetadata not found for network ${chainId} and module ${source}`)

        const tokens = (
          mod.type === 'substrate-native' ? [network.nativeCurrency ?? {}] : (network.tokens?.[source] ?? [])
        ) as any[]

        if (network.id === 'hydradx' && mod.type === 'substrate-hydration') {
          const hydrationCoingeckoIds = getHydrationCoingeckoIdsByAssetId(coins)
          for (const [strOnChainId, coingeckoId] of toPairs(hydrationCoingeckoIds)) {
            const onChainId = Number(strOnChainId)
            const existingToken = tokens.find((t) => t.onChainId === onChainId)
            if (existingToken) {
              // if token already exists, just update its coingeckoId
              existingToken.coingeckoId = coingeckoId
            } else {
              // otherwise create a new token with the coingeckoId
              tokens.push({
                onChainId,
                coingeckoId,
              })
            }
          }
        }

        const moduleTokens: Token[] = await mod.fetchTokens({
          networkId: network.id,
          tokens: (mod.type === 'substrate-native'
            ? [network.nativeCurrency ?? {}]
            : (network.tokens?.[source] ?? [])) as any[],
          miniMetadata,
          connector,
          cache: {},
        })

        Object.assign(
          newTokens,
          keyBy(moduleTokens, (t) => t.id),
        )
      } catch (cause) {
        console.log(
          'Failed to fetch tokens for module %s on network %s: %s',
          mod.type,
          network.id,
          (cause as Error).message,
        )
        // if it fails we want to return the list of previous tokens for that module/network
        Object.assign(
          newTokens,
          keyBy(
            prevTokens.filter((t) => t.type === mod.type && t.networkId === network.id),
            (t) => t.id,
          ),
        )
      }
    }

    return [network.id, Object.values(newTokens)]
  } catch (cause) {
    // decAnyMetadata throws null if metadata version is unsupported
    if (cause === null) console.warn('Unsupported metadata version on network', network.id)
    throw new Error(`Failed to fetch dot tokens for ${network.id}: ${cause}`, { cause })
  } finally {
    await provider.disconnect()
  }
}

const getHydrationCoingeckoIdsByAssetId = (coins: CoingeckoCoin[]): Record<string, string> => {
  const prefix = 'asset_registry%2F'

  return coins.reduce((acc, coin) => {
    const hydrationId = coin.platforms?.['hydration']

    if (hydrationId?.startsWith(prefix)) {
      try {
        // check that we get a valid number
        const assetId = Number(hydrationId.substring(prefix.length).trim())
        if (isNaN(assetId)) throw new Error('Invalid assetId')

        return { ...acc, [assetId]: coin.id }
      } catch {}
    }

    return acc
  }, {})
}
