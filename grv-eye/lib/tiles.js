// Caching proxy for BlueMap lowres tiles. Keeps load off the map server and
// makes tiles same-origin for the page.
import express from 'express';

export function tileProxy({ base, maps, maxBytes = 200 * 1024 * 1024 }) {
  const router = express.Router();
  const cache = new Map(); // key -> { buf, at } | { missing: true, at }
  const inflight = new Map();
  let bytes = 0;
  const PATH = /^[xz0-9\-/]+\.png$/;

  function remember(key, entry) {
    if (cache.has(key)) { const old = cache.get(key); bytes -= old.buf?.length || 0; cache.delete(key); }
    cache.set(key, entry);
    bytes += entry.buf?.length || 0;
    while (bytes > maxBytes && cache.size) {
      const [k, v] = cache.entries().next().value;
      cache.delete(k); bytes -= v.buf?.length || 0;
    }
  }

  async function load(key, url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 404) { remember(key, { missing: true, at: Date.now() }); return null; }
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    remember(key, { buf, at: Date.now() });
    return buf;
  }

  router.get('/:map/:lod/*', async (req, res) => {
    const { map, lod } = req.params;
    const rest = req.params[0];
    if (!maps[map] || !/^[1-9]$/.test(lod) || !PATH.test(rest)) return res.sendStatus(400);
    const key = `${map}/${lod}/${rest}`;
    const hit = cache.get(key);
    const fresh = hit && Date.now() - hit.at < (hit.missing ? 10 : 60) * 60_000;
    if (fresh) {
      cache.delete(key); cache.set(key, hit); // LRU bump
      if (hit.missing) return res.sendStatus(404);
      return res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }).send(hit.buf);
    }
    try {
      if (!inflight.has(key)) inflight.set(key, load(key, `${base}maps/${map}/tiles/${lod}/${rest}`).finally(() => inflight.delete(key)));
      const buf = await inflight.get(key);
      if (!buf) return res.sendStatus(404);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }).send(buf);
    } catch {
      res.sendStatus(502);
    }
  });
  return router;
}

export function squaremapTileProxy({ base, maps, maxBytes = 300 * 1024 * 1024 }) {
  const router = express.Router();
  const cache = new Map();
  const inflight = new Map();
  let bytes = 0;

  function remember(key, entry) {
    if (cache.has(key)) { bytes -= cache.get(key).buf?.length || 0; cache.delete(key); }
    cache.set(key, entry);
    bytes += entry.buf?.length || 0;
    while (bytes > maxBytes && cache.size) {
      const [oldKey, old] = cache.entries().next().value;
      cache.delete(oldKey);
      bytes -= old.buf?.length || 0;
    }
  }

  async function load(key, url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'GRV-EYE tile cache' },
    });
    if (response.status === 404) { remember(key, { missing: true, at: Date.now() }); return null; }
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const buf = Buffer.from(await response.arrayBuffer());
    remember(key, { buf, at: Date.now() });
    return buf;
  }

  router.get('/:world/:zoom/:tile', async (req, res) => {
    const { world, zoom, tile } = req.params;
    const map = maps[world];
    if (!map || !/^\d{1,2}$/.test(zoom) || Number(zoom) > map.maxZoom || !/^-?\d+_-?\d+\.png$/.test(tile)) {
      return res.sendStatus(400);
    }
    const key = `${world}/${zoom}/${tile}`;
    const hit = cache.get(key);
    const fresh = hit && Date.now() - hit.at < (hit.missing ? 10 : 60) * 60_000;
    if (fresh) {
      cache.delete(key); cache.set(key, hit);
      if (hit.missing) return res.sendStatus(404);
      return res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }).send(hit.buf);
    }
    try {
      if (!inflight.has(key)) {
        const url = `${base}tiles/${encodeURIComponent(world)}/${zoom}/${tile}`;
        inflight.set(key, load(key, url).finally(() => inflight.delete(key)));
      }
      const buf = await inflight.get(key);
      if (!buf) return res.sendStatus(404);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }).send(buf);
    } catch {
      res.sendStatus(502);
    }
  });
  return router;
}
