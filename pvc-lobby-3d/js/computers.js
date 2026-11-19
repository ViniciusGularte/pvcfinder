// Four interactive in-world computers. Apps are rendered into and clicked on
// the actual monitor texture—there are no external HUD controls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { S } from './core.js';
import { V, rnd, std, mesh, group, addCollider, $ } from './util.js';
import { T } from './textures.js';
import { addInteractable } from './interact.js';
import { sfx } from './audio.js';
import { pendant, rug } from './furniture.js';
import { WIKI_READER } from './config.js';

const POD = { x: 7, z: -6.8 };
const LAYOUT = [
  { x: POD.x - 1, z: POD.z + .4, rot: 0 }, { x: POD.x + 1, z: POD.z + .4, rot: 0 },
  { x: POD.x - 1, z: POD.z - .4, rot: Math.PI }, { x: POD.x + 1, z: POD.z - .4, rot: Math.PI },
];
const W = 512, H = 288;
const BOOT = ['PVC-BIOS v2.0  (c) guild systems', '', 'CPU: Redstone Core 9 @ 20 TPS', 'Memory test: 65536K OK', 'Network: PVC HUB LINKED',
  'Mounting /market/live ... OK', 'Loading PVC Lobby OS', ''];
const apps = [
  { id: 'shops', name: 'Shop', color: '#ffd27a', url: '/legacy.html?embed=pc', title: 'PVC Shop Browser' },
  { id: 'map', name: 'Map', color: '#7fc8ff', url: 'https://pvc.coolwebsite.uk/', title: 'PVC Map' },
  { id: 'notes', name: 'Notes', color: '#a8f0b4' },
  { id: 'wiki', name: 'Wiki', color: '#e8a0ff', url: WIKI_READER, title: 'PVC Wiki' },
];
const pcs = [];
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let appOverlay = null;
const overlayCorners = [V(-.43, .245, 0), V(.43, .245, 0), V(.43, -.245, 0), V(-.43, -.245, 0)];
const overlayPoints = overlayCorners.map(() => V());

const crt = document.createElement('canvas'); crt.width = W; crt.height = H;
{
  const g = crt.getContext('2d');
  for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y, W, 1); }
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .65);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}

export function buildComputers() {
  buildAppOverlay();
  rug(T.rugCool, POD.x, POD.z, 5.4, 4.6); LAYOUT.forEach((layout, i) => buildPC(i, layout));
  mesh(new RoundedBoxGeometry(3.9, .3, .04, 2, .015), std({ color: 0x3d6b70, roughness: 1 }), [POD.x, .9, POD.z]);
  pendant(POD.x - 1, POD.z, 3.1, 0, false); pendant(POD.x + 1, POD.z, 3.1, 0, false);
  const podLight = new THREE.PointLight(0xffc68a, 2.6, 9, 1.5); podLight.position.set(POD.x, 2.8, POD.z); S.scene.add(podLight);
  const glow = new THREE.PointLight(0x9fc4ff, 0, 3.5, 2); glow.visible = false; S.scene.add(glow);

  S.onFrame((dt, t) => {
    for (const pc of pcs) {
      pc.acc += dt;
      if (pc.acc >= (pc === S.activePC ? 1 / 24 : 1 / 8)) { draw(pc, t, pc.acc); pc.acc = 0; }
      pc.rgb.color.setHSL((t * .08 + pc.i * .25) % 1, .9, .55);
    }
    const active = S.activePC;
    updateAppOverlay(active);
    if (active) glow.position.copy(active.screenPos);
    glow.intensity += ((active ? 1.4 : 0) - glow.intensity) * Math.min(1, dt * 4); glow.visible = glow.intensity > .02;
  });

  addEventListener('keydown', onKey);
  const rendererCanvas = S.renderer.domElement;
  rendererCanvas.addEventListener('pointerup', onScreenClick);
  rendererCanvas.addEventListener('pointermove', event => {
    if (S.mode !== 'pc' || !S.activePC || S.activePC.state !== 'desktop') return;
    rendererCanvas.classList.toggle('hover', !!screenHit(event, S.activePC));
  });
}

function screenHit(event, pc) {
  ndc.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, S.camera);
  return ray.intersectObject(pc.screenMesh, false)[0] || null;
}

