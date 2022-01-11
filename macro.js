#!/usr/bin/env node

const util = require('util')
const fs = require('fs/promises')
const { readFileSync, writeFileSync } = require('fs')
const exec = util.promisify(require('child_process').exec)
const parachainDetails = Object.fromEntries(
  require('./parachainDetails').map((parachain) => [parachain.id, parachain])
)

// Polkadot.js.org input format:
//
// e.g. from https://github.com/polkadot-js/apps/blob/545d1e2f4d1b1187787a9764148f3640d0cc9d79/packages/apps-config/src/endpoints/productionRelayKusama.ts
//
// [
//   {
//     "paraId": 1000,
//     "text": "Statemine"
//     "providers": {
//       "Parity": "wss://kusama-statemine-rpc.paritytech.net",
//       "OnFinality": "wss://statemine.api.onfinality.io/public-ws",
//     },
//     "linked": [
//       "paraId": 1000,
//       "text": "Statemine"
//       "providers": {
//         "Parity": "wss://kusama-statemine-rpc.paritytech.net",
//         "OnFinality": "wss://statemine.api.onfinality.io/public-ws",
//       },
//     ]
//   }
// ]
//
const endpoints = JSON.parse(readFileSync('./endpoints.json'))
  .flatMap((endpoint) => [
    endpoint,
    ...(endpoint.linked || []).map((linked) => ({
      ...linked,
      relayId:
        endpoint.info === 'polkadot'
          ? 0
          : endpoint.info === 'kusama'
          ? 2
          : undefined,
    })),
  ])
  .filter((endpoint) => typeof endpoint.relayId !== 'undefined')
  .filter((endpoint) => typeof endpoint.paraId !== 'undefined')
  .filter((endpoint) => Object.values(endpoint.providers).length > 0)

;(async () => {
  for (endpoint of endpoints) {
    const { paraId, relayId, text: name, providers } = endpoint
    const rpcs = Object.values(providers)

    const id = `${relayId}-${paraId}`
    const dir = `./${relayId}/parathreads/${paraId}`
    console.log(id, name)

    const dirExists = await fs
      .stat(dir)
      .then((stat) => true)
      .catch(() => false)

    if (!dirExists) {
      console.log(`Creating directory for ${id}`)
      await exec(`rsync -avhP ./0_template/ ${dir}`)
    }

    const manifestFilename = `${dir}/manifest.json`
    const manifest = JSON.parse(readFileSync(manifestFilename))

    // update manifest name

    if (manifest.name !== name) {
      console.log(
        `Updating manifest name for ${id} from ${manifest.name} to ${name}`
      )

      manifest.name = name

      writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
    }

    // update manifest rpcs

    if (JSON.stringify(manifest.rpcs) !== JSON.stringify(rpcs)) {
      console.log(
        `Updating manifest rpcs for ${id}\nfrom:\t${JSON.stringify(
          manifest.rpcs
        )}\nto:\t${JSON.stringify(rpcs)}`
      )

      manifest.rpcs = rpcs

      writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
    }

    // update manifest details

    if (parachainDetails[id]) {
      const details = parachainDetails[id]

      if (details.subtitle && manifest.description !== details.subtitle) {
        console.log(
          `Updating manifest description for ${id}\nfrom:\t${manifest.description}\nto:\t${details.subtitle}`
        )

        manifest.description = details.subtitle

        writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
      }

      if (details.token && manifest.nativeToken !== details.token) {
        console.log(
          `Updating manifest nativeToken for ${id} from ${manifest.nativeToken} to ${details.token}`
        )

        manifest.nativeToken = details.token

        writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
      }

      if (
        details.links &&
        JSON.stringify(manifest.links) !== JSON.stringify(details.links)
      ) {
        console.log(
          `Updating manifest links for ${id}\nfrom:\t${JSON.stringify(
            manifest.links
          )}\nto:\t${JSON.stringify(details.links)}`
        )

        manifest.links = details.links

        writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
      }
    }

    // update global manifest

    const globalManifestFilename = './manifest.json'
    const globalManifest = JSON.parse(readFileSync(globalManifestFilename))

    if (!globalManifest[id] || globalManifest[id] !== name) {
      console.log(
        `Updating global manifest at ${id} from ${globalManifest[id]} to ${name}`
      )

      globalManifest[id] = name

      writeFileSync(
        globalManifestFilename,
        JSON.stringify(
          globalManifest,
          Object.keys(globalManifest).sort((a, b) => a - b),
          2
        )
      )
    }
  }
})()
