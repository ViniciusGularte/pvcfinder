// Floor, walls (with the window hole), ceiling, window, curtains, string lights, dust.
import * as THREE from 'three';
import { S } from './core.js';
import { ROOM, WIN } from './config.js';
import { rnd, std, mesh, noRaycast, addCollider } from './util.js';
import { T } from './textures.js';

export const R = { bulbs: [], lightsOn: true };   // shared room refs (used by weather.js, furniture.js)

export function buildRoom() {
  const { w: RW, d: RD, h: RH } = ROOM;

  const floor = mesh(new THREE.PlaneGeometry(RW, RD), std({ map: T.floor, roughness: .7 }), [0, 0, 0], { cast: false, name: 'floor' });
  floor.rotation.x = -Math.PI / 2; floor.userData.walkable = true;
  S.camBlockers.push(floor);

  R.trim = std({ color: 0x3b2516, roughness: .6 });
  const wallMat = std({ map: T.plaster, roughness: .95 }), panelMat = std({ map: T.panel, roughness: .8 });
  const walls = [
    { pos: [0, 0, -RD / 2], rot: 0 }, { pos: [0, 0, RD / 2], rot: Math.PI },
    { pos: [-RW / 2, 0, 0], rot: Math.PI / 2 }, { pos: [RW / 2, 0, 0], rot: -Math.PI / 2 },
  ];
  walls.forEach((w, i) => {
    const grp = new THREE.Group(); grp.position.set(...w.pos); grp.rotation.y = w.rot; S.scene.add(grp);
    const uppers = [], lowers = [];
    if (i === 1) {   // front wall: bunker entrance at world x = -8 (local x = +8)
      // Rectangles avoid a ShapeGeometry hole touching the lower edge, which produced unstable triangles/z-fighting.
      const upperY = 1.05 + (RH - 1.05) / 2;
      for (const [x0, x1] of [[-RW / 2, 6.75], [9.25, RW / 2]])
        uppers.push(mesh(new THREE.PlaneGeometry(x1 - x0, RH - 1.05), wallMat, [(x0 + x1) / 2, upperY, 0], { parent: grp, receive: false }));
      uppers.push(mesh(new THREE.PlaneGeometry(2.5, RH - 2.9), wallMat, [8, 2.9 + (RH - 2.9) / 2, 0], { parent: grp, receive: false }));
      for (const [x0, x1] of [[-RW / 2, 6.75], [9.25, RW / 2]]) {
        const lower = mesh(new THREE.PlaneGeometry(x1 - x0, 1.05), panelMat, [(x0 + x1) / 2, .525, .001], { parent: grp, receive: false });
        lowers.push(lower);
      }
    } else if (i === 3) {   // right wall: cut the window hole (local x = world z here)
      const H0 = 1.05, sh = new THREE.Shape();
      sh.moveTo(-RW / 2, H0); sh.lineTo(RW / 2, H0); sh.lineTo(RW / 2, RH); sh.lineTo(-RW / 2, RH); sh.closePath();
      const z0 = WIN.z - WIN.w / 2, z1 = WIN.z + WIN.w / 2, y0 = WIN.y - WIN.h / 2, y1 = WIN.y + WIN.h / 2;
      const hole = new THREE.Path(); hole.moveTo(z0, y0); hole.lineTo(z0, y1); hole.lineTo(z1, y1); hole.lineTo(z1, y0); hole.closePath();
      sh.holes.push(hole);
      const t = T.plaster.clone(); t.repeat.set(1 / 3, 1 / 1.275); t.needsUpdate = true;
      uppers.push(mesh(new THREE.ShapeGeometry(sh), std({ map: t, roughness: .95 }), [0, 0, 0], { parent: grp, cast: false, receive: false }));
    } else {
      uppers.push(mesh(new THREE.PlaneGeometry(RW, RH - 1.05), wallMat, [0, 1.05 + (RH - 1.05) / 2, 0], { parent: grp }));
    }
    if (i !== 1) lowers.push(mesh(new THREE.PlaneGeometry(RW, 1.05), panelMat, [0, .525, .001], { parent: grp }));
    if (i === 1) {
      for (const [x0, x1] of [[-RW / 2, 6.75], [9.25, RW / 2]]) {
        mesh(new THREE.BoxGeometry(x1 - x0, .06, .05), R.trim, [(x0 + x1) / 2, 1.07, .02], { parent: grp });
        mesh(new THREE.BoxGeometry(x1 - x0, .12, .04), R.trim, [(x0 + x1) / 2, .06, .02], { parent: grp });
      }
    } else {
      mesh(new THREE.BoxGeometry(RW, .06, .05), R.trim, [0, 1.07, .02], { parent: grp });
      mesh(new THREE.BoxGeometry(RW, .12, .04), R.trim, [0, .06, .02], { parent: grp });
    }
    S.camBlockers.push(...uppers, ...lowers);
  });

  const ceil = mesh(new THREE.PlaneGeometry(RW, RD), std({ color: 0x6b4a33, roughness: .9 }), [0, RH, 0]);
  ceil.rotation.x = Math.PI / 2; S.camBlockers.push(ceil);
  for (let z = -RD / 2 + 1.4; z < RD / 2; z += 2.4)
    mesh(new THREE.BoxGeometry(RW, .22, .26), std({ map: T.wood, color: 0x9a7050 }), [0, RH - .11, z]);

  buildExteriorShell(RW, RD, RH);
  buildWindow(RW);
  buildStringLights(RW, RD);
  buildDust(RW, RD, RH);
}

