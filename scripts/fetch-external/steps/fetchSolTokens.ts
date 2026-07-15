import type { Address } from '@solana/kit'
import { address } from '@solana/kit'
import { BALANCE_MODULES, SolSplTokenConfig, SolToken2022TokenConfig } from '@talismn/balances'
import { ChainConnectorSolStub } from '@talismn/chain-connectors'
import { SolNetwork, Token, TokenId } from '@talismn/chaindata-provider'
import { isSolanaAddress } from '@talismn/crypto'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'

import { fetchCoins } from '../../shared/coingecko'
import {
  FILE_INPUT_NETWORKS_SOLANA,
  FILE_MODULE_CACHE_SOL_SPL,
  FILE_MODULE_CACHE_SOL_TOKEN2022,
  FILE_SOL_MINT_PROGRAM_OWNERS_CACHE,
  FILE_SOL_TOKENS_PREBUILD,
} from '../../shared/constants'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { SolNetworksConfigFileSchema } from '../../shared/schemas'
import { SolTokensPreBuildFileSchema } from '../../shared/schemas/SolTokensPreBuild'
import { writeJsonFile } from '../../shared/writeFile'

type CacheEntry = { id: string } & Record<string, unknown>
type MintProgramOwnerCache = Record<string, string | null>
type SolMintTokenConfig = SolSplTokenConfig | SolToken2022TokenConfig
type CoingeckoSolTokenConfig = {
  networkId: string
  mintAddress: string
  coingeckoId: string
}

const SOL_TOKEN_PROGRAM_ID = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const SOL_TOKEN_2022_PROGRAM_ID = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
const MINT_PROGRAM_OWNER_LOOKUP_BATCH_SIZE = 100

