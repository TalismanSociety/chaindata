import { readFile, writeFile } from 'fs/promises'

import { PromisePool } from '@supercharge/promise-pool'
import uniq from 'lodash/uniq'
import WebSocket from 'ws'

import { FILE_CHAINDATA, FILE_RPC_HEALTH_WEBSOCKET, FILE_TESTNETS_CHAINDATA } from '../../shared/constants'
import { ConfigChain } from '../../shared/types'

export type WsRpcHealth = 'OK' | 'MEH' | 'NOK'

const MEH_IGNORED_ERROR_MESSAGES = [
  'Unexpected server response: 502', // bad gateway, could work on client
  'Unexpected server response: 429', // rate limited, could work on client
  'Unexpected server response: 521', // server down, could be temporary
  'Unexpected server response: 500', // random server error, out of our control
  'Unexpected server response: 523', // Cloudflare is unable to reach your origin server
  'connect ECONNREFUSED', // server is up but GitHub IP is blacklisted
  'WebSocket was closed before the connection was established', // very helpful, thanks!
]

const NOK_ERROR_MESSAGES = [
  'ENOTFOUND', // DNS lookup failed, it would fail on client too
  'certificate has expired', // TLS certificate expired, it would fail on client too
  'Unexpected server response: 530', // Cloudflare DNS error, assume client wont resolve it neither
  'self-signed certificate', // Nice try!
]

export const checkWsRpcs = async () => {
  // ATN we only use websocket rpcs for substrate chains
  const mainnets = JSON.parse(await readFile(FILE_CHAINDATA, 'utf-8')) as ConfigChain[]
  const testnets = JSON.parse(await readFile(FILE_TESTNETS_CHAINDATA, 'utf-8')) as ConfigChain[]
  const rpcUrls = uniq([...mainnets, ...testnets].flatMap((chain) => chain.rpcs ?? []))

  // v8 can only do 2 requests at once but the speed increment is worth the false positives
  // concurrency 4: 99 sec (7 actual timeouts)
  // concurrency 2: 183 sec (11 actual timeouts)
  const res = await PromisePool.withConcurrency(4)
    .for(rpcUrls)
    .process(async (rpcUrl): Promise<[string, WsRpcHealth]> => {
      try {
        return [rpcUrl, await getWsRpcHealth(rpcUrl)]
      } catch (err) {
        console.log('isUnhealthy', rpcUrl, 'ERROR', err)
        return [rpcUrl, 'NOK' as WsRpcHealth]
      }
    })

  if (res.errors.length) throw new Error(res.errors.join('\n\n'))

  const data = Object.fromEntries(res.results.sort(([a], [b]) => a.localeCompare(b)))

  await writeFile(FILE_RPC_HEALTH_WEBSOCKET, JSON.stringify(data, null, 2))
}

const getWsRpcHealth = (wsUrl: string): Promise<WsRpcHealth> =>
  new Promise((resolve) => {
    let isResolved = false
    let isClosed = false

    const ws = new WebSocket(wsUrl)

    const tryClose = () => {
      if (isClosed) return
      try {
        ws.close()
        isClosed = true
      } catch (err) {
        console.error('Failed to close web socket', wsUrl, err)
      }
    }

    const tryResolve = (value: WsRpcHealth) => {
      if (isResolved) return
      try {
        resolve(value)
        isResolved = true
      } catch (err) {
        console.error('Failed to resolve', wsUrl, err)
      }
    }

    // fallback timeout (e.g. 5 seconds)
    const timeout = setTimeout(() => {
      if (!isResolved) {
        console.log('Timeout', wsUrl)
        tryResolve('MEH')
        tryClose()
      }
    }, 5000)

    ws.onopen = (e) => {
      clearTimeout(timeout)
      // as long as rpc is responding, we consider it healthy enough
      tryClose()
      tryResolve('OK')
    }

    ws.onerror = (err) => {
      clearTimeout(timeout)
      tryClose()

      if (isNok(err.message)) tryResolve('NOK')
      else if (isMeh(err.message)) tryResolve('MEH')
      else {
        // Not 100% sure, consider healthy as MEH. could be github IP being rate limited or something like that
        console.warn('WebSocket error', wsUrl, err.message)
        // either way it sucks
        tryResolve('MEH')
      }
    }
  })

const isNok = (errorMessage: string) => NOK_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))

const isMeh = (errorMessage: string) => MEH_IGNORED_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))
