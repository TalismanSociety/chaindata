import { write } from 'fs'

import { Network, NetworkSchema, Token, TokenSchema } from '@talismn/chaindata'
import { z } from 'zod/v4'

import {
  FILE_OUTPUT_CHAINDATA,
  FILE_OUTPUT_MINI_METADATAS,
  FILE_OUTPUT_NETWORKS_ALL,
  FILE_OUTPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_NETWORKS_POLKADOT,
  FILE_OUTPUT_TOKENS_ALL,
  FILE_OUTPUT_TOKENS_ETHEREUM,
  FILE_OUTPUT_TOKENS_POLKADOT,
} from '../../shared/constants'
import { parseJsonFile, writeJsonFile } from '../../shared/util'

const TokensSchema = z.array(TokenSchema)
const NetworksSchema = z.array(NetworkSchema)

const MiniMetadatasSchema = z.array(z.any())

const ChainDataSchema = z.strictObject({
  tokens: TokensSchema,
  networks: NetworksSchema,
  miniMetadatas: MiniMetadatasSchema,
})

export const buildConsolidatedData = async () => {
  const ethTokens = parseJsonFile<Token[]>(FILE_OUTPUT_TOKENS_ETHEREUM)
  const dotTokens = parseJsonFile<Token[]>(FILE_OUTPUT_TOKENS_POLKADOT)
  const tokens = ethTokens.concat(...dotTokens)
  await writeJsonFile(FILE_OUTPUT_TOKENS_ALL, tokens, { schema: z.array(TokenSchema) })

  const ethNetworks = parseJsonFile<Network[]>(FILE_OUTPUT_NETWORKS_ETHEREUM)
  const dotNetworks = parseJsonFile<Network[]>(FILE_OUTPUT_NETWORKS_POLKADOT)
  const networks = ethNetworks.concat(...dotNetworks)
  await writeJsonFile(FILE_OUTPUT_NETWORKS_ALL, networks, { schema: z.array(NetworkSchema) })

  const miniMetadatas = parseJsonFile(FILE_OUTPUT_MINI_METADATAS, MiniMetadatasSchema)

  await writeJsonFile(
    FILE_OUTPUT_CHAINDATA,
    {
      networks,
      tokens,
      miniMetadatas,
    },
    { schema: ChainDataSchema },
  )
}
