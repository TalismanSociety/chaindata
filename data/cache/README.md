Files in this folder are manually generated, though individual entries are never recreated.
In order to force an update, you may delete a specific entry.

For example if a token image changes on coingecko side, delete the associated object inside the `known-evm-networks-icons-cache.json`.

`dtao-token-logos-cache.json` is the exception: it is refreshed on every run, using the `etag`/`lastModified` of each entry to skip unchanged images. Delete an entry to force a re-download of that subnet logo.
