```
wrangler d1 execute gaiaprotocol --local --file=./schema/nfts.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/contract_event_sync_status.sql

wrangler d1 execute gaiaprotocol --local --file=./schema/notices.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/notices_insert.sql

wrangler d1 execute gaiaprotocol --local --file=./schema/gaia_names.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/god_metadata.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/supabase_dump.sql

wrangler d1 execute gaiaprotocol --local --file=./schema/insert_nft_test.sql
```
