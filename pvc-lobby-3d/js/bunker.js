// Hidden bunker room, synchronized blast door, keypad and orbital terminal.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { S } from './core.js';
import { ROOM } from './config.js';
import { $, V, animate, addCollider, canvasTex, mesh, std } from './util.js';
import { addInteractable } from './interact.js';
import { sfx } from './audio.js';

const BX = -8, ENTRANCE_Z = ROOM.d / 2, BW = 5.6, BD = 8;
let door, doorCollider, doorTimer, doorRun = 0, terminalCanvas, terminalTexture, terminalAcc = 0;
let orbitalUntil = 0, lastOrbitalAt = 0, alarmLight;
let keypadCode = '';

export function buildBunker() {
  const steel = std({ color: 0x3b4946, metalness: .46, roughness: .42, emissive: 0x07130f, emissiveIntensity: .32 });
  const darkSteel = std({ color: 0x202b28, metalness: .55, roughness: .36, emissive: 0x06100d, emissiveIntensity: .28 });
  const floorMat = std({ map: bunkerFloorTexture(), color: 0x6f7770, metalness: .45, roughness: .62 });
  // Keep the bunker shell away from the lobby wall plane; sharing z=ENTRANCE_Z made its edges flicker through the plaster.
  const shellInset = .32, shellDepth = BD - shellInset, shellZ = ENTRANCE_Z + shellInset + shellDepth / 2;

  const floor = mesh(new THREE.PlaneGeometry(BW, BD), floorMat, [BX, .012, ENTRANCE_Z + BD / 2], { cast: false });
  floor.rotation.x = -Math.PI / 2; floor.userData.walkable = true;
  mesh(new THREE.BoxGeometry(BW, .16, shellDepth), darkSteel, [BX, ROOM.h - .08, shellZ], { cast: false });
  const left = mesh(new THREE.BoxGeometry(.18, ROOM.h, shellDepth), steel, [BX - BW / 2, ROOM.h / 2, shellZ]);
  const right = mesh(new THREE.BoxGeometry(.18, ROOM.h, shellDepth), steel, [BX + BW / 2, ROOM.h / 2, shellZ]);
  const far = mesh(new THREE.BoxGeometry(BW, ROOM.h, .18), steel, [BX, ROOM.h / 2, ENTRANCE_Z + BD]);
  S.camBlockers.push(left, right, far);

  // The pieces around the opening stop players walking through the solid wall.
  // Sit behind the lobby wall instead of almost coplanar with it.
  mesh(new THREE.BoxGeometry(1.55, ROOM.h, .16), steel, [BX - 2.025, ROOM.h / 2, ENTRANCE_Z + .14], { cast: false });
  mesh(new THREE.BoxGeometry(1.55, ROOM.h, .16), steel, [BX + 2.025, ROOM.h / 2, ENTRANCE_Z + .14], { cast: false });
  addCollider(BX - 2.025, ENTRANCE_Z, 1.55, .28); addCollider(BX + 2.025, ENTRANCE_Z, 1.55, .28);

  const frame = std({ color: 0x465252, metalness: .82, roughness: .24 });
  mesh(new THREE.BoxGeometry(2.72, .18, .28), frame, [BX, 2.98, ENTRANCE_Z - .07]);
  mesh(new THREE.BoxGeometry(.18, 3.0, .28), frame, [BX - 1.34, 1.5, ENTRANCE_Z - .07]);
  mesh(new THREE.BoxGeometry(.18, 3.0, .28), frame, [BX + 1.34, 1.5, ENTRANCE_Z - .07]);

  const doorMat = std({ map: bunkerDoorTexture(), color: 0xffffff, metalness: .7, roughness: .32, emissive: 0x14251e, emissiveIntensity: .18 });
  // The slab is recessed behind the frame so their front faces never overlap while the camera moves.
  door = mesh(new RoundedBoxGeometry(2.42, 2.76, .18, 2, .035), doorMat, [BX, 1.4, ENTRANCE_Z - .02]);
  doorCollider = addCollider(BX, ENTRANCE_Z - .02, 2.48, .34);

  buildKeypad(steel);
  buildTerminal(steel, darkSteel);

  const greenLight = new THREE.PointLight(0x45ff9a, 4.2, 9, 1.7); greenLight.position.set(BX, 2.5, ENTRANCE_Z + 5.8); S.scene.add(greenLight);
  const fillLight = new THREE.PointLight(0xc7e0d5, 3.2, 10, 1.8); fillLight.position.set(BX, 3.0, ENTRANCE_Z + 2.6); S.scene.add(fillLight);
  alarmLight = new THREE.PointLight(0xff1e32, 0, 9, 2); alarmLight.position.set(BX, 3.1, ENTRANCE_Z + 3.5); S.scene.add(alarmLight);
  for (const x of [BX - 2.35, BX + 2.35]) {
    const strip = mesh(new THREE.BoxGeometry(.07, .05, BD - .7), new THREE.MeshBasicMaterial({ color: 0x3eff91 }), [x, 3.72, ENTRANCE_Z + BD / 2], { cast: false });
    strip.material.toneMapped = false;
  }

  wireBunkerUI();
  S.onFrame((dt, t) => {
    terminalAcc += dt;
    if (terminalAcc > .08) { drawTerminal(t); terminalAcc = 0; }
    const active = performance.now() < orbitalUntil;
    alarmLight.intensity += ((active ? 5 + Math.sin(t * 13) * 3 : 0) - alarmLight.intensity) * Math.min(1, dt * 10);
  });
  S.bunker = { openDoor, onOrbital };
}

function bunkerFloorTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#202827'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#53605c'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
    for (let y = 20; y < h; y += 28) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); }
    for (let x = 18; x < w; x += 36) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, h - 8); g.stroke(); }
  }, [2, 3]);
}

function bunkerDoorTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1b2524'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#53605c'; g.lineWidth = 14; g.strokeRect(18, 18, w - 36, h - 36);
    g.strokeStyle = '#0b1111'; g.lineWidth = 6; g.strokeRect(45, 45, w - 90, h - 90);
    g.fillStyle = '#93a39d'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.fillText('PVC // B-07', w / 2, 100);
    g.fillStyle = '#ffca43'; g.font = 'bold 20px monospace'; g.fillText('AUTHORIZED PERSONNEL', w / 2, 137);
    g.save(); g.beginPath(); g.rect(48, h - 116, w - 96, 55); g.clip();
    g.fillStyle = '#e6b72f'; g.fillRect(0, h - 116, w, 55); g.strokeStyle = '#151515'; g.lineWidth = 28;
    for (let x = -80; x < w + 80; x += 66) { g.beginPath(); g.moveTo(x, h - 55); g.lineTo(x + 75, h - 130); g.stroke(); }
    g.restore();
    for (const x of [72, w - 72]) for (const y of [72, h - 72]) { g.fillStyle = '#82908a'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
  });
}

function buildKeypad(steel) {
  const panel = new THREE.Group(); panel.position.set(BX + 1.68, 1.42, ENTRANCE_Z - .15); S.scene.add(panel);
  mesh(new RoundedBoxGeometry(.48, .78, .13, 2, .025), steel, [0, 0, 0], { parent: panel });
  const faceTex = canvasTex(256, 384, g => {
    g.fillStyle = '#0a100e'; g.fillRect(0, 0, 256, 384); g.strokeStyle = '#52625c'; g.lineWidth = 8; g.strokeRect(8, 8, 240, 368);
    g.fillStyle = '#5aff9c'; g.font = 'bold 24px monospace'; g.fillText('ACCESS', 72, 53);
    g.fillStyle = '#183328'; g.fillRect(28, 78, 200, 54); g.fillStyle = '#8dffb8'; g.font = 'bold 34px monospace'; g.fillText('••••', 74, 117);
    g.font = 'bold 42px monospace'; g.textAlign = 'center';
    for (let i = 0; i < 12; i++) { const x = 62 + i % 3 * 66, y = 185 + Math.floor(i / 3) * 56; g.fillStyle = '#1b2925'; g.fillRect(x - 23, y - 33, 46, 42); g.fillStyle = '#d7e5df'; g.fillText(i < 9 ? String(i + 1) : i === 10 ? '0' : '·', x, y); }
  });
  const face = mesh(new THREE.PlaneGeometry(.4, .68), new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false, side: THREE.DoubleSide }), [0, 0, -.071], { parent: panel, cast: false });
  face.rotation.y = Math.PI;
  const led = mesh(new THREE.SphereGeometry(.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff334f }), [.16, .32, -.085], { parent: panel, cast: false });
  addInteractable([panel, face], { verb: 'Enter code on', name: 'the bunker keypad', anchor: V(BX + 1.68, 0, ENTRANCE_Z - .5), range: 1.7, action: openKeypad });
  S.bunkerLed = led;
}

