import { PromisePool } from '@supercharge/promise-pool'
import fromPairs from 'lodash/fromPairs'
import toPairs from 'lodash/toPairs'
import uniq from 'lodash/uniq'
import { Hex, hexToNumber } from 'viem'

import { FILE_KNOWN_EVM_NETWORKS, FILE_RPC_HEALTH_ETHEREUM, FILE_RPC_HEALTH_POLKADOT } from '../../shared/constants'
import { KnownEthNetworksFileSchema } from '../../shared/schemas'
import { RpcHealth, RpcHealthFileSchema } from '../../shared/schemas/RpcHealthWebSocket'
import { parseJsonFile, parseYamlFile, writeJsonFile } from '../../shared/util'

const RPC_TIMEOUT = 4_000 // 4 seconds

// const DEBUG = true

// const MEH_ERROR_MESSAGES = [
//   // 'Unexpected server response: 503', // service unavailable, hopefully temporary
//   // 'Unexpected server response: 502', // bad gateway, could work on client
//   // 'Unexpected server response: 429', // rate limited, could work on client
//   // 'Unexpected server response: 521', // server down, could be temporary
//   // 'Unexpected server response: 500', // random server error, out of our control
//   // 'Unexpected server response: 523', // Cloudflare is unable to reach your origin server, could work on client
//   // 'connect ECONNREFUSED', // server is up but GitHub IP is blacklisted
//   // 'WebSocket was closed before the connection was established', // very helpful, thanks!
//   'MEH',
// ]

// const NOK_ERROR_MESSAGES = [
//   'ENOTFOUND', // DNS lookup failed, it would fail on client too
//   'certificate has expired', // TLS certificate expired, it would fail on client too
//   'Unexpected server response: 530', // Cloudflare DNS error, assume client wont resolve it neither
//   'self-signed certificate', // Nice try!
// ]

// const isNok = (errorMessage: string) => NOK_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))

// const isMeh = (errorMessage: string) => MEH_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))

