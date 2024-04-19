import { writeFile } from 'node:fs/promises'

import { PromisePool } from '@supercharge/promise-pool'
import prettier from 'prettier'
import TOML from 'toml'

import {
  FILE_NOVASAMA_METADATA_PORTAL_URLS,
  NOVASAMA_METADATA_PORTAL_CONFIG,
  PRETTIER_CONFIG,
} from '../../shared/constants'
import { MetadataPortalUrls } from '../../shared/types'

const novasamaNameToTalismanChainId: Record<string, string | undefined> = {
  acala: 'acala',
  ajuna: 'ajuna',
  'aleph-node': 'aleph-zero',
  altair: 'altair',
  amplitude: 'amplitude',
  appchain: 'myriad',
  astar: 'astar',
  bajun: 'bajun',
  basilisk: 'basilisk',
  bifrost: 'bifrost-kusama',
  bifrost_polkadot: 'bifrost-polkadot',
  'bridge-hub-kusama': 'kusama-bridge-hub',
  'bridge-hub-polkadot': 'polkadot-bridge-hub',
  calamari: 'calamari',
  centrifuge: 'centrifuge-polkadot',
  'clover-mainnet': 'clover',
  collectives: 'polkadot-collectives',
  composable: 'composable-finance',
  crab2: 'crab',
  'crust-collator': 'shadow-kusama',
  darwinia2: 'darwinia',
  'dock-pos-main-runtime': 'dock-pos-mainnet',
  edgeware: 'edgeware',
  'encointer-parachain': 'encointer',
  frequency: 'frequency',
  heiko: 'heiko-kusama',
  hydradx: 'hydradx',
  imbue: 'imbue',
  'integritee-parachain': 'integritee-kusama',
  'interlay-parachain': 'interlay',
  invarch: 'invarch',
  ipci: 'ipci',
  'joystream-node': 'joystream',
  'kabocha-parachain': 'kabocha',
  karura: 'karura',
  khala: 'khala',
  'kilt-spiritnet': 'kilt-spiritnet',
  'kintsugi-parachain': 'kintsugi',
  'litentry-parachain': 'litentry',
  'litmus-parachain': 'litmus',
  mainnet: 'ternoa',
  'mangata-parachain': 'mangata',
  manta: 'manta',
  'matrix-enjin': 'enjin-matrixchain',
  moonbase: 'moonbase-alpha-testnet',
  moonbeam: 'moonbeam',
  moonriver: 'moonriver',
  node: 'polkadex-standalone',
  'node-subtensor': 'bittensor',
  'nodle-para': 'nodle-polkadot',
  'origintrail-parachain': 'neuroweb-polkadot',
  parallel: 'parallel',
  paseo: 'paseo-testnet',
  'peaq-node-krest': 'krest',
  pendulum: 'pendulum',
  phala: 'phala',
  picasso: 'picasso',
  'pioneer-runtime': 'bitcountry-pioneer',
  'polimec-mainnet': 'polimec',
  'polkadot-crust-parachain': 'crust-parachain',
  polymesh_mainnet: 'polymesh',
  'poscan-runtime': '3-dpass',
  quartz: 'quartz',
  robonomics: 'robonomics-kusama',
  rococo: 'rococo-testnet',
  shiden: 'shiden-kusama',
  statemine: 'kusama-asset-hub',
  statemint: 'polkadot-asset-hub',
  'subsocial-parachain': 'subsocial-polkadot',
  tinkernet_node: 'tinker',
  turing: 'turing',
  unique: 'unique',
  vara: 'vara',
  'watr-mainnet': 'watr',
  westend: 'westend-testnet',
  xxnetwork: 'xxnetwork',
  zeitgeist: 'zeitgeist',
}

export const fetchNovasamaMetadataPortalUrls = async () => {
  const config = TOML.parse(await (await fetch(NOVASAMA_METADATA_PORTAL_CONFIG)).text())

  const portalUrls: MetadataPortalUrls = config?.chains?.flatMap((chain: any) => {
    const name = chain?.name?.toLowerCase()
    const title = chain?.title
    const relayName = chain?.relay_chain
    const isTestnet = chain?.testnet === true

    const talismanId = novasamaNameToTalismanChainId[name]
    if (!talismanId) {
      console.warn(`Missing novasamaNameToTalismanChainId map for '${name}'`)
      return []
    }

    const urlId = [relayName, name].filter(Boolean).join('-').toLowerCase()

    const chainspecQrUrl = `https://metadata.novasama.io/qr/${encodeURIComponent(urlId)}_specs.png`
    const latestMetadataQrUrl = `https://metadata.novasama.io/qr/${encodeURIComponent(urlId)}_metadata_latest.apng`

    return {
      id: talismanId,
      isTestnet,
      meta: {
        name,
        title,
      },
      urls: {
        chainspecQrUrl,
        latestMetadataQrUrl,
      },
    }
  })

  const validPortalUrls = (
    await PromisePool.withConcurrency(4)
      .for(portalUrls)
      .process(async (chain) => {
        const [specResp, metadataResp] = await Promise.all([
          fetch(chain.urls.chainspecQrUrl),
          fetch(chain.urls.latestMetadataQrUrl),
        ])
        if (specResp.status !== 200 || metadataResp.status !== 200) {
          console.warn(
            `${chain.id} (${chain.meta.title}) metadata urls (${chain.urls.chainspecQrUrl}), (${chain.urls.latestMetadataQrUrl}) are invalid`,
          )
          return []
        }

        return chain
      })
  ).results
    .flatMap((chain) => chain)
    .sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(
    FILE_NOVASAMA_METADATA_PORTAL_URLS,
    await prettier.format(JSON.stringify(validPortalUrls, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )
}
