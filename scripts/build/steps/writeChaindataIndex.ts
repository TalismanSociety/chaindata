import { getFileList, html, writeChaindataFile } from '../util'
import { sharedData } from './_sharedData'

export const writeChaindataIndex = async () => {
  for (const chain of sharedData.chains) {
    if (typeof chain.id !== 'string') continue
    if (!Array.isArray(chain.rpcs) || chain.rpcs.length < 1) continue

    await writeChaindataFile(`chains/byId/${chain.id}.json`, JSON.stringify(chain, null, 2))

    if (typeof chain.genesisHash !== 'string') continue
    await writeChaindataFile(`chains/byGenesisHash/${chain.genesisHash}.json`, JSON.stringify(chain, null, 2))
  }

  await writeChaindataFile(
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
}
