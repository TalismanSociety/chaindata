/**
 * Script to sync missing Polkadot networks and RPCs from papi-console's GitHub data
 * into data/networks-polkadot.yaml.
 *
 * Matching strategy (in order):
 * 1. RPC URL match (normalized, trailing slashes stripped)
 * 2. Live genesisHash fetch via polkadot-api → lookup in data/cache/polkadot-network-specs.json
 * 3. Create new entry (or skip if all RPCs are dead)
 */

import { readFileSync, writeFileSync } from 'node:fs'

import kebabCase from 'lodash/kebabCase'
import { getWsProvider } from 'polkadot-api/ws'
import prettier from 'prettier'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { FILE_INPUT_NETWORKS_POLKADOT, FILE_NETWORKS_SPECS_POLKADOT, PRETTIER_CONFIG } from './shared/constants'

// --- Types ---

type PapiNetwork = {
  id: string
  display: string
  rpcs: Record<string, string>
  relayChainInfo?: {
    id: string
    isSystem: boolean
    parachain: number
  }
  nativeToken?: {
    symbol: string
    decimals: number
  }
  hasChainSpecs?: boolean
}

type YamlNetwork = {
  id: string
  name?: string
  isDefault?: boolean
  isTestnet?: boolean
  rpcs?: string[]
  relay?: string
  [key: string]: unknown
}

type NetworkSpecs = {
  id: string
  genesisHash: string
  [key: string]: unknown
}

type RelayFileConfig = {
  url: string
  relay: string
  isTestnet: boolean
}

// --- Constants ---

const PAPI_BASE_URL = 'https://raw.githubusercontent.com/polkadot-api/papi-console/main/src/state/chains/networks'

const RELAY_FILES: RelayFileConfig[] = [
  { url: `${PAPI_BASE_URL}/polkadot.json`, relay: 'polkadot', isTestnet: false },
  { url: `${PAPI_BASE_URL}/kusama.json`, relay: 'kusama', isTestnet: false },
  { url: `${PAPI_BASE_URL}/westend.json`, relay: 'westend-testnet', isTestnet: true },
  { url: `${PAPI_BASE_URL}/paseo.json`, relay: 'paseo-testnet', isTestnet: true },
]

const GENESIS_FETCH_TIMEOUT_MS = 10_000

// --- Helpers ---

const normalizeRpc = (url: string): string => url.replace(/\/+$/, '')

const generateNewId = (papiId: string, relay: string, existingIds: Set<string>): string => {
  const baseRelay = relay.replace('-testnet', '')
  // Convert to kebab-case and lowercase (handles camelCase, underscores, etc.)
  let baseId = kebabCase(papiId).toLowerCase()

  // Prefix with relay name if ID doesn't already contain it
  if (!baseId.includes(baseRelay)) {
    baseId = `${baseRelay}-${baseId}`
  }

  if (!existingIds.has(baseId)) return baseId

  let suffix = 2
  while (existingIds.has(`${baseId}-${suffix}`)) suffix++
  return `${baseId}-${suffix}`
}

const fetchPapiFile = async (url: string): Promise<PapiNetwork[]> => {
  console.log(`Fetching ${url}...`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.json() as Promise<PapiNetwork[]>
}

// Fetch the genesis hash via a single raw JSON-RPC request over the ws provider.
// We deliberately avoid createClient(), which eagerly starts a chainHead follow: on
// dead/unreachable RPCs that follow schedules background reconnect timers which fire
// after teardown and throw uncaught "Not connected" errors, crashing the process.
const requestGenesisHash = (rpc: string): Promise<string | null> =>
  new Promise((resolve) => {
    const provider = getWsProvider(rpc)
    let connection: ReturnType<typeof provider> | undefined
    let settled = false

    const finish = (result: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        connection?.disconnect()
      } catch {
        /* ignore teardown errors */
      }
      resolve(result)
    }

    const timer = setTimeout(() => finish(null), GENESIS_FETCH_TIMEOUT_MS)

    connection = provider((msg) => {
      if ('id' in msg && msg.id === 1) {
        finish('result' in msg && typeof msg.result === 'string' ? msg.result : null)
      }
    })

    connection.send({ jsonrpc: '2.0', id: 1, method: 'chainSpec_v1_genesisHash', params: [] })
  })

const fetchGenesisHash = async (rpcs: string[]): Promise<string | null> => {
  for (const rpc of rpcs) {
    const genesisHash = await requestGenesisHash(rpc)
    if (genesisHash) return genesisHash
    console.warn(`  Failed to fetch genesis hash from ${rpc}`)
  }
  return null
}