function onScreenClick(event) {
  const pc = S.activePC; if (S.mode !== 'pc' || !pc || pc.state !== 'desktop') return;
  const hit = screenHit(event, pc); if (!hit?.uv) return;
  const x = hit.uv.x * W, y = (1 - hit.uv.y) * H;
  for (let i = 0; i < apps.length; i++) {
    if (x >= 8 && x <= 82 && y >= 8 + i * 62 && y <= 68 + i * 62) { openApp(pc, apps[i].id); sfx.click(); return; }
  }
  if (x > 462 && x < 498 && y > 28 && y < 54) { pc.app = 'desktop'; sfx.click(); return; }
}

function openApp(pc, app) {
  pc.app = app; pc.t0 = S.clock.elapsedTime;
  const selected = apps.find(item => item.id === app);
  if (selected?.url) {
    const frame = appOverlay?.querySelector('iframe');
    if (frame && frame.dataset.app !== app) {
      frame.src = selected.url;
      frame.title = selected.title;
      frame.dataset.app = app;
    }
  }
  appOverlay?.classList.toggle('show', !!selected?.url);
}

function buildAppOverlay() {
  appOverlay = document.createElement('div'); appOverlay.id = 'pcAppOverlay';
  appOverlay.innerHTML = '<iframe title="PVC OS app"></iframe><button type="button" aria-label="Close application">× PVC OS</button>';
  appOverlay.querySelector('button').onclick = () => {
    if (S.activePC) S.activePC.app = 'desktop';
    appOverlay.classList.remove('show', 'visible'); sfx.click();
  };
  document.body.appendChild(appOverlay);
}

function updateAppOverlay(pc) {
  const app = pc && apps.find(item => item.id === pc.app);
  if (!appOverlay || S.mode !== 'pc' || !pc || pc.state !== 'desktop' || !app?.url) {
    appOverlay?.classList.remove('visible'); return;
  }
  pc.screenMesh.updateWorldMatrix(true, false);
  for (let i = 0; i < overlayCorners.length; i++) pc.screenMesh.localToWorld(overlayPoints[i].copy(overlayCorners[i])).project(S.camera);
  if (overlayPoints.some(point => point.z < -1 || point.z > 1)) { appOverlay.classList.remove('visible'); return; }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of overlayPoints) {
    const x = (point.x * .5 + .5) * innerWidth, y = (-point.y * .5 + .5) * innerHeight;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const inset = 2;
  appOverlay.style.left = `${minX + inset}px`; appOverlay.style.top = `${minY + inset}px`;
  appOverlay.style.width = `${Math.max(1, maxX - minX - inset * 2)}px`;
  appOverlay.style.height = `${Math.max(1, maxY - minY - inset * 2)}px`;
  appOverlay.classList.add('visible');
}

function onKey(event) {
  const pc = S.activePC;
  if (S.mode !== 'pc' || !pc || event.key === 'Escape' || pc.state !== 'desktop' || event.ctrlKey || event.metaKey) return;
  const target = pc.app === 'notes' ? 'text' : null;
  if (!target) return;
  if (event.key.length === 1) pc[target] += event.key;
  else if (event.key === 'Backspace') pc[target] = pc[target].slice(0, -1);
  else if (event.key === 'Enter' && target === 'text') pc.text += '\n';
  else return;
  const limit = 600; if (pc[target].length > limit) pc[target] = pc[target].slice(-limit);
  pc.lastKey = S.clock.elapsedTime; sfx.key(); event.preventDefault();
}

