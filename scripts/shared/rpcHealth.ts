import { existsSync } from 'node:fs'

import { PromisePool } from '@supercharge/promise-pool'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
import keys from 'lodash/keys'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'
import values from 'lodash/values'

import { FILE_RPC_HEALTH_ETHEREUM, FILE_RPC_HEALTH_POLKADOT, FILE_RPC_HEALTH_SOLANA } from './constants'
import { FORCE_OK_RPCS } from './forceOkRpcs'
import { isNotIgnoredRpcUrl } from './ignoredRpcs'
import { parseJsonFile } from './parseFile'
import {
  type NetworkRpcHealth,
  type NetworkRpcHealthCache,
  NetworkRpcHealthFileSchema,
  type RpcHealth,
} from './schemas/NetworkRpcHealth'
import { writeJsonFile } from './writeFile'

const READ_CACHE: Record<Platform, NetworkRpcHealthCache | null> = {
  polkadot: null,
  ethereum: null,
  solana: null,
}

export type RpcHealthSpec = { rpc: string; networkId: string }

export const getTimeoutSignal = (ms: number): AbortSignal => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

export const getRpcHealthKey = (rpcHealth: RpcHealthSpec): string => `${rpcHealth.rpc}::${rpcHealth.networkId}`

export const getRpcHealthSpecsFromKey = (key: string): RpcHealthSpec => {
  const [rpc, networkId] = key.split('::')
  return { rpc, networkId }
}

const FILEPATH_BY_PLATFORM = {
  polkadot: FILE_RPC_HEALTH_POLKADOT,
  ethereum: FILE_RPC_HEALTH_ETHEREUM,
  solana: FILE_RPC_HEALTH_SOLANA,
}

type Platform = keyof typeof FILEPATH_BY_PLATFORM

// a platform's file is created by its first check run, which a build can precede
const readRpcHealthFile = (platform: Platform): NetworkRpcHealthCache => {
  const filePath = FILEPATH_BY_PLATFORM[platform]
  return existsSync(filePath) ? parseJsonFile(filePath, NetworkRpcHealthFileSchema) : []
}

type CheckRpcsHealthOptions = {
  rechecks: number
  maxchecks: number
}

const DEFAULT_OPTIONS: CheckRpcsHealthOptions = {
  rechecks: 50,
  maxchecks: 200,
}

export const checkPlatformRpcsHealth = async (
  listedRpcs: RpcHealthSpec[],
  platform: Platform,
  getRpcHealth: (specs: RpcHealthSpec) => Promise<RpcHealth>,
  options?: Partial<CheckRpcsHealthOptions>,
) => {
  const cacheFilePath = FILEPATH_BY_PLATFORM[platform]
  const { maxchecks, ...rest }: CheckRpcsHealthOptions = Object.assign({}, DEFAULT_OPTIONS, options)

  // `--skip-rechecks` forces rechecks to 0: new RPCs are still always checked (newKeys is never sliced),
  // but existing/cached RPCs are not re-validated. Useful for fast local runs.
  const rechecks = process.argv.includes('--skip-rechecks') ? 0 : rest.rechecks

  const existingRpcHealths = readRpcHealthFile(platform).filter(({ rpc }) => isNotIgnoredRpcUrl(rpc))
  const existingRpcHealthsByKey = keyBy(existingRpcHealths, getRpcHealthKey)
  const listedRpcHealthsKeys = listedRpcs.filter(({ rpc }) => isNotIgnoredRpcUrl(rpc)).map(getRpcHealthKey)

  // purge unlisted ones
  for (const key of keys(existingRpcHealthsByKey))
    if (!listedRpcHealthsKeys.includes(key)) {
      console.debug('Purging unlisted RPC', key)
      delete existingRpcHealthsByKey[key]
    }

  const newKeys = listedRpcHealthsKeys.filter((key) => !existingRpcHealthsByKey[key])
  console.log('Found', newKeys.length, 'new RPCs to check')
  if (rechecks === 0 && process.argv.includes('--skip-rechecks'))
    console.log('--skip-rechecks: skipping rechecks of cached RPCs')

  // Limit rechecks based on maxchecks, but ALWAYS check all new RPCs
  // This ensures new networks are never skipped due to rate limiting
  const recheckBudget = Math.max(0, maxchecks - newKeys.length)
  const keysToRecheck = sortBy(values(existingRpcHealthsByKey), 'timestamp')
    .slice(0, Math.min(rechecks, recheckBudget))
    .map(getRpcHealthKey)

  // All new RPCs must be checked (no slicing), rechecks are limited
  const checks = uniq([...newKeys, ...keysToRecheck]).map(getRpcHealthSpecsFromKey)

  console.log('Checking', checks.length, 'RPCs (', newKeys.length, 'new +', keysToRecheck.length, 'rechecks)')

  // v8 can only do 2 requests at once but the speed increment is worth the false positives
  // concurrency 4: 99 sec (7 actual timeouts)
  // concurrency 2: 183 sec (11 actual timeouts)
  const res = await PromisePool.withConcurrency(4)
    .for(checks)
    .process(async ({ rpc, networkId }): Promise<NetworkRpcHealth> => {
      const previous = existingRpcHealthsByKey[getRpcHealthKey({ rpc, networkId })]
      try {
        const health = await getRpcHealth({ rpc, networkId })
        return { rpc, networkId, health, timestamp: new Date(), lastOkAt: getLastOkAt(health, previous) }
      } catch (err) {
        console.log('isUnhealthy', rpc, 'ERROR', err)
        return { rpc, networkId, timestamp: new Date(), health: { status: 'NOK', error: String(err) } }
      }
    })

  if (res.errors.length) throw new Error(res.errors.join('\n\n'))

  const rpcHealthsById = assign(existingRpcHealthsByKey, keyBy(res.results, getRpcHealthKey))

  const data = values(rpcHealthsById).sort((a, b) => getRpcHealthKey(a).localeCompare(getRpcHealthKey(b)))

  await writeJsonFile(cacheFilePath, data, { schema: NetworkRpcHealthFileSchema })

  delete READ_CACHE[platform] // reset cache to force reload on next getRpcsByStatus call
}

