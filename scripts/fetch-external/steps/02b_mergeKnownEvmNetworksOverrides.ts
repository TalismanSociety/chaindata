import { readFile, writeFile } from 'node:fs/promises'

import { TalismanEvmNetwork } from '../types'

export const mergeKnownEvmNetworksOverrides = async () => {
  const knownEvmNetworks = JSON.parse(await readFile('known-evm-networks.json', 'utf-8')) as TalismanEvmNetwork[]
  const overrides = JSON.parse(await readFile('known-evm-networks-overrides.json', 'utf-8')) as TalismanEvmNetwork[]

  const merged = knownEvmNetworks.map((network) => {
    const override = overrides.find((o) => o.id === network.id)

    if (!override) return network

    return {
      ...network,
      ...override,
    }
  })

  await writeFile('known-evm-networks.json', JSON.stringify(merged, null, 2))
}
