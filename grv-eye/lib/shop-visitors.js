const DAY_MS = 86_400_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shop_visitors (
  shop_key      TEXT NOT NULL,
  player        TEXT NOT NULL COLLATE NOCASE,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  visits        INTEGER NOT NULL DEFAULT 1,
  observations  INTEGER NOT NULL DEFAULT 2,
  PRIMARY KEY (shop_key, player)
);
CREATE INDEX IF NOT EXISTS idx_shop_visitors_recent
  ON shop_visitors(last_seen, shop_key);
`;

export function normalizeVisitorWorld(world) {
  const value = String(world || "")
    .trim()
    .toLowerCase();
  if (value.includes("nether")) return "minecraft_the_nether";
  if (value.includes("end")) return "minecraft_the_end";
  return "minecraft_overworld";
}

function coordinateToken(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(Math.round(number * 100) / 100);
}

export function buildShopVisitorKey(world, x, y, z) {
  return [
    normalizeVisitorWorld(world),
    coordinateToken(x),
    coordinateToken(y),
    coordinateToken(z),
  ].join("::");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function createShopVisitorTracker({
  db,
  getLocations,
  pollMs = 20_000,
  visitGapMs = 180_000,
  radius = 6,
  retentionDays = 60,
} = {}) {
  db.exec(SCHEMA);

  const statements = {
    upsert: db.prepare(`INSERT INTO shop_visitors
      (shop_key,player,first_seen,last_seen,visits,observations)
      VALUES (@shopKey,@player,@firstSeen,@lastSeen,1,@observations)
      ON CONFLICT(shop_key,player) DO UPDATE SET
        first_seen=MIN(shop_visitors.first_seen,excluded.first_seen),
        visits=shop_visitors.visits + CASE
          WHEN excluded.last_seen-shop_visitors.last_seen>@visitGapMs THEN 1
          ELSE 0
        END,
        last_seen=MAX(shop_visitors.last_seen,excluded.last_seen),
        observations=shop_visitors.observations+1`),
    backfill: db.prepare(`INSERT INTO shop_visitors
      (shop_key,player,first_seen,last_seen,visits,observations)
      VALUES (@shopKey,@player,@firstSeen,@lastSeen,@visits,@observations)
      ON CONFLICT(shop_key,player) DO UPDATE SET
        first_seen=MIN(shop_visitors.first_seen,excluded.first_seen),
        last_seen=MAX(shop_visitors.last_seen,excluded.last_seen),
        visits=MAX(shop_visitors.visits,excluded.visits),
        observations=MAX(shop_visitors.observations,excluded.observations)`),
    counts: db.prepare(`SELECT shop_key AS shopKey, COUNT(*) AS visitors
      FROM shop_visitors
      WHERE last_seen>=?
      GROUP BY shop_key`),
    pings: db.prepare(`SELECT ts,player,world,x,y,z
      FROM pings
      WHERE ts>=?
      ORDER BY ts`),
    prune: db.prepare("DELETE FROM shop_visitors WHERE last_seen<?"),
  };

  const writeVisit = db.transaction((row) => statements.upsert.run(row));
  const writeBackfill = db.transaction((rows) => {
    for (const row of rows) statements.backfill.run(row);
  });
  const presence = new Map();
  let catalog = { locations: [], buckets: new Map(), refreshedAt: 0 };
  let backfillStatus = {
    complete: false,
    scanned: 0,
    qualified: 0,
    finishedAt: 0,
  };

  const bucketSize = Math.max(16, radius * 2);
  const bucketKey = (world, x, z) =>
    [world, Math.floor(x / bucketSize), Math.floor(z / bucketSize)].join("::");

  function refreshCatalog(force = false) {
    const now = Date.now();
    if (!force && now - catalog.refreshedAt < 60_000) return catalog;

    const grouped = new Map();
    const rows = typeof getLocations === "function" ? getLocations() : [];
    for (const raw of rows || []) {
      const x = Number(raw.x);
      const y = Number(raw.y);
      const z = Number(raw.z);
      if (![x, y, z].every(Number.isFinite)) continue;
      const world = normalizeVisitorWorld(raw.world);
      const key = buildShopVisitorKey(world, x, y, z);
      let location = grouped.get(key);
      if (!location) {
        location = { key, world, x, y, z, owners: new Set() };
        grouped.set(key, location);
      }
      for (const owner of raw.owners || [raw.shopOwner]) {
        if (owner) location.owners.add(normalizeName(owner));
      }
    }

    const locations = [...grouped.values()];
    const buckets = new Map();
    for (const location of locations) {
      const key = bucketKey(location.world, location.x, location.z);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(location);
    }
    catalog = { locations, buckets, refreshedAt: now };
    return catalog;
  }

  function nearestShop(player) {
    const x = Number(player.x);
    const y = Number(player.y);
    const z = Number(player.z);
    if (![x, z].every(Number.isFinite)) return null;
    const world = normalizeVisitorWorld(player.world);
    const bx = Math.floor(x / bucketSize);
    const bz = Math.floor(z / bucketSize);
    let nearest = null;
    let nearestDistance = radius * radius + Number.EPSILON;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const candidates = catalog.buckets.get(
          [world, bx + dx, bz + dz].join("::"),
        );
        for (const shop of candidates || []) {
          const vertical = Number.isFinite(y) ? y - shop.y : 0;
          const distance =
            (x - shop.x) ** 2 + vertical ** 2 + (z - shop.z) ** 2;
          if (distance < nearestDistance) {
            nearest = shop;
            nearestDistance = distance;
          }
        }
      }
    }
    return nearest;
  }

  function record(players, now = Date.now()) {
    refreshCatalog();
    const active = new Set();

    for (const player of players || []) {
      const shop = nearestShop(player);
      if (!shop || shop.owners.has(normalizeName(player.name))) continue;
      const key = `${shop.key}\u0000${normalizeName(player.name)}`;
      active.add(key);
      const previous = presence.get(key);
      const consecutive =
        previous && now - previous.lastSeen <= pollMs * 1.75
          ? previous.consecutive + 1
          : 1;
      const firstSeen = consecutive > 1 ? previous.firstSeen : now;
      presence.set(key, { lastSeen: now, firstSeen, consecutive });

      if (consecutive >= 2) {
        writeVisit({
          shopKey: shop.key,
          player: player.name,
          firstSeen,
          lastSeen: now,
          observations: consecutive === 2 ? 2 : 1,
          visitGapMs,
        });
      }
    }

    for (const [key, value] of presence) {
      if (!active.has(key) && now - value.lastSeen > pollMs * 1.75) {
        presence.delete(key);
      }
    }
  }

  function backfill(days = 7) {
    refreshCatalog(true);
    const since = Date.now() - Math.max(1, days) * DAY_MS;
    const lastByPlayer = new Map();
    const visits = new Map();
    let scanned = 0;

    for (const ping of statements.pings.iterate(since)) {
      scanned += 1;
      const shop = nearestShop(ping);
      const playerKey = normalizeName(ping.player);
      if (!shop || shop.owners.has(playerKey)) {
        lastByPlayer.delete(playerKey);
        continue;
      }

      const previous = lastByPlayer.get(playerKey);
      if (
        previous &&
        previous.shopKey === shop.key &&
        ping.ts - previous.lastSeen <= visitGapMs
      ) {
        const aggregateKey = `${shop.key}\u0000${playerKey}`;
        let aggregate = visits.get(aggregateKey);
        if (!aggregate) {
          aggregate = {
            shopKey: shop.key,
            player: ping.player,
            firstSeen: previous.firstSeen,
            lastSeen: ping.ts,
            visits: 1,
            observations: 2,
          };
          visits.set(aggregateKey, aggregate);
        } else {
          if (ping.ts - aggregate.lastSeen > visitGapMs) aggregate.visits += 1;
          aggregate.lastSeen = ping.ts;
          aggregate.observations += 1;
        }
      }
      lastByPlayer.set(playerKey, {
        shopKey: shop.key,
        firstSeen:
          previous && previous.shopKey === shop.key
            ? previous.firstSeen
            : ping.ts,
        lastSeen: ping.ts,
      });
    }

    writeBackfill([...visits.values()]);
    backfillStatus = {
      complete: true,
      scanned,
      qualified: visits.size,
      finishedAt: Date.now(),
    };
    return backfillStatus;
  }

  function weeklyCounts(days = 7) {
    const safeDays = Math.min(30, Math.max(1, Number(days) || 7));
    refreshCatalog();
    const existing = new Map(
      statements.counts
        .all(Date.now() - safeDays * DAY_MS)
        .map((row) => [row.shopKey, Number(row.visitors) || 0]),
    );
    return {
      days: safeDays,
      radius,
      locations: catalog.locations.map((location) => ({
        locationKey: location.key,
        visitors: existing.get(location.key) || 0,
      })),
      status: backfillStatus,
    };
  }

  function prune() {
    return statements.prune.run(Date.now() - retentionDays * DAY_MS).changes;
  }

  return { record, backfill, weeklyCounts, prune, refreshCatalog };
}
