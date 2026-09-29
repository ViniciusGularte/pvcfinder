import Database from 'better-sqlite3';

export const CELL = 64; // spatial bucket size in blocks

const SCHEMA = `
-- Sampled position history. cx/cz are ${CELL}-block buckets for fast area lookups.
CREATE TABLE IF NOT EXISTS pings (
  id      INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,
  player  TEXT    NOT NULL,
  world   TEXT    NOT NULL,
  x       REAL    NOT NULL,
  y       REAL,
  z       REAL    NOT NULL,
  cx      INTEGER NOT NULL,
  cz      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pings_area   ON pings(world, cx, cz, ts);
CREATE INDEX IF NOT EXISTS idx_pings_player ON pings(player, ts);
CREATE INDEX IF NOT EXISTS idx_pings_ts     ON pings(ts);

CREATE TABLE IF NOT EXISTS players (
  name        TEXT PRIMARY KEY,
  uuid        TEXT,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  world       TEXT,
  x           REAL,
  z           REAL,
  sessions    INTEGER NOT NULL DEFAULT 0
);
`;

export function openDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  return db;
}
