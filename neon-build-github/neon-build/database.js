// database.js — SQLite with smart path for local + cloud
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Render mounts a persistent disk at /data — use it if available
// Otherwise fall back to project root (local dev)
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'neon-build.db');

const db = new Database(DB_PATH);

// WAL mode = better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Schema ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS parts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    category            TEXT    NOT NULL,
    brand               TEXT    NOT NULL,
    name                TEXT    NOT NULL,
    price_usd           REAL    NOT NULL,
    rating              INTEGER NOT NULL DEFAULT 3 CHECK(rating BETWEEN 1 AND 5),
    tier                TEXT    NOT NULL DEFAULT 'mid'
                          CHECK(tier IN ('ultra','high','mid','entry')),
    watt                INTEGER NOT NULL DEFAULT 0,
    stock               TEXT    NOT NULL DEFAULT 'in'
                          CHECK(stock IN ('in','low','out')),
    img                 TEXT    DEFAULT '',
    specs               TEXT    DEFAULT '{}',
    perf_gaming         INTEGER DEFAULT 0,
    perf_workstation    INTEGER DEFAULT 0,
    perf_streaming      INTEGER DEFAULT 0,
    retailer_amazon     TEXT    DEFAULT '',
    retailer_newegg     TEXT    DEFAULT '',
    retailer_bhphoto    TEXT    DEFAULT '',
    created_at          TEXT    DEFAULT (datetime('now')),
    updated_at          TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_category ON parts(category);
  CREATE INDEX IF NOT EXISTS idx_brand    ON parts(brand);
  CREATE INDEX IF NOT EXISTS idx_tier     ON parts(tier);
  CREATE INDEX IF NOT EXISTS idx_stock    ON parts(stock);
  CREATE INDEX IF NOT EXISTS idx_price    ON parts(price_usd);
  CREATE INDEX IF NOT EXISTS idx_updated  ON parts(updated_at);
`);

const count = db.prepare('SELECT COUNT(*) as n FROM parts').get().n;
console.log(`[DB] ${DB_PATH} — ${count} parts loaded`);

module.exports = db;
