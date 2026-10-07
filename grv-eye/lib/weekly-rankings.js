import Database from "better-sqlite3";

const DAY_MS = 86_400_000;

const QUALIFIED_PURCHASES_SQL = `
WITH nearby AS MATERIALIZED (
  SELECT
    event.id AS sale_id,
    event.detected_at,
    event.offer_key,
    offer.shop_owner AS source_owner,
    offer.shop_name AS source_shop,
    offer.world,
    offer.x,
    offer.y,
    offer.z,
    offer.item_id,
    offer.item_name,
    event.amount AS sale_trades,
    ping.player,
    MIN(ABS(ping.ts-event.detected_at)) AS nearest_ms
  FROM market_stock_events event
  JOIN market_offers offer ON offer.offer_key=event.offer_key
  JOIN eye.pings ping INDEXED BY idx_pings_ts
    ON ping.ts BETWEEN event.detected_at-180000 AND event.detected_at+30000
   AND ping.world=CASE
     WHEN lower(offer.world) LIKE '%nether%' THEN 'minecraft_the_nether'
     ELSE 'minecraft_overworld'
   END
   AND ping.x BETWEEN CAST(offer.x AS REAL)-6 AND CAST(offer.x AS REAL)+6
   AND ping.z BETWEEN CAST(offer.z AS REAL)-6 AND CAST(offer.z AS REAL)+6
   AND (
     ping.y IS NULL OR (
       (ping.x-CAST(offer.x AS REAL))*(ping.x-CAST(offer.x AS REAL))+
       (ping.y-CAST(offer.y AS REAL))*(ping.y-CAST(offer.y AS REAL))+
       (ping.z-CAST(offer.z AS REAL))*(ping.z-CAST(offer.z AS REAL))
     )<=36
   )
   AND lower(ping.player)<>lower(offer.shop_owner)
  WHERE event.event_type='sale'
    AND event.detected_at>=?
  GROUP BY event.id,ping.player
), classified AS (
  SELECT *,COUNT(*) OVER(PARTITION BY sale_id) AS candidates
  FROM nearby
)
SELECT *
FROM classified
WHERE candidates=1
ORDER BY detected_at`;

function parseOutputUnits(row) {
  const prefix = [
    row.source_owner,
    row.world,
    row.x,
    row.y,
    row.z,
    row.item_id,
  ].join("::") + "::";
  if (!String(row.offer_key).startsWith(prefix)) return 1;
  const remainder = String(row.offer_key).slice(prefix.length);
  const separator = remainder.indexOf("::");
  const output = Number(remainder.slice(0, separator));
  return Number.isFinite(output) && output > 0 ? output : 1;
}

function deduplicatePurchases(rows) {
  const purchases = new Map();
  for (const row of rows) {
    const units = parseOutputUnits(row) * Math.max(0, Number(row.sale_trades) || 0);
    const key = [
      String(row.player).toLowerCase(),
      String(row.source_owner).toLowerCase(),
      row.world,
      row.x,
      row.y,
      row.z,
      row.item_id,
      row.detected_at,
    ].join("\u0000");
    const existing = purchases.get(key);
    if (!existing) {
      purchases.set(key, { ...row, units });
    } else {
      // A villager can expose the same inventory through single-item and bulk
      // recipes. Keep the largest equivalent quantity instead of counting both.
      existing.units = Math.max(existing.units, units);
    }
  }
  return [...purchases.values()];
}

function aggregatePlayers(purchases) {
  const players = new Map();
  for (const purchase of purchases) {
    const key = String(purchase.player).toLowerCase();
    let player = players.get(key);
    if (!player) {
      player = {
        player: purchase.player,
        units: 0,
        lines: 0,
        sessions: new Set(),
        products: new Set(),
        merchants: new Set(),
        shops: new Set(),
      };
      players.set(key, player);
    }
    const location = [
      purchase.source_owner,
      purchase.world,
      purchase.x,
      purchase.y,
      purchase.z,
    ].join("::");
    player.units += purchase.units;
    player.lines += 1;
    player.sessions.add(`${purchase.detected_at}::${location}`);
    player.products.add(purchase.item_id);
    player.merchants.add(String(purchase.source_owner).toLowerCase());
    player.shops.add(location.toLowerCase());
  }
  return [...players.values()].map((player) => ({
    player: player.player,
    units: Math.round(player.units),
    lines: player.lines,
    sessions: player.sessions.size,
    products: player.products.size,
    merchants: player.merchants.size,
    shops: player.shops.size,
  }));
}

