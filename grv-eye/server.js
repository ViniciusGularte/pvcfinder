import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openDb, CELL } from './lib/db.js';
import { createSource } from './lib/sources.js';
import { discoverMaps, withSlash } from './lib/bluemap.js';
import { discoverSquaremap, withSlash as squaremapSlash } from './lib/squaremap.js';
import { squaremapTileProxy, tileProxy } from './lib/tiles.js';
import { createSkinResolver, isFloodgateUuid } from './lib/skins.js';
import { bboxOf, pointInPolygon } from './lib/geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const basePath = (v) => {
  const clean = String(v || '').trim().replace(/^\/+|\/+$/g, '');
  return clean ? `/${clean}` : '';
};

const cfg = {
  port: num(env.PORT, 8080),
  host: env.HOST || '0.0.0.0',
  appName: env.APP_NAME || 'GRV EYE',
  basePath: basePath(env.BASE_PATH ?? '/grveye'),
  token: env.ACCESS_TOKEN || '',
  pollMs: Math.max(2000, num(env.POLL_INTERVAL_MS, 5000)),
  dbFile: path.resolve(__dirname, env.DB_FILE || './data/eye.db'),
  retentionDays: num(env.HISTORY_RETENTION_DAYS, 60),
  minMove: num(env.PING_MIN_MOVE, 6),
  keepaliveMs: num(env.PING_KEEPALIVE_S, 60) * 1000,
  visitGapMs: num(env.VISIT_GAP_MIN, 3) * 60_000,
  maxScan: num(env.AREA_MAX_ROWS, 600_000),
  musicFile: env.MUSIC_FILE ?? 'The Batcave _ Brother Eye [kk4oSLA8jD4].mp3',
  source: {
    type: (env.SOURCE_TYPE || 'demo').toLowerCase(),
    url: env.SOURCE_URL || '',
    world: env.SOURCE_WORLD || 'world',
    bluemap: { base: withSlash(env.BLUEMAP_URL || 'https://web.peacefulvanilla.club/maps/'), maps: {} },
    squaremap: { base: squaremapSlash(env.SQUAREMAP_URL || 'https://web.peacefulvanilla.club/maps/'), maps: {} },
    json: {
      listPath: env.JSON_LIST_PATH ?? 'players',
      name: env.JSON_NAME_FIELD || 'name', x: env.JSON_X_FIELD || 'x',
      z: env.JSON_Z_FIELD || 'z', world: env.JSON_WORLD_FIELD || 'world',
    },
  },
  template: { url: env.TILE_URL || '', size: num(env.TILE_SIZE, 512), maxZoom: num(env.TILE_MAX_ZOOM, 3) },
  worlds: list(env.WORLDS),
  corsOrigins: list(env.CORS_ORIGINS),
  bedrockPrefixes: list(env.BEDROCK_PREFIXES || '.,*'),
  servePage: (env.SERVE_PAGE ?? 'true') !== 'false',
};

fs.mkdirSync(path.dirname(cfg.dbFile), { recursive: true });
const db = openDb(cfg.dbFile);

// ─── Map discovery ─────────────────────────────────────────
let tilesInfo = { mode: 'none' };
let worlds = cfg.worlds.map((id) => ({ id, name: id }));

if (cfg.source.type === 'bluemap') {
  const maps = await discoverMaps(cfg.source.bluemap.base, cfg.worlds);
  cfg.source.bluemap.maps = maps;
  worlds = Object.values(maps).map((m) => ({ id: m.id, name: m.name, start: m.start }));
  tilesInfo = { mode: 'bluemap', maps: Object.fromEntries(Object.values(maps).map((m) => [m.id, m.lowres])) };
  console.log(`[bluemap] maps: ${Object.keys(maps).join(', ')}`);
} else if (cfg.source.type === 'squaremap') {
  const maps = await discoverSquaremap(cfg.source.squaremap.base, cfg.worlds);
  cfg.source.squaremap.maps = maps;
  worlds = Object.values(maps).map((m) => ({ id: m.id, name: m.name, start: m.start }));
  tilesInfo = {
    mode: 'squaremap',
    maps: Object.fromEntries(Object.values(maps).map((m) => [m.id, {
      tileSize: m.tileSize,
      maxZoom: m.maxZoom,
      extraZoom: m.extraZoom,
    }])),
  };
  console.log(`[squaremap] maps: ${Object.keys(maps).join(', ')}`);
} else if (cfg.template.url) {
  tilesInfo = { mode: 'template', ...cfg.template };
}
if (cfg.source.type === 'demo' && !worlds.length) worlds = [{ id: 'world', name: 'Overworld' }, { id: 'world_nether', name: 'Nether' }];

