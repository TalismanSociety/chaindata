import { DotNetworkSchema, solNativeTokenId, SolNetwork, SolNetworkSchema } from '@talismn/chaindata-provider'
import assign from 'lodash/assign'
import { z } from 'zod/v4'

import { FILE_INPUT_NETWORKS_SOLANA, FILE_OUTPUT_NETWORKS_SOLANA } from '../../shared/constants'
import { getNetworkLogoUrl, getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseYamlFile } from '../../shared/parseFile'
import { SolNetworksConfigFileSchema } from '../../shared/schemas'
import { writeJsonFile } from '../../shared/writeFile'

export const buildSolanaNetworks = async () => {
  const solNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)

  const solNetworks: SolNetwork[] = solNetworksConfig
    .map((config) => {
      const nativeCurrency = assign(config.nativeCurrency, {
        logo: getTokenLogoUrl(
          config.nativeCurrency?.logo,
          config.nativeCurrency?.coingeckoId,
          config.nativeCurrency?.symbol,
        ),
      })

      return {
        ...config,
        platform: 'solana',
        nativeTokenId: solNativeTokenId(config.id),
        logo: getNetworkLogoUrl(config.logo, config.id, nativeCurrency),
      } as SolNetwork
    })
    .filter((network): network is SolNetwork => {
      const parsed = SolNetworkSchema.safeParse(network)
      if (!parsed.success) {
        console.warn(`Invalid Solana network configuration for ${network.id}:`, parsed.error)
        return false
      }
      return true
      //  return SolNetworkSchema.safeParse(network).success
    })

  await writeJsonFile(FILE_OUTPUT_NETWORKS_SOLANA, solNetworks, {
    schema: z.array(SolNetworkSchema),
  })
}
