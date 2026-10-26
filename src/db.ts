import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'travel_copilot.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('auto_vacuum = INCREMENTAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id TEXT NOT NULL,
    type TEXT CHECK(type IN ('flight', 'train', 'bus', 'lodging', 'activity')),
    origin TEXT,
    destination TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    booking_code TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id TEXT NOT NULL,
    category TEXT NOT NULL,
    estimated_amount REAL NOT NULL,
    actual_amount REAL DEFAULT 0,
    currency TEXT CHECK(currency IN ('EUR', 'USD', 'ARS')),
    converted_eur REAL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS geocoding_cache (
    query_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routing_cache (
    route_key TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    distance_km REAL NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transit_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    latency_ms REAL NOT NULL,
    cache_hits INTEGER NOT NULL,
    cache_misses INTEGER NOT NULL,
    routing_cached INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calendar_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    revoked INTEGER DEFAULT 0
  );
`);