const source = createSource(cfg.source);

// ─── Statements ────────────────────────────────────────────
const st = {
  ping: db.prepare('INSERT INTO pings(ts,player,world,x,y,z,cx,cz) VALUES(?,?,?,?,?,?,?,?)'),
  area: db.prepare(`SELECT ts, player, x, z FROM pings
    WHERE world=? AND cx BETWEEN ? AND ? AND cz BETWEEN ? AND ? AND ts BETWEEN ? AND ?
    ORDER BY player, ts`),
  trail: db.prepare('SELECT ts, world, x, z FROM pings WHERE player=? AND ts BETWEEN ? AND ? ORDER BY ts LIMIT 200000'),
  prune: db.prepare('DELETE FROM pings WHERE ts < ?'),
  upsert: db.prepare(`INSERT INTO players(name,uuid,first_seen,last_seen,world,x,z) VALUES(@name,@uuid,@ts,@ts,@world,@x,@z)
    ON CONFLICT(name) DO UPDATE SET uuid=COALESCE(excluded.uuid,players.uuid), last_seen=excluded.last_seen,
    world=excluded.world, x=excluded.x, z=excluded.z`),
  session: db.prepare('UPDATE players SET sessions=sessions+1 WHERE name=?'),
  playersRecent: db.prepare('SELECT * FROM players ORDER BY last_seen DESC LIMIT ?'),
  playersSearch: db.prepare("SELECT * FROM players WHERE name LIKE ? ESCAPE '\\' ORDER BY last_seen DESC LIMIT ?"),
  player: db.prepare('SELECT * FROM players WHERE name=?'),
  uuidOf: db.prepare('SELECT uuid FROM players WHERE name=?'),
  stats: db.prepare('SELECT COUNT(*) AS n, MIN(ts) AS since FROM pings'),
};

// ─── Live state ────────────────────────────────────────────
const online = new Map();
const lastPing = new Map();
let status = { ok: false, error: 'waiting for first read', lastOk: 0, count: 0, source: cfg.source.type };

const app = express();
const server = http.createServer(app);
const route = (suffix) => `${cfg.basePath}${suffix}` || '/';

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const authorized = (t) => !cfg.token || (t && crypto.timingSafeEqual(hash(t), hash(cfg.token)));

// CORS: the page can live on another host (e.g. Vercel). Supports "*" and globs like https://*.vercel.app
const originRes = cfg.corsOrigins.map((o) => new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
const originAllowed = (o) => !!o && originRes.some((r) => r.test(o));

const wss = new WebSocketServer({
  server, path: route('/ws'),
  verifyClient: (info) => {
    const o = info.origin || info.req.headers.origin;
    if (o && cfg.corsOrigins.length && !originAllowed(o) && o !== `http://${info.req.headers.host}` && o !== `https://${info.req.headers.host}`) return false;
    return authorized(new URL(info.req.url, 'http://x').searchParams.get('token'));
  },
});
const broadcast = (msg) => { const d = JSON.stringify(msg); for (const c of wss.clients) if (c.readyState === 1) c.send(d); };
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'snapshot', players: [...online.values()], status })));

const recordTick = db.transaction((players, now) => {
  const seen = new Set();
  for (const p of players) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    st.upsert.run({ name: p.name, uuid: p.uuid, ts: now, world: p.world, x: p.x, z: p.z });
    if (!online.has(p.name)) st.session.run(p.name);
    online.set(p.name, p);
    const lp = lastPing.get(p.name);
    if (!lp || lp.world !== p.world || Math.hypot(p.x - lp.x, p.z - lp.z) >= cfg.minMove || now - lp.ts >= cfg.keepaliveMs) {
      st.ping.run(now, p.name, p.world, p.x, p.y, p.z, Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      lastPing.set(p.name, { x: p.x, z: p.z, world: p.world, ts: now });
    }
  }
  for (const name of online.keys()) if (!seen.has(name)) { online.delete(name); lastPing.delete(name); }
});

