// Furniture and decor, most of it interactive.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { S } from './core.js';
import { ROOM } from './config.js';
import { V, rnd, pickOne, std, mesh, group, addCollider, addRotCollider, toast, softDot, glyphTex, animate, spawnFloaters, noRaycast } from './util.js';
import { T, BOOK_COLORS } from './textures.js';
import { R } from './room.js';
import { addInteractable } from './interact.js';
import { audioFX, sfx } from './audio.js';
import { openWiki } from './wiki.js';

const RW = ROOM.w, RD = ROOM.d;
const heartTex = glyphTex('❤', '#ff6b81', 48);
const noteTexs = ['♪', '♫', '♬'].map(c => glyphTex(c));
const sparkTex = softDot;
const bookGeometry = new THREE.BoxGeometry(1, 1, 1);
const bookMaterials = BOOK_COLORS.map(color => std({ color }));
const bookDummy = new THREE.Object3D();
let seatSerial = 0;

/* =========================================================
   Seats: every seat is { pos (hip point), yaw (facing), approach (where you stand up) }
   Furniture "front" is local -z.
   ========================================================= */
function makeSeat(g, lx, ly, lz, ad = .8) {
  g.updateMatrixWorld(true);
  const pos = g.localToWorld(V(lx, ly, lz));
  const f = V(0, 0, -1).applyQuaternion(g.quaternion);
  const approach = pos.clone().addScaledVector(f, ad); approach.y = 0;
  return { id: `seat-${++seatSerial}`, pos, yaw: Math.atan2(f.x, f.z), approach };
}
const nearestSeat = seats => seats.reduce((b, s) => s.pos.distanceToSquared(S.player.pos) < b.pos.distanceToSquared(S.player.pos) ? s : b);
function seatable(objects, name, seats, center, range = 1.6) {
  return addInteractable(objects, {
    verb: 'Sit on', name, anchor: center, range,
    approach: () => nearestSeat(seats).approach,
    action: () => S.player.sit(nearestSeat(seats)),
  });
}

function sofa(x, z, rot, color, seats = 3) {
  const g = group(x, z, rot);
  const fab = std({ color, roughness: .95 });
  const W = seats * .7 + .4;
  mesh(new RoundedBoxGeometry(W, .3, .9, 3, .06), fab, [0, .28, 0], { parent: g });
  mesh(new RoundedBoxGeometry(W, .55, .22, 3, .08), fab, [0, .65, .36], { parent: g });
  mesh(new RoundedBoxGeometry(.2, .5, .9, 3, .08), fab, [-W / 2 + .1, .45, 0], { parent: g });
  mesh(new RoundedBoxGeometry(.2, .5, .9, 3, .08), fab, [W / 2 - .1, .45, 0], { parent: g });
  for (let i = 0; i < seats; i++) mesh(new RoundedBoxGeometry(.68, .14, .66, 3, .06), fab, [-W / 2 + .2 + .35 + i * .7, .49, -.06], { parent: g });
  const p1 = mesh(new RoundedBoxGeometry(.38, .34, .12, 3, .06), std({ color: 0xe9cfa3 }), [-W / 2 + .45, .72, .2], { parent: g }); p1.rotation.z = .2;
  const p2 = mesh(new RoundedBoxGeometry(.38, .34, .12, 3, .06), std({ color: 0x2f4a3f }), [W / 2 - .45, .72, .2], { parent: g }); p2.rotation.z = -.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(.03, .02, .12, 6), R.trim, [sx * (W / 2 - .1), .06, sz * .38], { parent: g });
  addRotCollider(x, z, W, 1, rot);
  const list = []; for (let i = 0; i < seats; i++) list.push(makeSeat(g, -W / 2 + .55 + i * .7, .56, -.02));
  seatable(g, seats === 1 ? 'armchair' : 'sofa', list, V(x, 0, z), W / 2 + .9);
  return g;
}

function beanbag(x, z, rot, color) {
  const g = group(x, z, rot), mat = std({ color, roughness: 1 });
  mesh(new THREE.SphereGeometry(.5, 20, 14), mat, [0, .26, 0], { parent: g }).scale.set(1, .52, 1);
  mesh(new THREE.SphereGeometry(.42, 20, 14), mat, [0, .45, .26], { parent: g }).scale.set(1, .8, .55);
  addCollider(x, z, .85, .85);
  seatable(g, 'bean bag', [makeSeat(g, 0, .36, -.05, .85)], V(x, 0, z), 1.4);
}

function chair(x, z, rot, wood = 0x7a5232) {
  const g = group(x, z, rot), m = std({ map: T.wood, color: wood });
  mesh(new THREE.BoxGeometry(.46, .05, .46), m, [0, .47, 0], { parent: g });
  mesh(new THREE.BoxGeometry(.46, .5, .05), m, [0, .74, .21], { parent: g });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(.04, .47, .04), m, [sx * .2, .235, sz * .2], { parent: g });
  mesh(new RoundedBoxGeometry(.4, .05, .4, 2, .02), std({ color: 0xc8843a }), [0, .51, 0], { parent: g });
  seatable(g, 'chair', [makeSeat(g, 0, .53, 0, .7)], V(x, 0, z), 1.2);
}

function stool(x, z, rot) {
  const g = group(x, z, rot);
  mesh(new THREE.CylinderGeometry(.2, .2, .06, 18), std({ color: 0x6f8f72 }), [0, .74, 0], { parent: g });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .78, l = mesh(new THREE.CylinderGeometry(.018, .018, .75, 6), std({ color: 0x2b2b2b, metalness: .6 }), [Math.cos(a) * .13, .37, Math.sin(a) * .13], { parent: g }); l.rotation.set(Math.sin(a) * .12, 0, -Math.cos(a) * .12); }
  mesh(new THREE.TorusGeometry(.14, .012, 6, 18), std({ color: 0x2b2b2b, metalness: .6 }), [0, .3, 0], { parent: g }).rotation.x = Math.PI / 2;
  seatable(g, 'stool', [makeSeat(g, 0, .78, 0, .6)], V(x, 0, z), 1.1);
}

