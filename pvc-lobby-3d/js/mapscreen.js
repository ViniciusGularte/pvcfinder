// Shared PVC Squaremap renderer on the wall TV. No iframe: pan and zoom
// belong to the lobby and are broadcast to every connected player.
import * as THREE from 'three';
import { S } from './core.js';
import { API, WORLD, MAP_START, MAP_SPAWN, GOTO_ZOOM, ROOM, SCREEN } from './config.js';
import { $, V, std, mesh } from './util.js';
import { addInteractable } from './interact.js';

const screenZ = -ROOM.d / 2 + .08;
const toLL = (x, z) => L.latLng(-z, x);
const fromLL = latlng => ({ x: Math.round(latlng.lng), z: Math.round(-latlng.lat) });
let map, suppressShareUntil = 0, preview, previewCtx, previewTexture;
const previewImageCache = new Map();

const mapApi = () => {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://127.0.0.1:8081/lobby/api/map';
  return S.netConfig?.mapApi || 'https://api.theyasked.co/lobby/api/map';
};

const SquareMapLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('canvas'), size = this.getTileSize();
    tile.width = size.x; tile.height = size.y; tile.style.background = '#07100b';
    const g = tile.getContext('2d'); g.imageSmoothingEnabled = false;
    const source = S.netConfig?.map || { world: WORLD, tileSize: 512, maxZoom: 8 };
    const bpp = Math.pow(2, -coords.z);
    const lod = Math.min(source.maxZoom, Math.max(0, source.maxZoom + coords.z));
    const sourceBpp = Math.pow(2, source.maxZoom - lod), span = source.tileSize * sourceBpp;
    const x0 = coords.x * size.x * bpp, z0 = coords.y * size.y * bpp;
    const x1 = x0 + size.x * bpp, z1 = z0 + size.y * bpp;
    const jobs = [];
    for (let tx = Math.floor(x0 / span); tx * span < x1; tx++) for (let tz = Math.floor(z0 / span); tz * span < z1; tz++) {
      const url = `${mapApi()}/tiles/${encodeURIComponent(source.world || WORLD)}/${lod}/${tx}_${tz}.png`;
      jobs.push(previewImage(url).then(image => {
        if (!image) return;
        const ix0 = Math.max(x0, tx * span), iz0 = Math.max(z0, tz * span);
        const ix1 = Math.min(x1, (tx + 1) * span), iz1 = Math.min(z1, (tz + 1) * span);
        if (ix1 <= ix0 || iz1 <= iz0) return;
        g.drawImage(image,
          (ix0 - tx * span) / sourceBpp, (iz0 - tz * span) / sourceBpp,
          (ix1 - ix0) / sourceBpp, (iz1 - iz0) / sourceBpp,
          (ix0 - x0) / bpp, (iz0 - z0) / bpp,
          (ix1 - ix0) / bpp, (iz1 - iz0) / bpp);
      }));
    }
    Promise.all(jobs).then(() => done(null, tile));
    return tile;
  },
});

const CoordinateGrid = L.GridLayer.extend({
  createTile(coords) {
    const canvas = document.createElement('canvas'), size = this.getTileSize(); canvas.width = size.x; canvas.height = size.y;
    const g = canvas.getContext('2d'), bpp = Math.pow(2, -coords.z);
    const x0 = coords.x * size.x * bpp, z0 = coords.y * size.y * bpp;
    let step = 16; for (const value of [16, 64, 256, 1024, 4096, 16384]) { step = value; if (value / bpp >= 70) break; }
    g.strokeStyle = 'rgba(255,220,160,.18)'; g.lineWidth = 1;
    for (let x = Math.ceil(x0 / step) * step; x < x0 + size.x * bpp; x += step) { const px = (x - x0) / bpp; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, size.y); g.stroke(); }
    for (let z = Math.ceil(z0 / step) * step; z < z0 + size.y * bpp; z += step) { const py = (z - z0) / bpp; g.beginPath(); g.moveTo(0, py); g.lineTo(size.x, py); g.stroke(); }
    return canvas;
  },
});

