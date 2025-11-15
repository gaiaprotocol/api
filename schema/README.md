```
wrangler d1 execute gaiaprotocol --local --file=./schema/nfts.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/contract_event_sync_status.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/notices.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/gaia_names.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/profiles.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/gods_stats.sql
```

```
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/nfts.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/contract_event_sync_status.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/notices.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/gaia_names.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/profiles.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/gods_stats.sql
```

## insert
```
wrangler d1 execute gaiaprotocol --local --file=./schema/insert/notices_insert.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/insert/insert_nft_test.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/insert/insert_gods_stats.sql
```

## dump and restore
```
wrangler d1 execute gaiaprotocol --local --file=./schema/supabase_dump.sql
```
