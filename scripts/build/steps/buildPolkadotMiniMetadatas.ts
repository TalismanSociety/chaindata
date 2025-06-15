import values from 'lodash/values'
import { z } from 'zod/v4'

import { FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, FILE_OUTPUT_MINI_METADATAS } from '../../shared/constants'
import { DotNetworkMetadataExtractsFileSchema } from '../../shared/schemas/DotNetworkMetadataExtract'
import { parseJsonFile, writeJsonFile } from '../../shared/util'
import { checkDuplicates } from './helpers/checkDuplicates'

export const buildPolkadotMiniMetadatas = async () => {
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)

  const miniMetadatas = metadataExtracts
    .flatMap((extract) => values(extract.miniMetadatas))
    .sort((a, b) => a.id.localeCompare(b.id))

  checkDuplicates(miniMetadatas)

  await writeJsonFile(FILE_OUTPUT_MINI_METADATAS, miniMetadatas, {
    format: true,
    schema: z.array(z.any()),
  })
}