function buildPC(i, { x, z, rot }) {
  const g = group(x, z, rot);
  const desk = std({ map: T.wood, color: 0x8a6040, roughness: .5 }), metal = std({ color: 0x2b2b2b, metalness: .6, roughness: .4 });
  mesh(new RoundedBoxGeometry(1.8, .05, .8, 2, .015), desk, [0, .74, 0], { parent: g });
  for (const sx of [-.85, .85]) mesh(new THREE.BoxGeometry(.05, .72, .7), metal, [sx, .36, 0], { parent: g });
  mesh(new THREE.BoxGeometry(.25, .015, .18), metal, [0, .772, -.24], { parent: g });
  mesh(new THREE.BoxGeometry(.04, .3, .03), metal, [0, .92, -.28], { parent: g });
  mesh(new RoundedBoxGeometry(.92, .56, .035, 2, .01), std({ color: 0x15161a, roughness: .4 }), [0, 1.15, -.25], { parent: g });
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const screenMesh = mesh(new THREE.PlaneGeometry(.86, .49), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [0, 1.15, -.231], { parent: g, cast: false, receive: false });
  mesh(new THREE.BoxGeometry(.46, .02, .15), std({ color: 0x2a2d33, roughness: .6 }), [0, .775, .1], { parent: g });
  const rgb = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  mesh(new THREE.BoxGeometry(.46, .004, .004), rgb, [0, .768, .178], { parent: g, cast: false });
  mesh(new THREE.PlaneGeometry(.28, .22), std({ color: 0x2f4a5f, roughness: 1 }), [.36, .766, .1], { parent: g, cast: false }).rotation.x = -Math.PI / 2;
  mesh(new RoundedBoxGeometry(.06, .025, .1, 2, .01), std({ color: 0xdddddd }), [.36, .78, .1], { parent: g });
  mesh(new THREE.BoxGeometry(.2, .42, .42), std({ color: 0x1b1c20, roughness: .4 }), [.7, .975, -.15], { parent: g });
  mesh(new THREE.BoxGeometry(.006, .36, .01), rgb, [.64, .975, .065], { parent: g, cast: false });
  if (i % 2) mesh(new THREE.CylinderGeometry(.04, .035, .1, 12), std({ color: 0xb4623a }), [-.7, .815, .05], { parent: g });
  else mesh(new THREE.CylinderGeometry(.04, .04, .1, 12), std({ color: 0xe8e0d0 }), [-.62, .815, .1], { parent: g });
  const chair = new THREE.Group(); chair.position.set(0, 0, .8); g.add(chair);
  const fabric = std({ color: 0x2f4a5f, roughness: .9 });
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const leg = mesh(new THREE.BoxGeometry(.3, .03, .04), metal, [Math.cos(a) * .15, .06, Math.sin(a) * .15], { parent: chair }); leg.rotation.y = -a; }
  mesh(new THREE.CylinderGeometry(.03, .03, .36, 8), metal, [0, .26, 0], { parent: chair });
  mesh(new RoundedBoxGeometry(.5, .08, .5, 2, .03), fabric, [0, .47, 0], { parent: chair });
  mesh(new RoundedBoxGeometry(.48, .6, .07, 2, .03), fabric, [0, .88, .25], { parent: chair });
  for (const sx of [-.26, .26]) mesh(new THREE.BoxGeometry(.04, .03, .3), metal, [sx, .66, .02], { parent: chair });
  addCollider(x, z, 1.8, .8); g.updateMatrixWorld(true);
  const pos = g.localToWorld(V(0, .46, .78)), f = V(0, 0, -1).applyQuaternion(g.quaternion);
  const seat = { id: `pc-${i + 1}`, pos, yaw: Math.atan2(f.x, f.z), approach: pos.clone().addScaledVector(f, -.8).setY(0) };
  const pc = {
    i, g, canvas, ctx: canvas.getContext('2d'), tex, rgb, screenMesh, seat, state: 'idle', app: 'desktop', t0: 0, acc: rnd(0, .1),
    text: '', lastKey: -9,
    screenPos: g.localToWorld(V(0, 1.15, .15)), camPose: { pos: g.localToWorld(V(0, 1.27, .45)), look: g.localToWorld(V(0, 1.13, -.25)), hideAvatar: true },
    stars: Array.from({ length: 70 }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(.05, 1) })),
    bx: rnd(40, 400), by: rnd(40, 220), vx: rnd(40, 60) * (Math.random() < .5 ? -1 : 1), vy: rnd(30, 45), hue: rnd(0, 360),
  };
  pcs.push(pc);
  addInteractable(g, { verb: 'Use', name: 'the computer', anchor: V(x, 0, z), range: 1.5, approach: () => seat.approach, action: () => usePC(pc) });
}

function usePC(pc) {
  if (S.activePC) return;
  S.player.sit(pc.seat); S.mode = 'pc'; S.activePC = pc; S.camOverride = pc.camPose; S.camChangeT = S.clock.elapsedTime;
  pc.state = 'boot'; pc.app = 'desktop'; pc.t0 = S.clock.elapsedTime; sfx.boot();
  $('seatText').textContent = 'At the computer · click apps on screen · Esc to stand up';
  pc.seat.onLeave = () => {
    pc.state = 'idle'; S.mode = 'walk'; S.activePC = null; S.camOverride = null; S.camChangeT = S.clock.elapsedTime;
    appOverlay?.classList.remove('show', 'visible');
    const frame = appOverlay?.querySelector('iframe');
    if (frame) { frame.src = 'about:blank'; delete frame.dataset.app; }
    S.renderer.domElement.classList.remove('hover'); S.cam.yaw = pc.seat.yaw + Math.PI; S.cam.pitch = -.25;
  };
}

