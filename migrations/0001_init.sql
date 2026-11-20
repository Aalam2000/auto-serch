-- auto-serch: first schema

CREATE TABLE searches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  last_run   TEXT,
  last_error TEXT
);

-- One row per Turbo.az ad.
-- status: new -> filtered_out | reviewed -> sent -> interesting | rejected ; sold
CREATE TABLE ads (
  id            TEXT PRIMARY KEY,          -- Turbo.az ad id
  url           TEXT NOT NULL,
  search_id     INTEGER REFERENCES searches(id),
  name          TEXT NOT NULL,             -- "Mercedes E 220"
  engine        TEXT,                      -- "2.2 л" (from the list)
  fuel          TEXT,                      -- from the ad page
  year          INTEGER,
  mileage_km    INTEGER,                   -- as written, not trusted
  price         INTEGER,
  currency      TEXT,
  city          TEXT,
  distance_km   INTEGER,                   -- from Baku, NULL = unknown city
  credit        INTEGER NOT NULL DEFAULT 0,
  photo         TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  status_reason TEXT,                      -- why filtered out
  note          TEXT,                      -- my note
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL
);
CREATE INDEX ads_status ON ads(status);

CREATE TABLE price_history (
  ad_id   TEXT NOT NULL REFERENCES ads(id),
  price   INTEGER NOT NULL,
  seen_at TEXT NOT NULL
);
CREATE INDEX price_history_ad ON price_history(ad_id);

-- AI review of one ad (text + all photos).
CREATE TABLE reviews (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id             TEXT NOT NULL REFERENCES ads(id),
  body_score        INTEGER,  -- 0..10
  rust_score        INTEGER,  -- 0..10, 10 = no rust
  accident_signs    TEXT,
  interior_score    INTEGER,  -- 0..10
  has_ac            INTEGER,  -- 1 / 0 / NULL = unknown
  real_mileage_note TEXT,
  total_score       INTEGER,  -- 0..100
  summary           TEXT,
  ai_model          TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX reviews_ad ON reviews(ad_id);

-- Road distance from Baku, approximate. Editable later in the Mini App.
CREATE TABLE cities (
  name        TEXT PRIMARY KEY,   -- as on ru.turbo.az
  distance_km INTEGER NOT NULL
);

-- key/value settings, value is JSON.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