/* =========================================================
   Lamps, plants, shelves
   ========================================================= */
function floorLamp(x, z, color = 0xffb067) {
  const g = group(x, z);
  mesh(new THREE.CylinderGeometry(.16, .18, .04, 20), R.trim, [0, .02, 0], { parent: g });
  mesh(new THREE.CylinderGeometry(.015, .015, 1.55, 8), std({ color: 0xc9a46a, metalness: .6, roughness: .35 }), [0, .8, 0], { parent: g });
  const shadeMat = std({ color: 0xf6dfb5, emissive: 0xffb45a, emissiveIntensity: .9, side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(.18, .28, .32, 24, 1, true), shadeMat, [0, 1.62, 0], { parent: g, cast: false });
  const L = new THREE.PointLight(color, 2.4, 7, 1.8); L.position.set(x, 1.55, z); S.scene.add(L);
  addCollider(x, z, .4, .4);
  let on = true;
  addInteractable(g, {
    verb: () => on ? 'Turn off' : 'Turn on', name: 'lamp', anchor: V(x, 0, z), range: 1.4,
    action: () => { on = !on; L.visible = on; shadeMat.emissiveIntensity = on ? .9 : .05; sfx.switch(); },
  });
}
export function pendant(x, z, y = ROOM.h - .9, intensity = 2, withLight = true) {
  mesh(new THREE.CylinderGeometry(.006, .006, ROOM.h - y, 4), std({ color: 0x222222 }), [x, y + (ROOM.h - y) / 2, z], { cast: false });
  mesh(new THREE.ConeGeometry(.28, .26, 20, 1, true), std({ color: 0x2f4a3f, side: THREE.DoubleSide, emissive: 0xffb45a, emissiveIntensity: .12 }), [x, y, z], { cast: false });
  mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), [x, y - .1, z], { cast: false });
  if (!withLight) return;
  const L = new THREE.PointLight(0xffc68a, intensity, 8, 1.6); L.position.set(x, y - .2, z); S.scene.add(L);
}

function plant(x, z, s = 1) {
  const g = group(x, z);
  mesh(new THREE.CylinderGeometry(.2 * s, .15 * s, .4 * s, 14), std({ color: 0xb4623a }), [0, .2 * s, 0], { parent: g });
  const leaves = new THREE.Group(); g.add(leaves);
  const leafMat = std({ color: 0x4f7d3f, flatShading: true, roughness: .7 });
  for (let i = 0; i < 9; i++) {
    const l = mesh(new THREE.IcosahedronGeometry(.18 * s, 0), leafMat, [rnd(-.18, .18) * s, (.55 + rnd(0, .7)) * s, rnd(-.18, .18) * s], { parent: leaves });
    l.scale.set(1, rnd(1.2, 1.9), .45); l.rotation.set(rnd(-.6, .6), rnd(0, 6), rnd(-.6, .6));
  }
  addCollider(x, z, .5 * s, .5 * s);
  addInteractable(g, {
    verb: 'Water', name: 'the plant', anchor: V(x, 0, z), range: 1.3,
    action: () => {
      sfx.water(); toast('🌱 The plant looks happier.');
      spawnFloaters(glyphTex('💧', '#7fc8ff', 44), V(x, 1.2 * s, z), 4, { rise: -.5, size: .1 });
      animate(.8, k => { const b = 1 + Math.sin(k * Math.PI * 3) * .08 * (1 - k); leaves.scale.set(b, 1 + (b - 1) * 2, b); });
    },
  });
}

function bookshelf(x, z, rot = 0) {
  const g = group(x, z, rot), m = std({ map: T.wood, color: 0x8a5d3b });
  mesh(new THREE.BoxGeometry(2, 2.6, .05), m, [0, 1.3, -.2], { parent: g });
  for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(.06, 2.6, .42), m, [sx * .97, 1.3, 0], { parent: g });
  const bookData = BOOK_COLORS.map(() => []), books = [];
  for (let i = 0; i < 6; i++) {
    const y = .05 + i * .51;
    mesh(new THREE.BoxGeometry(1.95, .04, .42), m, [0, y, 0], { parent: g });
    if (i === 5) continue;
    let bx = -.9;
    while (bx < .85) {
      const bw = rnd(.04, .08), bh = rnd(.28, .42);
      if (Math.random() < .08) { bx += .12; continue; }
      const color = Math.floor(Math.random() * BOOK_COLORS.length);
      bookData[color].push({ x: bx + bw / 2, y: y + .02 + bh / 2, z: .02, w: bw, h: bh, d: rnd(.24, .3), rot: Math.random() < .06 ? .25 : 0 });
      bx += bw + .005;
    }
  }
  const placeBook = (book, offset = 0) => {
    bookDummy.position.set(book.x, book.y, book.z + offset); bookDummy.rotation.set(0, 0, book.rot); bookDummy.scale.set(book.w, book.h, book.d); bookDummy.updateMatrix();
    book.batch.setMatrixAt(book.index, bookDummy.matrix); book.batch.instanceMatrix.needsUpdate = true;
  };
  bookData.forEach((entries, color) => {
    if (!entries.length) return;
    const batch = new THREE.InstancedMesh(bookGeometry, bookMaterials[color], entries.length); batch.castShadow = false; batch.receiveShadow = true; g.add(batch);
    entries.forEach((book, index) => { book.batch = batch; book.index = index; placeBook(book); books.push(book); });
    batch.computeBoundingSphere();
  });
  // a little globe on top
  mesh(new THREE.SphereGeometry(.14, 16, 12), std({ color: 0x3d7aa8, roughness: .5 }), [-.6, 2.82, 0], { parent: g });
  addRotCollider(x, z, 2.1, .6, rot);
  g.updateMatrixWorld(true);
  const anchor = g.localToWorld(V(0, 0, .3)); anchor.y = 0;
  addInteractable(g, {
    verb: 'Open', name: 'PVC Wiki', anchor, range: 1.6,
    action: () => {
      const b = pickOne(books);
      sfx.page();
      animate(.35, k => placeBook(b, k * .18), () => setTimeout(() => animate(.35, k => placeBook(b, .18 * (1 - k))), 2200));
      openWiki();
    },
  });
}

