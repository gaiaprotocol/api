CREATE TABLE profiles (
  account TEXT PRIMARY KEY,
  nickname TEXT,
  bio TEXT,
  profile_image TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);