export function buildMapScreen() {
  const frame = std({ color: 0x4a2e1b, roughness: .5 }), fw = .16;
  const { x, y, w, h } = SCREEN;
  mesh(new THREE.BoxGeometry(w + fw * 2, fw, .14), frame, [x, y + h / 2 + fw / 2, screenZ]);
  mesh(new THREE.BoxGeometry(w + fw * 2, fw, .14), frame, [x, y - h / 2 - fw / 2, screenZ]);
  mesh(new THREE.BoxGeometry(fw, h, .14), frame, [x - w / 2 - fw / 2, y, screenZ]);
  mesh(new THREE.BoxGeometry(fw, h, .14), frame, [x + w / 2 + fw / 2, y, screenZ]);
  preview = document.createElement('canvas'); preview.width = 1024; preview.height = 576; previewCtx = preview.getContext('2d');
  previewTexture = new THREE.CanvasTexture(preview); previewTexture.colorSpace = THREE.SRGBColorSpace; previewTexture.minFilter = THREE.LinearFilter;
  const hole = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: previewTexture, toneMapped: false, side: THREE.DoubleSide }), [x, y, screenZ], { cast: false, receive: false, name: 'screen' });
  const glow = new THREE.PointLight(0x9fd3b0, 1.4, 7, 2); glow.position.set(x, y, screenZ + 1.2); S.scene.add(glow);

  const element = document.createElement('div'); element.className = 'screen pvc-map-screen map-stage';
  element.innerHTML = '<div id="sharedMap"></div><div class="map-live"><i></i> PVC LIVE MAP</div><div id="mapCoords">x 54 · z 51</div>';
  document.body.prepend(element);

  map = L.map(element.querySelector('#sharedMap'), { crs: L.CRS.Simple, minZoom: -8, maxZoom: 4, zoomSnap: .5, zoomControl: false, attributionControl: false, preferCanvas: true });
  new SquareMapLayer({ tileSize: 256, minZoom: -8, maxZoom: 4, keepBuffer: 2 }).addTo(map);
  new CoordinateGrid({ tileSize: 256, minZoom: -8, maxZoom: 4, zIndex: 2 }).addTo(map);
  map.setView(toLL(MAP_START.x, MAP_START.z), MAP_START.zoom, { animate: false });
  renderPreview(MAP_START);
  map.on('mousemove', event => { const p = fromLL(event.latlng); $('mapCoords').textContent = `x ${p.x} · z ${p.z}`; });
  map.on('moveend zoomend', () => {
    const center = fromLL(map.getCenter());
    renderPreview({ ...center, zoom: map.getZoom() });
    if (performance.now() < suppressShareUntil) return;
    S.multiplayer?.setMapView({ ...center, zoom: map.getZoom() });
  });

  S.mapScreen = { applyShared };
  addInteractable(hole, { verb: 'Use', name: 'the shared map', anchor: V(x, 0, screenZ), range: 60, action: enterMap });
  wireMapBar(); S.resizers.push(() => { if (S.mode === 'map') { S.camOverride = mapPose(); setTimeout(() => map.invalidateSize(), 50); } });
}

function applyShared(view) {
  if (!map || !Number.isFinite(+view?.x) || !Number.isFinite(+view?.z)) return;
  const current = fromLL(map.getCenter());
  if (Math.hypot(current.x - view.x, current.z - view.z) < 1 && Math.abs(map.getZoom() - view.zoom) < .1) {
    renderPreview(view);
    return;
  }
  renderPreview(view);
  suppressShareUntil = performance.now() + 900;
  map.setView(toLL(view.x, view.z), view.zoom, { animate: true, duration: .45 });
}