export function rug(tex, x, z, w, d, rot = 0) {
  const r = mesh(new THREE.PlaneGeometry(w, d), std({ map: tex, roughness: 1 }), [x, .006, z], { cast: false });
  r.rotation.set(-Math.PI / 2, 0, rot); r.userData.walkable = true;
}

/* =========================================================
   Lounge: sofa, coffee table + mug, radio
   ========================================================= */
function lounge() {
  const cx = -5, cz = -4.6;
  rug(T.rugWarm, cx, -6, 6, 3.8);
  sofa(cx, cz, 0, 0xb5643c, 3);
  mesh(new RoundedBoxGeometry(.5, .04, .8, 2, .02), std({ color: 0xe0c27a, roughness: 1 }), [cx + .85, .58, cz - .05]).rotation.y = .2;

  const tw = std({ map: T.wood, color: 0xa4764f, roughness: .55 });
  const tz = -6.3;
  mesh(new RoundedBoxGeometry(1.5, .07, .75, 2, .03), tw, [cx, .42, tz]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(.06, .4, .06), tw, [cx + sx * .66, .2, tz + sz * .3]);
  addCollider(cx, tz, 1.5, .75);
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(.32, .04, .22), std({ color: BOOK_COLORS[i * 2] }), [cx - .3, .475 + i * .04, tz]).rotation.y = rnd(-.2, .2);
  // mug with steam
  const mug = new THREE.Group(); mug.position.set(cx + .35, .51, tz - .05); S.scene.add(mug);
  mesh(new THREE.CylinderGeometry(.05, .045, .11, 16), std({ color: 0xe8e0d0, roughness: .4 }), [0, 0, 0], { parent: mug });
  mesh(new THREE.TorusGeometry(.03, .008, 6, 12), std({ color: 0xe8e0d0 }), [.055, 0, 0], { parent: mug });
  mesh(new THREE.CircleGeometry(.043, 16), std({ color: 0x3a2112 }), [0, .05, 0], { parent: mug }).rotation.x = -Math.PI / 2;
  const steam = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0 })); s.userData.t = i / 6; S.scene.add(s); steam.push(s); }
  let steamBoost = 0;
  addInteractable(mug, {
    verb: 'Sip', name: 'the coffee', anchor: V(cx + .35, 0, tz), range: 1.5,
    approach: () => V(cx + .35, 0, tz + .95),
    action: () => { sfx.sip(); steamBoost = 1; toast('☕ Mmm, still warm.'); },
  });
  S.onFrame(dt => {
    steamBoost = Math.max(0, steamBoost - dt * .5);
    for (const s of steam) {
      s.userData.t = (s.userData.t + dt * (.25 + steamBoost * .4)) % 1; const k = s.userData.t;
      s.position.set(mug.position.x + Math.sin(k * 6 + s.userData.t * 9) * .03, .58 + k * .45, mug.position.z);
      s.scale.setScalar(.06 + k * (.14 + steamBoost * .1)); s.material.opacity = Math.sin(k * Math.PI) * (.3 + steamBoost * .4);
    }
  });

  // radio on a side table
  const sx = cx - 2, sz = cz;
  mesh(new THREE.CylinderGeometry(.26, .26, .04, 24), tw, [sx, .56, sz]);
  mesh(new THREE.CylinderGeometry(.03, .03, .54, 8), tw, [sx, .28, sz]);
  mesh(new THREE.CylinderGeometry(.18, .2, .03, 20), tw, [sx, .015, sz]);
  addCollider(sx, sz, .5, .5);
  const radio = new THREE.Group(); radio.position.set(sx, .58, sz); radio.rotation.y = .5; S.scene.add(radio);
  const rw = std({ map: T.wood, color: 0xc48a52, roughness: .45 });
  mesh(new RoundedBoxGeometry(.46, .3, .2, 3, .04), rw, [0, .15, 0], { parent: radio });
  mesh(new THREE.PlaneGeometry(.3, .2), std({ map: T.grille, roughness: 1 }), [-.05, .15, .101], { parent: radio, cast: false });
  const cones = [-.12, .02].map(c => mesh(new THREE.CircleGeometry(.055, 20), std({ color: 0x241811, roughness: .9 }), [c, .15, .103], { parent: radio, cast: false }));
  const radioButtons = [.2, .1].map(ky => {
    const button = mesh(new THREE.CylinderGeometry(.032, .032, .025, 14), std({ color: 0xd8b98a, metalness: .5, roughness: .3 }), [.17, ky, .105], { parent: radio });
    button.rotation.x = Math.PI / 2; return button;
  });
  const led = mesh(new THREE.SphereGeometry(.01, 8, 8), new THREE.MeshBasicMaterial({ color: 0x552211 }), [.17, .045, .102], { parent: radio, cast: false });
  mesh(new THREE.TorusGeometry(.14, .012, 6, 20, Math.PI), std({ color: 0x3a2516, metalness: .3 }), [0, .3, 0], { parent: radio });
  mesh(new THREE.CylinderGeometry(.004, .004, .45, 6), std({ color: 0xcccccc, metalness: .8, roughness: .2 }), [.2, .45, -.05], { parent: radio }).rotation.z = -.4;
  addInteractable(radio, {
    verb: () => audioFX.playing ? 'Pause' : 'Play', name: 'the shared radio', anchor: V(sx, 0, sz), range: 1.8,
    approach: () => V(sx + .25, 0, sz + 1.0),
    action: () => audioFX.toggle(),
  });
  // The lower physical button changes the global station track.
  addInteractable(radioButtons[1], {
    verb: 'Play', name: 'the next radio track', anchor: V(sx, 0, sz), range: 1.8,
    approach: () => V(sx + .25, 0, sz + 1.0),
    action: () => audioFX.next(),
  });
  let noteT = 0;
  S.onFrame(dt => {
    const lvl = audioFX.level();
    cones.forEach((c, i) => c.scale.setScalar(1 + lvl * (i ? .12 : .2)));
    led.material.color.setHex(audioFX.playing ? 0x66ff88 : 0x552211);
    noteT -= dt;
    if (audioFX.playing && noteT <= 0) { noteT = rnd(.7, 1.3); spawnFloaters(pickOne(noteTexs), V(sx, 1.0, sz), 1, { rise: .9, size: .12, dur: 2 }); }
  });

  floorLamp(cx + 1.9, cz + .3);
}

