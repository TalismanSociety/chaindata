// RPCs that should always be treated as OK (best) in the build output.
// Use this for RPCs that filter on origin headers and therefore fail health checks
// in CI (GitHub Actions), but work fine in browsers.
export const FORCE_OK_RPCS: string[] = [
  'wss://bittensor-finney.api.onfinality.io/ws?apikey=15b864be-512b-4391-aea6-d7a583a9a7e1',
]