function previewImage(url) {
  if (previewImageCache.has(url)) return previewImageCache.get(url);
  const request = new Promise(resolve => {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
    const timer = setTimeout(() => resolve(null), 12_000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = url;
  }).then(image => {
    if (!image) previewImageCache.delete(url);
    while (previewImageCache.size > 64) previewImageCache.delete(previewImageCache.keys().next().value);
    return image;
  });
  previewImageCache.set(url, request);
  return request;
}

function paintPreview(state, loading = false) {
  if (state.token !== renderPreview.token || !previewCtx) return;
  const { view, entries, x0, z0, bpp, span } = state, g = previewCtx, W = preview.width, H = preview.height;
  g.fillStyle = '#07100b'; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  let drawn = 0;
  for (const entry of entries) if (entry.image?.naturalWidth) {
    g.drawImage(entry.image, (entry.tx * span - x0) / bpp, (entry.tz * span - z0) / bpp, span / bpp, span / bpp);
    drawn++;
  }
  if (!drawn) {
    g.strokeStyle = 'rgba(140,240,175,.09)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.fillStyle = 'rgba(223,247,228,.52)'; g.font = '600 20px Inter, sans-serif'; g.textAlign = 'center';
    g.fillText(loading ? 'LOADING PVC WORLD…' : 'MAP TILES UNAVAILABLE · RETRYING', W / 2, H / 2);
    g.textAlign = 'left';
  }
  g.fillStyle = 'rgba(4,12,7,.84)'; g.fillRect(18, 18, 278, 48); g.fillRect(W - 210, 18, 192, 48);
  g.strokeStyle = 'rgba(140,240,175,.38)'; g.strokeRect(18, 18, 278, 48); g.strokeRect(W - 210, 18, 192, 48);
  g.fillStyle = '#dff7e4'; g.font = '600 22px Fraunces, serif';
  g.fillText('●  PVC LIVE MAP', 34, 50); g.fillText(`x ${Math.round(view.x)} · z ${Math.round(view.z)}`, W - 190, 50);
  previewTexture.needsUpdate = true;
}

function renderPreview(view) {
  if (!previewCtx || !Number.isFinite(+view?.x) || !Number.isFinite(+view?.z)) return;
  view = { x: +view.x, z: +view.z, zoom: Number.isFinite(+view.zoom) ? +view.zoom : -2 };
  const W = preview.width, H = preview.height;
  const source = S.netConfig?.map || { world: WORLD, tileSize: 512, maxZoom: 8 };
  const bpp = Math.pow(2, -view.zoom);
  const lod = Math.round(Math.min(source.maxZoom, Math.max(0, source.maxZoom + view.zoom)));
  const sourceBpp = Math.pow(2, source.maxZoom - lod), span = source.tileSize * sourceBpp;
  const x0 = view.x - W * bpp / 2, z0 = view.z - H * bpp / 2, x1 = x0 + W * bpp, z1 = z0 + H * bpp;
  const token = renderPreview.token = (renderPreview.token || 0) + 1;
  const entries = [];
  for (let tx = Math.floor(x0 / span); tx * span < x1; tx++) for (let tz = Math.floor(z0 / span); tz * span < z1; tz++) {
    const url = `${mapApi()}/tiles/${encodeURIComponent(source.world || WORLD)}/${lod}/${tx}_${tz}.png`;
    entries.push({ image: null, tx, tz, request: previewImage(url) });
  }
  const state = { token, view, entries, x0, z0, bpp, span };
  paintPreview(state, true);
  let settled = 0;
  entries.forEach(entry => entry.request.then(image => {
    if (token !== renderPreview.token) return;
    entry.image = image; settled++;
    paintPreview(state, settled < entries.length);
  }));
}

function mapPose() {
  const cam = S.camera, k = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const dist = Math.max((SCREEN.h + .25) / k, (SCREEN.w + .3) / (k * cam.aspect));
  return { pos: V(SCREEN.x, SCREEN.y, screenZ + Math.min(dist, ROOM.d - 1)), look: V(SCREEN.x, SCREEN.y, screenZ), hideAvatar: true };
}

let enterTimer;
export function enterMap() {
  if (S.mode !== 'walk') return;
  if (S.player.state === 'sit') S.player.stand();
  S.mode = 'map'; S.player.walkTarget = null; S.camOverride = mapPose(); S.camChangeT = S.clock.elapsedTime;
  clearTimeout(enterTimer); enterTimer = setTimeout(() => { if (S.mode === 'map') { document.body.classList.add('map-mode'); map.invalidateSize(); } }, 800);
}
export function exitMap() {
  if (S.mode !== 'map') return;
  clearTimeout(enterTimer); document.body.classList.remove('map-mode'); $('results').classList.remove('show');
  S.mode = 'walk'; S.camOverride = null; S.camChangeT = S.clock.elapsedTime;
}

function go(x, z, zoom = GOTO_ZOOM) {
  suppressShareUntil = 0; map.setView(toLL(x, z), zoom, { animate: true, duration: .55 });
  S.multiplayer?.setMapView({ x, z, zoom }); suppressShareUntil = performance.now() + 700;
}

function wireMapBar() {
  $('back').onclick = exitMap;
  addEventListener('keydown', event => { if (event.code === 'Escape' && S.mode === 'map') exitMap(); });
  $('goto').onsubmit = event => { event.preventDefault(); const x = +$('gx').value, z = +$('gz').value; if (Number.isFinite(x) && Number.isFinite(z)) go(x, z); };
  $('spawn').onclick = () => go(MAP_SPAWN.x, MAP_SPAWN.z, MAP_SPAWN.zoom);
  const results = $('results'), escape = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  $('search').onsubmit = async event => {
    event.preventDefault(); const query = $('q').value.trim(); if (query.length < 2) return;
    results.innerHTML = '<div>Searching…</div>'; results.classList.add('show');
    try {
      const response = await fetch(`${API}/api/v2/search/${encodeURIComponent(query)}`); if (!response.ok) throw new Error('Search unavailable');
      const list = (await response.json()).filter(item => Number.isFinite(+item.x) && Number.isFinite(+item.z)).slice(0, 25);
      results.innerHTML = list.length ? '' : '<div>Nothing found.</div>';
      for (const item of list) { const row = document.createElement('div'); row.innerHTML = `${escape(item.name)} <small>· ${escape(item.type || '')} · ${Math.round(item.x)}, ${Math.round(item.z)}</small>`; row.onclick = () => { go(+item.x, +item.z); results.classList.remove('show'); }; results.appendChild(row); }
    } catch (error) { results.innerHTML = `<div>${escape(error.message)}</div>`; }
  };
  addEventListener('pointerdown', event => { if (!event.target.closest('#searchWrap')) results.classList.remove('show'); });
}