/* =========================================================
   Fireplace corner with armchairs and a sleepy cat
   ========================================================= */
function fireplaceCorner() {
  const fx = -RW / 2 + .45, fz = -1;
  const stone = std({ map: T.stone, roughness: .95 });
  mesh(new THREE.BoxGeometry(.9, 1.3, 2.4), stone, [fx, .65, fz]);
  mesh(new THREE.BoxGeometry(.6, ROOM.h - 1.3, 1.5), stone, [-RW / 2 + .3, 1.3 + (ROOM.h - 1.3) / 2, fz]);
  mesh(new THREE.BoxGeometry(1.1, .12, 2.7), std({ map: T.wood, color: 0x7a4a2a }), [fx + .08, 1.36, fz]);
  mesh(new THREE.BoxGeometry(.5, .8, 1.3), std({ color: 0x120a06, roughness: 1 }), [fx + .21, .5, fz], { cast: false });
  addCollider(fx, fz, 1.0, 2.6);
  for (let i = 0; i < 3; i++) {
    const l = mesh(new THREE.CylinderGeometry(.06, .07, .9, 8), std({ color: 0x4a2c18 }), [fx + .5, .2 + (i === 2 ? .1 : 0), fz - .12 + i * .12]);
    l.rotation.x = Math.PI / 2; l.rotation.z = i === 2 ? .3 : 0;
  }
  for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(.035, .035, rnd(.12, .22), 12), std({ color: 0xf3e6cf, emissive: 0xffb060, emissiveIntensity: .25 }), [fx + .1, 1.48, fz - .9 + i * .12]);
  mesh(new THREE.BoxGeometry(.06, .4, .3), std({ color: 0x5f7d5c }), [fx + .1, 1.62, fz + .7]);

  const flames = [], cols = [0xff5a1a, 0xff8c2a, 0xffc04a];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(.07, .12), rnd(.3, .5), 8, 1, true),
      new THREE.MeshBasicMaterial({ color: cols[i % 3], transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(fx + .5, .45, fz + rnd(-.35, .35)); m.userData.ph = rnd(0, 10); m.userData.base = m.position.y;
    S.scene.add(m); flames.push(m);
  }
  const light = new THREE.PointLight(0xff8a3a, 4.5, 11, 1.5);
  light.position.set(fx + 1.0, .7, fz); light.castShadow = true;
  light.shadow.mapSize.set(S.quality.lowPower ? 256 : 512, S.quality.lowPower ? 256 : 512); light.shadow.bias = -.002; light.shadow.radius = 6;
  S.scene.add(light);
  let boost = 0;
  addInteractable(flames.concat([]), { verb: 'Stoke', name: 'the fire', anchor: V(fx + .5, 0, fz), range: 1.9, action: stoke });
  const hearth = mesh(new THREE.BoxGeometry(.7, .04, 2.6), stone, [fx + .75, .02, fz], { cast: false });
  addInteractable(hearth, { verb: 'Stoke', name: 'the fire', anchor: V(fx + .5, 0, fz), range: 1.9, action: stoke });
  function stoke() {
    boost = 1; sfx.whoosh(); toast('🔥 The fire roars back to life.');
    for (let i = 0; i < 3; i++) spawnFloaters(sparkTex, V(fx + .5, .5, fz + rnd(-.3, .3)), 6, { color: 0xffa040, additive: true, size: .05, rise: rnd(1, 1.8), dur: 1.2, stagger: .05 });
  }
  S.onFrame((dt, t) => {
    boost = Math.max(0, boost - dt * .25);
    for (const f of flames) {
      const n = Math.sin(t * 9 + f.userData.ph) * .5 + Math.sin(t * 15.3 + f.userData.ph * 2) * .3;
      const b = 1 + boost * .8;
      f.scale.set((1 + n * .15) * b, (1 + n * .35) * b, (1 + n * .15) * b);
      f.position.y = f.userData.base + n * .03 + boost * .08;
      f.material.opacity = .6 + n * .25;
    }
    light.intensity = (4 + Math.sin(t * 11) * .6 + Math.sin(t * 23.7) * .4 + Math.random() * .3) * (1 + boost * .8);
  });

  sofa(-9.3, -2.4, Math.PI / 2 - .5, 0x6d8a6a, 1);
  sofa(-9.3, .5, Math.PI / 2 + .5, 0x8a5a6a, 1);
  rug(T.rugSage, -9.6, -1, 2.6, 3.6, Math.PI / 2);
  cat(-10.45, 1.35, -.6);
  floorLamp(-11.2, 3.6);
}

