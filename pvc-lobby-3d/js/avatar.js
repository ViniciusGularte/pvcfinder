// Minecraft-style player model built from a 64×64 skin (classic or slim arms, with overlay layers).
import * as THREE from 'three';
import { API, SKIN_SOURCES } from './config.js';

export const PX = 1.8 / 32;   // one skin pixel in metres (player is 32px = 1.8m tall)
export const HIP = 12 * PX;

/* ---------- skin loading ---------- */
function loadImage(url, ms = 8000) {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); img.onload = null; img.onerror = null;
      if (error) rej(error); else res(img);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), ms);
    img.onload = () => finish();
    img.onerror = () => finish(new Error('load failed'));
    img.src = url;
  });
}

// Multiplayer reconnects used to download and decode the same skin each time. Keep a
// small bounded cache and share concurrent requests; avatar textures themselves remain
// independent and are disposed when a player leaves.
const SKIN_CACHE_LIMIT = 24;
const skinCache = new Map();
const skinRequests = new Map();
function rememberSkin(key, skin) {
  if (skinCache.has(key)) skinCache.delete(key);
  skinCache.set(key, skin);
  while (skinCache.size > SKIN_CACHE_LIMIT) skinCache.delete(skinCache.keys().next().value);
  return skin;
}

// Normalises any skin image into a 64×64 canvas and detects slim (Alex) arms.
export function prepareSkin(img) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let slim = false;
  if (img.height === 32) {   // legacy skin: mirror right limbs onto the left ones
    g.drawImage(c, 0, 16, 16, 16, 16, 48, 16, 16);
    g.drawImage(c, 40, 16, 16, 16, 32, 48, 16, 16);
  } else {
    const a = g.getImageData(54, 20, 2, 12).data;
    slim = true; for (let i = 3; i < a.length; i += 4) if (a[i] > 0) { slim = false; break; }
  }
  return { canvas: c, slim };
}

async function fetchSkinUncached(nick) {
  let uuid = null;
  try {
    const r = await fetch(`${API}/api/v1/uuidFromName/${encodeURIComponent(nick)}`);
    if (r.ok) uuid = (await r.json())?.uuid?.replace(/-/g, '') || null;
  } catch {}
  for (const src of SKIN_SOURCES) {
    const url = src(nick, uuid); if (!url) continue;
    try {
      const img = await loadImage(url);
      if (img.width === 64 && (img.height === 64 || img.height === 32)) return { ...prepareSkin(img), source: new URL(url).hostname };
    } catch {}
  }
  return null;
}

export function fetchSkin(nick) {
  const key = String(nick || '').trim().toLowerCase();
  if (skinCache.has(key)) {
    const skin = skinCache.get(key);
    skinCache.delete(key); skinCache.set(key, skin);
    return Promise.resolve(skin);
  }
  if (skinRequests.has(key)) return skinRequests.get(key);
  const request = fetchSkinUncached(nick)
    .then(skin => rememberSkin(key, skin))
    .finally(() => skinRequests.delete(key));
  skinRequests.set(key, request);
  return request;
}

// An original default look (hoodie + jeans) for guests or when no skin is found.
export function defaultSkin() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const box = (u, v, w, h, d, col) => { g.fillStyle = col; g.fillRect(u + d, v, w * 2, d); g.fillRect(u, v + d, (d + w) * 2, h); };
  const rows = (u, v, w, h, d, from, to, col) => { g.fillStyle = col; g.fillRect(u, v + d + from, (d + w) * 2, to - from); };
  box(0, 0, 8, 8, 8, '#c68863');
  g.fillStyle = '#4a2f1f'; g.fillRect(8, 0, 8, 8); g.fillRect(0, 8, 32, 2); g.fillRect(24, 8, 8, 6); g.fillRect(0, 8, 2, 5); g.fillRect(14, 8, 2, 3);
  g.fillStyle = '#fff'; g.fillRect(9, 12, 2, 1); g.fillRect(13, 12, 2, 1);
  g.fillStyle = '#2b4a6f'; g.fillRect(10, 12, 1, 1); g.fillRect(13, 12, 1, 1);
  g.fillStyle = '#8a4a3a'; g.fillRect(11, 14, 2, 1);
  box(16, 16, 8, 12, 4, '#d9772f');
  g.fillStyle = '#b85f22'; g.fillRect(23, 20, 2, 12); g.fillRect(21, 26, 6, 3);
  g.fillStyle = '#f6ead7'; g.fillRect(22, 20, 1, 3); g.fillRect(25, 20, 1, 3);
  for (const [u, v] of [[40, 16], [32, 48]]) { box(u, v, 4, 12, 4, '#d9772f'); rows(u, v, 4, 12, 4, 10, 12, '#c68863'); }
  for (const [u, v] of [[0, 16], [16, 48]]) { box(u, v, 4, 12, 4, '#3b4f7a'); rows(u, v, 4, 12, 4, 10, 12, '#2a2a2a'); }
  return { canvas: c, slim: false };
}

