// Hidden bunker room, synchronized blast door, keypad and locked secure computer.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { S } from './core.js';
import { ROOM, SURFACE_AREA } from './config.js';
import { $, V, rnd, animate, addCollider, canvasTex, mesh, std } from './util.js';
import { addInteractable } from './interact.js';
import { sfx } from './audio.js';

const BX = -8, ENTRANCE_Z = ROOM.d / 2, BW = 5.6, BD = 8;
const SURFACE_DOOR_Z = ENTRANCE_Z + 3.35, SURFACE_DOOR_W = 1.58, SURFACE_DOOR_H = 2.55;
let door, doorCollider, doorTimer, doorRun = 0, terminalCanvas, terminalTexture;
let keypadCode = '', terminalCode = '';
let surfaceDoor, surfaceDoorCollider, surfaceDoorOpen = false, surfaceDoorBusy = false;

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
  // Right wall is split around the operable surface exit and its viewing slot.
  const rightX = BX + BW / 2, shellStart = ENTRANCE_Z + shellInset, shellEnd = ENTRANCE_Z + BD;
  const openingStart = SURFACE_DOOR_Z - SURFACE_DOOR_W / 2, openingEnd = SURFACE_DOOR_Z + SURFACE_DOOR_W / 2;
  const before = openingStart - shellStart, after = shellEnd - openingEnd;
  const rightParts = [
    mesh(new THREE.BoxGeometry(.18, ROOM.h, before), steel, [rightX, ROOM.h / 2, shellStart + before / 2]),
    mesh(new THREE.BoxGeometry(.18, ROOM.h, after), steel, [rightX, ROOM.h / 2, openingEnd + after / 2]),
    mesh(new THREE.BoxGeometry(.18, ROOM.h - SURFACE_DOOR_H, SURFACE_DOOR_W), steel,
      [rightX, SURFACE_DOOR_H + (ROOM.h - SURFACE_DOOR_H) / 2, SURFACE_DOOR_Z]),
  ];
  addCollider(rightX, shellStart + before / 2, .28, before);
  addCollider(rightX, openingEnd + after / 2, .28, after);
  const far = mesh(new THREE.BoxGeometry(BW, ROOM.h, .18), steel, [BX, ROOM.h / 2, ENTRANCE_Z + BD]);
  addCollider(BX - BW / 2, shellZ, .28, shellDepth);
  addCollider(BX, ENTRANCE_Z + BD, BW, .28);
  S.camBlockers.push(left, ...rightParts, far);

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

  buildBloodClue();
  buildKeypad(steel);
  buildSecureComputer(steel, darkSteel);
  buildSurfaceExit(steel, darkSteel);
  buildAbandonedExterior();

  const greenLight = new THREE.PointLight(0x45ff9a, 4.2, 9, 1.7); greenLight.position.set(BX, 2.5, ENTRANCE_Z + 5.8); S.scene.add(greenLight);
  const fillLight = new THREE.PointLight(0xc7e0d5, 3.2, 10, 1.8); fillLight.position.set(BX, 3.0, ENTRANCE_Z + 2.6); S.scene.add(fillLight);
  for (const x of [BX - 2.35, BX + 2.35]) {
    const strip = mesh(new THREE.BoxGeometry(.07, .05, BD - .7), new THREE.MeshBasicMaterial({ color: 0x3eff91 }), [x, 3.72, ENTRANCE_Z + BD / 2], { cast: false });
    strip.material.toneMapped = false;
  }

  wireBunkerUI();
  S.bunker = { openDoor };
}

