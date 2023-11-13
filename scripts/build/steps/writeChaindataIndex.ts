import { getFileList, html, writeChaindataFile } from '../../shared/util'
import { sharedData } from './_sharedData'

export const writeChaindataIndex = async () => {
  await writeChains()
  await writeEvmNetworks()
  await writeTokens()
  await writeMiniMetadatas()

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
          .slice()
          .sort()
          .map((file) => html`<a href="${file}">${file}</a>`)
          .join('\n')}
      </pre>
      </body>
    </html>`,
  )
}

const writeChains = async () => {
  const allChains = sharedData.chains
    .filter((chain) => Array.isArray(chain.rpcs) && chain.rpcs.length > 0)
    .sort((a, b) => (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER))

  await writeChaindataFile(`chains/all.json`, JSON.stringify(allChains, null, 2))
  await writeChaindataFile(
    `chains/summary.json`,
    JSON.stringify(
      allChains.map(({ id, isTestnet, sortIndex, genesisHash, name, themeColor, logo, specName, specVersion }) => ({
        id,
        isTestnet,
        sortIndex,
        genesisHash,
        name,
        themeColor,
        logo,
        specName,
        specVersion,
      })),
      null,
      2,
    ),
  )

  for (const chain of allChains) {
    if (typeof chain.id !== 'string') continue
    await writeChaindataFile(`chains/byId/${chain.id}.json`, JSON.stringify(chain, null, 2))

    if (typeof chain.genesisHash !== 'string') continue
    await writeChaindataFile(`chains/byGenesisHash/${chain.genesisHash}.json`, JSON.stringify(chain, null, 2))
  }
}

const writeEvmNetworks = async () => {
  const allEvmNetworks = sharedData.evmNetworks
    .filter((evmNetwork) => Array.isArray(evmNetwork.rpcs) && evmNetwork.rpcs.length > 0)
    .sort((a, b) => (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER))

  await writeChaindataFile(`evmNetworks/all.json`, JSON.stringify(allEvmNetworks, null, 2))
  await writeChaindataFile(
    `evmNetworks/summary.json`,
    JSON.stringify(
      allEvmNetworks.map(({ id, isTestnet, sortIndex, name, themeColor, logo }) => ({
        id,
        isTestnet,
        sortIndex,
        name,
        themeColor,
        logo,
      })),
      null,
      2,
    ),
  )

  for (const evmNetwork of allEvmNetworks) {
    if (typeof evmNetwork.id !== 'string') continue
    await writeChaindataFile(`evmNetworks/byId/${evmNetwork.id}.json`, JSON.stringify(evmNetwork, null, 2))
  }
}

const writeTokens = async () => {
  const allTokens = sharedData.tokens.sort((a, b) => a.id.localeCompare(b.id))

  await writeChaindataFile(`tokens/all.json`, JSON.stringify(allTokens, null, 2))
  await writeChaindataFile(
    `tokens/summary.json`,
    JSON.stringify(
      allTokens.map(({ id, isTestnet, type, symbol, decimals, logo }) => ({
        id,
        isTestnet,
        type,
        symbol,
        decimals,
        logo,
      })),
      null,
      2,
    ),
  )

  for (const token of allTokens) {
    if (typeof token.id !== 'string') continue
    await writeChaindataFile(`tokens/byId/${token.id}.json`, JSON.stringify(token, null, 2))
  }
}

const writeMiniMetadatas = async () => {
  const allMiniMetadatas = sharedData.miniMetadatas.sort((a, b) => a.chainId.localeCompare(b.chainId))

  await writeChaindataFile(`miniMetadatas/all.json`, JSON.stringify(allMiniMetadatas, null, 2))
  await writeChaindataFile(
    `miniMetadatas/summary.json`,
    JSON.stringify(
      allMiniMetadatas.map(({ id, chainId, source, version, specName, specVersion, balancesConfig }) => ({
        id,
        chainId,
        source,
        version,
        specName,
        specVersion,
        balancesConfig,
      })),
      null,
      2,
    ),
  )

  for (const miniMetadata of allMiniMetadatas) {
    if (typeof miniMetadata.id !== 'string') continue
    await writeChaindataFile(`miniMetadatas/byId/${miniMetadata.id}.json`, JSON.stringify(miniMetadata, null, 2))
  }
}