/* ---------- model ---------- */
function skinBox(tex, mat, w, h, d, u, v, inflate = 0) {
  const geo = new THREE.BoxGeometry((w + inflate) * PX, (h + inflate) * PX, (d + inflate) * PX);
  const rects = [
    [u + d + w, v + d, d, h],   // +x: character's left side
    [u, v + d, d, h],           // -x: right side
    [u + d, v, w, d],           // +y: top
    [u + d + w, v, w, d],       // -y: bottom
    [u + d, v + d, w, h],       // +z: front
    [u + 2 * d + w, v + d, w, h], // -z: back
  ];
  const uv = geo.attributes.uv;
  rects.forEach(([x, y, rw, rh], f) => {
    const u0 = x / 64, u1 = (x + rw) / 64, v0 = 1 - y / 64, v1 = 1 - (y + rh) / 64;
    uv.setXY(f * 4, u0, v0); uv.setXY(f * 4 + 1, u1, v0); uv.setXY(f * 4 + 2, u0, v1); uv.setXY(f * 4 + 3, u1, v1);
  });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}

function nameTag(text) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = 'bold 34px sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 28; c.width = w; c.height = 50;
  g.font = 'bold 34px sans-serif'; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, w, 50);
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 14, 27);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false, depthWrite: false }));
  s.scale.set(w / 50 * .17, .17, 1);
  return s;
}

