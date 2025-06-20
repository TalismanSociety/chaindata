import { PromisePool } from '@supercharge/promise-pool'
import fromPairs from 'lodash/fromPairs'
import toPairs from 'lodash/toPairs'
import uniq from 'lodash/uniq'
import WebSocket from 'ws'

import { FILE_INPUT_NETWORKS_POLKADOT, FILE_RPC_HEALTH_WEBSOCKET } from '../../shared/constants'
import { DotNetworksConfigFileSchema } from '../../shared/schemas'
import { WsRpcHealth, WsRpcHealthFileSchema } from '../../shared/schemas/RpcHealthWebSocket'
import { parseJsonFile, parseYamlFile, writeJsonFile } from '../../shared/util'

// export type WsRpcHealth = 'OK' | 'MEH' | 'NOK'

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
  const networks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const statusByRpc = parseJsonFile<Record<string, WsRpcHealth>>(FILE_RPC_HEALTH_WEBSOCKET, WsRpcHealthFileSchema)

  const rpcUrls = uniq(networks.flatMap((chain) => chain.rpcs ?? []))

  // v8 can only do 2 requests at once but the speed increment is worth the false positives
  // concurrency 4: 99 sec (7 actual timeouts)
  // concurrency 2: 183 sec (11 actual timeouts)
  const res = await PromisePool.withConcurrency(4)
    .for(
      rpcUrls.filter((url) => {
        const prevStatus = statusByRpc[url]
        // skip rpcs that are NOK for more than a month
        if (
          prevStatus?.status === 'NOK' &&
          Date.now() - new Date(prevStatus.since).getTime() > 30 * 24 * 60 * 60 * 1000
        ) {
          console.warn('Skipping known dead rpc %s - consider removing it?', url)
          return false
        }
        return true
      }),
    )
    .process(async (rpcUrl): Promise<[string, WsRpcHealth]> => {
      try {
        return [rpcUrl, await getWsRpcHealth(rpcUrl)]
      } catch (err) {
        console.log('isUnhealthy', rpcUrl, 'ERROR', err)
        return [rpcUrl, { status: 'NOK', error: String(err), since: new Date() }]
      }
    })

  if (res.errors.length) throw new Error(res.errors.join('\n\n'))

  for (const [rpcUrl, status] of res.results) {
    const prev = statusByRpc[rpcUrl]

    // skip if status is the same (need to preserve the since date)
    if (prev?.status === status.status) continue

    // save the status
    statusByRpc[rpcUrl] = status
  }

  const data = fromPairs(toPairs(statusByRpc).sort(([a], [b]) => a.localeCompare(b)))

  await writeJsonFile(FILE_RPC_HEALTH_WEBSOCKET, data, { format: true })
}

const getWsRpcHealth = (wsUrl: string): Promise<WsRpcHealth> =>
  new Promise((resolve) => {
    let isDone = false

    const ws = new WebSocket(wsUrl)

    const done = (value: WsRpcHealth) => {
      if (isDone) return
      isDone = true

      if (value.status === 'MEH' || value.status === 'NOK') console.log(value.status, wsUrl, value.error)

      resolve(value)
      ws.close()
    }

    // fallback timeout (e.g. 5 seconds)
    const timeout = setTimeout(() => {
      if (isDone) return

      done({ status: 'MEH', error: 'Timeout', since: new Date() })
    }, 5000)

    ws.onopen = (e) => {
      if (isDone) return
      clearTimeout(timeout)

      done({ status: 'OK' })
    }

    ws.onerror = (err) => {
      if (isDone) return
      clearTimeout(timeout)

      if (isMeh(err.message)) done({ status: 'MEH', error: err.message, since: new Date() })
      else if (isNok(err.message)) done({ status: 'NOK', error: err.message, since: new Date() })
      else done({ status: 'MEH', error: err.message, since: new Date() })
    }
  })
