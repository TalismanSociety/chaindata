import type { Dictionary } from 'lodash'
import {
  DotNetwork,
  DotNetworkSchema,
  DotToken,
  subNativeTokenId,
  Token,
  TokenSchema,
} from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import { z } from 'zod/v4'

import {
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_OUTPUT_NETWORKS_POLKADOT,
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
  const dotNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const dotNetworks = parseJsonFile(FILE_OUTPUT_NETWORKS_POLKADOT, z.array(DotNetworkSchema))

  const dotTokens: Token[] = metadataExtracts
    .flatMap(
      (network) =>
        Object.values<DotToken>(network.tokens).map((token) => validateDebug(token, TokenSchema, 'token')) ?? [],
    )
    .map(fixLogoUrl)
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  // apply nativeCurrency properties
  for (const network of dotNetworks) {
    const nativeToken = dotTokens.find((t) => t.id === network.nativeTokenId)
    if (!nativeToken) {
      console.warn(`Native token not found for network ${network.id}, skipping...`)
      continue
    }
    Object.assign(nativeToken, network.nativeCurrency)
  }

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
