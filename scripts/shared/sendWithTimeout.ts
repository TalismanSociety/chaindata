import { WsProvider } from '@polkadot/api'

import { sleep } from './sleep'

export const sendWithTimeout = async (
  url: string | string[],
  requests: Array<[string, any?]>,
  timeout: number = 10_000,
): Promise<any[]> => {
  const autoConnectMs = 0
  const ws = new WsProvider(
    url,
    autoConnectMs,
    {
      // our extension will send this header with every request
      // some RPCs reject this header
      // for those that reject, we want the chaindata CI requests to also reject
      Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
    },
    // doesn't matter what this is as long as it's a bit larger than `timeout`
    // if it's not set then `new WsProvider` will throw an uncatchable error after 60s
    timeout * 99,
  )

  return await (async () => {
    try {
      // try to connect to chain
      await ws.connect()

      const isReadyTimeout = sleep(timeout).then(() => {
        throw new Error('timeout (isReady)')
      })
      await Promise.race([ws.isReady, isReadyTimeout])

      const requestTimeout = sleep(timeout).then(() => {
        throw new Error('timeout (request)')
      })
      return await Promise.race([
        Promise.all(requests.map(([method, params = []]) => ws.send<any>(method, params))),
        requestTimeout,
      ])
    } finally {
      ws.disconnect()
    }
  })()
}