function aggregateMerchants(purchases) {
  const merchants = new Map();
  for (const purchase of purchases) {
    const key = String(purchase.source_owner).toLowerCase();
    let merchant = merchants.get(key);
    if (!merchant) {
      merchant = {
        player: purchase.source_owner,
        units: 0,
        lines: 0,
        sessions: new Set(),
        products: new Set(),
        buyers: new Set(),
        shops: new Set(),
      };
      merchants.set(key, merchant);
    }
    const location = [
      purchase.world,
      purchase.x,
      purchase.y,
      purchase.z,
    ].join("::");
    merchant.units += purchase.units;
    merchant.lines += 1;
    merchant.sessions.add(
      `${String(purchase.player).toLowerCase()}::${purchase.detected_at}::${location}`,
    );
    merchant.products.add(purchase.item_id);
    merchant.buyers.add(String(purchase.player).toLowerCase());
    merchant.shops.add(location);
  }
  return [...merchants.values()].map((merchant) => ({
    player: merchant.player,
    units: Math.round(merchant.units),
    lines: merchant.lines,
    sessions: merchant.sessions.size,
    products: merchant.products.size,
    buyers: merchant.buyers.size,
    shops: merchant.shops.size,
  }));
}

function rank(rows, compare, metric, valueOf, limit = 10) {
  return rows
    .slice()
    .sort(compare)
    .slice(0, limit)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      metric,
      value: valueOf(row),
    }));
}

export function buildRankings(rows, totalStockDrops, { days = 7, now = Date.now() } = {}) {
  const purchases = deduplicatePurchases(rows);
  const players = aggregatePlayers(purchases);
  const merchants = aggregateMerchants(purchases);
  const byName = (left, right) => left.player.localeCompare(right.player);

  return {
    generatedAt: now,
    from: now - days * DAY_MS,
    to: now,
    days,
    coverage: {
      totalStockDrops,
      qualifiedDrops: rows.length,
      productMovements: purchases.length,
      identifiedPlayers: players.length,
    },
    boards: {
      shoppers: rank(
        players,
        (left, right) =>
          right.sessions - left.sessions ||
          right.lines - left.lines ||
          right.units - left.units ||
          byName(left, right),
        "shopping trips",
        (row) => row.sessions,
      ),
      bulkBuyers: rank(
        players,
        (left, right) =>
          right.units - left.units ||
          right.sessions - left.sessions ||
          byName(left, right),
        "items",
        (row) => row.units,
      ),
      explorers: rank(
        players,
        (left, right) =>
          right.shops - left.shops ||
          right.merchants - left.merchants ||
          right.sessions - left.sessions ||
          byName(left, right),
        "shops",
        (row) => row.shops,
      ),
      merchants: rank(
        merchants,
        (left, right) =>
          right.sessions - left.sessions ||
          right.buyers - left.buyers ||
          right.units - left.units ||
          byName(left, right),
        "sales sessions",
        (row) => row.sessions,
      ),
    },
    note:
      "Rankings use qualified observed market activity. They may not include every transaction.",
  };
}

export function createWeeklyRankings({
  marketDbFile,
  eyeDbFile,
  cacheMs = 300_000,
  days = 7,
} = {}) {
  const db = new Database(marketDbFile, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  db.prepare("ATTACH DATABASE ? AS eye").run(eyeDbFile);
  const purchases = db.prepare(QUALIFIED_PURCHASES_SQL);
  const stockDrops = db.prepare(`SELECT COUNT(*) AS count
    FROM market_stock_events
    WHERE event_type='sale' AND detected_at>=?`);
  let cache = null;
  let cachedAt = 0;

  function getRankings(force = false) {
    const now = Date.now();
    if (!force && cache && now - cachedAt < cacheMs) return cache;
    const since = now - days * DAY_MS;
    cache = buildRankings(
      purchases.all(since),
      Number(stockDrops.get(since)?.count) || 0,
      { days, now },
    );
    cachedAt = now;
    return cache;
  }

  return {
    getRankings,
    close: () => db.close(),
  };
}