function buildExteriorShell(RW, RD, RH) {
  const exterior = std({ color: 0x54483d, roughness: .96 });
  const roofMat = std({ color: 0x201c1b, roughness: .92 });
  const outdoor = object => { object.userData.outdoor = true; S.camBlockers.push(object); return object; };

  // Solid outer facade keeps the one-sided interior wall planes from disappearing outside.
  for (const [x0, x1] of [[-RW / 2, -9.25], [-6.75, RW / 2]]) {
    outdoor(mesh(new THREE.BoxGeometry(x1 - x0, RH, .18), exterior, [(x0 + x1) / 2, RH / 2, RD / 2 + .2], { cast: false, receive: false }));
    addCollider((x0 + x1) / 2, RD / 2 + .2, x1 - x0, .2);
  }
  outdoor(mesh(new THREE.BoxGeometry(2.5, RH - 2.9, .18), exterior, [-8, 2.9 + (RH - 2.9) / 2, RD / 2 + .2], { cast: false, receive: false }));
  const leftX = -RW / 2 - .2, rightX = RW / 2 + .2;
  outdoor(mesh(new THREE.BoxGeometry(.18, RH, RD + .18), exterior, [leftX, RH / 2, 0], { cast: false, receive: false }));
  addCollider(leftX, 0, .2, RD);
  const wz0 = WIN.z - WIN.w / 2, wz1 = WIN.z + WIN.w / 2, wy0 = WIN.y - WIN.h / 2, wy1 = WIN.y + WIN.h / 2;
  for (const [z0, z1] of [[-RD / 2, wz0], [wz1, RD / 2]])
    outdoor(mesh(new THREE.BoxGeometry(.18, RH, z1 - z0), exterior, [rightX, RH / 2, (z0 + z1) / 2], { cast: false, receive: false }));
  outdoor(mesh(new THREE.BoxGeometry(.18, wy0, WIN.w), exterior, [rightX, wy0 / 2, WIN.z], { cast: false, receive: false }));
  outdoor(mesh(new THREE.BoxGeometry(.18, RH - wy1, WIN.w), exterior, [rightX, wy1 + (RH - wy1) / 2, WIN.z], { cast: false, receive: false }));
  addCollider(rightX, 0, .2, RD);
  outdoor(mesh(new THREE.BoxGeometry(RW, RH, .18), exterior, [0, RH / 2, -RD / 2 - .2], { cast: false, receive: false }));
  addCollider(0, -RD / 2 - .2, RW, .2);

  const rise = 2.35, overhang = .65, run = RW / 2 + overhang, slope = Math.hypot(run, rise), angle = Math.atan2(rise, run);
  for (const side of [-1, 1]) {
    const roof = outdoor(mesh(new THREE.BoxGeometry(slope, .18, RD + overhang * 2), roofMat,
      [side * run / 2, RH + rise / 2, 0], { cast: false, receive: false }));
    roof.rotation.z = side * -angle;
  }
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-run, 0); gableShape.lineTo(0, rise); gableShape.lineTo(run, 0); gableShape.closePath();
  for (const z of [-RD / 2 - .18, RD / 2 + .18]) {
    const gable = outdoor(mesh(new THREE.ShapeGeometry(gableShape), std({ color: 0x403830, roughness: 1, side: THREE.DoubleSide }), [0, RH, z], { cast: false, receive: false }));
    if (z < 0) gable.rotation.y = Math.PI;
  }
}

