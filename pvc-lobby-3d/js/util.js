import * as THREE from 'three';
import { S } from './core.js';

export const $ = id => document.getElementById(id);
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp01 = v => Math.min(1, Math.max(0, v));
export const angleLerp = (a, b, k) => { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * k; };
export const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

export const store = {
  get() { try { return JSON.parse(localStorage.getItem('pvcLobby') || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem('pvcLobby', JSON.stringify({ ...store.get(), ...v })); } catch {} },
};

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = S.renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export const std = o => new THREE.MeshStandardMaterial({ roughness: .85, metalness: 0, ...o });

export function mesh(geo, mat, pos, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true;
  if (opts.name) m.name = opts.name;
  (opts.parent || S.scene).add(m);
  return m;
}

export function group(x, z, rot = 0, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  S.scene.add(g); return g;
}

export const noRaycast = o => { o.raycast = () => {}; return o; };

export function addCollider(cx, cz, sx, sz) {
  const c = { minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 };
  S.colliders.push(c); return c;
}
// rotated rectangle → its bounding box
export function addRotCollider(cx, cz, w, d, rot) {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  return addCollider(cx, cz, c * w + s * d, s * w + c * d);
}

export const softDot = canvasTex(64, 64, g => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

export const glyphTex = (ch, color = '#ffd59a', size = 52) => canvasTex(64, 64, g => {
  g.fillStyle = color; g.font = `${size}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 34);
});

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// tiny tween helper: animate(seconds, k => {...}, done)
export function animate(dur, fn, done) {
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
    fn(k);
    if (k < 1) requestAnimationFrame(step); else done && done();
  };
  requestAnimationFrame(step);
}
export const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// floating sprite particles (hearts, notes, sparks…) that rise and fade
export function spawnFloaters(tex, origin, n = 5, opts = {}) {
  let finished = 0;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: opts.color ?? 0xffffff, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const sz = opts.size ?? .14; s.scale.setScalar(sz);
    const ox = rnd(-.15, .15), oz = rnd(-.15, .15), rise = opts.rise ?? rnd(.6, 1), delay = i * (opts.stagger ?? .12);
    S.scene.add(s); s.position.copy(origin);
    setTimeout(() => animate(opts.dur ?? 1.4, k => {
      s.position.set(origin.x + ox + Math.sin(k * 6 + i) * .05, origin.y + k * rise, origin.z + oz);
      s.material.opacity = Math.sin(k * Math.PI);
    }, () => {
      S.scene.remove(s); s.material.dispose();
      finished++; if (opts.disposeTexture && finished === n) tex.dispose();
    }), delay * 1000);
  }
  if (opts.disposeTexture && n <= 0) tex.dispose();
}