async function tick() {
  let players;
  try {
    players = await source.fetch();
    status = { ok: true, error: null, lastOk: Date.now(), count: players.length, source: cfg.source.type };
  } catch (err) {
    status = { ...status, ok: false, error: String(err.message || err) };
    console.warn('[source]', status.error);
    broadcast({ type: 'status', status });
    return;
  }
  const now = Date.now();
  recordTick(players, now);
  broadcast({ type: 'tick', ts: now, players: [...online.values()], status });
}
async function loop() {
  const t0 = Date.now();
  try { await tick(); } catch (err) { console.error('[tick]', err); }
  setTimeout(loop, Math.max(500, cfg.pollMs - (Date.now() - t0)));
}
function prune() {
  const r = st.prune.run(Date.now() - cfg.retentionDays * 86_400_000);
  if (r.changes) console.log(`[prune] removed ${r.changes} old pings`);
}
setInterval(prune, 3_600_000);

// ─── Area history ──────────────────────────────────────────
function areaHistory({ world, points, from, to, buckets = 48 }) {
  const bbox = bboxOf(points);
  const span = Math.max(1, to - from);
  const hist = Array.from({ length: buckets }, () => new Set());
  const players = new Map();
  let scanned = 0, truncated = false, cur = null;

  const flush = () => {
    if (!cur) return;
    let p = players.get(cur.player);
    if (!p) { p = { name: cur.player, visits: [], total: 0, first: cur.start, last: cur.end, pings: 0 }; players.set(cur.player, p); }
    p.visits.push({ start: cur.start, end: cur.end, x: cur.x, z: cur.z });
    p.total += cur.end - cur.start;
    p.pings += cur.n;
    p.first = Math.min(p.first, cur.start);
    p.last = Math.max(p.last, cur.end);
    cur = null;
  };

  for (const r of st.area.iterate(world,
    Math.floor(bbox.minX / CELL), Math.floor(bbox.maxX / CELL),
    Math.floor(bbox.minZ / CELL), Math.floor(bbox.maxZ / CELL), from, to)) {
    if (++scanned > cfg.maxScan) { truncated = true; break; }
    const inside = r.x >= bbox.minX && r.x <= bbox.maxX && r.z >= bbox.minZ && r.z <= bbox.maxZ && pointInPolygon(r.x, r.z, points);
    if (!inside) { if (cur && cur.player === r.player) flush(); continue; }
    if (cur && cur.player === r.player && r.ts - cur.end <= cfg.visitGapMs) { cur.end = r.ts; cur.n++; }
    else { flush(); cur = { player: r.player, start: r.ts, end: r.ts, x: r.x, z: r.z, n: 1 }; }
    hist[Math.min(buckets - 1, Math.floor(((r.ts - from) / span) * buckets))].add(r.player);
  }
  flush();

  const out = [...players.values()].sort((a, b) => b.last - a.last);
  for (const p of out) p.visits.sort((a, b) => b.start - a.start);
  return { players: out, histogram: { from, to, counts: hist.map((s) => s.size) }, truncated, scanned };
}

// ─── HTTP ──────────────────────────────────────────────────
app.disable('x-powered-by');
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (originAllowed(o)) {
    res.set({
      'Access-Control-Allow-Origin': o,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'X-Skin-Model, X-Skin-Edition, X-Skin-Source',
      'Access-Control-Max-Age': '600',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '128kb' }));
if (cfg.servePage) {
  if (cfg.basePath) app.get(cfg.basePath, (req, res, next) => {
    if (req.path.endsWith('/')) return next();
    res.redirect(308, `${cfg.basePath}/`);
  });
  app.use(route('/'), express.static(path.join(__dirname, 'public')));
}

// Skins are public data, so no token (images are loaded straight from the page).
const getSkin = createSkinResolver({
  prefixes: cfg.bedrockPrefixes,
  lookupUuid: (name) => online.get(name)?.uuid || st.uuidOf.get(name)?.uuid || null,
});
app.get(route('/skin/:name'), async (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9_.*\-]{1,32}$/.test(name)) return res.sendStatus(400);
  try {
    const s = await getSkin(name);
    res.set({
      'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600',
      'X-Skin-Model': s.model, 'X-Skin-Edition': s.edition, 'X-Skin-Source': s.source,
    }).send(s.buf);
  } catch (err) {
    console.warn('[skin]', name, err.message);
    res.sendStatus(502);
  }
});
if (tilesInfo.mode === 'bluemap') {
  app.use(route('/tiles'), tileProxy({ base: cfg.source.bluemap.base, maps: cfg.source.bluemap.maps }));
} else if (tilesInfo.mode === 'squaremap') {
  app.use(route('/tiles'), squaremapTileProxy({ base: cfg.source.squaremap.base, maps: cfg.source.squaremap.maps }));
}

