import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const {
  fetchLiveMarketData,
  normalizeMarketData,
} = require("../../lib/normalizeMarketData.js");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS market_offers (
  offer_key    TEXT PRIMARY KEY,
  shop_name    TEXT NOT NULL,
  shop_owner   TEXT NOT NULL,
  world        TEXT NOT NULL,
  x            TEXT NOT NULL,
  y            TEXT NOT NULL,
  z            TEXT NOT NULL,
  item_name    TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  stock        INTEGER NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_stock_events (
  id           INTEGER PRIMARY KEY,
  offer_key    TEXT NOT NULL,
  event_type   TEXT NOT NULL CHECK(event_type IN ('restock', 'sale')),
  detected_at  INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after  INTEGER NOT NULL,
  amount       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_events_recent
  ON market_stock_events(event_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_offer
  ON market_stock_events(offer_key, detected_at DESC);
`;

function aggregateOffers(rows) {
  const offers = new Map();
  for (const row of rows) {
    const existing = offers.get(row.offerKey);
    if (existing) {
      existing.stock += row.stock;
      continue;
    }
    offers.set(row.offerKey, {
      offerKey: row.offerKey,
      shopName: row.storeName,
      shopOwner: row.storeOwner,
      world: row.world,
      x: row.coords.x,
      y: row.coords.y,
      z: row.coords.z,
      itemName: row.itemName,
      itemId: row.itemId,
      stock: row.stock,
    });
  }
  return [...offers.values()];
}

export function createMarketTracker({
  dbFile,
  pollMs = 60_000,
  retentionDays = 30,
} = {}) {
  const resolvedFile = path.resolve(dbFile);
  fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
  const db = new Database(resolvedFile);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);

  const statements = {
    offer: db.prepare("SELECT stock FROM market_offers WHERE offer_key=?"),
    upsert: db.prepare(`INSERT INTO market_offers
      (offer_key,shop_name,shop_owner,world,x,y,z,item_name,item_id,stock,first_seen,last_seen)
      VALUES (@offerKey,@shopName,@shopOwner,@world,@x,@y,@z,@itemName,@itemId,@stock,@now,@now)
      ON CONFLICT(offer_key) DO UPDATE SET
        shop_name=excluded.shop_name, shop_owner=excluded.shop_owner,
        world=excluded.world, x=excluded.x, y=excluded.y, z=excluded.z,
        item_name=excluded.item_name, item_id=excluded.item_id,
        stock=excluded.stock, last_seen=excluded.last_seen`),
    event: db.prepare(`INSERT INTO market_stock_events
      (offer_key,event_type,detected_at,stock_before,stock_after,amount)
      VALUES (?,?,?,?,?,?)`),
    prune: db.prepare("DELETE FROM market_stock_events WHERE detected_at < ?"),
    recent: db.prepare(`SELECT
        e.offer_key AS offerKey,
        MAX(e.detected_at) AS restockedAt,
        o.shop_name AS shopName, o.shop_owner AS shopOwner,
        o.world, o.x, o.y, o.z, o.item_name AS itemName,
        o.stock AS stockNow,
        (SELECT amount FROM market_stock_events latest
          WHERE latest.offer_key=e.offer_key AND latest.event_type='restock'
          ORDER BY latest.detected_at DESC LIMIT 1) AS amount,
        (SELECT stock_before FROM market_stock_events latest
          WHERE latest.offer_key=e.offer_key AND latest.event_type='restock'
          ORDER BY latest.detected_at DESC LIMIT 1) AS stockBefore
      FROM market_stock_events e
      JOIN market_offers o ON o.offer_key=e.offer_key
      WHERE e.event_type='restock' AND e.detected_at >= ?
      GROUP BY e.offer_key
      ORDER BY restockedAt DESC
      LIMIT ?`),
    stats: db.prepare(`SELECT
      (SELECT COUNT(*) FROM market_offers) AS offers,
      (SELECT COUNT(*) FROM market_stock_events WHERE event_type='restock') AS restocks,
      (SELECT COUNT(*) FROM market_stock_events WHERE event_type='sale') AS sales,
      (SELECT MIN(first_seen) FROM market_offers) AS since`),
  };

  const record = db.transaction((offers, now) => {
    let events = 0;
    for (const offer of offers) {
      const previous = statements.offer.get(offer.offerKey);
      if (previous && previous.stock !== offer.stock) {
        const delta = offer.stock - previous.stock;
        statements.event.run(
          offer.offerKey,
          delta > 0 ? "restock" : "sale",
          now,
          previous.stock,
          offer.stock,
          Math.abs(delta),
        );
        events += 1;
      }
      statements.upsert.run({ ...offer, now });
    }
    return events;
  });

  let status = {
    ok: false,
    lastOk: 0,
    error: "waiting for first market read",
    offers: 0,
  };
  let timer = null;

  async function poll() {
    const startedAt = Date.now();
    try {
      const payload = await fetchLiveMarketData();
      const { rows } = normalizeMarketData(payload);
      const offers = aggregateOffers(rows);
      const events = record(offers, Date.now());
      status = {
        ok: true,
        lastOk: Date.now(),
        error: null,
        offers: offers.length,
        events,
      };
    } catch (error) {
      status = { ...status, ok: false, error: String(error?.message || error) };
      console.warn("[market]", status.error);
    } finally {
      timer = setTimeout(
        poll,
        Math.max(1_000, pollMs - (Date.now() - startedAt)),
      );
    }
  }

  function start() {
    statements.prune.run(Date.now() - retentionDays * 86_400_000);
    poll();
  }

  function recentRestocks(hours = 24, limit = 500) {
    const safeHours = Math.min(168, Math.max(1, Number(hours) || 24));
    const safeLimit = Math.min(2_000, Math.max(1, Number(limit) || 500));
    return statements.recent.all(Date.now() - safeHours * 3_600_000, safeLimit);
  }

  function close() {
    if (timer) clearTimeout(timer);
    db.close();
  }

  return {
    start,
    close,
    recentRestocks,
    getStatus: () => ({ ...status, ...statements.stats.get() }),
  };
}
