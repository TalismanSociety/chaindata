/**
 * Script to remove dead RPCs from networks-ethereum.yaml and networks-polkadot.yaml
 *
 * - For Ethereum RPCs: uses viem/fetch to query eth_blockNumber
 * - For Polkadot RPCs: uses @polkadot/rpc-provider WsProvider to query block number
 * - If block number can't be fetched within 5 seconds, the RPC is removed
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { WsProvider } from '@polkadot/rpc-provider'
import { PromisePool } from '@supercharge/promise-pool'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { FILE_INPUT_NETWORKS_ETHEREUM, FILE_INPUT_NETWORKS_POLKADOT } from './shared/constants'

const TIMEOUT_MS = 5_000 // 5 seconds
const CONCURRENCY = 10

type RpcCheckResult = {
  rpc: string
  networkId: string
  success: boolean
  blockNumber?: number | string
  error?: string
}

// ============ Ethereum RPC Check ============

const checkEthereumRpc = async (rpc: string, networkId: string): Promise<RpcCheckResult> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { rpc, networkId, success: false, error: `HTTP ${response.status}` }
    }

    const data = (await response.json()) as { result?: string; error?: { message: string } }

    if (data.error) {
      return { rpc, networkId, success: false, error: data.error.message }
    }

    if (!data.result) {
      return { rpc, networkId, success: false, error: 'No result' }
    }

    const blockNumber = parseInt(data.result, 16)
    return { rpc, networkId, success: true, blockNumber }
  } catch (err) {
    clearTimeout(timeout)
    const error = err instanceof Error ? err.message : String(err)
    return { rpc, networkId, success: false, error }
  }
}

// ============ Polkadot RPC Check ============

const checkPolkadotRpc = async (rpc: string, networkId: string): Promise<RpcCheckResult> => {
  const provider = new WsProvider(rpc, 2_000, undefined, TIMEOUT_MS)

  try {
    const result = await Promise.race([
      (async () => {
        await provider.isReady
        const header = (await provider.send('chain_getHeader', [])) as { number?: string }
        const blockNumber = header?.number ? parseInt(header.number, 16) : undefined
        return { rpc, networkId, success: true, blockNumber }
      })(),
      new Promise<RpcCheckResult>((resolve) =>
        setTimeout(() => resolve({ rpc, networkId, success: false, error: 'Timeout' }), TIMEOUT_MS),
      ),
    ])

    await provider.disconnect()
    return result
  } catch (err) {
    try {
      await provider.disconnect()
    } catch {
      // ignore disconnect errors
    }
    const error = err instanceof Error ? err.message : String(err)
    return { rpc, networkId, success: false, error }
  }
}

// ============ Process YAML Files ============

interface NetworkConfig {
  id: string
  name?: string
  rpcs?: string[]
  [key: string]: unknown
}

const processEthereumYaml = async () => {
  console.log('\n📡 Checking Ethereum RPCs...\n')

  const content = readFileSync(FILE_INPUT_NETWORKS_ETHEREUM, 'utf-8')
  const networks = parseYaml(content) as NetworkConfig[]

  // Collect all RPCs to check
  const rpcsToCheck: Array<{ rpc: string; networkId: string }> = []
  for (const network of networks) {
    if (network.rpcs?.length) {
      for (const rpc of network.rpcs) {
        rpcsToCheck.push({ rpc, networkId: network.id })
      }
    }
  }

  console.log(`Found ${rpcsToCheck.length} Ethereum RPCs to check`)

  // Check RPCs in parallel with limited concurrency
  const { results } = await PromisePool.withConcurrency(CONCURRENCY)
    .for(rpcsToCheck)
    .process(async ({ rpc, networkId }) => {
      const result = await checkEthereumRpc(rpc, networkId)
      const status = result.success ? '✅' : '❌'
      const info = result.success ? `block ${result.blockNumber}` : result.error
      console.log(`  ${status} [${networkId}] ${rpc} - ${info}`)
      return result
    })

  // Build set of dead RPCs per network
  const deadRpcsByNetwork = new Map<string, Set<string>>()
  for (const result of results) {
    if (!result.success) {
      if (!deadRpcsByNetwork.has(result.networkId)) {
        deadRpcsByNetwork.set(result.networkId, new Set())
      }
      deadRpcsByNetwork.get(result.networkId)!.add(result.rpc)
    }
  }

  // Remove dead RPCs from networks
  let removedCount = 0
  for (const network of networks) {
    const deadRpcs = deadRpcsByNetwork.get(network.id)
    if (deadRpcs && network.rpcs) {
      const originalLength = network.rpcs.length
      network.rpcs = network.rpcs.filter((rpc) => !deadRpcs.has(rpc))
      removedCount += originalLength - network.rpcs.length

      // Remove empty rpcs array
      if (network.rpcs.length === 0) {
        network.rpcs = undefined
      }
    }
  }

  // Write back
  if (removedCount > 0) {
    writeFileSync(FILE_INPUT_NETWORKS_ETHEREUM, stringifyYaml(networks, { lineWidth: 0, keepUndefined: false }))
    console.log(`\n🗑️  Removed ${removedCount} dead Ethereum RPCs`)
  } else {
    console.log('\n✨ All Ethereum RPCs are healthy')
  }

  return { total: rpcsToCheck.length, removed: removedCount }
}

const processPolkadotYaml = async () => {
  console.log('\n📡 Checking Polkadot RPCs...\n')

  const content = readFileSync(FILE_INPUT_NETWORKS_POLKADOT, 'utf-8')
  const networks = parseYaml(content) as NetworkConfig[]

  // Collect all RPCs to check
  const rpcsToCheck: Array<{ rpc: string; networkId: string }> = []
  for (const network of networks) {
    if (network.rpcs?.length) {
      for (const rpc of network.rpcs) {
        rpcsToCheck.push({ rpc, networkId: network.id })
      }
    }
  }

  console.log(`Found ${rpcsToCheck.length} Polkadot RPCs to check`)

  // Check RPCs sequentially (WebSocket connections don't play well with high concurrency)
  const results: RpcCheckResult[] = []
  for (const { rpc, networkId } of rpcsToCheck) {
    const result = await checkPolkadotRpc(rpc, networkId)
    const status = result.success ? '✅' : '❌'
    const info = result.success ? `block ${result.blockNumber}` : result.error
    console.log(`  ${status} [${networkId}] ${rpc} - ${info}`)
    results.push(result)
  }

  // Build set of dead RPCs per network
  const deadRpcsByNetwork = new Map<string, Set<string>>()
  for (const result of results) {
    if (!result.success) {
      if (!deadRpcsByNetwork.has(result.networkId)) {
        deadRpcsByNetwork.set(result.networkId, new Set())
      }
      deadRpcsByNetwork.get(result.networkId)!.add(result.rpc)
    }
  }

  // Remove dead RPCs from networks
  let removedCount = 0
  for (const network of networks) {
    const deadRpcs = deadRpcsByNetwork.get(network.id)
    if (deadRpcs && network.rpcs) {
      const originalLength = network.rpcs.length
      network.rpcs = network.rpcs.filter((rpc) => !deadRpcs.has(rpc))
      removedCount += originalLength - network.rpcs.length
      // For Polkadot, keep empty arrays (schema requires rpcs to be an array)
    }
  }

  // Write back
  if (removedCount > 0) {
    writeFileSync(FILE_INPUT_NETWORKS_POLKADOT, stringifyYaml(networks, { lineWidth: 0, keepUndefined: false }))
    console.log(`\n🗑️  Removed ${removedCount} dead Polkadot RPCs`)
  } else {
    console.log('\n✨ All Polkadot RPCs are healthy')
  }

  return { total: rpcsToCheck.length, removed: removedCount }
}

// ============ Main ============

const main = async () => {
  console.log('🔍 Dead RPC Cleanup Script')
  console.log(`⏱️  Timeout: ${TIMEOUT_MS / 1000}s per RPC\n`)

  const args = process.argv.slice(2)
  const checkEthereum = args.length === 0 || args.includes('--ethereum') || args.includes('-e')
  const checkPolkadot = args.length === 0 || args.includes('--polkadot') || args.includes('-p')

  let ethStats = { total: 0, removed: 0 }
  let dotStats = { total: 0, removed: 0 }

  if (checkEthereum) {
    ethStats = await processEthereumYaml()
  }

  if (checkPolkadot) {
    dotStats = await processPolkadotYaml()
  }

  console.log('\n📊 Summary:')
  if (checkEthereum) {
    console.log(`  Ethereum: ${ethStats.removed}/${ethStats.total} RPCs removed`)
  }
  if (checkPolkadot) {
    console.log(`  Polkadot: ${dotStats.removed}/${dotStats.total} RPCs removed`)
  }

  // Force exit because WsProvider keeps the process open
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
