import WebSocket from 'ws'

import { FILE_INPUT_NETWORKS_POLKADOT, FILE_RPC_HEALTH_POLKADOT } from '../../shared/constants'
import { checkPlatformRpcsHealth, RpcHealthSpec } from '../../shared/rpcHealth'
import { DotNetworksConfigFileSchema } from '../../shared/schemas'
import { RpcHealth } from '../../shared/schemas/NetworkRpcHealth'
import { parseYamlFile } from '../../shared/util'

const RPC_TIMEOUT = 4_000 // 4 seconds
const RECHECKS_PER_RUN = 50
const MAX_CHECKS_PER_RUN = 200

export const checkPolkadotRpcs = async () => {
  // ATM we only use websocket rpcs for substrate chains
  const networks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const listedRpcs = networks.flatMap((network) => network.rpcs.map((rpc) => ({ rpc, networkId: network.id })))

  await checkPlatformRpcsHealth(listedRpcs, 'polkadot', getRpcHealth, {
    rechecks: RECHECKS_PER_RUN,
    maxchecks: MAX_CHECKS_PER_RUN,
  })
}

const getRpcHealth = ({ rpc, networkId }: RpcHealthSpec): Promise<RpcHealth> =>
  new Promise((resolve) => {
    let isDone = false

    const ws = new WebSocket(rpc)

    const done = (value: RpcHealth) => {
      if (isDone) return
      isDone = true

      if (value.status === 'MEH' || value.status === 'NOK') console.log(value.status, rpc, value.error)

      resolve(value)
      ws.close()
    }

    // fallback timeout (e.g. 5 seconds)
    const timeout = setTimeout(() => {
      if (isDone) return

      done({ status: 'MEH', error: 'Timeout' })
    }, 5000)

    ws.onopen = (e) => {
      if (isDone) return
      clearTimeout(timeout)

      done({ status: 'OK' })
    }

    ws.onerror = (err) => {
      if (isDone) return
      clearTimeout(timeout)

      if (isMeh(err.message)) done({ status: 'MEH', error: err.message })
      else if (isNok(err.message)) done({ status: 'NOK', error: err.message })
      else done({ status: 'MEH', error: err.message })
    }
  })

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