export const fetchSolTokens = async () => {
  const prevSolTokens = parseJsonFile(FILE_SOL_TOKENS_PREBUILD, SolTokensPreBuildFileSchema)
  const solNetworks = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)

  const arSolSplCache = parseJsonFile<CacheEntry[]>(FILE_MODULE_CACHE_SOL_SPL)
  const splCache = keyBy(arSolSplCache, (t) => t.id)
  const arSolToken2022Cache = parseJsonFile<CacheEntry[]>(FILE_MODULE_CACHE_SOL_TOKEN2022)
  const token2022Cache = keyBy(arSolToken2022Cache, (t) => t.id)
  const mintProgramOwnersCache = parseJsonFile<MintProgramOwnerCache>(FILE_SOL_MINT_PROGRAM_OWNERS_CACHE)

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
            const configuredTokenConfigs = network.tokens?.['sol-spl'] ?? []
            const tokenConfigs =
              network.id === 'solana-mainnet'
                ? mergeCoingeckoTokenConfigs(configuredTokenConfigs, cgMainnetTokensConfig)
                : configuredTokenConfigs

            const filteredTokenConfigs = await filterTokenConfigsByProgramOwner({
              connector,
              networkId: network.id,
              tokenConfigs,
              mintProgramOwnersCache,
              programId: SOL_TOKEN_PROGRAM_ID,
            })
            warnAboutSkippedConfiguredTokens(network.id, mod.type, configuredTokenConfigs, filteredTokenConfigs)

            const tokens = await mod.fetchTokens({
              networkId: network.id,
              tokens: filteredTokenConfigs,
              cache: splCache,
              connector,
            })

            // merge fetched tokens with previous ones
            results = results.filter((t) => t.networkId !== network.id || t.type !== mod.type).concat(...tokens)
            break
          }
          case 'sol-token2022': {
            const configuredTokenConfigs = network.tokens?.['sol-token2022'] ?? []
            const tokenConfigs =
              network.id === 'solana-mainnet'
                ? mergeCoingeckoTokenConfigs(configuredTokenConfigs, cgMainnetTokensConfig)
                : configuredTokenConfigs

            const filteredTokenConfigs = await filterTokenConfigsByProgramOwner({
              connector,
              networkId: network.id,
              tokenConfigs,
              mintProgramOwnersCache,
              programId: SOL_TOKEN_2022_PROGRAM_ID,
            })
            warnAboutSkippedConfiguredTokens(network.id, mod.type, configuredTokenConfigs, filteredTokenConfigs)

            const tokens = await mod.fetchTokens({
              networkId: network.id,
              tokens: filteredTokenConfigs,
              cache: token2022Cache,
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
    FILE_MODULE_CACHE_SOL_TOKEN2022,
    values(token2022Cache).sort((a, b) => a.id.localeCompare(b.id)),
  )
  await writeJsonFile(FILE_SOL_MINT_PROGRAM_OWNERS_CACHE, getSortedMintProgramOwnersCache(mintProgramOwnersCache))

  await writeJsonFile(
    FILE_SOL_TOKENS_PREBUILD,
    results.sort((a, b) => a.id.localeCompare(b.id)),
    {
      schema: SolTokensPreBuildFileSchema,
    },
  )
}

const mergeCoingeckoTokenConfigs = <T extends SolMintTokenConfig>(
  tokenConfigs: T[],
  coingeckoTokenConfigs: CoingeckoSolTokenConfig[],
): T[] => {
  const configsByMintAddress = keyBy(tokenConfigs, (c) => c.mintAddress)

  for (const cgToken of coingeckoTokenConfigs) {
    configsByMintAddress[cgToken.mintAddress] = assign(
      {
        networkId: cgToken.networkId,
        mintAddress: cgToken.mintAddress,
        coingeckoId: cgToken.coingeckoId,
      },
      configsByMintAddress[cgToken.mintAddress],
    ) as T
  }

  return values(configsByMintAddress) as T[]
}

const filterTokenConfigsByProgramOwner = async <T extends SolMintTokenConfig>({
  connector,
  networkId,
  tokenConfigs,
  mintProgramOwnersCache,
  programId,
}: {
  connector: ChainConnectorSolStub
  networkId: string
  tokenConfigs: T[]
  mintProgramOwnersCache: MintProgramOwnerCache
  programId: Address
}): Promise<T[]> => {
  if (!tokenConfigs.length) return tokenConfigs

  const mintAddresses = [...new Set(tokenConfigs.map((t) => t.mintAddress))]
  const unknownMintAddresses = mintAddresses.filter(
    (mintAddress) => !(getMintProgramOwnerCacheKey(networkId, mintAddress) in mintProgramOwnersCache),
  )

  if (unknownMintAddresses.length) {
    const rpc = await connector.getRpc()

    const mintAddressesToFetch: Address[] = []
    for (const mintAddress of unknownMintAddresses) {
      try {
        mintAddressesToFetch.push(address(mintAddress))
      } catch (cause) {
        console.warn('Invalid Solana mint address %s: %s', mintAddress, (cause as Error).message)
        mintProgramOwnersCache[getMintProgramOwnerCacheKey(networkId, mintAddress)] = null
      }
    }

    console.log('Fetching program owners for %s Solana mint accounts on %s', mintAddressesToFetch.length, networkId)
    for (const chunk of chunks(mintAddressesToFetch, MINT_PROGRAM_OWNER_LOOKUP_BATCH_SIZE)) {
      const { value: accounts } = await rpc.getMultipleAccounts(chunk, { encoding: 'base64' }).send()
      accounts.forEach((account, index) => {
        mintProgramOwnersCache[getMintProgramOwnerCacheKey(networkId, chunk[index])] = account?.owner ?? null
      })
    }
  }

  return tokenConfigs.filter(
    (tokenConfig) =>
      mintProgramOwnersCache[getMintProgramOwnerCacheKey(networkId, tokenConfig.mintAddress)] === programId,
  )
}

const warnAboutSkippedConfiguredTokens = <T extends SolMintTokenConfig>(
  networkId: string,
  moduleType: 'sol-spl' | 'sol-token2022',
  configuredTokenConfigs: T[],
  filteredTokenConfigs: T[],
) => {
  const filteredMintAddresses = new Set(filteredTokenConfigs.map((t) => t.mintAddress))
  const skippedTokenConfigs = configuredTokenConfigs.filter((t) => !filteredMintAddresses.has(t.mintAddress))
  if (skippedTokenConfigs.length) {
    console.warn(
      'Ignoring configured %s tokens on %s with non-matching mint program owner: %s',
      moduleType,
      networkId,
      skippedTokenConfigs.map((t) => t.mintAddress).join(', '),
    )
  }
}

const chunks = <T>(items: T[], size: number) => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

const getMintProgramOwnerCacheKey = (networkId: string, mintAddress: string) => `${networkId}:${mintAddress}`

const getSortedMintProgramOwnersCache = (mintProgramOwnersCache: MintProgramOwnerCache) =>
  Object.fromEntries(
    Object.entries(mintProgramOwnersCache)
      .filter(([key]) => key.includes(':'))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
