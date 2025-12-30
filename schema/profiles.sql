CREATE TABLE profiles (
  account TEXT PRIMARY KEY, -- wallet address
  nickname TEXT,
  bio TEXT,
  avatar_url TEXT,
  avatar_thumbnail_url TEXT,
  banner_url TEXT,
  banner_thumbnail_url TEXT,
  social_links TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);
