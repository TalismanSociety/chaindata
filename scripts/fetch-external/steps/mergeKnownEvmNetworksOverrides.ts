import { readFile, writeFile } from 'node:fs/promises'

import mergeWith from 'lodash/mergeWith'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_OVERRIDES } from '../../shared/constants'
import { ConfigEvmNetwork } from '../../shared/types'
import { networkMergeCustomizer } from '../../shared/util'

/**
 * NOTE: This is not used.
 *
 * Instead, the overrides are merged using `networkMergeCustomizer` in-memory, wherever they are needed.
 *
 * For example, in `addEvmNetworks.ts`:
 * ```
 * // merge known evm network overrides
 * const knownEvmNetworks = sharedData.knownEvmNetworksConfig.map((knownEvmNetwork) => {
 *   const overrides = sharedData.knownEvmNetworksOverridesConfig.find((ov) => ov.id === knownEvmNetwork.id)
 *   return overrides ? mergeWith(knownEvmNetwork, overrides, networkMergeCustomizer) : knownEvmNetwork
 * })
 * ```
 */
export const mergeKnownEvmNetworksOverrides = async () => {
  const knownEvmNetworks: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8'))
  const overrides: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS_OVERRIDES, 'utf-8'))

  const merged = knownEvmNetworks.map((network) => {
    const override = overrides.find((o) => o.id === network.id)

    if (!override) return network

    return mergeWith(
      network,
      override,
      // TODO: Document the intended behaviour of `networkMergeCustomizer`
      networkMergeCustomizer,
    )
  })

  await writeFile(FILE_KNOWN_EVM_NETWORKS, JSON.stringify(merged, null, 2))
}
