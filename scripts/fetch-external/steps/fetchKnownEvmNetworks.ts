import fs from 'fs'
import path from 'path'

import prettier from 'prettier'

export const fetchKnownEvmNetworks = async () => {
  const response = await fetch('https://chainid.network/chains_mini.json')
  const json = await response.json()

  fs.writeFileSync(
    'known-evm-networks.json',
    await prettier.format(JSON.stringify(json, null, 2), {
      parser: 'json',
    }),
  )
}
