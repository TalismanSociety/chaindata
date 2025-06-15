import type { Dictionary } from 'lodash'
import { DotNetwork, DotToken, Token, TokenSchema } from '@talismn/chaindata'
import keyBy from 'lodash/keyBy'
import { z } from 'zod/v4'

import {
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_OUTPUT_TOKENS_POLKADOT,
} from '../../shared/constants'
import { DotNetworkConfig, DotNetworksConfigFileSchema } from '../../shared/schemas'
import { DotNetworkMetadataExtractsFileSchema } from '../../shared/schemas/DotNetworkMetadataExtract'
import {
  fixAssetUrl,
  getAssetPathFromCoingeckoTokenId,
  getAssetPathFromUrl,
  parseJsonFile,
  parseYamlFile,
  validateDebug,
  writeJsonFile,
} from '../../shared/util'
import { checkDuplicates } from './helpers/checkDuplicates'

export const buildPolkadotTokens = async () => {
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)

  const dotTokens: Token[] = metadataExtracts
    .flatMap(
      (network) =>
        Object.values<DotToken>(network.tokens).map((token) => validateDebug(token, TokenSchema, 'token')) ?? [],
    )
    .map(fixLogoUrl)
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  checkDuplicates(dotTokens)

  await writeJsonFile(FILE_OUTPUT_TOKENS_POLKADOT, dotTokens, {
    format: true,
    schema: z.array(TokenSchema),
  })
}

const fixLogoUrl = (token: Token): Token => {
  token.logo = fixAssetUrl(token.logo) // in most cases this will clear out the logo because it doesnt exist

  if (!token.logo && token.coingeckoId) token.logo = getAssetPathFromCoingeckoTokenId(token.coingeckoId)

  return token
}
