import { copyFileSync, existsSync } from 'node:fs'

import { MINIMETADATA_VERSION, type Network } from '@talismn/chaindata-provider'
import isEqual from 'lodash/isEqual'

import { FILE_OUTPUT_CHAINDATA } from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { writeJsonFile } from '../../shared/writeFile'

const FIRST_VERSION_WITH_CHAINDATA_FILE = 4

type PreviousChaindataFile = {
  networks: { id: string; rpcs: string[] }[]
  tokens: { networkId: string }[]
  miniMetadatas: { chainId: string }[]
}

export const updatePreviousVersionsRpcs = async () => {
  const current = parseJsonFile<{ networks: Network[] }>(FILE_OUTPUT_CHAINDATA)
  const rpcsByNetworkId = new Map(current.networks.map((network) => [network.id, network.rpcs]))

  const currentVersion = Number(MINIMETADATA_VERSION.replace(/^v/, ''))

  for (let version = FIRST_VERSION_WITH_CHAINDATA_FILE; version < currentVersion; version++) {
    const dir = `pub/v${version}`
    const backupFile = `${dir}/chaindata.backup.json`
    if (!existsSync(backupFile)) copyFileSync(`${dir}/chaindata.json`, backupFile)
    const data = parseJsonFile<PreviousChaindataFile>(backupFile)

    let rpcsUpdated = 0
    const networks = data.networks.filter((network) => {
      const rpcs = rpcsByNetworkId.get(network.id)
      if (!rpcs) return false
      if (!isEqual(network.rpcs, rpcs)) rpcsUpdated++
      network.rpcs = rpcs
      return true
    })

    const networkIds = new Set(networks.map((network) => network.id))
    const tokens = data.tokens.filter((token) => networkIds.has(token.networkId))
    const miniMetadatas = data.miniMetadatas.filter((m) => networkIds.has(m.chainId))

    console.log(
      `v${version}: rpcs updated for ${rpcsUpdated} networks, removed ${data.networks.length - networks.length} networks, ${data.tokens.length - tokens.length} tokens, ${data.miniMetadatas.length - miniMetadatas.length} miniMetadatas`,
    )

    const updated = { ...data, networks, tokens, miniMetadatas }
    await writeJsonFile(`${dir}/chaindata.json`, updated)
    await writeJsonFile(`${dir}/chaindata.min.json`, updated, { format: false })
  }
}