export const checkEthereumRpcs = async () => {
  const networks = parseJsonFile(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)
  const statusByRpc = parseJsonFile<Record<string, RpcHealth>>(FILE_RPC_HEALTH_POLKADOT, RpcHealthFileSchema)
  const rpcUrls = networks.flatMap((chain) => chain.rpcs.map((rpc) => [rpc, chain.id] as const) ?? [])

  console.log('Checking', rpcUrls.length, 'Ethereum RPCs')

  // v8 can only do 2 requests at once but the speed increment is worth the false positives
  // concurrency 4: 99 sec (7 actual timeouts)
  // concurrency 2: 183 sec (11 actual timeouts)
  const res = await PromisePool.withConcurrency(4)
    .for(
      rpcUrls.filter(([url]) => {
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
    .process(async ([rpcUrl, networkId]): Promise<[string, RpcHealth]> => {
      try {
        return [rpcUrl, await getWsRpcHealth(rpcUrl, networkId)]
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

  await writeJsonFile(FILE_RPC_HEALTH_ETHEREUM, data, { schema: RpcHealthFileSchema })
}

const getWsRpcHealth = async (rpcUrl: string, networkId: string): Promise<RpcHealth> => {
  // here we want to validate that the RPC may work
  // if unreachable (DNS or SSL error), consider invalid
  // if it doesn't respond, consider unknown as it might be blocking requests from github action runner
  // if it responds, consider valid only if the chainId matches

  // use fetch instead of viem to ensure we get proper HTTP errors
  try {
    if (isKnownInvalidRpcUrl(rpcUrl)) return { status: 'NOK', error: 'Known invalid RPC URL', since: new Date() }

    const request = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id: 0, jsonrpc: '2.0', method: 'eth_chainId' }),
      signal: getTimeoutSignal(1000),
    })
    if (!request.ok) {
      const error = `HTTP ${request.status} - ${request.statusText}`
      const since = new Date()
      console.log(rpcUrl, error)

      switch (request.status) {
        case 526: // unreachable (DNS or SSL error)
        case 525: // unreachable (DNS or SSL error)
        case 523: // unreachable (DNS or SSL error)
        case 972: // unreachable (DNS or SSL error)
        case 530: // frozen
        case 400: // bad request - (verified that this is not client specific)
        case 401: // unauthorized - (verified that this is not client specific)
        case 422: // unprocessable
        case 410: {
          // gone

          // if (DEBUG)
          //   console.warn(`[invalid] HTTP error ${rpcUrl} : ${request.status} - "${request.statusText}"`)
          return { status: 'NOK', error, since }
        }

        case 403: // access denied, probably blocking github
        case 403: // access denied, probably blocking github
        case 522: // timeout, maybe the RPC is ignoring requests from our IP
        case 521: // web server down, maybe temporary downtime
        case 502: // bad gateway, consider host is blocking github
        case 503: // service unavailable, consider host is blocking github or temporary downtime
        case 429: // too many requests
        case 404: // service unavailable, consider host is blocking github or temporary downtime
        case 405: {
          // not allowed
          // if (DEBUG)
          //   console.warn(`[unknown] HTTP error ${chainId} ${rpcUrl} : ${request.status} - "${request.statusText}"`)
          return { status: 'MEH', error, since }
        }

        default: // unexpected - might be worth investigating
          console.warn(`Unknown HTTP error ${rpcUrl} : ${request.status} - "${request.statusText}"`)
      }
      return { status: 'MEH', error, since }
    }

    try {
      const response = (await request.json()) as { id: number; jsonrpc: '2.0'; result: Hex }
      const resChainId = String(hexToNumber(response.result))
      const isValid = Number(networkId) === Number(resChainId)
      if (!isValid)
        return { status: 'NOK', error: `chainId mismatch: expected ${networkId}, got ${resChainId}`, since: new Date() }

      return { status: 'OK' }
    } catch (err) {
      return { status: 'NOK', error: `Failed to fetch chainId: ${(err as Error).message}`, since: new Date() }
    }
  } catch (err) {
    const since = new Date()
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') {
        return { status: 'MEH', error: `Timeout`, since }
      }

      // console.warn('unexpected DOMException', chainId, rpcUrl, err)
      return { status: 'NOK', error: `Unexpected DOMException: ${err.message}`, since }
    } else if (err instanceof Error) {
      if (err.cause) {
        const cause = err.cause as any
        switch (cause.code ?? '') {
          // unreachable or certificate errors
          case 'ENOTFOUND':
          case 'DEPTH_ZERO_SELF_SIGNED_CERT':
          case 'CERT_HAS_EXPIRED':
          case 'ERR_TLS_CERT_ALTNAME_INVALID':
          case 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR':
          case 'ERR_SSL_TLSV1_UNRECOGNIZED_NAME':
          case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
          case 'SELF_SIGNED_CERT_IN_CHAIN': {
            // if (DEBUG) console.warn(`[invalid] invalid certificate ${chainId} ${rpcUrl} - ${cause.code}`)
            return { status: 'NOK', error: `Invalid certificate: ${cause.code}`, since }
          }

          // might just be blocking github action host
          case 'ECONNREFUSED':
          case 'UND_ERR_CONNECT_TIMEOUT':
          case 'ECONNRESET': {
            // if (DEBUG) console.warn(`[unknown] connection failed ${chainId} ${rpcUrl} - ${cause.code}`)
            return { status: 'MEH', error: `Connection blocked: ${cause.code}`, since }
          }

          // unexpected, might be worth investigating
          default: {
            if (cause.code) console.warn('unexpected cause error code', networkId, rpcUrl, cause.code)
            else console.warn('unexpected error', networkId, rpcUrl, err)
            break
          }
        }
      }
      const anyError = err as any
      return { status: 'MEH', error: `Unknown error: ${anyError.code ?? anyError.message}`, since }
    } else return { status: 'MEH', error: `Unknown error: ${(err as any)?.toString()}`, since }
  }

  //return { status: 'MEH', error: `Unknown error`, since: new Date() }
}

const getTimeoutSignal = (ms: number) => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

// new Promise((resolve) => {
//   let isDone = false

//   const ws = new WebSocket(url)

//   const done = (value: RpcHealth) => {
//     if (isDone) return
//     isDone = true

//     if (value.status === 'MEH' || value.status === 'NOK') console.log(value.status, url, value.error)

//     resolve(value)
//     ws.close()
//   }

//   // fallback timeout (e.g. 5 seconds)
//   const timeout = setTimeout(() => {
//     if (isDone) return

//     done({ status: 'MEH', error: 'Timeout', since: new Date() })
//   }, 5000)

//   ws.onopen = (e) => {
//     if (isDone) return
//     clearTimeout(timeout)

//     done({ status: 'OK' })
//   }

//   ws.onerror = (err) => {
//     if (isDone) return
//     clearTimeout(timeout)

//     if (isMeh(err.message)) done({ status: 'MEH', error: err.message, since: new Date() })
//     else if (isNok(err.message)) done({ status: 'NOK', error: err.message, since: new Date() })
//     else done({ status: 'MEH', error: err.message, since: new Date() })
//   }
// })

const isKnownInvalidRpcUrl = (url: string) => KNOWN_INVALID_RPC_URLS.some((invalidUrl) => invalidUrl.includes(url))