function cat(x, z, rot) {
  const g = group(x, z, rot);
  mesh(new THREE.CylinderGeometry(.42, .45, .1, 24), std({ color: 0x7a4a6a, roughness: 1 }), [0, .05, 0], { parent: g });
  mesh(new THREE.CylinderGeometry(.34, .34, .06, 24), std({ color: 0xe9d6c0, roughness: 1 }), [0, .11, 0], { parent: g });
  const fur = std({ color: 0xe08a3c, roughness: .92 }), dark = std({ color: 0xa85222, roughness: .95 });
  const cream = std({ color: 0xf3d4ad, roughness: 1 }), ink = std({ color: 0x24150f, roughness: .7 });
  const body = mesh(new THREE.SphereGeometry(.25, 24, 16), fur, [-.06, .32, 0], { parent: g }); body.scale.set(1.45, .76, .9);
  const chest = mesh(new THREE.SphereGeometry(.18, 20, 14), cream, [.15, .32, 0], { parent: g }); chest.scale.set(.65, .8, .72);
  for (const zz of [-.13, .13]) {
    const paw = mesh(new THREE.SphereGeometry(.085, 16, 10), cream, [.21, .18, zz], { parent: g }); paw.scale.set(1.4, .55, .8);
  }
  for (const stripe of [-.18, -.06, .06]) {
    const band = mesh(new THREE.TorusGeometry(.245, .018, 6, 24, Math.PI * .78), dark, [stripe, .34, 0], { parent: g });
    band.rotation.set(Math.PI / 2, 0, Math.PI / 2); band.scale.set(1, 1, .88);
  }
  const head = new THREE.Group(); head.position.set(.27, .44, 0); g.add(head);
  const skull = mesh(new THREE.SphereGeometry(.17, 24, 16), fur, [0, 0, 0], { parent: head }); skull.scale.set(1.08, .95, 1);
  for (const ez of [-.105, .105]) {
    const ear = mesh(new THREE.ConeGeometry(.075, .17, 4), fur, [-.035, .16, ez], { parent: head }); ear.rotation.y = Math.PI / 4;
    const inner = mesh(new THREE.ConeGeometry(.038, .095, 4), std({ color: 0xe99991, roughness: 1 }), [-.025, .17, ez], { parent: head }); inner.rotation.y = Math.PI / 4;
  }
  const eyes = [];
  for (const ez of [-.065, .065]) {
    const eye = mesh(new THREE.SphereGeometry(.025, 12, 8), std({ color: 0x92c95b, emissive: 0x284c16, emissiveIntensity: .35 }), [.155, .035, ez], { parent: head }); eye.scale.x = .35; eyes.push(eye);
    const pupil = mesh(new THREE.SphereGeometry(.013, 10, 6), ink, [.174, .035, ez], { parent: head }); pupil.scale.set(.25, 1, .55);
  }
  for (const ez of [-.04, .04]) { const muzzle = mesh(new THREE.SphereGeometry(.045, 14, 9), cream, [.15, -.04, ez], { parent: head }); muzzle.scale.set(.65, .65, 1); }
  mesh(new THREE.SphereGeometry(.018, 10, 7), std({ color: 0xd97a8a }), [.185, -.025, 0], { parent: head }).scale.set(.6, .55, 1);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const whisker = mesh(new THREE.CylinderGeometry(.0025, .0025, .16, 5), cream, [.185, -.055 + i * .025, side * (.095 + i * .012)], { parent: head, cast: false });
    whisker.rotation.x = Math.PI / 2; whisker.rotation.z = (i - 1) * .12;
  }
  const tail = new THREE.Group(); tail.position.set(-.28, .31, .08); g.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(-.18, .03, .1), V(-.28, .14, .13), V(-.2, .28, .08)]);
  mesh(new THREE.TubeGeometry(tailCurve, 18, .035, 8, false), fur, null, { parent: tail });
  addCollider(x, z, .9, .9);
  let pet = 0;
  addInteractable(g, {
    verb: 'Pet', name: 'the cat', anchor: V(x, 0, z), range: 1.3,
    action: () => {
      pet = 3; sfx.purr(2.8); if (Math.random() < .35) setTimeout(() => sfx.meow(), 2600);
      toast(pickOne(['😺 Purrrr…', '😺 The cat leans into your hand.', '😺 Happy cat noises.']));
      spawnFloaters(heartTex, V(x, .55, z), 5, { size: .12 });
    },
  });
  S.onFrame((dt, t) => {
    pet = Math.max(0, pet - dt);
    body.scale.y = .76 + Math.sin(t * 2.2) * .025;
    chest.scale.y = .8 + Math.sin(t * 2.2) * .018;
    head.rotation.z = pet > 0 ? .18 + Math.sin(t * 3) * .04 : Math.sin(t * .4) * .025;
    tail.rotation.y = pet > 0 ? Math.sin(t * 8) * .42 : Math.sin(t * 1.3) * .12;
    const blink = Math.sin(t * .72) > .985 ? .12 : 1; eyes.forEach(eye => eye.scale.y = blink);
  });
}

