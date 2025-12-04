CREATE TABLE IF NOT EXISTS persona_fragment_ohlcv_1h (
  persona_address TEXT NOT NULL,
  bucket_start    INTEGER NOT NULL,    -- UNIX timestamp (e.g. 1710000000)

  open_price      TEXT,
  high_price      TEXT,
  low_price       TEXT,
  close_price     TEXT,

  volume_wei      TEXT NOT NULL,
  buy_volume_wei  TEXT NOT NULL,
  sell_volume_wei TEXT NOT NULL,
  trade_count     INTEGER NOT NULL,

  PRIMARY KEY (persona_address, bucket_start)
);
