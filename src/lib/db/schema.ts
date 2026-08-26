export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  album_count INTEGER,
  cover_id TEXT
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  year INTEGER,
  cover_id TEXT,
  track_count INTEGER,
  kind TEXT NOT NULL DEFAULT 'music'
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  album_id TEXT NOT NULL,
  album_name TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  track_no INTEGER,
  disc INTEGER,
  content_type TEXT,
  cover_id TEXT,
  artwork_url TEXT,
  kind TEXT NOT NULL DEFAULT 'music',
  on_nas INTEGER NOT NULL DEFAULT 1,
  nas_bytes INTEGER,
  local_uri TEXT,
  local_bytes INTEGER,
  offline_status TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS recents (
  position INTEGER PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  position INTEGER PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  cover_url TEXT,
  spotify_url TEXT NOT NULL DEFAULT '',
  imported_at INTEGER NOT NULL,
  liked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  spotify_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  cover_url TEXT,
  matched_id TEXT,
  PRIMARY KEY (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_id);
CREATE INDEX IF NOT EXISTS tracks_offline ON tracks(offline_status);
CREATE INDEX IF NOT EXISTS tracks_kind ON tracks(kind);

CREATE TABLE IF NOT EXISTS prod_projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prod_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  sort INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER,
  starred INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES prod_projects(id)
);

CREATE INDEX IF NOT EXISTS prod_tasks_project ON prod_tasks(project_id);
CREATE INDEX IF NOT EXISTS prod_tasks_status ON prod_tasks(status);

CREATE TABLE IF NOT EXISTS prod_reminders (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  weekday INTEGER,
  once_at INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wealth_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cash',
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wealth_assets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'other',
  account_id TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  cost_basis REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wealth_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  price REAL NOT NULL,
  booked_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS wealth_quotes_asset ON wealth_quotes(asset_id, booked_at);

CREATE TABLE IF NOT EXISTS wealth_tx (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  account_id TEXT,
  asset_id TEXT,
  counter_account_id TEXT,
  quantity REAL,
  unit_price REAL,
  booked_at INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS wealth_assets_account ON wealth_assets(account_id);
CREATE INDEX IF NOT EXISTS wealth_tx_booked ON wealth_tx(booked_at);
CREATE INDEX IF NOT EXISTS wealth_tx_account ON wealth_tx(account_id);
CREATE INDEX IF NOT EXISTS wealth_tx_asset ON wealth_tx(asset_id);

CREATE TABLE IF NOT EXISTS wealth_goals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  target REAL NOT NULL,
  scope TEXT NOT NULL DEFAULT 'networth',
  account_id TEXT,
  asset_id TEXT,
  deadline_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
`