app.get(route('/api/config'), (_req, res) => {
  const s = st.stats.get();
  res.json({
    appName: cfg.appName, authRequired: !!cfg.token, source: cfg.source.type,
    pollMs: cfg.pollMs, worlds, tiles: tilesInfo, musicFile: cfg.musicFile,
    historySince: s.since, retentionDays: cfg.retentionDays,
  });
});

app.use(route('/api'), (req, res, next) => {
  const h = req.get('authorization') || '';
  if (!authorized(h.startsWith('Bearer ') ? h.slice(7) : null)) return res.status(401).json({ error: 'Invalid access code' });
  next();
});

app.get(route('/api/status'), (_req, res) => res.json(status));

app.post(route('/api/area'), (req, res) => {
  const { world, points, from, to } = req.body || {};
  if (typeof world !== 'string' || !world) return res.status(400).json({ error: 'Missing world' });
  if (!Array.isArray(points) || points.length < 3 || points.length > 200 ||
      !points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    return res.status(400).json({ error: 'An area needs 3 to 200 [x, z] points' });
  }
  const now = Date.now();
  const t1 = Number.isFinite(to) ? Math.min(to, now) : now;
  const t0 = Number.isFinite(from) ? Math.max(0, from) : t1 - 86_400_000;
  const t = Date.now();
  const result = areaHistory({ world, points, from: t0, to: t1 });
  res.json({ ...result, ms: Date.now() - t });
});

app.get(route('/api/players'), (req, res) => {
  const limit = Math.min(500, num(req.query.limit, 200));
  const q = String(req.query.q || '').trim();
  const rows = q ? st.playersSearch.all(`%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`, limit) : st.playersRecent.all(limit);
  res.json({ players: rows.map((p) => ({ ...p, online: online.has(p.name) })) });
});

app.get(route('/api/players/:name'), (req, res) => {
  const p = st.player.get(req.params.name);
  if (!p) return res.status(404).json({ error: 'Never seen this player' });
  const live = online.get(p.name) || null;
  const edition = isFloodgateUuid(p.uuid) || cfg.bedrockPrefixes.some((x) => x && p.name.startsWith(x)) ? 'bedrock' : 'java';
  res.json({ player: { ...p, online: !!live, live, edition } });
});

app.get(route('/api/players/:name/trail'), (req, res) => {
  const to = Math.min(Date.now(), num(req.query.to, Date.now()));
  let from = num(req.query.from, to - 6 * 3_600_000);
  if (to - from > 31 * 86_400_000) from = to - 31 * 86_400_000;
  const all = st.trail.all(req.params.name, from, to);
  const MAX = 20000;
  let rows = all;
  if (all.length > MAX) {
    // Downsample but keep points around gaps / world changes so segments still break correctly.
    const k = Math.ceil(all.length / MAX);
    rows = all.filter((r, i) => i % k === 0 || i === all.length - 1 ||
      (i > 0 && (r.world !== all[i - 1].world || r.ts - all[i - 1].ts > 300_000)) ||
      (i < all.length - 1 && (r.world !== all[i + 1].world || all[i + 1].ts - r.ts > 300_000)));
  }
  res.json({ trail: rows, total: all.length, from, to });
});

server.listen(cfg.port, cfg.host, () => {
  console.log(`\n  ${cfg.appName} watching on http://${cfg.host}:${cfg.port}${cfg.basePath || '/'}`);
  const sourceUrl = cfg.source.type === 'bluemap' ? cfg.source.bluemap.base : cfg.source.type === 'squaremap' ? cfg.source.squaremap.base : cfg.source.url;
  console.log(`  source: ${cfg.source.type}${sourceUrl ? ' → ' + sourceUrl : ''}`);
  console.log(`  access: ${cfg.token ? 'protected by ACCESS_TOKEN' : 'OPEN (set ACCESS_TOKEN!)'}\n`);
  prune();
  loop();
});
const shutdown = () => { db.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