/* =========================================================
   Kitchen nook (front-right): counter, coffee machine, fridge, stools
   ========================================================= */
function kitchen() {
  const z = RD / 2 - .38, x0 = 4.8, x1 = 10.8, cx = (x0 + x1) / 2, w = x1 - x0;
  const cab = std({ color: 0x6f8f72, roughness: .7 }), top = std({ map: T.wood, color: 0xc8a070, roughness: .4 });
  mesh(new THREE.BoxGeometry(w, .88, .66), cab, [cx, .44, z]);
  mesh(new THREE.BoxGeometry(w + .04, .05, .72), top, [cx, .905, z - .02]);
  for (let x = x0 + .6; x < x1; x += .6) mesh(new THREE.BoxGeometry(.012, .78, .01), std({ color: 0x4f6b52 }), [x, .44, z - .335], { cast: false });
  for (let x = x0 + .3; x < x1; x += .6) mesh(new THREE.BoxGeometry(.12, .02, .02), std({ color: 0xd8c08a, metalness: .6 }), [x, .78, z - .345], { cast: false });
  const bs = mesh(new THREE.PlaneGeometry(w, .9), std({ map: T.tiles, roughness: .4 }), [cx, 1.38, RD / 2 - .01], { cast: false });
  bs.rotation.y = Math.PI;
  mesh(new THREE.BoxGeometry(w, .7, .36), cab, [cx, 2.35, RD / 2 - .2]);
  addCollider(cx, z, w, .7);
  // shelf with jars
  for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(.06, .06, rnd(.14, .22), 12), std({ color: pickOne([0xe9d6b0, 0xc9a35a, 0x8a5a3a, 0xb4623a]), roughness: .5 }), [x0 + 3.6 + i * .18, 1.0, z + .12]);
  // fruit bowl
  mesh(new THREE.SphereGeometry(.16, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: 0xe6dcc4, side: THREE.DoubleSide }), [x0 + 2.6, 1.08, z]);
  for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(.05, 10, 8), std({ color: pickOne([0xd33a2c, 0xf2b134, 0x7cb342]) }), [x0 + 2.6 + rnd(-.06, .06), 1.04, z + rnd(-.06, .06)]);

  // coffee machine
  const mx = x0 + 1.2;
  const machine = new THREE.Group(); machine.position.set(mx, .93, z); S.scene.add(machine);
  mesh(new RoundedBoxGeometry(.32, .42, .3, 2, .03), std({ color: 0x2b2b2b, roughness: .4, metalness: .3 }), [0, .21, 0], { parent: machine });
  mesh(new THREE.BoxGeometry(.3, .04, .2), std({ color: 0x777777, metalness: .7, roughness: .3 }), [0, .02, -.08], { parent: machine });
  mesh(new THREE.CylinderGeometry(.07, .08, .14, 16), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, transparent: true, opacity: .45, roughness: .1 }), [0, .1, -.1], { parent: machine });
  const coffee = mesh(new THREE.CylinderGeometry(.068, .078, .01, 16), std({ color: 0x3a2112 }), [0, .04, -.1], { parent: machine, cast: false });
  const btn = mesh(new THREE.SphereGeometry(.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0xaa2222 }), [.1, .34, -.152], { parent: machine, cast: false });
  let brewing = 0;
  addInteractable(machine, {
    verb: 'Make', name: 'coffee', anchor: V(mx, 0, z), range: 1.5, approach: () => V(mx, 0, z - 1.0),
    action: () => {
      if (brewing > 0) return toast('☕ Patience… it’s brewing.');
      brewing = 3; sfx.brew(); btn.material.color.setHex(0x33ff66); toast('☕ Brewing…');
      setTimeout(() => { btn.material.color.setHex(0xaa2222); toast('☕ Fresh coffee! The whole room smells great.'); spawnFloaters(softDot, V(mx, 1.3, z - .1), 6, { size: .12, rise: .6, color: 0xdddddd }); }, 3000);
    },
  });
  S.onFrame(dt => {
    brewing = Math.max(0, brewing - dt);
    const level = brewing > 0 ? (1 - brewing / 3) : (coffee.userData.full ? 1 : 0);
    if (brewing > 0) coffee.userData.full = true;
    coffee.scale.y = 1 + level * 10; coffee.position.y = .04 + level * .05;
  });

  // fridge
  const fx = 11.3, fz = RD / 2 - .45;
  const fridgeMat = std({ color: 0xe8e2d0, roughness: .35 });
  mesh(new THREE.BoxGeometry(.85, 2.0, .75), fridgeMat, [fx, 1.0, fz]);
  mesh(new THREE.BoxGeometry(.75, 1.8, .02), std({ color: 0x222831 }), [fx, 1.0, fz - .37], { cast: false });
  const inLight = new THREE.PointLight(0xdff2ff, 0, 2, 2); inLight.position.set(fx, 1.2, fz - .5); inLight.visible = false; S.scene.add(inLight);
  for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(rnd(.1, .2), rnd(.1, .25), .15), std({ color: pickOne([0xd33a2c, 0xf2b134, 0x7cb342, 0xf5f5f5, 0x3d7aa8]) }), [fx + rnd(-.25, .25), .45 + Math.floor(i / 2) * .5, fz - .25], { cast: false });
  const hinge = new THREE.Group(); hinge.position.set(fx - .425, 0, fz - .38); S.scene.add(hinge);
  mesh(new THREE.BoxGeometry(.85, 1.98, .05), fridgeMat, [.425, 1.0, -.02], { parent: hinge });
  mesh(new THREE.BoxGeometry(.03, .5, .04), std({ color: 0xb0b0b0, metalness: .8, roughness: .2 }), [.76, 1.2, -.07], { parent: hinge });
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(.08, .08, .01), std({ color: pickOne([0xd33a2c, 0x3d7aa8, 0xf2b134]) }), [.25 + i * .14, 1.5 - i * .1, -.05], { parent: hinge, cast: false });
  addCollider(fx, fz, .85, .75);
  let open = false;
  addInteractable([hinge], {
    verb: () => open ? 'Close' : 'Open', name: 'the fridge', anchor: V(fx, 0, fz), range: 1.6, approach: () => V(fx - .6, 0, fz - 1.1),
    action: () => {
      open = !open; sfx.fridge();
      const a0 = hinge.rotation.y, a1 = open ? 1.9 : 0;
      inLight.visible = true;
      animate(.5, k => { hinge.rotation.y = a0 + (a1 - a0) * k; inLight.intensity = open ? k * 1.5 : (1 - k) * 1.5; }, () => { inLight.visible = open; });
      if (open) toast(pickOne(['🧀 Cheese, apples and… a suspicious potion.', '🥕 Carrots. Lots of carrots.', '🍰 Someone left half a cake in here.']));
    },
  });

  stool(6.3, z - .95, Math.PI); stool(7.6, z - .95, Math.PI); stool(8.9, z - .95, Math.PI);
  pendant(6.9, z - .5, ROOM.h - 1.1, 2.2); pendant(9.1, z - .5, ROOM.h - 1.1, 0, false);
}

