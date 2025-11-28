CREATE TABLE profiles (
  account TEXT PRIMARY KEY, -- wallet address
  nickname TEXT,
  bio TEXT,
  profile_image TEXT,
  social_links TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);
