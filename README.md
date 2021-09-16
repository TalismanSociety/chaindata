# 📁 Chaindata
This repository is a **community controlled** index of relay/parachain assets, allowing developers to **easily leverage the latest chain information** when building within the polkadot ecosystem. 

>Think of it as an supplementary datastore to extend the information available on-chain.   

The hope is for developers to use this repository as an chain-id-indexed endpoint for chain specific data, while allowing parachain teams to update their own assets as required.

The goals of this repo are:

1. Provide a common URL schema for accessing chain assets
3. Allow parachains to manage their assets across community projects
2. Provide brand consistency across the ecosystem
3. Move towards a decentralised model

> **Developers**: If you're looking to utilise these assets in your application, use the [@talismn/chaindata-js](https://github.com/talismansociety/chaindata-js) lib for a much smoother experience

----

## Usage
Each supported chain will have a directory based on the chain id. This directory will contain a `manifest.json` file, a `chainspec.json` file [TODO] and an assets directory containing all available assets.

>Required assets are `logo.svg`, `banner.png` and a `card.png`.

**To use an asset in your application, simply reference it by ID using the chain-id-indexed directory structure.**

> Note: In the following examples we'll be using the Kusama chain assets (id: 2)

### Basic asset usage
To use the chain logo, access the asset file using:

<pre>https://github.com/talismansociety/chaindata/blob/master/<b>2/assets/logo.svg</b></pre>

This can be used directly in a UI layer. For example in HTML:

```html
<img src='https://github.com/talismansociety/chaindata/blob/master/2/assets/logo.svg'/>
```

### Asset & brand discovery
To discover which assets are available, reference the manifest.json file at the root of the chain directory:

<pre>https://github.com/talismansociety/chaindata/blob/master/<b>2/manifest.json</b></pre>

This will return a json file containing all available asset types, filenames & branding information.

```json5
{
  "logo": "logo.svg",
  "poster": "poster.png",
  // ...more
  "colors": {
    "primary": "#FF0056",
    "secondary": "...",
    "dark": "...",
    // ...more
  }
}
```

> Note: see here [TODO] for info on which items are marked as required

### Public RPCs
Each chain directory should have at least 1 public rpc included in the manifest.

This array will contain a list publically available RPC endpoints. These endpoints can be used when connecting to a chain using polkadot.js.

```json5
[
  "wss://kusama-rpc.polkadot.io",
  "wss://kusama.api.onfinality.io"
]
```

### Chain discovery
To discover which chains are supported, reference the manifest.json file at the root of the repo.

<pre>https://github.com/talismansociety/chaindata/blob/master/<b>manifest.json</b></pre>

The JSON file returned will be an object containing key:value pairs of the <b>chain id</b> and <b>name</b>.

```json5
{
  "0": "Polkadot",
  "2": "Kusama",
  // ... more
}
```


### Lightclient WASM spec (todo)
```
TODO: provide the WASM chaindata for spinning up local lightclients

1. is this possible?
2. do the specs need constant updating?
3. ... questions
```

----

## For parachains
Nominate a github account (todo) be the authorised signaller of pull requests.

With your nominated account you can create pull requests, or signal the validity of other pull requests. Once signalled, we'll validate and merge the pull request into the master branch.

> Note: For new parachains, along with a new directory for your parachain assets (see [required fields](#required-fields)), you'll also need to add an entry into the [manifest.json](#chain-discovery) file at the root of the repo. 

> For recommended assets specs, see this file [this file](https://github.com/talismansociety/blob/master/SPECS.md)

----

## For developers
Although developers can use the raw URLs as above, it's recommended to use one of the following when building applications:

1. [Chaindata JS lib](https://github.com/talismansociety/chaindata-js) (js library)
2. [Chaindata react hooks](https://github.com/TalismanSociety/api-react-hooks) (react wrapper around the js lib)

----

## Required fields
The following files are required per chain directory:

```json
- manifest.json
- chainspec.json
- /assets
  - logo.svg
  - banner.png
  - background.png
  - /colors
    - primary
    - secondary
```

----

## Roadmap

#### Todo
- ✖️ Add all current relay/parachains
- ✖️ Integrate on IPFS
- ✖️ Implement governance model

#### Done
- ✔️ configure directory structure
- ✔️ set up repo

----

## Notes
all public rpcs here: https://github.com/polkadot-js/apps/tree/master/packages/apps-config/src/endpoints