function draw(pc, t, dt) {
  const g = pc.ctx;
  if (pc.state === 'idle') drawIdle(pc, g, dt); else if (pc.state === 'boot') drawBoot(pc, g, t); else drawDesktop(pc, g, t);
  g.drawImage(crt, 0, 0); g.fillStyle = `rgba(255,255,255,${rnd(0, .02)})`; g.fillRect(0, 0, W, H); pc.tex.needsUpdate = true;
}

function drawIdle(pc, g, dt) {
  g.fillStyle = '#03050a'; g.fillRect(0, 0, W, H);
  for (const star of pc.stars) { star.z -= dt * .25; if (star.z <= .05) Object.assign(star, { x: rnd(-1, 1), y: rnd(-1, 1), z: 1 }); const x = W / 2 + star.x / star.z * 90, y = H / 2 + star.y / star.z * 90, r = (1 - star.z) * 2.4; g.fillStyle = `rgba(200,220,255,${1 - star.z})`; g.fillRect(x, y, r, r); }
  pc.bx += pc.vx * dt; pc.by += pc.vy * dt;
  if (pc.bx < 10 || pc.bx > W - 110) { pc.vx *= -1; pc.hue = (pc.hue + 70) % 360; } if (pc.by < 40 || pc.by > H - 10) { pc.vy *= -1; pc.hue = (pc.hue + 70) % 360; }
  pc.bx = Math.min(Math.max(pc.bx, 10), W - 110); pc.by = Math.min(Math.max(pc.by, 40), H - 10);
  g.font = 'bold 40px monospace'; g.fillStyle = `hsl(${pc.hue},80%,65%)`; g.fillText('PVC', pc.bx, pc.by); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, W, H);
}

function drawBoot(pc, g, t) {
  const elapsed = t - pc.t0; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.font = '15px monospace'; g.fillStyle = '#b8c4b8';
  const count = Math.min(BOOT.length, Math.floor(elapsed * 5)); for (let i = 0; i < count; i++) g.fillText(BOOT[i], 20, 30 + i * 20);
  if (elapsed > 1.7) { const k = Math.min(1, (elapsed - 1.7) / 1.1); g.strokeStyle = '#b8c4b8'; g.strokeRect(20, 220, W - 40, 16); g.fillStyle = '#7fd38a'; g.fillRect(23, 223, (W - 46) * k, 10); }
  if (elapsed > 3) { pc.state = 'desktop'; pc.t0 = t; }
}

function desktopBackground(g) {
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2c2f6e'); bg.addColorStop(.7, '#d9865a'); bg.addColorStop(1, '#f2b880'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d2240'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 16) g.lineTo(x, H - 50 - Math.sin(x * .02) * 18 - Math.sin(x * .05) * 6); g.lineTo(W, H); g.fill();
  g.fillStyle = '#fff2b0'; g.fillRect(410, 50, 30, 30);
  apps.forEach((app, i) => drawAppIcon(g, app, 16, 12 + i * 62));
}

function drawAppIcon(g, app, x, y) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
  g.fillStyle = 'rgba(20,22,42,.62)'; g.beginPath(); g.roundRect(x - 3, y - 3, 42, 38, 7); g.fill();
  g.shadowColor = 'transparent'; g.fillStyle = app.color; g.strokeStyle = '#192039'; g.lineWidth = 2;
  if (app.id === 'shops') {
    g.beginPath(); g.roundRect(x + 3, y + 9, 29, 20, 4); g.fill(); g.stroke();
    g.beginPath(); g.arc(x + 17.5, y + 10, 7, Math.PI, 0); g.stroke();
    g.fillStyle = '#192039'; g.fillRect(x + 9, y + 16, 17, 2);
  } else if (app.id === 'map') {
    g.beginPath(); g.moveTo(x + 2, y + 6); g.lineTo(x + 12, y + 3); g.lineTo(x + 23, y + 7); g.lineTo(x + 33, y + 3); g.lineTo(x + 33, y + 27); g.lineTo(x + 23, y + 31); g.lineTo(x + 12, y + 27); g.lineTo(x + 2, y + 31); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#192039'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 12, y + 4); g.lineTo(x + 12, y + 27); g.moveTo(x + 23, y + 7); g.lineTo(x + 23, y + 30); g.stroke();
    g.fillStyle = '#ff5b68'; g.beginPath(); g.arc(x + 23, y + 15, 3, 0, Math.PI * 2); g.fill();
  } else if (app.id === 'notes') {
    g.beginPath(); g.moveTo(x + 5, y + 3); g.lineTo(x + 25, y + 3); g.lineTo(x + 32, y + 10); g.lineTo(x + 32, y + 31); g.lineTo(x + 5, y + 31); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#192039'; for (let i = 0; i < 3; i++) g.fillRect(x + 10, y + 13 + i * 5, 17, 1.5);
  } else {
    g.beginPath(); g.moveTo(x + 2, y + 7); g.quadraticCurveTo(x + 10, y + 3, x + 17, y + 9); g.quadraticCurveTo(x + 25, y + 3, x + 33, y + 7); g.lineTo(x + 33, y + 29); g.quadraticCurveTo(x + 25, y + 25, x + 17, y + 31); g.quadraticCurveTo(x + 10, y + 25, x + 2, y + 29); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#192039'; g.beginPath(); g.moveTo(x + 17, y + 9); g.lineTo(x + 17, y + 30); g.stroke();
  }
  g.fillStyle = '#fff'; g.font = '600 10px sans-serif'; g.textAlign = 'center'; g.fillText(app.name, x + 17, y + 44); g.textAlign = 'left'; g.restore();
}

