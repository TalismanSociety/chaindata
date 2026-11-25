import { type SolNetwork, SolNetworkSchema, solNativeTokenId } from '@talismn/chaindata-provider'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
import { z } from 'zod/v4'

import {
  FILE_INPUT_NETWORKS_SOLANA,
  FILE_NETWORKS_SPECS_SOLANA,
  FILE_OUTPUT_NETWORKS_SOLANA,
} from '../../shared/constants'
import { getNetworkLogoUrl, getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { logUnverifiedNetworks, selectNetworkRpcs } from '../../shared/rpcHealth'
import { SolNetworkSpecsFileSchema, SolNetworksConfigFileSchema } from '../../shared/schemas'
import { writeJsonFile } from '../../shared/writeFile'

export const buildSolanaNetworks = async () => {
  const solNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)
  const solNetworksSpecs = parseJsonFile(FILE_NETWORKS_SPECS_SOLANA, SolNetworkSpecsFileSchema)

  const specsById = keyBy(solNetworksSpecs, (n) => n.id)

  const unverifiedNetworkIds: string[] = []

  const solNetworks: SolNetwork[] = solNetworksConfig
    .map(({ tokens, ...config }) => config) // remove tokens field
    .flatMap((config) => {
      const selection = selectNetworkRpcs(config.id, 'solana', config.rpcs)
      if (!selection.rpcs.length) return [] // no rpcs available for this network
      if (selection.isUnverified) unverifiedNetworkIds.push(config.id)
      return [{ ...config, rpcs: selection.rpcs }]
    })
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
        ...specsById[config.id],
        platform: 'solana',
        isDefault: config.isDefault ?? false,
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
    })

  logUnverifiedNetworks('solana', unverifiedNetworkIds)

  await writeJsonFile(FILE_OUTPUT_NETWORKS_SOLANA, solNetworks, {
    schema: z.array(SolNetworkSchema),
  })
}
