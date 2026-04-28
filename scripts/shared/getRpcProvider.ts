import { WsProvider } from '@polkadot/api'

export const getRpcProvider = (rpcs: string[], autoConnectMs = 5_000, timeout = autoConnectMs) => {
  const provider = new WsProvider(
    rpcs,
    autoConnectMs,
    {
      Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
    },
    timeout,
  )

  // Wrap WsProvider's onSocketMessage handler to catch JSON.parse errors from malformed
  // WebSocket responses. Without this, a truncated JSON message causes an uncaught exception
  // that crashes the entire Node.js process (the upstream library does JSON.parse without
  // try-catch in ws/index.js __internal__onSocketMessage).
  const origHandler = (provider as any).__internal__onSocketMessage
  if (typeof origHandler === 'function') {
    const safeHandler = (message: MessageEvent) => {
      try {
        return origHandler.call(provider, message)
      } catch (err) {
        if (err instanceof SyntaxError) {
          console.warn(`WsProvider received malformed JSON, disconnecting: ${err.message}`)
          provider.disconnect().catch(() => {})
          return
        }
        throw err
      }
    }

    // Replace on instance so future reconnects (which read this property) use the safe version
    ;(provider as any).__internal__onSocketMessage = safeHandler

    // Also patch the already-created websocket from the constructor's synchronous connect()
    const ws = (provider as any).__internal__websocket
    if (ws) ws.onmessage = safeHandler
  }

  return provider
}