function buildBloodClue() {
  const texture = canvasTex(768, 420, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2 - 10); g.rotate(-.055);
    g.font = '600 190px Caveat, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 11; g.strokeStyle = 'rgba(35,2,4,.72)'; g.strokeText('00 _ 0', 5, 8);
    g.fillStyle = 'rgba(105,8,15,.94)'; g.fillText('00 _ 0', 0, 0);
    g.lineWidth = 3; g.strokeStyle = 'rgba(184,28,35,.38)'; g.strokeText('00 _ 0', -2, -3);
    g.restore();

    const drops = [[170,270,13,92],[286,250,9,58],[475,270,12,105],[595,247,8,64]];
    for (const [x, y, radius, length] of drops) {
      const gradient = g.createLinearGradient(x, y, x, y + length);
      gradient.addColorStop(0, 'rgba(104,7,13,.88)'); gradient.addColorStop(1, 'rgba(52,2,6,.18)');
      g.fillStyle = gradient; g.beginPath(); g.moveTo(x - radius, y); g.quadraticCurveTo(x, y + length, x + radius * .25, y + length);
      g.quadraticCurveTo(x + radius, y + 15, x + radius, y); g.closePath(); g.fill();
    }
    for (const [x, y, r] of [[92,130,10],[126,320,7],[650,112,8],[692,286,12],[535,348,5],[232,92,6]]) {
      g.fillStyle = `rgba(91,5,11,${.45 + r / 30})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .035, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const writing = mesh(new THREE.PlaneGeometry(1.42, .78), material, [BX - 2.02, 1.48, ENTRANCE_Z - .02], { cast: false, receive: false, name: 'blood-passcode-clue' });
  writing.rotation.y = Math.PI; writing.rotation.z = -.035; writing.renderOrder = 3;
}

function buildSurfaceExit(steel, darkSteel) {
  const x = BX + BW / 2;
  surfaceDoor = new THREE.Group();
  surfaceDoor.position.set(x - .035, 0, SURFACE_DOOR_Z); S.scene.add(surfaceDoor);
  const metal = std({ color: 0x293331, metalness: .72, roughness: .48, emissive: 0x07100e, emissiveIntensity: .2 });
  const edge = std({ color: 0x53605c, metalness: .82, roughness: .3 });
  const windowW = .92, windowH = .46, windowY = 1.61, sideW = (SURFACE_DOOR_W - windowW) / 2;

  mesh(new RoundedBoxGeometry(.15, 1.34, SURFACE_DOOR_W, 2, .025), metal, [0, .67, 0], { parent: surfaceDoor });
  mesh(new RoundedBoxGeometry(.15, .56, SURFACE_DOOR_W, 2, .025), metal, [0, 2.27, 0], { parent: surfaceDoor });
  for (const z of [-(windowW + sideW) / 2, (windowW + sideW) / 2])
    mesh(new THREE.BoxGeometry(.15, windowH, sideW), metal, [0, windowY, z], { parent: surfaceDoor });
  for (const y of [windowY - windowH / 2 - .055, windowY + windowH / 2 + .055])
    mesh(new THREE.BoxGeometry(.18, .11, SURFACE_DOOR_W), edge, [-.015, y, 0], { parent: surfaceDoor });

  const glass = mesh(new THREE.PlaneGeometry(windowW, windowH), new THREE.MeshStandardMaterial({
    color: 0x8aa49d, metalness: .05, roughness: .28, transparent: true, opacity: .2, side: THREE.DoubleSide,
  }), [-.082, windowY, 0], { parent: surfaceDoor, cast: false, receive: false });
  glass.rotation.y = Math.PI / 2;
  for (const z of [-.3, 0, .3]) mesh(new THREE.BoxGeometry(.025, windowH, .018), edge, [-.095, windowY, z], { parent: surfaceDoor, cast: false });
  for (const y of [windowY - .15, windowY, windowY + .15]) mesh(new THREE.BoxGeometry(.025, .018, windowW), edge, [-.095, y, 0], { parent: surfaceDoor, cast: false });

  const signTex = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#111715'; g.fillRect(0, 0, w, h); g.strokeStyle = '#75827c'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#d8b449'; g.textAlign = 'center'; g.font = 'bold 48px monospace'; g.fillText('SURFACE ACCESS', w / 2, 67);
    g.fillStyle = '#819088'; g.font = 'bold 27px monospace'; g.fillText('SECTOR C // MANUAL EXIT', w / 2, 115);
  });
  const sign = mesh(new THREE.PlaneGeometry(.92, .29), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide, toneMapped: false }),
    [-.086, .91, 0], { parent: surfaceDoor, cast: false });
  sign.rotation.y = Math.PI / 2;
  const handle = mesh(new THREE.CylinderGeometry(.045, .045, .22, 10), darkSteel, [-.15, 1.18, -.55], { parent: surfaceDoor });
  handle.rotation.z = Math.PI / 2;

  // Heavy frame around the operable surface exit.
  for (const z of [-SURFACE_DOOR_W / 2 - .11, SURFACE_DOOR_W / 2 + .11])
    mesh(new THREE.BoxGeometry(.28, SURFACE_DOOR_H + .25, .16), steel, [x, (SURFACE_DOOR_H + .25) / 2, SURFACE_DOOR_Z + z]);
  mesh(new THREE.BoxGeometry(.28, .18, SURFACE_DOOR_W + .38), steel, [x, SURFACE_DOOR_H + .09, SURFACE_DOOR_Z]);
  surfaceDoorCollider = addCollider(x, SURFACE_DOOR_Z, .42, SURFACE_DOOR_W + .08);
  S.camBlockers.push(...surfaceDoor.children.filter(child => child.isMesh));
  addInteractable([surfaceDoor, glass, sign], {
    verb: () => surfaceDoorOpen ? 'Close' : 'Open', name: 'the surface exit', anchor: V(x - .12, 0, SURFACE_DOOR_Z), range: 1.85,
    action: toggleSurfaceDoor,
  });
}

function toggleSurfaceDoor() {
  if (surfaceDoorBusy || !surfaceDoor) return;
  surfaceDoorBusy = true;
  const opening = !surfaceDoorOpen, start = surfaceDoor.rotation.y, target = opening ? Math.PI / 2 : 0;
  const hingeX = BX + BW / 2 - .035, hingeZ = SURFACE_DOOR_Z - SURFACE_DOOR_W / 2;
  if (opening) {
    Object.assign(surfaceDoorCollider, { minX: 9999, maxX: 10000, minZ: 9999, maxZ: 10000 });
    sfx.bunkerDoor(true);
  } else sfx.bunkerDoor(false);
  animate(.62, k => {
    const eased = k * k * (3 - 2 * k), angle = start + (target - start) * eased;
    surfaceDoor.rotation.y = angle;
    surfaceDoor.position.x = hingeX + Math.sin(angle) * SURFACE_DOOR_W / 2;
    surfaceDoor.position.z = hingeZ + Math.cos(angle) * SURFACE_DOOR_W / 2;
  }, () => {
    surfaceDoorOpen = opening; surfaceDoorBusy = false;
    if (!opening) {
      const player = S.player?.pos;
      if (player && Math.abs(player.x - (BX + BW / 2)) < .7 && Math.abs(player.z - SURFACE_DOOR_Z) < 1) player.x += player.x < BX + BW / 2 ? -.8 : .8;
      Object.assign(surfaceDoorCollider, {
        minX: BX + BW / 2 - .21, maxX: BX + BW / 2 + .21,
        minZ: SURFACE_DOOR_Z - SURFACE_DOOR_W / 2 - .04, maxZ: SURFACE_DOOR_Z + SURFACE_DOOR_W / 2 + .04,
      });
    }
  });
}

function buildAbandonedExterior() {
  const x0 = BX + BW / 2;
  const outdoor = object => { object.traverse(child => { child.userData.outdoor = true; }); return object; };
  const omesh = (geometry, material, position, options = {}) => outdoor(mesh(geometry, material, position, { cast: false, ...options }));
  const concrete = std({ color: 0x4b4e49, roughness: 1 });
  const oldConcrete = std({ color: 0x333936, roughness: 1 });
  const rust = std({ color: 0x563a2c, metalness: .55, roughness: .85 });
  const black = new THREE.MeshBasicMaterial({ color: 0x000202, fog: true, side: THREE.DoubleSide });

  const areaW = SURFACE_AREA.maxX - SURFACE_AREA.minX + 2, areaD = SURFACE_AREA.maxZ - SURFACE_AREA.minZ + 2;
  const ground = omesh(new THREE.PlaneGeometry(areaW, areaD), std({ color: 0x202923, roughness: 1 }),
    [(SURFACE_AREA.minX + SURFACE_AREA.maxX) / 2, -.035, (SURFACE_AREA.minZ + SURFACE_AREA.maxZ) / 2], { cast: false });
  ground.rotation.x = -Math.PI / 2;
  const path = omesh(new THREE.PlaneGeometry(60, 3.4), oldConcrete, [x0 + 29.5, -.018, SURFACE_DOOR_Z + 1.5], { cast: false });
  path.rotation.x = -Math.PI / 2;

  // Concrete stairway into the shell of an unfinished building.
  const stairZ = SURFACE_DOOR_Z + 8.2, stairX = x0 + 17;
  for (let i = 0; i < 8; i++) {
    const h = .16 + i * .16;
    omesh(new THREE.BoxGeometry(.58, h, 2.25), concrete, [stairX + i * .5, h / 2, stairZ]);
  }
  omesh(new THREE.BoxGeometry(2.7, .18, 2.7), concrete, [stairX + 4.1, 1.38, stairZ]);
  addCollider(stairX + 1.75, stairZ, 4.2, 2.4);

  const buildX = x0 + 27, buildZ = SURFACE_DOOR_Z + 11;
  for (const x of [buildX - 2.6, buildX + 2.6]) for (const z of [buildZ - 2.7, buildZ + 2.7]) {
    omesh(new THREE.BoxGeometry(.34, 5.2, .34), oldConcrete, [x, 2.6, z]); addCollider(x, z, .5, .5);
  }
  for (const y of [2.45, 4.75]) {
    omesh(new THREE.BoxGeometry(5.55, .22, 5.8), concrete, [buildX, y, buildZ]);
    for (const z of [buildZ - 2.7, buildZ + 2.7]) omesh(new THREE.BoxGeometry(5.7, .32, .3), oldConcrete, [buildX, y + .32, z]);
  }
  omesh(new THREE.BoxGeometry(.22, 2.2, 3.2), oldConcrete, [buildX + 2.55, 3.65, buildZ + .6]);
  addCollider(buildX + 2.55, buildZ + .6, .34, 3.25);
  for (let i = 0; i < 5; i++) omesh(new THREE.CylinderGeometry(.025, .025, 1.25 + i * .16, 6), rust,
    [buildX - 2.3 + i * .42, 5.38 + i * .08, buildZ - 2.25]);

  // Repeating concrete frames form a maintenance tunnel directly beyond the viewing slot.
  const tunnelX = x0 + 40, tunnelZ = SURFACE_DOOR_Z + 2;
  omesh(new THREE.BoxGeometry(7.4, .12, 3.35), oldConcrete, [tunnelX + 3.2, .02, tunnelZ]);
  for (let i = 0; i < 5; i++) {
    const x = tunnelX + i * 1.55;
    for (const z of [tunnelZ - 1.55, tunnelZ + 1.55])
      omesh(new THREE.BoxGeometry(.34, 2.85, .32), concrete, [x, 1.425, z]);
    omesh(new THREE.BoxGeometry(.34, .32, 3.42), concrete, [x, 2.7, tunnelZ]);
  }
  for (const z of [tunnelZ - 1.55, tunnelZ + 1.55]) addCollider(tunnelX + 3.1, z, 6.7, .42);
  addCollider(tunnelX + 6.35, tunnelZ, .42, 3.35);
  const tunnelEnd = omesh(new THREE.PlaneGeometry(3.05, 2.65), black, [tunnelX + 6.35, 1.36, tunnelZ], { cast: false });
  tunnelEnd.rotation.y = Math.PI / 2;

  // Rusted fence and barrels sit deeper in the construction yard, leaving the house perimeter clear.
  const yardFenceZ = SURFACE_DOOR_Z + 10.2;
  for (let i = 0; i < 11; i++) omesh(new THREE.BoxGeometry(.09, 1.7, .09), rust,
    [x0 + 2 + i * 1.35, .85, yardFenceZ]);
  for (const y of [.45, 1.25]) omesh(new THREE.BoxGeometry(14.2, .06, .08), rust,
    [x0 + 8.75, y, yardFenceZ]);
  addCollider(x0 + 8.75, yardFenceZ, 14.35, .28);
  for (const [x, z, tilt] of [[x0 + 10, SURFACE_DOOR_Z + 8.3, .05], [x0 + 14, SURFACE_DOOR_Z + 10.8, -.12], [x0 + 17, SURFACE_DOOR_Z + 7.5, .18]]) {
    const barrel = omesh(new THREE.CylinderGeometry(.3, .3, .82, 12), rust, [x, .41, z]); barrel.rotation.z = tilt;
    addCollider(x, z, .65, .65);
  }

  const rubbleCount = S.quality.lowPower ? 18 : 34, rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.42, 0), concrete, rubbleCount);
  const dummy = new THREE.Object3D();
  let rubblePlaced = 0;
  for (let attempts = 0; rubblePlaced < rubbleCount && attempts < 500; attempts++) {
    const scale = rnd(.25, .8), rx = x0 + rnd(1.4, 56), rz = rnd(SURFACE_AREA.minZ + .7, SURFACE_AREA.maxZ - .7);
    const inHouseClearance = rx > -18 && rx < 20 && rz > -18 && rz < 22;
    const inMainRoutes = (rx < 56 && rz > 12 && rz < 20) || (rx > 5 && rx < 75 && rz > 29 && rz < 40) ||
      (rx > 15 && rx < 61 && rz > -23 && rz < -17) || (rx > 55 && rx < 61 && rz > -23 && rz < 25);
    if (inHouseClearance || inMainRoutes || Math.hypot(rx - SURFACE_AREA.centerX, rz - SURFACE_AREA.centerZ) > SURFACE_AREA.radius - 10) continue;
    dummy.position.set(rx, scale * .14, rz); addCollider(rx, rz, scale * .8, scale * .8);
    dummy.rotation.set(rnd(0, .7), rnd(0, 6.28), rnd(0, .5)); dummy.scale.set(scale, scale * .65, scale * 1.2); dummy.updateMatrix(); rubble.setMatrixAt(rubblePlaced++, dummy.matrix);
  }
  rubble.count = rubblePlaced;
  rubble.instanceMatrix.needsUpdate = true; rubble.computeBoundingSphere(); rubble.userData.outdoor = true; rubble.receiveShadow = true; S.scene.add(rubble);

  // Bare trunks disappear into the fog and frame the construction without dense geometry.
  const deadTrees = [
    [x0 + 24, 8.2, 1.2], [x0 + 31, 13.5, 1.5], [x0 + 38, -1.8, 1.1], [x0 + 45, 17.5, 1.4],
    [x0 + 51, -2.15, 1.8], [x0 + 58, 20.5, 1.3], [x0 + 66, -1.4, 1.7], [x0 + 72, 15.6, 1.5],
  ];
  const treeMat = std({ color: 0x252b27, roughness: 1 });
  deadTrees.forEach(([x, dz, scale], index) => {
    const trunk = omesh(new THREE.CylinderGeometry(.12, .22, 4.4, 6), treeMat, [x, 2.2 * scale, SURFACE_DOOR_Z + dz]); trunk.scale.y = scale;
    addCollider(x, SURFACE_DOOR_Z + dz, .48, .48);
    for (const side of [-1, 1]) {
      const branch = omesh(new THREE.CylinderGeometry(.045, .08, 1.5, 5), treeMat, [x + side * .38, (3 + index % 2 * .35) * scale, SURFACE_DOOR_Z + dz]);
      branch.rotation.z = side * .8;
    }
  });

  // A failing work lamp provides the only warm cue outside.
  omesh(new THREE.CylinderGeometry(.045, .06, 2.8, 7), rust, [x0 + 2.5, 1.4, SURFACE_DOOR_Z - .7]);
  addCollider(x0 + 2.5, SURFACE_DOOR_Z - .7, .3, .3);
  omesh(new THREE.BoxGeometry(.32, .22, .24), new THREE.MeshBasicMaterial({ color: 0xd2a059, fog: true }),
    [x0 + 2.5, 2.75, SURFACE_DOOR_Z - .7], { cast: false });
  const workLight = new THREE.PointLight(0xdca35e, 2.2, 9, 2); workLight.position.set(x0 + 2.35, 2.5, SURFACE_DOOR_Z - .7); S.scene.add(workLight);
  S.onFrame((_dt, t) => { workLight.intensity = 1.65 + Math.sin(t * 7.7) * .22 + Math.sin(t * 19.3) * .12; });

  buildDistantDistrict(omesh, oldConcrete, rust);
  buildMountainBarrier();
}

function buildDistantDistrict(omesh, concrete, rust) {
  const roadZ = 34.5, roadMat = std({ color: 0x171b1a, roughness: 1 });
  const road = omesh(new THREE.PlaneGeometry(65, 8.5), roadMat, [39.5, -.012, roadZ], { cast: false }); road.rotation.x = -Math.PI / 2;
  for (const z of [roadZ - 4.35, roadZ + 4.35]) omesh(new THREE.BoxGeometry(65, .16, .36), concrete, [39.5, .08, z]);
  for (let x = 10; x < 71; x += 6) omesh(new THREE.BoxGeometry(2.8, .025, .13), std({ color: 0x8c805d, roughness: 1 }), [x, .018, roadZ]);

  const buildings = [
    { x: 27, z: 41, w: 7.5, d: 5.2, h: 10.5, c: 0x252b2e },
    { x: 39, z: 40, w: 8.5, d: 6.2, h: 15.5, c: 0x20272a },
    { x: 52, z: 40.5, w: 10, d: 6, h: 20, c: 0x1b2327 },
    { x: 65, z: 40, w: 8.5, d: 6.5, h: 16, c: 0x22272b },
    { x: 69, z: 27.5, w: 5.5, d: 6, h: 12, c: 0x272b2c },
  ];
  for (const building of buildings) {
    const mat = std({ color: building.c, roughness: .95 });
    omesh(new THREE.BoxGeometry(building.w, building.h, building.d), mat, [building.x, building.h / 2, building.z]);
    addCollider(building.x, building.z, building.w, building.d);
    const rows = Math.max(2, Math.floor(building.h / 2.1));
    for (let row = 0; row < rows; row++) for (let col = -1; col <= 1; col++) {
      if ((row + col + Math.round(building.x)) % 4 === 0) continue;
      omesh(new THREE.PlaneGeometry(.65, .42), new THREE.MeshBasicMaterial({ color: 0x8a8565, transparent: true, opacity: .35, fog: true }),
        [building.x + col * building.w * .22, 1.3 + row * 1.85, building.z - building.d / 2 - .012], { cast: false });
    }
  }

  for (let x = 12; x <= 66; x += 9) {
    omesh(new THREE.CylinderGeometry(.045, .065, 3.8, 7), rust, [x, 1.9, roadZ - 3.55]);
    omesh(new THREE.BoxGeometry(.3, .2, .22), new THREE.MeshBasicMaterial({ color: 0x776d53, fog: true }), [x, 3.72, roadZ - 3.55], { cast: false });
    addCollider(x, roadZ - 3.55, .3, .3);
  }
}

function buildMountainBarrier() {
  const material = std({ color: 0x151c1a, roughness: 1 });
  const ridgeMaterial = std({ color: 0x202724, roughness: 1 });
  const buildRing = (count, radius, minBase, maxBase, minHeight, maxHeight, mat, phase = 0) => {
    const geometry = new THREE.ConeGeometry(1, 1, 7);
    const batch = new THREE.InstancedMesh(geometry, mat, count), dummy = new THREE.Object3D();
    batch.userData.outdoor = true; batch.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      const angle = phase + i / count * Math.PI * 2 + rnd(-.035, .035);
      const base = rnd(minBase, maxBase), height = rnd(minHeight, maxHeight), r = radius + rnd(-2.2, 2.2);
      const x = SURFACE_AREA.centerX + Math.cos(angle) * r, z = SURFACE_AREA.centerZ + Math.sin(angle) * r;
      dummy.position.set(x, height / 2 - .15, z); dummy.rotation.set(0, rnd(0, Math.PI * 2), 0); dummy.scale.set(base, height, base); dummy.updateMatrix();
      batch.setMatrixAt(i, dummy.matrix);
      addCollider(x, z, base * 1.25, base * 1.25);
    }
    batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); S.scene.add(batch); S.camBlockers.push(batch);
  };
  buildRing(S.quality.lowPower ? 38 : 52, SURFACE_AREA.radius + 3, 8.5, 12.5, 22, 36, material);
  buildRing(S.quality.lowPower ? 28 : 38, SURFACE_AREA.radius + 14, 12, 17, 30, 48, ridgeMaterial, Math.PI / 38);
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

function buildSecureComputer(steel, darkSteel) {
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
  addInteractable([screen, keyboard], { verb: 'Log in to', name: 'the secure computer', anchor: V(BX, 0, z - .6), range: 1.8, action: openTerminal });
  drawTerminal();
}

function drawTerminal() {
  if (!terminalCanvas) return;
  const g = terminalCanvas.getContext('2d');
  g.fillStyle = '#020907'; g.fillRect(0, 0, 768, 432);
  g.strokeStyle = 'rgba(64,255,146,.12)'; g.lineWidth = 1;
  for (let y = 0; y < 432; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(768, y); g.stroke(); }
  g.fillStyle = '#48ff98'; g.font = 'bold 28px monospace'; g.fillText('PVC SECURE COMPUTER', 28, 46);
  g.fillStyle = '#6fbc91'; g.font = '16px monospace'; g.fillText('AUTHENTICATION GATE // LOCKED', 30, 82);
  g.strokeStyle = '#48ff98'; g.lineWidth = 3; g.strokeRect(492, 118, 190, 190);
  g.font = 'bold 92px monospace'; g.fillText('⌾', 535, 247);
  g.font = '16px monospace';
  ['6-DIGIT PASSCODE REQUIRED', 'ACCESS PROFILE: UNCONFIGURED', '', '> CLICK COMPUTER TO AUTHENTICATE'].forEach((line, i) => g.fillText(line, 30, 145 + i * 43));
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
    } else if (S.mode === 'terminal') {
      if (/^\d$/.test(event.key)) pushTerminalDigit(event.key);
      else if (event.key === 'Backspace') { terminalCode = terminalCode.slice(0, -1); paintTerminal(); }
      else if (event.key === 'Escape') closeTerminal();
    }
  });

  $('terminalExit').onclick = closeTerminal;
  $('terminalClear').onclick = () => { terminalCode = ''; $('terminalOverlay').classList.remove('denied'); $('terminalState').textContent = 'ENTER SIX-DIGIT PASSCODE'; paintTerminal(); sfx.click(); };
  const terminalOverlay = $('terminalOverlay'), terminalDisplay = $('terminalDisplay');
  const paintTerminal = () => { terminalDisplay.textContent = '●'.repeat(terminalCode.length).padEnd(6, '○'); };
  terminalOverlay.querySelectorAll('[data-terminal-digit]').forEach(button => button.onclick = () => pushTerminalDigit(button.dataset.terminalDigit));
  function pushTerminalDigit(digit) {
    if (terminalCode.length >= 6) return;
    terminalCode += digit; paintTerminal(); sfx.key();
    if (terminalCode.length !== 6) return;
    terminalOverlay.classList.add('denied'); $('terminalState').textContent = 'ACCESS PROFILE NOT CONFIGURED'; sfx.access(false);
    setTimeout(() => { terminalCode = ''; terminalOverlay.classList.remove('denied'); $('terminalState').textContent = 'ENTER SIX-DIGIT PASSCODE'; paintTerminal(); }, 1200);
  }
}

function openKeypad() {
  if (S.player.state === 'sit') S.player.stand();
  keypadCode = ''; S.mode = 'keypad'; $('keypadOverlay').classList.add('open'); $('keypadDisplay').textContent = '••••';
}
function closeKeypad() { $('keypadOverlay').classList.remove('open', 'denied', 'granted'); if (S.mode === 'keypad') S.mode = 'walk'; }
function openTerminal() {
  if (S.player.state === 'sit') S.player.stand();
  terminalCode = ''; S.mode = 'terminal'; $('terminalOverlay').classList.remove('denied');
  $('terminalOverlay').classList.add('open'); $('terminalDisplay').textContent = '○○○○○○'; $('terminalState').textContent = 'ENTER SIX-DIGIT PASSCODE';
}
function closeTerminal() { $('terminalOverlay').classList.remove('open', 'denied'); if (S.mode === 'terminal') S.mode = 'walk'; }

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