function appWindow(g, title, color) {
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(99, 29, 397, 229); g.fillStyle = '#f6ead7'; g.fillRect(94, 24, 397, 229);
  g.fillStyle = color; g.fillRect(94, 24, 397, 24); g.fillStyle = '#fff8ee'; g.font = 'bold 13px sans-serif'; g.fillText(title, 104, 41);
  g.fillStyle = '#e74b67'; g.beginPath(); g.arc(476, 36, 7, 0, Math.PI * 2); g.fill();
}

function drawDesktop(pc, g, t) {
  desktopBackground(g);
  if (pc.app === 'notes') drawNotes(pc, g, t);
  else {
    const app = apps.find(item => item.id === pc.app);
    if (app?.url) drawPortal(g, app);
  }
  g.fillStyle = 'rgba(26,17,11,.92)'; g.fillRect(0, H - 24, W, 24); g.fillStyle = '#c9782f'; g.fillRect(4, H - 20, 64, 16);
  g.fillStyle = '#fff8ee'; g.font = 'bold 11px sans-serif'; g.fillText('◉ PVC OS', 10, H - 8); g.font = '12px sans-serif'; g.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), W - 52, H - 8);
}

function wrap(text, length) { const out = []; for (const para of text.split('\n')) { if (!para.length) out.push(''); for (let i = 0; i < para.length; i += length) out.push(para.slice(i, i + length)); } return out; }
function drawNotes(pc, g, t) {
  appWindow(g, `notes.txt — ${S.nick}`, '#3d2a1d'); g.font = '13px monospace'; g.fillStyle = '#2b1d14';
  const lines = [`Welcome, ${S.nick}!`, 'Shop, Map and Wiki open inside PVC OS.', '──────────────────────────────────────', ...wrap(pc.text, 42)].slice(-12);
  lines.forEach((line, i) => g.fillText(line, 106, 70 + i * 15)); const last = lines.at(-1) || '';
  if ((t * 2) % 2 < 1 || t - pc.lastKey < .5) g.fillRect(106 + g.measureText(last).width + 1, 59 + (lines.length - 1) * 15, 7, 13);
}

function drawPortal(g, app) {
  appWindow(g, `${app.name.toUpperCase()} · opening inside PVC OS`, '#28354f');
  g.fillStyle = '#111827'; g.fillRect(104, 56, 374, 176);
  g.strokeStyle = app.color; g.lineWidth = 2; g.beginPath(); g.arc(291, 137, 24, -.6, Math.PI * 1.55); g.stroke();
  g.fillStyle = app.color; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText(`Loading ${app.name}…`, 291, 184); g.textAlign = 'left';
}

export function setCinematicComputers() {
  const presets = [
    { app: 'notes', text: 'Reviewing PVC market telemetry…' },
    { app: 'desktop', text: '' },
    { app: 'notes', text: 'Cinematic capture node online.' },
  ];
  pcs.slice(0, 3).forEach((pc, index) => {
    pc.state = 'desktop'; pc.app = presets[index].app; pc.text = presets[index].text;
    pc.t0 = S.clock.elapsedTime; pc.acc = 1;
  });
}