function addMissingRpcs(network: YamlNetwork, papiRpcs: string[], rpcToNetwork: Map<string, YamlNetwork>): number {
  if (!network.rpcs) network.rpcs = []

  const existingNormalized = new Set(network.rpcs.map(normalizeRpc))
  let added = 0

  for (const rpc of papiRpcs) {
    if (!existingNormalized.has(rpc)) {
      network.rpcs.push(rpc)
      existingNormalized.add(rpc)
      rpcToNetwork.set(rpc, network)
      added++
    }
  }

  return added
}

// --- Main ---

const main = async () => {
  // 1. Parse existing YAML
  const yamlNetworks: YamlNetwork[] = parseYaml(readFileSync(FILE_INPUT_NETWORKS_POLKADOT, 'utf-8'))

  // 2. Load network specs for genesisHash → networkId lookup (required for matching)
  const networkSpecs: NetworkSpecs[] = JSON.parse(readFileSync(FILE_NETWORKS_SPECS_POLKADOT, 'utf-8'))

  // 3. Build lookup maps
  const rpcToNetwork = new Map<string, YamlNetwork>()
  for (const network of yamlNetworks) {
    for (const rpc of network.rpcs ?? []) {
      rpcToNetwork.set(normalizeRpc(rpc), network)
    }
  }

  const genesisToId = new Map<string, string>()
  for (const specs of networkSpecs) {
    genesisToId.set(specs.genesisHash, specs.id)
  }

  const networkById = new Map<string, YamlNetwork>()
  for (const network of yamlNetworks) {
    networkById.set(network.id, network)
  }

  const existingIds = new Set(yamlNetworks.map((n) => n.id))

  let addedRpcs = 0
  let newEntries = 0
  let skippedDead = 0

  // 4. Process each relay file
  for (const relayFile of RELAY_FILES) {
    const papiNetworks = await fetchPapiFile(relayFile.url)
    console.log(`\nProcessing ${relayFile.relay}: ${papiNetworks.length} networks`)

    for (const papiNet of papiNetworks) {
      const papiRpcs = [...new Set(Object.values(papiNet.rpcs).map(normalizeRpc))]
      const baseRelay = relayFile.relay.replace('-testnet', '')
      const isRelayChain = papiNet.id === baseRelay

      // Step 1: Try RPC match
      let matched: YamlNetwork | undefined
      for (const rpc of papiRpcs) {
        const found = rpcToNetwork.get(rpc)
        if (found) {
          matched = found
          break
        }
      }

      if (matched) {
        const added = addMissingRpcs(matched, papiRpcs, rpcToNetwork)
        if (added > 0) {
          addedRpcs += added
          console.log(`  [RPC match] ${matched.id}: added ${added} RPCs`)
        }
        continue
      }

      // Step 2: Fetch genesisHash live, then lookup in specs cache
      console.log(`  Fetching genesis hash for ${papiNet.id}...`)
      const genesisHash = await fetchGenesisHash(papiRpcs)

      if (genesisHash) {
        const specsId = genesisToId.get(genesisHash)
        if (specsId) {
          const existingNetwork = networkById.get(specsId)
          if (existingNetwork) {
            const added = addMissingRpcs(existingNetwork, papiRpcs, rpcToNetwork)
            if (added > 0) {
              addedRpcs += added
              console.log(`  [Genesis match] ${existingNetwork.id}: added ${added} RPCs`)
            }
            continue
          }
        }
      } else {
        console.warn(`  [SKIP] ${papiNet.id}: all RPCs dead, skipping`)
        skippedDead++
        continue
      }

      // Step 3: Create new entry
      const newId = generateNewId(papiNet.id, relayFile.relay, existingIds)
      existingIds.add(newId)

      const newEntry: YamlNetwork = {
        id: newId,
        name: papiNet.display,
        isDefault: false,
      }

      if (relayFile.isTestnet) {
        newEntry.isTestnet = true
      }

      newEntry.rpcs = papiRpcs

      if (!isRelayChain) {
        newEntry.relay = relayFile.relay
      }

      yamlNetworks.push(newEntry)
      for (const rpc of papiRpcs) {
        rpcToNetwork.set(rpc, newEntry)
      }
      networkById.set(newId, newEntry)

      newEntries++
      console.log(`  [NEW] ${newId} (from papi: ${papiNet.id})`)
    }
  }

  // 5. Write updated YAML
  const yamlOutput = stringifyYaml(yamlNetworks, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
  })

  const formatted = await prettier.format(yamlOutput, {
    ...PRETTIER_CONFIG,
    parser: 'yaml',
  })

  writeFileSync(FILE_INPUT_NETWORKS_POLKADOT, formatted)

  console.log('\n--- Summary ---')
  console.log(`Added RPCs to existing networks: ${addedRpcs}`)
  console.log(`New network entries created: ${newEntries}`)
  console.log(`Skipped (dead RPCs): ${skippedDead}`)
  console.log('Done!')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