// RPCs that are not to be fail both from github and browser
const KNOWN_INVALID_RPC_URLS = [
  'https://mainnet.openpiece.io',
  'https://rpc2.mix-blockchain.org:8647',
  'https://mainnet.openpiece.io/ ',
  'https://core.poa.network',
  'https://devnet.web3games.org/evm',
  'https://rpc.public-0138.defi-oracle.io',
  'https://node.mainnet.lightstreams.io',
  'https://rpc.swapdex.network',
  'https://rpcurl.mainnet.plgchain.com',
  'https://mainnet.hashio.io/api',
  'https://arrakis.gorengine.com/own',
  'https://node.cheapeth.org/rpc',
  'https://rpc.zkevm.thefirechain.com',
  'https://mainnet.rpc1.thefirechain.com',
  'https://rpc.softnote.com',
  'https://rpc.luckynetwork.org',
  'https://test.dostchain.com',
  'https://mainnet.zakumi.io',
  'https://rpc.rikscan.com',
  'https://dataseed1.btachain.com',
  'https://rpc.dev.publicmint.io:8545',
  'https://market.bigsb.io',
  'https://prod-forge.prod.findora.org:8545',
  'https://rpc.empirenetwork.io',
  'https://rpc1.phi.network',
  'https://rpc.chain.nexi.technology',
  'https://rpcurl.mainnet.plgchain.plinga.technology',
  'https://chain.nexilix.com',
  'https://node-api.uptn.io/v1/ext/rpc',
  'https://rpc-mainnet.pepenetwork.io',
  'https://rpcpc1-ga.agung.peag.network',
  'https://rpc.astranaut.io',
  'https://rpc1.astranaut.io',
  'https://sanrchain-node.santiment.net',
  'https://gateway.opn.network/node/ext/bc/2VsZe',
  'https://mainnet-rpc.satoshichain.io',
  'https://rpc.autobahn.network',
  'https://api.electroneum.com',
  'https://mainnet.genesyscode.io',
  'https://proxy.thinkiumrpc.net',
  'https://rpc.test.taiko.xyz',
  'https://rpc.l3test.taiko.xyz',
  'https://jellie-rpc.twala.io',
  'https://mainnet.kekchain.com',
  'https://chain.deptofgood.com',
  'https://net.iolite.io',
  'https://rpc.auxilium.global',
  'https://devnet.gather.network',
  'https://rpc.raptorchain.io/web3',
  'https://23.92.21.121:8545',
  'https://mainnet.ipdc.io',
  'https://wallrpc.pirl.io',
  'https://rpc2.phi.network',
  'https://proxy.thinkiumrpc.net/',
  'https://node.sirius.lightstreams.io',
  'https://node.atoshi.io',
  'https://rpc.testnet.dogechain.dog',
  'https://layer1test.decentrabone.com',
  'https://subnets.avax.network/portal-fantasy/testnet/rpc',
  'https://rpc.atheios.org',
  'https://bombchain-testnet.ankr.com/bas_full_rpc_1',
  'https://ngeth.testnet.n3.nahmii.io',
  'https://node-api.alp.uptn.io/v1/ext/rpc',
  'https://evm-rpc.testnet.teleport.network',
  'https://evm.klyntarscan.org',
  'https://evm.klyntar.org',
  'https://blocktonscan.com',
  'https://mainnet.berylbit.io',
  'https://data-aws-testnet.imperiumchain.com',
  'https://data-aws-mainnet.imperiumchain.com',
  'https://data-aws2-testnet.imperiumchain.com',
  'https://data-aws2-mainnet.imperiumchain.com',
  'https://smartbch.devops.cash',
  'https://betaenv.singularity.gold:18545',
  'https://gateway.opn.network/node/ext/bc/2VsZe5DstWw2bfgdx3YbjKcMsJnNDjni95sZorBEdk9L9Qr9Fr/rpc',
  'https://api.testnet-dev.trust.one',
  'https://rpc.condrieu.ethdevops.io',
  'https://testnet.rpc.uschain.network/',
  'https://rpc-devnet-algorand-rollup.a1.milkomeda.com/',
  'https://sparta-rpc.polis.tech/',
  'https://testnet.kekchain.com/',
  'https://rpc.testnet.fastexchain.com/',
  'https://weelinknode1c.gw002.oneitfarm.com/',
  'https://rpc.zhejiang.ethpandaops.io/',
  'https://testnet-rpc.exlscan.com/',
  'https://toys.joys.cash/',
  'https://test.doschain.com/jsonrpc',
  'https://rpc.dexilla.com',
  'https://rpc.xerom.org',
].map((url) => url.replace(/\/$/, ''))