export function createAvatar({ shadows = true } = {}) {
  const root = new THREE.Group();
  let model = null, tag = null, P = {};
  const handAttachments = { r: [], l: [] };
  let phase = 0;

  function disposeModel() {
    if (!model) return;
    root.remove(model);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    model.traverse(o => {
      if (o.userData.avatarAttachment) return;
      if (o.geometry) geometries.add(o.geometry);
      for (const material of [].concat(o.material || [])) if (material) {
        materials.add(material); if (material.map) textures.add(material.map);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    model = null;
  }
  function disposeTag() {
    if (!tag) return;
    root.remove(tag); tag.material.map?.dispose(); tag.material.dispose(); tag = null;
  }

  function setSkin({ canvas, slim }) {
    disposeModel();
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const base = new THREE.MeshStandardMaterial({ map: tex, roughness: .9, fog: false });
    const over = new THREE.MeshStandardMaterial({ map: tex, roughness: .9, alphaTest: .5, side: THREE.DoubleSide, fog: false });
    model = new THREE.Group(); root.add(model);
    const aw = slim ? 3 : 4;
    const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x * PX, y * PX, 0); model.add(p); return p; };
    const part = (parent, w, h, d, u, v, ou, ov, oy, inf = .5) => {
      const a = skinBox(tex, base, w, h, d, u, v), b = skinBox(tex, over, w, h, d, ou, ov, inf);
      a.position.y = b.position.y = oy * PX; parent.add(a, b);
    };
    P.head = pivot(0, 24); part(P.head, 8, 8, 8, 0, 0, 32, 0, 4, 1);
    P.body = pivot(0, 18); part(P.body, 8, 12, 4, 16, 16, 16, 32, 0);
    P.rArm = pivot(-(4 + aw / 2), 22); part(P.rArm, aw, 12, 4, 40, 16, 40, 32, -4);
    P.lArm = pivot(4 + aw / 2, 22); part(P.lArm, aw, 12, 4, 32, 48, 48, 48, -4);
    P.rLeg = pivot(-2, 12); part(P.rLeg, 4, 12, 4, 0, 16, 0, 32, -6);
    P.lLeg = pivot(2, 12); part(P.lLeg, 4, 12, 4, 16, 48, 0, 48, -6);
    handAttachments.r.forEach(object => P.rArm.add(object));
    handAttachments.l.forEach(object => P.lArm.add(object));
    if (!shadows) model.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }
  function setName(name) {
    disposeTag();
    tag = nameTag(name); tag.position.y = 2.12; root.add(tag);
  }
  function dispose() {
    disposeModel(); disposeTag();
    const geometries = new Set(), materials = new Set();
    [...handAttachments.r, ...handAttachments.l].forEach(object => object.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      for (const material of [].concat(o.material || [])) if (material) materials.add(material);
    }));
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  }
  function attachToHand(object, side = 'r') {
    const key = side === 'l' ? 'l' : 'r';
    object.traverse(child => { child.userData.avatarAttachment = true; });
    if (!handAttachments[key].includes(object)) handAttachments[key].push(object);
    P[key === 'r' ? 'rArm' : 'lArm']?.add(object);
    return object;
  }

  // state: { speed, sitting, typing, airborne, t }
  function update(dt, st) {
    if (!model) return;
    const sw = Math.min(1, st.speed / 2.6);
    phase += dt * (3 + st.speed * 2.6);
    const s = Math.sin(phase);
    P.body.rotation.set(0, 0, 0);
    P.head.rotation.set(0, 0, 0);
    if (st.sitting) {
      P.rLeg.rotation.set(-Math.PI / 2, 0, .06); P.lLeg.rotation.set(-Math.PI / 2, 0, -.06);
      const typ = st.typing ? Math.sin(st.t * 30) * .08 : 0;
      P.rArm.rotation.set(st.typing ? -1.15 + typ : -.45, 0, 0); P.lArm.rotation.set(st.typing ? -1.15 - typ : -.45, 0, 0);
      P.head.rotation.x = st.typing ? .15 : 0;
    } else if (st.airborne) {
      P.rLeg.rotation.set(-.4, 0, 0); P.lLeg.rotation.set(.3, 0, 0);
      P.rArm.rotation.set(0, 0, -.5); P.lArm.rotation.set(0, 0, .5);
    } else {
      P.rLeg.rotation.set(s * .8 * sw, 0, 0); P.lLeg.rotation.set(-s * .8 * sw, 0, 0);
      const idle = Math.sin(st.t * 1.4) * .04;
      P.rArm.rotation.set(-s * .7 * sw, 0, -.05 - idle); P.lArm.rotation.set(s * .7 * sw, 0, .05 + idle);
      P.head.rotation.x = Math.sin(st.t * .7) * .03;
    }
    if (st.emote === 'wave') P.rArm.rotation.set(-2.5 + Math.sin(st.t * 12) * .3, 0, -.3);
    if (st.emote === 'heart') { P.rArm.rotation.set(-1.8, 0, -.65); P.lArm.rotation.set(-1.8, 0, .65); }
    if (st.emote === 'celebrate') { P.rArm.rotation.set(-2.8, 0, -.25); P.lArm.rotation.set(-2.8, 0, .25); }
    if (st.emote === 'dance') {
      const beat = Math.sin(st.t * 8), bounce = Math.abs(Math.cos(st.t * 8));
      P.rArm.rotation.set(-beat * 1.35, 0, -.18); P.lArm.rotation.set(beat * 1.35, 0, .18);
      P.rLeg.rotation.set(beat * .48, 0, -.08); P.lLeg.rotation.set(-beat * .48, 0, .08);
      P.body.rotation.z = beat * .14; P.head.rotation.z = -beat * .1;
      P.body.position.y = 18 * PX + bounce * .07;
    } else if (st.emote === 'clap') {
      const clap = .48 + Math.abs(Math.sin(st.t * 11)) * .42;
      P.rArm.rotation.set(-1.45, 0, clap); P.lArm.rotation.set(-1.45, 0, -clap);
      P.head.rotation.x = -.08 + Math.sin(st.t * 11) * .04;
      P.body.position.y = 18 * PX + Math.abs(Math.sin(st.t * 11)) * .025;
    } else if (st.emote === 'laugh') {
      const chuckle = Math.sin(st.t * 13);
      P.rArm.rotation.set(-1.5 + chuckle * .12, 0, .55); P.lArm.rotation.set(-1.5 - chuckle * .12, 0, -.55);
      P.body.rotation.x = .12 + Math.abs(chuckle) * .12; P.head.rotation.x = -.18 + chuckle * .1;
      P.body.position.y = 18 * PX + Math.abs(chuckle) * .035;
    } else if (st.emote === 'overcharge') {
      const surge = Math.sin(st.t * 19), pulse = (Math.sin(st.t * 10) + 1) * .5;
      P.rArm.rotation.set(-2.72 + surge * .12, 0, -.42); P.lArm.rotation.set(-2.72 - surge * .12, 0, .42);
      P.rLeg.rotation.set(.18 + surge * .08, 0, -.1); P.lLeg.rotation.set(-.18 - surge * .08, 0, .1);
      P.body.rotation.set(-.08, surge * .06, surge * .035); P.head.rotation.set(-.2, 0, -surge * .05);
      P.body.position.y = 18 * PX + .05 + pulse * .09;
    } else {
      P.body.position.y = 18 * PX + (st.sitting ? 0 : Math.abs(Math.cos(phase)) * .02 * sw);
    }
  }

  return { root, setSkin, setName, update, dispose, attachToHand };
}

// Draws the face (with hat layer) of a skin onto a small canvas — for the HUD.
export function drawHead(skinCanvas, target) {
  const g = target.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, target.width, target.height);
  g.drawImage(skinCanvas, 8, 8, 8, 8, 0, 0, target.width, target.height);
  g.drawImage(skinCanvas, 40, 8, 8, 8, 0, 0, target.width, target.height);
}
