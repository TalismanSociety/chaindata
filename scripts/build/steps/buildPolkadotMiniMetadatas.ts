import { AnyMiniMetadataSchema } from '@talismn/chaindata-provider'
import values from 'lodash/values'
import { z } from 'zod/v4'

import { checkDuplicates } from '../../shared/checkDuplicates'
import { FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, FILE_OUTPUT_MINI_METADATAS } from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { DotNetworkMetadataExtractsFileSchema } from '../../shared/schemas/DotNetworkMetadataExtract'
import { writeJsonFile } from '../../shared/writeFile'

export const buildPolkadotMiniMetadatas = async () => {
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)

  const miniMetadatas = metadataExtracts
    .flatMap((extract) => values(extract.miniMetadatas))
    .sort((a, b) => a.id.localeCompare(b.id))

  checkDuplicates(miniMetadatas)

  await writeJsonFile(FILE_OUTPUT_MINI_METADATAS, miniMetadatas, {
    schema: z.array(AnyMiniMetadataSchema),
  })
}
