import { WsProvider } from '@polkadot/api'

export const getRpcProvider = (rpcs: string[], autoConnectMs = 5_000, timeout = autoConnectMs) =>
  new WsProvider(
    rpcs,
    autoConnectMs,
    {
      Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
    },
    timeout,
  )