function buildTerminal(steel, darkSteel) {
  const z = ENTRANCE_Z + BD - .7;
  mesh(new THREE.BoxGeometry(3.5, .12, 1.1), steel, [BX, .84, z]);
  for (const x of [BX - 1.55, BX + 1.55]) mesh(new THREE.BoxGeometry(.12, .84, .9), darkSteel, [x, .42, z]);
  mesh(new THREE.BoxGeometry(.8, .95, .75), darkSteel, [BX + 1.25, 1.35, z + .05]);
  terminalCanvas = document.createElement('canvas'); terminalCanvas.width = 768; terminalCanvas.height = 432;
  terminalTexture = new THREE.CanvasTexture(terminalCanvas); terminalTexture.colorSpace = THREE.SRGBColorSpace;
  mesh(new RoundedBoxGeometry(1.7, 1.05, .09, 2, .025), darkSteel, [BX, 1.65, z - .05]);
  const screen = mesh(new THREE.PlaneGeometry(1.55, .87), new THREE.MeshBasicMaterial({ map: terminalTexture, toneMapped: false, side: THREE.DoubleSide }), [BX, 1.65, z - .105], { cast: false });
  screen.rotation.y = Math.PI;
  const keyboard = mesh(new THREE.BoxGeometry(1.25, .05, .42), darkSteel, [BX, .94, z - .28]); keyboard.rotation.x = -.08;
  addCollider(BX, z, 3.6, 1.15);
  addInteractable([screen, keyboard], { verb: 'Access', name: 'the orbital terminal', anchor: V(BX, 0, z - .6), range: 1.8, action: openTerminal });
  drawTerminal(0);
}