// A MEH check carries over the time of the RPC's last pass: an OK check records it as `timestamp`, a NOK one clears it
const getLastOkAt = (health: RpcHealth, previous: NetworkRpcHealth | undefined): Date | undefined => {
  if (health.status !== 'MEH' || !previous) return undefined
  return previous.health.status === 'OK' ? previous.timestamp : previous.lastOkAt
}

export const getRpcsByStatus = (
  networkId: string,
  platform: Platform,
  status: RpcHealth['status'] | 'all',
): string[] => {
  if (!READ_CACHE[platform]) READ_CACHE[platform] = readRpcHealthFile(platform)

  return [
    ...READ_CACHE[platform].filter(
      (rpcHealth) => rpcHealth.networkId === networkId && (status === 'all' || rpcHealth.health.status === status),
    ),
  ].map((rpcHealth) => rpcHealth.rpc)
}

// How long an RPC that stopped answering the check (MEH) stays verified after it last passed one.
// At the current RPC count, checkEthereumRpcs rechecks each EVM RPC about every two weeks.
const MEH_RPC_VERIFIED_FOR_MS = 30 * 24 * 60 * 60 * 1000

export type NetworkRpcsSelection = {
  rpcs: string[]
  /** true when the network has no verified RPC, and `rpcs` are its unverified ones */
  isUnverified: boolean
}

/**
 * Picks the RPCs to publish for a network from `rpcs` (listed in order of preference). Verified RPCs come first:
 * - RPCs in FORCE_OK_RPCS, then RPCs that passed their last check (OK)
 * - then RPCs that didn't answer their last check (MEH) but passed one within MEH_RPC_VERIFIED_FOR_MS of the
 *   latest check run
 *
 * RPCs that failed their last check (NOK) are never published. Unverified RPCs (other MEH ones, and ones not
 * checked yet) are published only when the network has no verified RPC: CI can be blocked or rate limited by
 * every RPC of a network, and the network would otherwise drop out of the feed.
 */
export const selectNetworkRpcs = (networkId: string, platform: Platform, rpcs: string[]): NetworkRpcsSelection => {
  if (!READ_CACHE[platform]) READ_CACHE[platform] = readRpcHealthFile(platform)
  const { latestCheck, byNetwork } = getRpcHealthIndex(READ_CACHE[platform])
  const healthByRpc = byNetwork.get(networkId) ?? new Map<string, NetworkRpcHealth>()

  const isOk = (rpc: string) => FORCE_OK_RPCS.includes(rpc) || healthByRpc.get(rpc)?.health.status === 'OK'
  const isRecentMeh = (rpc: string) => {
    const rpcHealth = healthByRpc.get(rpc)
    if (rpcHealth?.health.status !== 'MEH' || !rpcHealth.lastOkAt) return false
    return latestCheck - rpcHealth.lastOkAt.getTime() <= MEH_RPC_VERIFIED_FOR_MS
  }

  const candidates = uniq(rpcs).filter(isNotIgnoredRpcUrl)
  const verified = uniq([
    ...candidates.filter((rpc) => FORCE_OK_RPCS.includes(rpc)),
    ...candidates.filter(isOk),
    ...candidates.filter(isRecentMeh),
  ])
  if (verified.length) return { rpcs: verified, isUnverified: false }

  const unverified = candidates.filter((rpc) => healthByRpc.get(rpc)?.health.status !== 'NOK')
  return { rpcs: unverified, isUnverified: unverified.length > 0 }
}

type RpcHealthIndex = {
  /** time of the most recent check in the file, so that a build's output doesn't depend on when it runs */
  latestCheck: number
  byNetwork: Map<string, Map<string, NetworkRpcHealth>>
}

const RPC_HEALTH_INDEXES = new WeakMap<NetworkRpcHealthCache, RpcHealthIndex>()

const getRpcHealthIndex = (rpcHealths: NetworkRpcHealthCache): RpcHealthIndex => {
  let index = RPC_HEALTH_INDEXES.get(rpcHealths)
  if (!index) {
    index = { latestCheck: 0, byNetwork: new Map() }
    for (const rpcHealth of rpcHealths) {
      index.latestCheck = Math.max(index.latestCheck, rpcHealth.timestamp.getTime())
      const healthByRpc = index.byNetwork.get(rpcHealth.networkId) ?? new Map<string, NetworkRpcHealth>()
      healthByRpc.set(rpcHealth.rpc, rpcHealth)
      index.byNetwork.set(rpcHealth.networkId, healthByRpc)
    }
    RPC_HEALTH_INDEXES.set(rpcHealths, index)
  }
  return index
}

export const logUnverifiedNetworks = (platform: Platform, networkIds: string[]) => {
  if (!networkIds.length) return
  console.warn(
    `${networkIds.length} ${platform} networks have no verified RPC, publishing their unverified RPCs:`,
    networkIds.join(', '),
  )
}
