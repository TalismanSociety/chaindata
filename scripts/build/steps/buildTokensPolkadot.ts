import { DotToken, Token, TokenSchema } from '@talismn/chaindata'
import { z } from 'zod/v4'

import { FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, FILE_OUTPUT_TOKENS_POLKADOT } from '../../shared/constants'
import { DotNetworkMetadataExtractsFileSchema } from '../../shared/schemas/DotNetworkMetadataExtract'
import { parseJsonFile, validateDebug, writeJsonFile } from '../../shared/util'

export const buildTokensPolkadot = async () => {
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)

  const dotTokens: Token[] = metadataExtracts
    .flatMap(
      (network) =>
        Object.values<DotToken>(network.tokens).map((token) => validateDebug(token, TokenSchema, 'token')) ?? [],
    )
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  await writeJsonFile(FILE_OUTPUT_TOKENS_POLKADOT, dotTokens, {
    format: true,
    schema: z.array(TokenSchema),
  })
}
