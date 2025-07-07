import {
  AnyMiniMetadataSchema,
  ChaindataFileSchema,
  Network,
  NetworkSchema,
  Token,
  TokenSchema,
} from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import { z } from 'zod/v4'

import {
  FILE_OUTPUT_CHAINDATA,
  FILE_OUTPUT_CHAINDATA_MINIFIED,
  FILE_OUTPUT_MINI_METADATAS,
  FILE_OUTPUT_NETWORKS_ALL,
  FILE_OUTPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_NETWORKS_POLKADOT,
  FILE_OUTPUT_TOKENS_ALL,
  FILE_OUTPUT_TOKENS_ETHEREUM,
  FILE_OUTPUT_TOKENS_POLKADOT,
} from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { writeJsonFile } from '../../shared/writeFile'

const MiniMetadatasFileSchema = z.array(AnyMiniMetadataSchema)

export const buildConsolidatedData = async () => {
  const ethTokens = parseJsonFile<Token[]>(FILE_OUTPUT_TOKENS_ETHEREUM)
  const dotTokens = parseJsonFile<Token[]>(FILE_OUTPUT_TOKENS_POLKADOT)
  const allTokens = ethTokens.concat(...dotTokens)
  await writeJsonFile(FILE_OUTPUT_TOKENS_ALL, allTokens, { schema: z.array(TokenSchema) })

  const ethNetworks = parseJsonFile<Network[]>(FILE_OUTPUT_NETWORKS_ETHEREUM)
  const dotNetworks = parseJsonFile<Network[]>(FILE_OUTPUT_NETWORKS_POLKADOT)
  const allNetworks = ethNetworks.concat(...dotNetworks)
  await writeJsonFile(FILE_OUTPUT_NETWORKS_ALL, allNetworks, { schema: z.array(NetworkSchema) })

  const networksById = keyBy(allNetworks, (n) => n.id)
  const tokensById = keyBy(allTokens, (t) => t.id)

  const allMiniMetadatas = parseJsonFile(FILE_OUTPUT_MINI_METADATAS, MiniMetadatasFileSchema)

  const networks = allNetworks.filter((n) => {
    const nativeToken = tokensById[n.nativeTokenId]
    if (!nativeToken) {
      console.warn(`Ignoring network ${n.id}: no native token ${n.nativeTokenId} found`)
      return false
    }
    return true
  })

  const tokens = allTokens.filter((token) => {
    const network = networksById[token.networkId]
    if (!network) {
      console.warn(`Ignoring token ${token.id}: no network ${token.networkId} found`)
      return false
    }
    return true
  })

  const miniMetadatas = allMiniMetadatas.filter((m) => {
    const network = networksById[m.chainId]
    if (!network) {
      console.warn(`Ignoring miniMetadata ${m.id}: no network ${m.chainId} found`)
      return false
    }
    return true
  })

  const chaindata = {
    networks,
    tokens,
    miniMetadatas,
  }

  await writeJsonFile(FILE_OUTPUT_CHAINDATA, chaindata, { schema: ChaindataFileSchema })
  await writeJsonFile(FILE_OUTPUT_CHAINDATA_MINIFIED, chaindata, { schema: ChaindataFileSchema, format: false })
}
