# Chaindata

<img src="assets/talisman.svg" alt="Talisman" width="15%" align="right" />

[![api-link](https://img.shields.io/website?label=graphql%20api&logo=graphql&logoColor=white&style=flat-square&up_message=online&down_message=offline&url=https%3A%2F%2Fsquid.subsquid.io%2Fchaindata%2Fv%2Fv4%2Fgraphql)](https://squid.subsquid.io/chaindata/v/v4/graphql)
[![discord-link](https://img.shields.io/discord/858891448271634473?logo=discord&logoColor=white&style=flat-square)](https://discord.gg/talisman)

A **community controlled** repository of [relay](https://wiki.polkadot.network/docs/learn-architecture#relay-chain) and [parachain](https://wiki.polkadot.network/docs/learn-architecture#parachain-and-parathread-slots) information in the [Polkadot ecosystem](https://polkadot.network/).

The goals of this repo are:

1. Provide a community-managed index of Polkadot parachains and their connection information (rpcs, chainspecs)
1. Provide a source of chain and token assets across the ecosystem
1. Enable developers to retrieve this information via an API suitable to their project (graphql, rest [**soon™**](https://github.com/TalismanSociety/chaindata/issues/35), npm [**soon™**](https://github.com/TalismanSociety/chaindata/issues/35))
1. Move towards a decentralised model

---

## Usage

At this time, this repo is used to configure an API which scrapes information from each chain and exposes it via graphql.  
The API can be interacted with via this URL: https://squid.subsquid.io/chaindata/v/v4/graphql

As an example, you could use this query to get the name, [genesisHash](## 'the hash of the first block on the chain') and [address type prefix](https://wiki.polkadot.network/docs/learn-account-advanced#address-format) for each chain:

```graphql
query {
  chains {
    genesisHash
    prefix
    name
  }
}
```

For an example of a more advanced use-case, you can check out the [Talisman wallet](https://github.com/TalismanSociety/talisman/blob/898310b3761a7313ffaa5f2f747736dcb24fd455/packages/chaindata-provider-extension/src/graphql.ts) source code.  
The wallet uses chaindata to populate a database of chains and tokens which is used for features like account balance subscriptions and sending funds.
