import { PromisePool } from '@supercharge/promise-pool'
import uniq from 'lodash/uniq'
import WebSocket from 'ws'

import { FILE_NETWORKS_POLKADOT, FILE_RPC_HEALTH_WEBSOCKET } from '../../shared/constants'
import { DotNetworksConfigFileSchema } from '../../shared/schemas'
import { parseYamlFile, writeJsonFile } from '../../shared/util'

export type WsRpcHealth = 'OK' | 'MEH' | 'NOK'

const MEH_ERROR_MESSAGES = [
  'Unexpected server response: 503', // service unavailable, hopefully temporary
  'Unexpected server response: 502', // bad gateway, could work on client
  'Unexpected server response: 429', // rate limited, could work on client
  'Unexpected server response: 521', // server down, could be temporary
  'Unexpected server response: 500', // random server error, out of our control
  'Unexpected server response: 523', // Cloudflare is unable to reach your origin server, could work on client
  'connect ECONNREFUSED', // server is up but GitHub IP is blacklisted
  'WebSocket was closed before the connection was established', // very helpful, thanks!
]

const NOK_ERROR_MESSAGES = [
  'ENOTFOUND', // DNS lookup failed, it would fail on client too
  'certificate has expired', // TLS certificate expired, it would fail on client too
  'Unexpected server response: 530', // Cloudflare DNS error, assume client wont resolve it neither
  'self-signed certificate', // Nice try!
]

const isNok = (errorMessage: string) => NOK_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))

const isMeh = (errorMessage: string) => MEH_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))

export const checkWsRpcs = async () => {
  // ATM we only use websocket rpcs for substrate chains
  const networks = parseYamlFile(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)

  const rpcUrls = uniq(networks.flatMap((chain) => chain.rpcs ?? []))

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

  await writeJsonFile(FILE_RPC_HEALTH_WEBSOCKET, data, { format: true })
}

const getWsRpcHealth = (wsUrl: string): Promise<WsRpcHealth> =>
  new Promise((resolve) => {
    let isDone = false

    const ws = new WebSocket(wsUrl)

    const done = (value: WsRpcHealth, logLevel?: 'log' | 'warn', logMessage?: string) => {
      if (isDone) return
      isDone = true

      if (logLevel) console[logLevel](value, wsUrl, logMessage)

      resolve(value)
      ws.close()
    }

    // fallback timeout (e.g. 5 seconds)
    const timeout = setTimeout(() => {
      if (isDone) return

      done('MEH', 'log', 'Timeout')
    }, 5000)

    ws.onopen = (e) => {
      if (isDone) return
      clearTimeout(timeout)

      done('OK')
    }

    ws.onerror = (err) => {
      if (isDone) return
      clearTimeout(timeout)

      if (isMeh(err.message)) done('MEH')
      else if (isNok(err.message)) done('NOK', 'log', err.message)
      else done('MEH', 'warn', err.message) //worth investigating
    }
  })
