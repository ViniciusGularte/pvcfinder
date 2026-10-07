import Database from "better-sqlite3";
import { Worker } from "node:worker_threads";

const DAY_MS = 86_400_000;

const SALES_SQL = `SELECT
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
  event.amount AS sale_trades
FROM market_stock_events event
JOIN market_offers offer ON offer.offer_key=event.offer_key
WHERE event.event_type='sale' AND event.detected_at>=?
ORDER BY event.detected_at`;

const PINGS_IN_CELL_SQL = `SELECT ts,player,x,y,z
FROM eye.pings INDEXED BY idx_pings_area
WHERE world=? AND cx=? AND cz=? AND ts BETWEEN ? AND ?`;

function marketWorldToMapWorld(world) {
  return String(world || "").toLowerCase().includes("nether")
    ? "minecraft_the_nether"
    : "minecraft_overworld";
}

function cellRange(value) {
  return [Math.floor((value - 6) / 64), Math.floor((value + 6) / 64)];
}

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
  const sales = db.prepare(SALES_SQL);
  const pingsInCell = db.prepare(PINGS_IN_CELL_SQL);
  const stockDrops = db.prepare(`SELECT COUNT(*) AS count
    FROM market_stock_events
    WHERE event_type='sale' AND detected_at>=?`);
  let cache = null;
  let cachedAt = 0;

  function qualifiedPurchases(since) {
    const qualified = [];
    for (const sale of sales.iterate(since)) {
      const shopX = Number(sale.x);
      const shopY = Number(sale.y);
      const shopZ = Number(sale.z);
      if (![shopX, shopY, shopZ].every(Number.isFinite)) continue;

      const [minCx, maxCx] = cellRange(shopX);
      const [minCz, maxCz] = cellRange(shopZ);
      const candidates = new Map();
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cz = minCz; cz <= maxCz; cz += 1) {
          for (const ping of pingsInCell.iterate(
            marketWorldToMapWorld(sale.world),
            cx,
            cz,
            sale.detected_at - 180_000,
            sale.detected_at + 30_000,
          )) {
            if (
              String(ping.player).toLowerCase() ===
              String(sale.source_owner).toLowerCase()
            ) {
              continue;
            }
            const vertical = Number.isFinite(Number(ping.y))
              ? Number(ping.y) - shopY
              : 0;
            const distance =
              (Number(ping.x) - shopX) ** 2 +
              vertical ** 2 +
              (Number(ping.z) - shopZ) ** 2;
            if (distance > 36) continue;
            const key = String(ping.player).toLowerCase();
            if (!candidates.has(key)) candidates.set(key, ping.player);
          }
        }
      }
      if (candidates.size === 1) {
        qualified.push({ ...sale, player: [...candidates.values()][0] });
      }
    }
    return qualified;
  }

  function getRankings(force = false) {
    const now = Date.now();
    if (!force && cache && now - cachedAt < cacheMs) return cache;
    const since = now - days * DAY_MS;
    cache = buildRankings(
      qualifiedPurchases(since),
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

export function createWeeklyRankingsService(options = {}) {
  const safeOptions = {
    marketDbFile: options.marketDbFile,
    eyeDbFile: options.eyeDbFile,
    cacheMs: options.cacheMs || 300_000,
    days: options.days || 7,
  };
  let cache = null;
  let worker = null;
  let lastError = null;
  let closed = false;

  function refresh() {
    if (closed || worker) return;
    worker = new Worker(new URL("./weekly-rankings-worker.js", import.meta.url), {
      workerData: safeOptions,
      execArgv: process.execArgv.filter(
        (argument) => !argument.startsWith("--input-type"),
      ),
    });
    worker.on("message", (message) => {
      if (message?.ok && message.data) {
        cache = message.data;
        lastError = null;
      } else {
        lastError = message?.error || "Weekly ranking worker failed";
      }
    });
    worker.on("error", (error) => {
      lastError = error.message;
      console.warn("[weekly-rankings] worker:", error.message);
    });
    worker.on("exit", (code) => {
      if (code && !closed && !lastError) {
        lastError = `Weekly ranking worker exited with code ${code}`;
      }
      worker = null;
    });
  }

  function getRankings() {
    const stale =
      !cache || Date.now() - Number(cache.generatedAt || 0) >= safeOptions.cacheMs;
    if (stale) refresh();
    return cache;
  }

  return {
    refresh,
    getRankings,
    getStatus: () => ({
      ready: !!cache,
      refreshing: !!worker,
      error: lastError,
    }),
    close: () => {
      closed = true;
      if (worker) worker.terminate();
      worker = null;
    },
  };
}