function drawTerminal(t) {
  if (!terminalCanvas) return;
  const g = terminalCanvas.getContext('2d'), active = performance.now() < orbitalUntil;
  g.fillStyle = active ? '#180407' : '#020907'; g.fillRect(0, 0, 768, 432);
  g.strokeStyle = active ? 'rgba(255,45,65,.18)' : 'rgba(64,255,146,.12)'; g.lineWidth = 1;
  for (let y = 0; y < 432; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(768, y); g.stroke(); }
  g.fillStyle = active ? '#ff4257' : '#48ff98'; g.font = 'bold 26px monospace'; g.fillText('PVC ORBITAL DEFENSE NETWORK', 28, 42);
  g.font = '16px monospace'; g.fillText(active ? 'STATUS // CANNON ACTIVE' : 'STATUS // STANDBY', 30, 78);
  g.strokeStyle = active ? '#ff4257' : '#48ff98'; g.lineWidth = 3; g.beginPath(); g.arc(570, 220, 128, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = .3; for (const r of [42, 84]) { g.beginPath(); g.arc(570, 220, r, 0, 7); g.stroke(); } g.globalAlpha = 1;
  const a = t * 1.5; g.beginPath(); g.moveTo(570, 220); g.lineTo(570 + Math.cos(a) * 128, 220 + Math.sin(a) * 128); g.stroke();
  g.font = '15px monospace'; const lines = active ? ['UPLINK LOCKED', 'TARGET SOLUTION ACCEPTED', 'ENERGY DISCHARGE: 100%', '', 'ALL LOBBY CLIENTS NOTIFIED'] : ['UPLINK: SECURE', 'PLATFORM: HIGH ORBIT', 'AUTHORIZATION: REQUIRED', '', '> CLICK TERMINAL TO CONTINUE'];
  lines.forEach((line, i) => g.fillText(line, 30, 132 + i * 34));
  terminalTexture.needsUpdate = true;
}

function wireBunkerUI() {
  const keypad = $('keypadOverlay'), display = $('keypadDisplay');
  const paint = () => { display.textContent = keypadCode.padEnd(4, '•'); };
  keypad.querySelectorAll('[data-digit]').forEach(button => button.onclick = () => pushDigit(button.dataset.digit));
  $('keypadClear').onclick = () => { keypadCode = ''; keypad.classList.remove('denied', 'granted'); paint(); sfx.click(); };
  $('keypadClose').onclick = closeKeypad;
  function pushDigit(digit) {
    if (keypadCode.length >= 4) return; keypadCode += digit; paint(); sfx.key();
    if (keypadCode.length !== 4) return;
    if (keypadCode === '0070') {
      keypad.classList.add('granted'); S.bunkerLed?.material.color.setHex(0x46ff92); sfx.access(true);
      const until = Date.now() + 2500; openDoor(until); S.multiplayer?.openBunker(); setTimeout(closeKeypad, 650);
    } else {
      keypad.classList.add('denied'); sfx.access(false);
      setTimeout(() => { keypadCode = ''; keypad.classList.remove('denied'); paint(); }, 700);
    }
  }
  addEventListener('keydown', event => {
    if (S.mode === 'keypad') {
      if (/^\d$/.test(event.key)) pushDigit(event.key);
      else if (event.key === 'Backspace') { keypadCode = keypadCode.slice(0, -1); paint(); }
      else if (event.key === 'Escape') closeKeypad();
    } else if (S.mode === 'terminal' && event.key === 'Escape') closeTerminal();
  });

  $('terminalClose').onclick = closeTerminal;
  $('orbitalActivate').onclick = () => {
    const button = $('orbitalActivate'), log = $('terminalLog'); if (button.disabled) return;
    button.disabled = true; log.textContent = 'VERIFYING COMMAND AUTHORITY…'; sfx.access(true);
    setTimeout(() => {
      log.textContent = 'COMMAND ACCEPTED // BROADCASTING TO PVC HUB';
      S.multiplayer?.activateOrbital(); onOrbital({ name: S.nick, ts: Date.now() });
      setTimeout(() => { button.disabled = false; closeTerminal(); }, 1400);
    }, 800);
  };
}

function openKeypad() {
  if (S.player.state === 'sit') S.player.stand();
  keypadCode = ''; S.mode = 'keypad'; $('keypadOverlay').classList.add('open'); $('keypadDisplay').textContent = '••••';
}
function closeKeypad() { $('keypadOverlay').classList.remove('open', 'denied', 'granted'); if (S.mode === 'keypad') S.mode = 'walk'; }
function openTerminal() { S.mode = 'terminal'; $('terminalOverlay').classList.add('open'); $('terminalLog').textContent = 'AWAITING AUTHORIZED COMMAND'; }
function closeTerminal() { $('terminalOverlay').classList.remove('open'); if (S.mode === 'terminal') S.mode = 'walk'; }

function openDoor(until = Date.now() + 2500) {
  clearTimeout(doorTimer); const run = ++doorRun, wasClosed = Math.abs(door.position.x - BX) < .1;
  Object.assign(doorCollider, { minX: 9999, maxX: 10000, minZ: 9999, maxZ: 10000 });
  const start = door.position.x, target = BX - 2.62;
  if (wasClosed) sfx.bunkerDoor(true);
  animate(.48, k => { if (run === doorRun) door.position.x = start + (target - start) * (1 - Math.pow(1 - k, 3)); });
  doorTimer = setTimeout(() => closeDoor(run), Math.max(600, until - Date.now()));
}
function closeDoor(run) {
  if (run !== doorRun) return; const start = door.position.x; sfx.bunkerDoor(false);
  animate(.5, k => { if (run === doorRun) door.position.x = start + (BX - start) * (k * k * (3 - 2 * k)); }, () => {
    if (run !== doorRun) return;
    const player = S.player?.pos;
    if (player && Math.abs(player.x - BX) < 1.35 && Math.abs(player.z - ENTRANCE_Z) < .5) player.z = player.z >= ENTRANCE_Z ? ENTRANCE_Z + .55 : ENTRANCE_Z - .55;
    Object.assign(doorCollider, { minX: BX - 1.24, maxX: BX + 1.24, minZ: ENTRANCE_Z - .19, maxZ: ENTRANCE_Z + .15 });
    S.bunkerLed?.material.color.setHex(0xff334f);
  });
}

function onOrbital(message = {}) {
  const now = performance.now(); if (now - lastOrbitalAt < 500) return; lastOrbitalAt = now;
  orbitalUntil = now + 5200; const alert = $('orbitalAlert');
  $('orbitalBy').textContent = message.name ? `AUTHORIZED BY ${message.name}` : 'PVC DEFENSE NETWORK';
  alert.classList.remove('show'); void alert.offsetWidth; alert.classList.add('show'); sfx.orbital();
  clearTimeout(onOrbital.timer); onOrbital.timer = setTimeout(() => alert.classList.remove('show'), 5200);
}