function buildWindow(RW) {
  const wx0 = RW / 2;
  const wz0 = WIN.z - WIN.w / 2, wz1 = WIN.z + WIN.w / 2, wy0 = WIN.y - WIN.h / 2, wy1 = WIN.y + WIN.h / 2;
  const reveal = std({ color: 0xd9c4a3, roughness: .9 });
  mesh(new THREE.BoxGeometry(.24, .035, WIN.w), reveal, [wx0 + .12, wy1 - .025, WIN.z], { cast: false, receive: false });
  mesh(new THREE.BoxGeometry(.24, .035, WIN.w), reveal, [wx0 + .12, wy0 + .025, WIN.z], { cast: false, receive: false });
  mesh(new THREE.BoxGeometry(.24, WIN.h - .1, .035), reveal, [wx0 + .12, WIN.y, wz0 + .025], { cast: false, receive: false });
  mesh(new THREE.BoxGeometry(.24, WIN.h - .1, .035), reveal, [wx0 + .12, WIN.y, wz1 - .025], { cast: false, receive: false });
  const winWood = std({ color: 0xf2e8d6, roughness: .6 });
  for (const [sy, sz, py, pz] of [[.1, WIN.w + .2, wy1 + .05, WIN.z], [.1, WIN.w + .2, wy0 - .05, WIN.z], [WIN.h + .2, .1, WIN.y, wz0 - .05], [WIN.h + .2, .1, WIN.y, wz1 + .05]])
    mesh(new THREE.BoxGeometry(.06, sy, sz), winWood, [wx0 - .045, py, pz], { cast: false, receive: false });
  for (const [sy, sz, py, pz] of [[WIN.h, .05, WIN.y, WIN.z], [.05, WIN.w, WIN.y + .2, WIN.z]])
    mesh(new THREE.BoxGeometry(.045, sy, sz), winWood, [wx0 - .072, py, pz], { cast: false, receive: false });
  mesh(new THREE.BoxGeometry(.3, .06, WIN.w + .4), std({ map: T.wood, color: 0xb08460 }), [wx0 - .15, wy0 - .08, WIN.z], { cast: false, receive: false });

  // Exterior trim is separate so the window reads correctly from the explorable grounds.
  const outerWood = std({ color: 0x36291f, roughness: .82 });
  const exteriorPart = part => { part.userData.outdoor = true; return part; };
  const outerX = wx0 + .37;
  for (const [sy, sz, py, pz] of [[.13, WIN.w + .34, wy1 + .07, WIN.z], [.13, WIN.w + .34, wy0 - .07, WIN.z], [WIN.h + .28, .13, WIN.y, wz0 - .07], [WIN.h + .28, .13, WIN.y, wz1 + .07]])
    exteriorPart(mesh(new THREE.BoxGeometry(.075, sy, sz), outerWood, [outerX, py, pz], { cast: false, receive: false }));
  exteriorPart(mesh(new THREE.BoxGeometry(.07, WIN.h, .055), outerWood, [outerX + .002, WIN.y, WIN.z], { cast: false, receive: false }));
  exteriorPart(mesh(new THREE.BoxGeometry(.07, .055, WIN.w), outerWood, [outerX + .002, WIN.y + .2, WIN.z], { cast: false, receive: false }));
  exteriorPart(mesh(new THREE.BoxGeometry(.24, .08, WIN.w + .48), std({ color: 0x4a3829, roughness: .9 }), [wx0 + .4, wy0 - .12, WIN.z], { cast: false, receive: false }));

  // candle + little plant on the sill
  mesh(new THREE.CylinderGeometry(.04, .04, .12, 12), std({ color: 0xf3e6cf, emissive: 0xffb060, emissiveIntensity: .3 }), [wx0 - .14, wy0 - .01, wz0 + .35]);
  R.candleFlame = new THREE.Mesh(new THREE.SphereGeometry(.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc860 }));
  R.candleFlame.position.set(wx0 - .14, wy0 + .07, wz0 + .35); R.candleFlame.scale.y = 1.8; S.scene.add(R.candleFlame);
  R.candleLight = new THREE.PointLight(0xffa850, .6, 2.5, 2); R.candleLight.position.copy(R.candleFlame.position); S.scene.add(R.candleLight);
  mesh(new THREE.CylinderGeometry(.07, .055, .12, 12), std({ color: 0xb4623a }), [wx0 - .14, wy0 - .01, wz1 - .35]);
  for (let i = 0; i < 5; i++) { const l = mesh(new THREE.IcosahedronGeometry(.06, 0), std({ color: 0x5f8f4a, flatShading: true }), [wx0 - .14 + rnd(-.04, .04), wy0 + .1 + rnd(0, .08), wz1 - .35 + rnd(-.04, .04)]); l.scale.y = 1.6; }

  // glass with raindrops (opacity driven by weather)
  R.glassMat = new THREE.MeshBasicMaterial({ map: T.rainGlass, color: 0xdfe8ff, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide });
  R.glass = mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), R.glassMat, [wx0 + .18, WIN.y, WIN.z], { cast: false, receive: false, name: 'window' });
  R.glass.rotation.y = -Math.PI / 2;
  S.camBlockers.push(R.glass);   // keep the 3rd-person camera from slipping outside

  // curtains + rod
  const curtain = (z, flip) => {
    const geo = new THREE.PlaneGeometry(.7, 2.75, 30, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 26) * .04 + (flip ? -1 : 1) * p.getX(i) * .05);
    geo.computeVertexNormals();
    mesh(geo, std({ color: 0xc8843a, side: THREE.DoubleSide, roughness: 1 }), [wx0 - .14, 2.25, z]).rotation.y = -Math.PI / 2;
  };
  curtain(wz0 - .15, false); curtain(wz1 + .15, true);
  mesh(new THREE.CylinderGeometry(.015, .015, WIN.w + 1.4, 8), std({ color: 0x7a5530, metalness: .5, roughness: .4 }), [wx0 - .14, 3.62, WIN.z]).rotation.x = Math.PI / 2;

  /* Weather control plaque temporarily disabled. Restore it here when climate controls return. */
}

