import z4 from 'zod/v4'

import {
  DotNetworksConfigFileSchema,
  EthNetworksConfigFileSchema,
  KnownEthNetworksOverridesFileSchema,
} from './shared/schemas'
import { CoingeckoOverridesFileSchema } from './shared/schemas/CoingeckoOverrides'
import { writeJsonFile } from './shared/writeFile'

const tryUpdateSchema = async (filePath: string, schema: z4.ZodTypeAny) => {
  try {
    await writeJsonFile(
      filePath,
      z4.toJSONSchema(schema, {
        // required because of EthereumAddressSchema (which uses a tranform), otherwise generation breaks
        io: 'input',
      }),
    )
    console.log(`Schema updated successfully: ${filePath.split('/').pop()}`)
  } catch (error) {
    console.error(`Failed to update schema ${filePath.split('/').pop()}:`, error)
  }
}

await tryUpdateSchema('./schemas/networks-ethereum.json', EthNetworksConfigFileSchema)

await tryUpdateSchema('./schemas/known-networks-ethereum-overrides.json', KnownEthNetworksOverridesFileSchema)

await tryUpdateSchema('./schemas/coingecko-overrides.json', CoingeckoOverridesFileSchema)

await tryUpdateSchema('./schemas/networks-polkadot.json', DotNetworksConfigFileSchema)