/* =========================================================
   Front door, light switch, coat rack
   ========================================================= */
function entrance() {
  const dx = -3, z = RD / 2;
  mesh(new THREE.PlaneGeometry(1.15, 2.35), new THREE.MeshBasicMaterial({ color: 0x050505 }), [dx, 1.175, z - .015], { cast: false }).rotation.y = Math.PI;
  const frame = std({ color: 0x3b2516, roughness: .6 });
  for (const [w, h, x, y] of [[.1, 2.45, dx - .62, 1.225], [.1, 2.45, dx + .62, 1.225], [1.34, .1, dx, 2.43]]) mesh(new THREE.BoxGeometry(w, h, .1), frame, [x, y, z - .05]);
  const hinge = new THREE.Group(); hinge.position.set(dx - .57, 0, z - .06); S.scene.add(hinge);
  const doorMat = std({ map: T.wood, color: 0x8a5232, roughness: .6 });
  mesh(new THREE.BoxGeometry(1.14, 2.35, .06), doorMat, [.57, 1.175, 0], { parent: hinge });
  for (const y of [.65, 1.7]) mesh(new THREE.BoxGeometry(.8, .7, .02), std({ color: 0x6f4228 }), [.57, y, -.04], { parent: hinge, cast: false });
  mesh(new THREE.SphereGeometry(.035, 10, 8), std({ color: 0xd8b98a, metalness: .8, roughness: .25 }), [1.0, 1.05, -.06], { parent: hinge });
  rug(T.rugCool, dx, z - .8, 1.6, 1.0);
  let busy = false;
  addInteractable(hinge, {
    verb: 'Open', name: 'the door', anchor: V(dx, 0, z - .3), range: 1.8,
    action: () => {
      if (busy) return; busy = true; sfx.door();
      const w = S.wx || {};
      toast(w.lightning ? '⛈️ Whoa — thunder! Back inside, quick.' : w.snow > .3 ? '❄️ Brr! Way too cold. Back to the fireplace.' : w.rain > .3 ? '🌧️ It’s pouring out there. Better stay cozy inside.' : w.fog > .6 ? '🌫️ Can’t see a thing out there.' : '🌙 Nice out… but it’s cozier in here.', 3200);
      animate(.8, k => hinge.rotation.y = k * 1.25, () => setTimeout(() => animate(.8, k => hinge.rotation.y = 1.25 * (1 - k), () => { sfx.thunk(); busy = false; }), 1800));
    },
  });
  // light switch
  const sw = new THREE.Group(); sw.position.set(dx + 1.05, 1.3, z - .02); S.scene.add(sw);
  mesh(new THREE.BoxGeometry(.1, .14, .015), std({ color: 0xf3ead8 }), [0, 0, 0], { parent: sw, cast: false });
  const toggle = mesh(new THREE.BoxGeometry(.025, .05, .02), std({ color: 0xd8c8a8 }), [0, .015, -.015], { parent: sw, cast: false });
  addInteractable(sw, {
    verb: 'Flip', name: 'the string lights', anchor: V(dx + 1.05, 0, z - .3), range: 1.5,
    action: () => { R.lightsOn = !R.lightsOn; toggle.position.y = R.lightsOn ? .015 : -.015; sfx.switch(); toast(R.lightsOn ? '✨ String lights on.' : '🌑 String lights off.'); },
  });
  // coat rack
  const rx = dx - 1.5, rz = z - .4;
  mesh(new THREE.CylinderGeometry(.025, .03, 1.8, 8), std({ color: 0x5a3a22 }), [rx, .9, rz]);
  mesh(new THREE.CylinderGeometry(.2, .22, .04, 16), std({ color: 0x5a3a22 }), [rx, .02, rz]);
  mesh(new RoundedBoxGeometry(.12, .7, .32, 2, .04), std({ color: 0xb5643c }), [rx + .06, 1.35, rz], {}).rotation.z = .1;
  mesh(new THREE.TorusGeometry(.1, .03, 6, 14), std({ color: 0x2f4a5f }), [rx - .08, 1.62, rz]).rotation.y = Math.PI / 2;
  addCollider(rx, rz, .45, .45);
}

/* =========================================================
   Game table with a chess board
   ========================================================= */