function buildStringLights(RW, RD) {
  const cols = [0xffd27a, 0xffb36b, 0xfff0c0];
  const bulbPositions = cols.map(() => []);
  const line = (a, b, n, sag) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p);
      const bulb = p.clone(); bulb.y -= .04; bulbPositions[i % cols.length].push(bulb);
    }
    S.scene.add(noRaycast(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a1a10 }))));
  };
  const y = 3.95, e = .1, V3 = (x, z, yy = y) => new THREE.Vector3(x, yy, z);
  line(V3(-RW / 2 + e, RD / 2 - e), V3(RW / 2 - e, RD / 2 - e), 70, .3);
  line(V3(-RW / 2 + e, -RD / 2 + e), V3(-RW / 2 + e, RD / 2 - e), 70, .35);
  line(V3(-RW / 2 + e, -RD / 2 + 3), V3(RW / 2 - e, RD / 2 - 3), 90, .6);
  line(V3(RW / 2 - e, -RD / 2 + 3), V3(-RW / 2 + e, RD / 2 - 3), 90, .6);
  const bulbGeometry = new THREE.SphereGeometry(.03, 8, 8), dummy = new THREE.Object3D();
  bulbPositions.forEach((positions, index) => {
    const material = new THREE.MeshBasicMaterial({ color: cols[index] });
    const batch = noRaycast(new THREE.InstancedMesh(bulbGeometry, material, positions.length));
    positions.forEach((position, i) => { dummy.position.copy(position); dummy.updateMatrix(); batch.setMatrixAt(i, dummy.matrix); });
    batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere();
    batch.userData.ph = rnd(0, 6); batch.userData.base = new THREE.Color(cols[index]);
    S.scene.add(batch); R.bulbs.push(batch);
  });
}

function buildDust(RW, RD, RH) {
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([rnd(-RW / 2, RW / 2 - .3), rnd(.2, RH), rnd(-RD / 2, RD / 2)], i * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  R.dust = noRaycast(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd9a0, size: .014, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending })));
  S.scene.add(R.dust);

  S.onFrame((dt, t) => {
    R.candleLight.intensity = .5 + Math.sin(t * 13) * .08 + Math.random() * .06;
    R.candleFlame.scale.y = 1.7 + Math.sin(t * 17) * .2;
    const on = R.lightsOn ? 1 : .07;
    for (const b of R.bulbs) b.material.color.copy(b.userData.base).multiplyScalar(on * (.75 + .35 * Math.sin(t * 1.6 + b.userData.ph)));
    const a = geo.attributes.position;
    for (let i = 0; i < n; i++) { a.array[i * 3 + 1] += Math.sin(t * .3 + i) * .0006; a.array[i * 3] += Math.cos(t * .2 + i * 1.7) * .0004; }
    a.needsUpdate = true;
  });
}
