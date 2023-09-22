import {
  FILE_CHAINDATA,
  FILE_EVM_NETWORKS,
  FILE_TESTNETS_CHAINDATA,
} from './build/constants'
import { html, cleanupOutputDir, getFileList, writeFile } from './build/util'

const chaindata = await Bun.file(FILE_CHAINDATA).json()
const testnetsChaindata = await Bun.file(FILE_TESTNETS_CHAINDATA).json()
const evmNetworks = await Bun.file(FILE_EVM_NETWORKS).json()

await cleanupOutputDir()

await writeFile('chaindata.json', JSON.stringify(chaindata, null, 2))

for (const chain of chaindata) {
  if (!Array.isArray(chain.rpcs) || chain.rpcs.length < 1) continue
  if (typeof chain.id !== 'string') continue

  await writeFile(
    `chains/byId/${chain.id}.json`,
    JSON.stringify(chain, null, 2)
  )
}

await writeFile(
  'index.html',
  html`<html>
    <head>
      <meta name="color-scheme" content="light dark" />
      <style>
        html {
          font-family: sans-serif;
        }
        a {
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <pre style="word-wrap: break-word; white-space: pre-wrap;">
<h3>Chaindata</h3>
${getFileList()
        .map((file) => html`<a href="${file}">${file}</a>`)
        .join('\n')}
      </pre>
    </body>
  </html>`
)
