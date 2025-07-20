CREATE TABLE god_metadata (
  token_id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  gender TEXT NOT NULL,
  parts TEXT NOT NULL,
  image TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