function gameTable() {
  const x = -6, z = 5.2;
  const tw = std({ map: T.wood, color: 0x9a6a42, roughness: .5 });
  mesh(new THREE.CylinderGeometry(.7, .7, .05, 32), tw, [x, .74, z]);
  mesh(new THREE.CylinderGeometry(.06, .08, .72, 12), tw, [x, .37, z]);
  mesh(new THREE.CylinderGeometry(.35, .38, .04, 20), tw, [x, .02, z]);
  addCollider(x, z, 1.2, 1.2);
  const board = mesh(new THREE.BoxGeometry(.5, .02, .5), std({ map: T.checker, roughness: .5 }), [x, .775, z]);
  const cells = [], border = .5 * 16 / 256, sq = .5 * 28 / 256;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) cells.push([i, j]);
  const cellPos = (i, j) => V(x - .25 + border + (i + .5) * sq, .79, z - .25 + border + (j + .5) * sq);
  const pieces = [];
  const used = new Set();
  for (let k = 0; k < 10; k++) {
    let c; do c = pickOne(cells); while (used.has(c.join()));
    used.add(c.join());
    const p = mesh(new THREE.CylinderGeometry(.012, .018, .05, 10), std({ color: k % 2 ? 0x1e1410 : 0xf3ead8, roughness: .4 }), null, { cast: true });
    p.position.copy(cellPos(...c)).y += .025; p.userData.cell = c; pieces.push(p);
  }
  addInteractable([board, ...pieces], {
    verb: 'Move', name: 'a chess piece', anchor: V(x, 0, z), range: 1.6,
    action: () => {
      const p = pickOne(pieces); let c; do c = pickOne(cells); while (used.has(c.join()));
      used.delete(p.userData.cell.join()); used.add(c.join()); p.userData.cell = c;
      const a = p.position.clone(), b = cellPos(...c); b.y = a.y;
      animate(.45, k => { p.position.lerpVectors(a, b, k); p.position.y = a.y + Math.sin(k * Math.PI) * .08; }, () => sfx.chess());
      toast(pickOne(['♟️ Your move… bold choice.', '♟️ Checkmate? Probably not.', '♟️ The cat is judging that move.']));
    },
  });
  chair(x, z - 1.0, Math.PI); chair(x, z + 1.0, 0);
  pendant(x, z, ROOM.h - 1.2, 1.4);
}

/* =========================================================
   Reading nook by the window
   ========================================================= */
function readingNook() {
  rug(T.rugCool, 10.2, 3, 2.6, 3.4, Math.PI / 2);
  beanbag(10.4, 2.1, -Math.PI / 2 + .25, 0xc9a35a);
  beanbag(10.4, 4.0, -Math.PI / 2 - .25, 0x3d6b70);
  // Leave a clear standing spot in front of the wall weather controls.
  floorLamp(10.8, 7.15);
  // small side crate with a book pile
  mesh(new THREE.BoxGeometry(.45, .4, .45), std({ map: T.wood, color: 0xa4764f }), [11.4, .2, 3.05]);
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(.25, .05, .18), std({ color: BOOK_COLORS[i + 3] }), [11.4, .43 + i * .05, 3.05]).rotation.y = rnd(-.3, .3);
  addCollider(11.4, 3.05, .5, .5);
}

function wallLogo() {
  const x = 1.15, y = 2.52, z = RD / 2 - .08, w = 2.35, h = 2.05;
  const frame = std({ map: T.wood, color: 0x7b4a2b, roughness: .52 });
  mesh(new THREE.BoxGeometry(w, h, .08), std({ color: 0x2b1b12, roughness: .9 }), [x, y, z], { cast: false });
  for (const [fw, fh, fx, fy] of [
    [w + .18, .12, x, y + h / 2 + .03], [w + .18, .12, x, y - h / 2 - .03],
    [.12, h, x - w / 2 - .03, y], [.12, h, x + w / 2 + .03, y],
  ]) mesh(new THREE.BoxGeometry(fw, fh, .12), frame, [fx, fy, z - .04]);
  const pictureMaterial = new THREE.MeshBasicMaterial({ color: 0x2b1b12, transparent: true, alphaTest: .02, side: THREE.DoubleSide, toneMapped: false });
  const picture = mesh(
    new THREE.PlaneGeometry(w - .16, h - .16),
    pictureMaterial,
    [x, y, z - .085], { cast: false, receive: false },
  );
  picture.rotation.y = Math.PI;
  const loadLogo = retry => new THREE.TextureLoader().load('/assets/pvc-logo.png', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, S.renderer.capabilities.getMaxAnisotropy());
    pictureMaterial.color.setHex(0xffffff); pictureMaterial.map = texture; pictureMaterial.needsUpdate = true;
  }, undefined, () => {
    if (retry) setTimeout(() => loadLogo(false), 700);
  });
  loadLogo(true);
}

/* =========================================================
   Build everything
   ========================================================= */
export function buildFurniture() {
  lounge();
  fireplaceCorner();
  kitchen();
  entrance();
  gameTable();
  readingNook();
  wallLogo();
  bookshelf(-10.3, -RD / 2 + .25);
  bookshelf(.4, -RD / 2 + .25);
  rug(T.rugWarm, 1.5, 3.5, 7, 4.6);
  floorLamp(3.4, -4.6);
  [[-11.4, -11.4, 1.2], [11.4, -11.4, 1.1], [-11.4, 11.4, 1], [-8.55, -11.4, .8], [-1.5, -11.4, .8], [11.3, 8.8, 1.2], [-11.3, 8, 1.1], [3.6, 11.3, .9], [11.4, .4, 1]]
    .forEach(([x, z, s]) => plant(x, z, s));
}
