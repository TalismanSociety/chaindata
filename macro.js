#!/usr/bin/env node

const util = require('util')
const fs = require('fs/promises')
const { readFileSync, writeFileSync } = require('fs')
const exec = util.promisify(require('child_process').exec)
const parachainDetails = require('./parachainDetails')

// Polkadot.js.org input format:
// {
//   "paraId": 1000,
//   "text": "Statemine"
//   "providers": {
//     "Parity": "wss://kusama-statemine-rpc.paritytech.net",
//     "OnFinality": "wss://statemine.api.onfinality.io/public-ws",
//   },
//   "linked": [
//     "paraId": 1000,
//     "text": "Statemine"
//     "providers": {
//       "Parity": "wss://kusama-statemine-rpc.paritytech.net",
//       "OnFinality": "wss://statemine.api.onfinality.io/public-ws",
//     },
//   ]
// }
//
const endpoints = JSON.parse(readFileSync('./endpoints.json'))
  .flatMap((endpoint) => [endpoint, ...(endpoint.linked || [])])
  .filter((endpoint) => typeof endpoint.paraId !== 'undefined')
  .filter((endpoint) => Object.values(endpoint.providers).length > 0)

;(async () => {
  for (endpoint of endpoints) {
    const { paraId, text: name, providers } = endpoint
    const rpcs = Object.values(providers)

    console.log(paraId, name)

    const dirExists = await fs
      .stat(`./${paraId}`)
      .then((stat) => true)
      .catch(() => false)

    if (!dirExists) {
      console.log(`Creating directory for ${paraId}`)
      await exec(`rsync -avhP ./0_template/ ./${paraId}`)
    }

    const manifestFilename = `./${paraId}/manifest.json`
    const manifest = JSON.parse(readFileSync(manifestFilename))

    // update manifest name

    if (manifest.name !== name) {
      console.log(
        `Updating manifest name for ${paraId} from ${manifest.name} to ${name}`
      )

      manifest.name = name

      writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
    }

    // update manifest rpcs

    if (JSON.stringify(manifest.rpcs) !== JSON.stringify(rpcs)) {
      console.log(
        `Updating manifest rpcs for ${paraId}\nfrom:\t${JSON.stringify(
          manifest.rpcs
        )}\nto:\t${JSON.stringify(rpcs)}`
      )

      manifest.rpcs = rpcs

      writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
    }

    // update manifest details

    if (parachainDetails[paraId]) {
      const details = parachainDetails[paraId]

      if (details.subtitle && manifest.description !== details.subtitle) {
        console.log(
          `Updating manifest description for ${paraId}\nfrom:\t${manifest.description}\nto:\t${details.subtitle}`
        )

        manifest.description = details.subtitle

        writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
      }

      if (details.token && manifest.nativeToken !== details.token) {
        console.log(
          `Updating manifest nativeToken for ${paraId} from ${manifest.nativeToken} to ${details.token}`
        )

        manifest.nativeToken = details.token

        writeFileSync(manifestFilename, JSON.stringify(manifest, null, 2))
      }

      if (
        details.links &&
        JSON.stringify(manifest.links) !== JSON.stringify(details.links)
      ) {
        console.log(
          `Updating manifest links for ${paraId}\nfrom:\t${JSON.stringify(
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

    if (!globalManifest[paraId] || globalManifest[paraId] !== name) {
      console.log(
        `Updating global manifest at ${paraId} from ${globalManifest[paraId]} to ${name}`
      )

      globalManifest[paraId] = name

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
