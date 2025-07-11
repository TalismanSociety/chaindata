import { PromisePool } from '@supercharge/promise-pool'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
import keys from 'lodash/keys'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'
import values from 'lodash/values'

import { isNotBlacklistedRpcUrl } from './blacklistedRpcs'
import { FILE_RPC_HEALTH_ETHEREUM, FILE_RPC_HEALTH_POLKADOT } from './constants'
import { parseJsonFile } from './parseFile'
import {
  NetworkRpcHealth,
  NetworkRpcHealthCache,
  NetworkRpcHealthFileSchema,
  RpcHealth,
} from './schemas/NetworkRpcHealth'
import { writeJsonFile } from './writeFile'

const READ_CACHE: Record<Platform, NetworkRpcHealthCache | null> = {
  polkadot: null,
  ethereum: null,
}

export type RpcHealthSpec = { rpc: string; networkId: string }

export const getTimeoutSignal = (ms: number) => {
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
}

type Platform = keyof typeof FILEPATH_BY_PLATFORM

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
  const { rechecks, maxchecks }: CheckRpcsHealthOptions = Object.assign({}, DEFAULT_OPTIONS, options)

  const existingRpcHealths = parseJsonFile(cacheFilePath, NetworkRpcHealthFileSchema).filter(({ rpc }) =>
    isNotBlacklistedRpcUrl(rpc),
  )
  const existingRpcHealthsByKey = keyBy(existingRpcHealths, getRpcHealthKey)
  const listedRpcHealthsKeys = listedRpcs.filter(({ rpc }) => isNotBlacklistedRpcUrl(rpc)).map(getRpcHealthKey)

  // purge unlisted ones
  for (const key of keys(existingRpcHealthsByKey))
    if (!listedRpcHealthsKeys.includes(key)) {
      console.debug('Purging unlisted RPC', key)
      delete existingRpcHealthsByKey[key]
    }

  const newKeys = listedRpcHealthsKeys.filter((key) => !existingRpcHealthsByKey[key])
  console.log('Found', newKeys.length, 'new RPCs to check')

  const keysToRecheck = sortBy(values(existingRpcHealthsByKey), 'timestamp').slice(0, rechecks).map(getRpcHealthKey)

  const allRpcs = uniq([...newKeys, ...keysToRecheck])
  const checks = allRpcs.map(getRpcHealthSpecsFromKey).slice(0, maxchecks)

  console.log('Checking', checks.length, 'RPCs out of', allRpcs.length)

  // v8 can only do 2 requests at once but the speed increment is worth the false positives
  // concurrency 4: 99 sec (7 actual timeouts)
  // concurrency 2: 183 sec (11 actual timeouts)
  const res = await PromisePool.withConcurrency(4)
    .for(checks)
    .process(async ({ rpc, networkId }): Promise<NetworkRpcHealth> => {
      try {
        const health = await getRpcHealth({ rpc, networkId })
        return { rpc, networkId, health, timestamp: new Date() }
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

export const getRpcsByStatus = (
  networkId: string,
  platform: Platform,
  status: RpcHealth['status'] | 'all',
): string[] => {
  if (!READ_CACHE[platform])
    READ_CACHE[platform] = parseJsonFile(FILEPATH_BY_PLATFORM[platform], NetworkRpcHealthFileSchema)

  return [
    ...READ_CACHE[platform].filter(
      (rpcHealth) => rpcHealth.networkId === networkId && (status === 'all' || rpcHealth.health.status === status),
    ),
  ].map((rpcHealth) => rpcHealth.rpc)
}
