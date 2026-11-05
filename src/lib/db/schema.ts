export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_media_origins (
  service TEXT NOT NULL,
  origin_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  PRIMARY KEY (service, origin_id)
);
CREATE INDEX IF NOT EXISTS service_media_origin_track ON service_media_origins(service, track_id);

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

CREATE TABLE IF NOT EXISTS health_weight_entries (
  entry_date TEXT PRIMARY KEY NOT NULL CHECK (length(entry_date) = 10),
  weight_kg REAL NOT NULL CHECK (weight_kg >= 20 AND weight_kg <= 400),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS health_training_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  session_date TEXT NOT NULL CHECK (length(session_date) = 10),
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS health_training_date ON health_training_sessions(session_date);
CREATE TABLE IF NOT EXISTS health_training_rest (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_medication_plans (
  id TEXT PRIMARY KEY NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_medication_logs (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES health_medication_plans(id),
  entry_date TEXT NOT NULL CHECK (length(entry_date) = 10),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS health_medication_log_date ON health_medication_logs(entry_date);
CREATE TABLE IF NOT EXISTS health_medication_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  alerts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (alerts_enabled IN (0, 1))
);
CREATE TABLE IF NOT EXISTS health_body_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  entry_date TEXT NOT NULL UNIQUE CHECK (length(entry_date) = 10),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_nutrition_days (
  entry_date TEXT PRIMARY KEY NOT NULL CHECK (length(entry_date) = 10),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS integration_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_media_retired (id TEXT PRIMARY KEY, uri TEXT, service TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_import_receipts (id TEXT PRIMARY KEY, service TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS backend_source_tracks (id TEXT PRIMARY KEY, signature TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS backend_resources (kind TEXT NOT NULL, id TEXT NOT NULL, directory INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS backend_versions (key TEXT PRIMARY KEY, domain TEXT NOT NULL, version INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS backend_version_domain ON backend_versions(domain);
CREATE TABLE IF NOT EXISTS backend_requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL);
`;

// Triggers cover writes from background synchronization, imports and legacy native entry points too.
export const BACKEND_TRIGGER_SQL: string[] = [];
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_weight_entries_insert AFTER INSERT ON health_weight_entries BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('weight:' || NEW.entry_date,'weight',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('weight:$collection','weight',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_weight_entries_update AFTER UPDATE ON health_weight_entries BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('weight:' || NEW.entry_date,'weight',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('weight:$collection','weight',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_weight_entries_delete AFTER DELETE ON health_weight_entries BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('weight:' || OLD.entry_date,'weight',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('weight:$collection','weight',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_training_sessions_insert AFTER INSERT ON health_training_sessions BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:' || NEW.id,'training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$collection','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_training_sessions_update AFTER UPDATE ON health_training_sessions BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:' || NEW.id,'training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$collection','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_training_sessions_delete AFTER DELETE ON health_training_sessions BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:' || OLD.id,'training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$collection','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_training_rest_insert AFTER INSERT ON health_training_rest BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$rest','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$collection','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_training_rest_update AFTER UPDATE ON health_training_rest BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$rest','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$collection','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_training_rest_delete AFTER DELETE ON health_training_rest BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$rest','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('training:$collection','training',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_plans_insert AFTER INSERT ON health_medication_plans BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:' || NEW.id,'medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_plans_update AFTER UPDATE ON health_medication_plans BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:' || NEW.id,'medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_plans_delete AFTER DELETE ON health_medication_plans BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:' || OLD.id,'medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_logs_insert AFTER INSERT ON health_medication_logs BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:' || NEW.id,'medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_logs_update AFTER UPDATE ON health_medication_logs BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:' || NEW.id,'medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_logs_delete AFTER DELETE ON health_medication_logs BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:' || OLD.id,'medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_settings_insert AFTER INSERT ON health_medication_settings BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_settings_update AFTER UPDATE ON health_medication_settings BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_medication_settings_delete AFTER DELETE ON health_medication_settings BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('medication:$collection','medication',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_nutrition_days_insert AFTER INSERT ON health_nutrition_days BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('nutrition:' || NEW.entry_date,'nutrition',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('nutrition:$collection','nutrition',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_nutrition_days_update AFTER UPDATE ON health_nutrition_days BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('nutrition:' || NEW.entry_date,'nutrition',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('nutrition:$collection','nutrition',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_nutrition_days_delete AFTER DELETE ON health_nutrition_days BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('nutrition:' || OLD.entry_date,'nutrition',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('nutrition:$collection','nutrition',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_body_reviews_insert AFTER INSERT ON health_body_reviews BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('body:' || NEW.id,'body',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('body:$collection','body',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_body_reviews_update AFTER UPDATE ON health_body_reviews BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('body:' || NEW.id,'body',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('body:$collection','body',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_health_body_reviews_delete AFTER DELETE ON health_body_reviews BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('body:' || OLD.id,'body',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('body:$collection','body',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_projects_insert AFTER INSERT ON prod_projects BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:' || NEW.id,'tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:$collection','tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_projects_update AFTER UPDATE ON prod_projects BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:' || NEW.id,'tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:$collection','tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_projects_delete AFTER DELETE ON prod_projects BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:' || OLD.id,'tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:$collection','tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_tasks_insert AFTER INSERT ON prod_tasks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:' || NEW.id,'tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:$collection','tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_tasks_update AFTER UPDATE ON prod_tasks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:' || NEW.id,'tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:$collection','tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_tasks_delete AFTER DELETE ON prod_tasks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:' || OLD.id,'tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('tasks:$collection','tasks',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_reminders_insert AFTER INSERT ON prod_reminders BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('reminders:' || NEW.id,'reminders',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('reminders:$collection','reminders',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_reminders_update AFTER UPDATE ON prod_reminders BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('reminders:' || NEW.id,'reminders',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('reminders:$collection','reminders',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_prod_reminders_delete AFTER DELETE ON prod_reminders BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('reminders:' || OLD.id,'reminders',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('reminders:$collection','reminders',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_accounts_insert AFTER INSERT ON wealth_accounts BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_accounts_update AFTER UPDATE ON wealth_accounts BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_accounts_delete AFTER DELETE ON wealth_accounts BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || OLD.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_assets_insert AFTER INSERT ON wealth_assets BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_assets_update AFTER UPDATE ON wealth_assets BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_assets_delete AFTER DELETE ON wealth_assets BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || OLD.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_quotes_insert AFTER INSERT ON wealth_quotes BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_quotes_update AFTER UPDATE ON wealth_quotes BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_quotes_delete AFTER DELETE ON wealth_quotes BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || OLD.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_tx_insert AFTER INSERT ON wealth_tx BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_tx_update AFTER UPDATE ON wealth_tx BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_tx_delete AFTER DELETE ON wealth_tx BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || OLD.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_goals_insert AFTER INSERT ON wealth_goals BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_goals_update AFTER UPDATE ON wealth_goals BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || NEW.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_wealth_goals_delete AFTER DELETE ON wealth_goals BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:' || OLD.id,'wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('wealth:$collection','wealth',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_artists_insert AFTER INSERT ON artists BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_artists_update AFTER UPDATE ON artists BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_artists_delete AFTER DELETE ON artists BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || OLD.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_albums_insert AFTER INSERT ON albums BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_albums_update AFTER UPDATE ON albums BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_albums_delete AFTER DELETE ON albums BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || OLD.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_tracks_insert AFTER INSERT ON tracks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_tracks_update AFTER UPDATE ON tracks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_tracks_delete AFTER DELETE ON tracks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || OLD.id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_recents_insert AFTER INSERT ON recents BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.track_id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_recents_update AFTER UPDATE ON recents BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.track_id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_recents_delete AFTER DELETE ON recents BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || OLD.track_id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_favorites_insert AFTER INSERT ON favorites BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.track_id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_favorites_update AFTER UPDATE ON favorites BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || NEW.track_id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_favorites_delete AFTER DELETE ON favorites BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:' || OLD.track_id,'catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('catalog:$collection','catalog',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_playlists_insert AFTER INSERT ON playlists BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:' || NEW.id,'playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:$collection','playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_playlists_update AFTER UPDATE ON playlists BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:' || NEW.id,'playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:$collection','playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_playlists_delete AFTER DELETE ON playlists BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:' || OLD.id,'playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:$collection','playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_playlist_tracks_insert AFTER INSERT ON playlist_tracks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:' || NEW.playlist_id,'playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:$collection','playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_playlist_tracks_update AFTER UPDATE ON playlist_tracks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:' || NEW.playlist_id,'playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:$collection','playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_playlist_tracks_delete AFTER DELETE ON playlist_tracks BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:' || OLD.playlist_id,'playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('playlists:$collection','playlists',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_integration_cache_insert AFTER INSERT ON integration_cache BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('integrations:' || NEW.key,'integrations',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('integrations:$collection','integrations',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_integration_cache_update AFTER UPDATE ON integration_cache BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('integrations:' || NEW.key,'integrations',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('integrations:$collection','integrations',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_integration_cache_delete AFTER DELETE ON integration_cache BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('integrations:' || OLD.key,'integrations',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('integrations:$collection','integrations',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_meta_settings_insert AFTER INSERT ON meta WHEN NEW.key='nas_settings' BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('settings:$collection','settings',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_meta_preferences_insert AFTER INSERT ON meta WHEN NEW.key LIKE 'service_preference:%' BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('preferences:' || substr(NEW.key,20),'preferences',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('preferences:$collection','preferences',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_meta_settings_update AFTER UPDATE ON meta WHEN NEW.key='nas_settings' BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('settings:$collection','settings',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_meta_preferences_update AFTER UPDATE ON meta WHEN NEW.key LIKE 'service_preference:%' BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('preferences:' || substr(NEW.key,20),'preferences',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('preferences:$collection','preferences',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_meta_settings_delete AFTER DELETE ON meta WHEN OLD.key='nas_settings' BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('settings:$collection','settings',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
BACKEND_TRIGGER_SQL.push(`CREATE TRIGGER IF NOT EXISTS nlc_revision_meta_preferences_delete AFTER DELETE ON meta WHEN OLD.key LIKE 'service_preference:%' BEGIN
 INSERT INTO backend_versions(key,domain,version) VALUES ('preferences:' || substr(OLD.key,20),'preferences',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
 INSERT INTO backend_versions(key,domain,version) VALUES ('preferences:$collection','preferences',1) ON CONFLICT(key) DO UPDATE SET version=version+1;
END`);
