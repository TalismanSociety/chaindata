import z4 from 'zod/v4'

import {
  CoingeckoOverridesFileSchema,
  DotNetworksConfigFileSchema,
  EthNetworksConfigFileSchema,
  SolNetworksConfigFileSchema,
} from './shared/schemas'
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

await tryUpdateSchema('./schemas/networks-polkadot.json', DotNetworksConfigFileSchema)
await tryUpdateSchema('./schemas/networks-solana.json', SolNetworksConfigFileSchema)
await tryUpdateSchema('./schemas/networks-ethereum.json', EthNetworksConfigFileSchema)
await tryUpdateSchema('./schemas/coingecko-overrides.json', CoingeckoOverridesFileSchema)
