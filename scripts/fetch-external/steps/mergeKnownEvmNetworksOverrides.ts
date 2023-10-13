import { readFile, writeFile } from 'node:fs/promises'

import { mergeWith } from 'lodash'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_OVERRIDES } from '../../shared/constants'
import { TalismanEvmNetwork } from '../../shared/types'
import { networkMergeCustomizer } from '../../shared/util'

export const mergeKnownEvmNetworksOverrides = async () => {
  const knownEvmNetworks = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8')) as TalismanEvmNetwork[]
  const overrides = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS_OVERRIDES, 'utf-8')) as TalismanEvmNetwork[]

  const merged = knownEvmNetworks.map((network) => {
    const override = overrides.find((o) => o.id === network.id)

    if (!override) return network

    return mergeWith(network, override, networkMergeCustomizer)
  })

  await writeFile(FILE_KNOWN_EVM_NETWORKS, JSON.stringify(merged, null, 2))
}
