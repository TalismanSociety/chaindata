import WebSocket from 'ws'

import { FILE_INPUT_NETWORKS_POLKADOT, FILE_NETWORKS_SPECS_POLKADOT } from '../../shared/constants'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { checkPlatformRpcsHealth, RpcHealthSpec } from '../../shared/rpcHealth'
import { DotNetworkSpecsFileSchema, DotNetworksConfigFileSchema } from '../../shared/schemas'
import { RpcHealth } from '../../shared/schemas/NetworkRpcHealth'

const RECHECKS_PER_RUN = 100
const MAX_CHECKS_PER_RUN = 2000
const TIMEOUT = 10_000 // tangle is slow, but works

export const checkPolkadotRpcs = async () => {
  // ATM we only use websocket rpcs for substrate chains
  const networks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const listedRpcs = networks.flatMap((network) => network.rpcs.map((rpc) => ({ rpc, networkId: network.id })))

  // Known-good genesis hash per network (from the last successful fetch).
  // An RPC that is up but serves a different block-0 hash is on a stale/forked/reset chain: mark it NOK so it
  // is excluded from the pool until it catches up (self-heals once it serves the expected genesis again).
  // Networks with no known genesis yet (new chains, or intentionally cleared to bootstrap a network reset)
  // skip this check and are validated on connectivity alone.
  const expectedGenesisById = new Map(
    parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema).map((specs) => [
      specs.id,
      specs.genesisHash,
    ]),
  )

  await checkPlatformRpcsHealth(
    // uncomment for easy debugging
    // [
    //   { networkId: 'paseo-testnet', rpc: 'wss://api2.zondax.ch/pas/node/rpc' }, // NOK Timeout (this one breaks WsProvider if left in OK/MEH)
    //   { networkId: 'paseo-testnet', rpc: 'wss://paseo.dotters.network' },
    //   { networkId: 'centrifuge-polkadot', rpc: 'wss://centrifuge-rpc.dwellir.com' }, // NOK ENOTFOUND
    //   { networkId: 'continuum', rpc: 'wss://continuum-rpc-1.metaverse.network/wss' }, // MEH SSL issue
    //   { networkId: 'tangle', rpc: 'wss://rpc.tangle.tools' }, // MEH SSL issue
    // ],
    listedRpcs, //.filter((rpc) => rpc.networkId === 'encointer'),
    'polkadot',
    ({ rpc, networkId }: RpcHealthSpec) => getRpcHealth({ rpc, networkId }, expectedGenesisById.get(networkId)),
    {
      rechecks: RECHECKS_PER_RUN,
      maxchecks: MAX_CHECKS_PER_RUN,
    },
  )
}

const getRpcHealth = ({ rpc }: RpcHealthSpec, expectedGenesis?: string): Promise<RpcHealth> =>
  new Promise((resolve) => {
    let isDone = false

    // when we have a known genesis to compare against, health requires BOTH a runtime version response
    // and a matching block-0 hash; otherwise connectivity (runtime version) alone is enough.
    let hasRuntimeVersion = false
    let hasMatchingGenesis = !expectedGenesis

    const ws = new WebSocket(rpc)

    const done = (value: RpcHealth) => {
      if (isDone) return
      isDone = true

      if (value.status === 'MEH' || value.status === 'NOK') console.log(value.status, rpc, value.error)

      resolve(value)
      ws.close()
    }

    const resolveIfReady = () => {
      if (hasRuntimeVersion && hasMatchingGenesis) {
        clearTimeout(timeout)
        done({ status: 'OK' })
      }
    }

    // fallback timeout (e.g. 5 seconds)
    const timeout = setTimeout(() => {
      if (isDone) return

      done({ status: 'NOK', error: 'Timeout' })
    }, TIMEOUT)

    ws.onopen = (e) => {
      if (isDone) return

      if (typeof ws.readyState !== 'number' || ws.readyState !== WebSocket.OPEN)
        return done({ status: 'NOK', error: 'WebSocket is not open' })

      ws.onmessage = (message) => {
        let parsed: any
        try {
          parsed = JSON.parse(message.data.toString())
        } catch (err) {
          console.error('Failed to parse message', message.data, 'Error:', err)
          if (isDone) return
          done({ status: 'MEH', error: 'Failed to parse message' })
          return
        }

        // id 2 is the genesis (block 0 hash) probe, only sent when we have an expected genesis to compare
        if (parsed.id === 2) {
          const genesisHash = parsed.result
          if (genesisHash !== expectedGenesis)
            return done({
              status: 'NOK',
              error: `genesis mismatch (got ${genesisHash}, expected ${expectedGenesis})`,
            })
          hasMatchingGenesis = true
          return resolveIfReady()
        }

        // any other response means the node answered the runtime version probe (id 1)
        hasRuntimeVersion = true
        resolveIfReady()
      }

      // fetch runtime version as a connectivity test
      ws.send('{"jsonrpc":"2.0","id":1,"method":"state_getRuntimeVersion","params":[]}', (err) => {
        if (err) console.error('send error', err)
      })

      // fetch the genesis (block 0) hash to detect stale/forked/reset nodes
      if (expectedGenesis)
        ws.send('{"jsonrpc":"2.0","id":2,"method":"chain_getBlockHash","params":[0]}', (err) => {
          if (err) console.error('send error', err)
        })
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
  'does not match certificate',
  'certificate has expired', // TLS certificate expired, it would fail on client too
  'Unexpected server response: 530', // Cloudflare DNS error, assume client wont resolve it neither
  'Unexpected server response: 404',
  'self-signed certificate', // Nice try!
]

const isNok = (errorMessage: string) => NOK_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))

const isMeh = (errorMessage: string) => MEH_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))
