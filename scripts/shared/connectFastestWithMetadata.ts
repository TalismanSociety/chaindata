import { createClient } from '@polkadot-api/substrate-client'
import { fetchBestMetadata } from '@talismn/sapi'
import { getWsProvider } from 'polkadot-api/ws'

import { withTimeout } from './withTimeout'

export type DotClient = ReturnType<typeof createClient>

// @polkadot/rpc-provider's WsProvider connects to a single endpoint, does NOT fail over to another
// rpc on a *request* timeout (only on disconnect), AND auto-reconnects forever while logging every
// failure ("API-WS: disconnected ... 1002"). Large metadata (asset-hubs ~600KB+) can't download
// within the timeout on a slow endpoint (e.g. astar: dwellir 34s vs onfinality 3s), so a single
// slow/dead rpc both blocks the fetch and spams the console indefinitely.
//
// polkadot-api's ws provider avoids both: its logger defaults to a no-op (no console spam) and
// client.destroy() tears the connection down cleanly. We use the low-level @polkadot-api/substrate-client
// (raw request/response) rather than polkadot-api's high-level createClient on purpose: the latter
// eagerly runs a chainHead_follow subscription whose background promise rejects (DisjointError /
// "Not connected") when we destroy the client mid-follow, surfacing as an unhandled rejection that
// crashes the process. Race every rpc behind a hard per-rpc timeout (so a dead rpc can't hang the
// race and leak a reconnecting socket), keep the fastest client that returns metadata for the
// caller's subsequent storage reads, and always destroy the rest. The caller owns the returned client.
export const connectFastestWithMetadata = async (
  rpcs: string[],
  perRpcTimeoutMs = 20_000,
): Promise<{ client: DotClient; metadataRpc: `0x${string}` }> => {
  const clients = rpcs.map((rpc) => ({ rpc, client: createClient(getWsProvider(rpc)) }))
  const errors: string[] = []

  try {
    const winner = await new Promise<{ client: DotClient; metadataRpc: `0x${string}` }>((resolve, reject) => {
      let pending = clients.length
      let resolved = false
      for (const { rpc, client } of clients) {
        void (async () => {
          try {
            const metadataRpc = await withTimeout(
              () =>
                fetchBestMetadata(
                  (method, params) => client.request(method, params),
                  false, // do not allow fallback, though it will fallback if RPC responds that Metadata runtime api doesn't exist
                ),
              perRpcTimeoutMs,
              `metadata fetch timed out for ${rpc}`,
            )
            if (!resolved) {
              resolved = true
              resolve({ client, metadataRpc })
            }
          } catch (cause) {
            errors.push(`${rpc}: ${(cause as Error)?.message ?? cause}`)
            if (--pending === 0 && !resolved)
              reject(new Error(`all ${clients.length} rpc(s) failed: ${errors.join(' | ')}`))
          }
        })()
      }
    })

    for (const { client } of clients) if (client !== winner.client) client.destroy()
    return winner
  } catch (cause) {
    for (const { client } of clients) client.destroy()
    throw cause
  }
}
