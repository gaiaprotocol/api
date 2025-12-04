```
wrangler d1 execute gaiaprotocol --local --file=./schema/nfts.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/contract_event_sync_status.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/notices.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/gaia_names.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/profiles.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/gods_stats.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/oauth2_web3_accounts.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/notifications.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/notification_unread_counters.sql

wrangler d1 execute gaiaprotocol --local --file=./schema/persona_fragments.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_fragment_trades.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_fragment_holders.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_fragment_ohlcv_1h.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_posts.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_post_views.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_post_likes.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_post_bookmarks.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_chat_messages.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/persona_chat_reactions.sql
```

```
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/nfts.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/contract_event_sync_status.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/notices.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/gaia_names.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/profiles.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/gods_stats.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/oauth2_web3_accounts.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/notifications.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/notification_unread_counters.sql

wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_fragments.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_fragment_trades.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_fragment_holders.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_fragment_ohlcv_1h.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_posts.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_post_views.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_post_likes.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_post_bookmarks.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_chat_messages.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/persona_chat_reactions.sql
```

## insert
```
wrangler d1 execute gaiaprotocol --local --file=./schema/insert/notices_insert.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/insert/insert_nft_test.sql
wrangler d1 execute gaiaprotocol --local --file=./schema/insert/insert_gods_stats.sql
```

## testnet insert
```
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/insert/notices_insert.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/insert/insert_nft_test.sql
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/insert/insert_gods_stats.sql
```

## dump and restore
```
wrangler d1 execute gaiaprotocol --local --file=./schema/dump-and-restore/supabase_dump.sql
```

## testnet dump and restore
```
wrangler d1 execute gaiaprotocol_testnet --remote --file=./schema/dump-and-restore/supabase_dump.sql
```