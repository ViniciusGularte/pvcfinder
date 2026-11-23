import * as THREE from 'three';
import { S } from './core.js';
import { addCollider, canvasTex, mesh, std } from './util.js';

const FLOOR = -3.4, CEILING = -.55, HALF = 1.55;
const A = { x0: 18, x1: 24, z: -20 };
const B = { x: 58, z0: 16, z1: 22 };
export const SEWER_OPENINGS = [
  { minX: A.x0 - .3, maxX: A.x1 + .2, minZ: A.z - 1.6, maxZ: A.z + 1.6 },
  { minX: B.x - 1.6, maxX: B.x + 1.6, minZ: B.z0 - .2, maxZ: B.z1 + .3 },
];

export function buildSewer() {
  const concrete = std({ color: 0x303a36, roughness: .96, metalness: .04 });
  const wet = std({ color: 0x172622, roughness: .38, metalness: .08 });
  const rust = std({ color: 0x5a3b2d, roughness: .82, metalness: .48 });
  const retaining = concrete.clone(); retaining.side = THREE.DoubleSide;
  const rail = std({ color: 0x7c5a32, roughness: .65, metalness: .72 });
  const hazard = std({ color: 0xd59825, emissive: 0x5a2a05, emissiveIntensity: .55, roughness: .68, metalness: .35 });
  const signTexture = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#121715'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d59825'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#efb84c'; g.font = '700 48px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SEWER ACCESS', w / 2, h / 2 + 2);
  });
  const sign = new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false, fog: false });
  const wallOpts = { minY: FLOOR - .5, maxY: -.35, kind: 'sewer-wall' };
  const addPart = (geometry, material, position, opts = {}) => {
    const part = mesh(geometry, material, position, { cast: false, receive: true, ...opts });
    S.camBlockers.push(part); return part;
  };

  // Main L-shaped network: far east of the house, then north to a second exit.
  addPart(new THREE.BoxGeometry(34, .16, HALF * 2), wet, [41, FLOOR - .08, A.z]);
  addPart(new THREE.BoxGeometry(34, .16, HALF * 2 + 3), concrete, [41, CEILING, A.z]);
  // Fill the complete turning square. The two straight slabs only overlap in half
  // of it, which previously left the outer corner open to the surface. The roof
  // deliberately overhangs the walls so the outdoor scene cannot leak through
  // the seam at shallow first-person viewing angles.
  addPart(new THREE.BoxGeometry(HALF * 2, .16, HALF * 2), wet, [B.x, FLOOR - .08, A.z]);
  addPart(new THREE.BoxGeometry(HALF * 2 + 2.4, .16, HALF * 2 + 2.4), concrete, [B.x, CEILING, A.z]);
  const horizontalOuterLength = B.x + HALF - A.x1;
  const horizontalInnerLength = B.x - HALF - A.x1;
  const horizontalOuterX = (A.x1 + B.x + HALF) / 2;
  const horizontalInnerX = (A.x1 + B.x - HALF) / 2;
  addPart(new THREE.BoxGeometry(horizontalOuterLength, CEILING - FLOOR, .18), concrete,
    [horizontalOuterX, (FLOOR + CEILING) / 2, A.z - HALF]);
  addCollider(horizontalOuterX, A.z - HALF, horizontalOuterLength, .24, wallOpts);
  addPart(new THREE.BoxGeometry(horizontalInnerLength, CEILING - FLOOR, .18), concrete,
    [horizontalInnerX, (FLOOR + CEILING) / 2, A.z + HALF]);
  addCollider(horizontalInnerX, A.z + HALF, horizontalInnerLength, .24, wallOpts);
  addPart(new THREE.BoxGeometry(HALF * 2, .16, 36), wet, [B.x, FLOOR - .08, -2]);
  addPart(new THREE.BoxGeometry(HALF * 2 + 3, .16, 36), concrete, [B.x, CEILING, -2]);
  const verticalOuterLength = B.z0 - (A.z - HALF);
  const verticalInnerLength = B.z0 - (A.z + HALF);
  const verticalOuterZ = (B.z0 + A.z - HALF) / 2;
  const verticalInnerZ = (B.z0 + A.z + HALF) / 2;
  addPart(new THREE.BoxGeometry(.18, CEILING - FLOOR, verticalOuterLength), concrete,
    [B.x + HALF, (FLOOR + CEILING) / 2, verticalOuterZ]);
  addCollider(B.x + HALF, verticalOuterZ, .24, verticalOuterLength, wallOpts);
  addPart(new THREE.BoxGeometry(.18, CEILING - FLOOR, verticalInnerLength), concrete,
    [B.x - HALF, (FLOOR + CEILING) / 2, verticalInnerZ]);
  addCollider(B.x - HALF, verticalInnerZ, .24, verticalInnerLength, wallOpts);

  buildStairsA(addPart, concrete, retaining, rail, hazard, sign, wallOpts);
  buildStairsB(addPart, concrete, retaining, rail, hazard, sign, wallOpts);

  // Low-cost pipes and pools create depth without extra dynamic shadows.
  for (let x = 27; x <= 54; x += 4.5) {
    const pipe = addPart(new THREE.CylinderGeometry(.09, .09, 4.1, 8), rust, [x, -1.0, A.z - 1.28]);
    pipe.rotation.z = Math.PI / 2;
  }
  for (let z = -16; z <= 13; z += 5) {
    addPart(new THREE.CylinderGeometry(.08, .08, 3.3, 8), rust, [B.x + 1.27, -1.05, z]).rotation.x = Math.PI / 2;
  }
  const lightCount = S.quality.lowPower ? 3 : 7;
  const horizontalLights = Math.ceil(lightCount * .55), verticalLights = lightCount - horizontalLights;
  const lampMat = std({ color: 0x9ec8b3, emissive: 0x6dba91, emissiveIntensity: 2.4, roughness: .55 });
  for (let i = 0; i < lightCount; i++) {
    const alongVertical = i >= horizontalLights;
    const light = new THREE.PointLight(i % 3 === 0 ? 0x9bb8a8 : 0x6d927e, S.quality.lowPower ? .7 : 1.15, 8, 2);
    if (alongVertical) {
      const verticalIndex = i - horizontalLights;
      const z = verticalLights === 1 ? -2 : -15 + verticalIndex * 26 / (verticalLights - 1);
      light.position.set(B.x, -1.05, z);
      mesh(new THREE.BoxGeometry(.72, .07, .16), lampMat, [light.position.x, CEILING - .1, light.position.z], { cast: false });
    } else {
      const x = horizontalLights === 1 ? 41 : 27 + i * 27 / (horizontalLights - 1);
      light.position.set(x, -1.05, A.z);
      mesh(new THREE.BoxGeometry(.16, .07, .72), lampMat, [light.position.x, CEILING - .1, light.position.z], { cast: false });
    }
    S.scene.add(light);
  }

  S.groundHeightAt = (x, z, currentY = 0) => {
    if (z >= A.z - 1.3 && z <= A.z + 1.3 && x >= A.x0 && x <= A.x1) return FLOOR * ((x - A.x0) / (A.x1 - A.x0));
    if (x >= B.x - 1.3 && x <= B.x + 1.3 && z >= B.z0 && z <= B.z1) return FLOOR * (1 - (z - B.z0) / (B.z1 - B.z0));
    const below = currentY < -.45;
    const horizontal = x >= A.x1 && x <= B.x && z >= A.z - 1.35 && z <= A.z + 1.35;
    const vertical = x >= B.x - 1.35 && x <= B.x + 1.35 && z >= A.z && z <= B.z0;
    const turn = x >= B.x - 1.35 && x <= B.x + 1.35 && z >= A.z - 1.35 && z <= A.z + 1.35;
    return below && (horizontal || vertical || turn) ? FLOOR : 0;
  };
  S.sewer = { floor: FLOOR, isUnderground: (x, z, y) => y < -.45 && S.groundHeightAt(x, z, y) < -.45 };
}

function buildStairsA(addPart, concrete, retaining, rail, hazard, sign, wallOpts) {
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = (i + .5) / steps, y = FLOOR * t;
    addPart(new THREE.BoxGeometry(.52, .16, 2.6), concrete, [A.x0 + t * (A.x1 - A.x0), y - .08, A.z]);
  }
  for (const z of [A.z - 1.45, A.z + 1.45]) {
    addPart(wedgeGeometry([
      [A.x0 - .15, .12, z], [A.x1 + .12, .12, z],
      [A.x1 + .12, FLOOR - .12, z], [A.x0 - .15, -.12, z],
    ]), retaining, [0, 0, 0]);
    addCollider(21, z, 6.4, .24, { ...wallOpts, maxY: .4 });
  }
  stairRailsA(rail);
  entranceFrame(addPart, concrete, hazard, sign, A.x0 - .15, A.z, 0);
}

function buildStairsB(addPart, concrete, retaining, rail, hazard, sign, wallOpts) {
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = (i + .5) / steps, y = FLOOR * (1 - t);
    addPart(new THREE.BoxGeometry(2.6, .16, .52), concrete, [B.x, y - .08, B.z0 + t * (B.z1 - B.z0)]);
  }
  for (const x of [B.x - 1.45, B.x + 1.45]) {
    addPart(wedgeGeometry([
      [x, .12, B.z0 - .12], [x, FLOOR - .12, B.z0 - .12],
      [x, -.12, B.z1 + .15], [x, .12, B.z1 + .15],
    ]), retaining, [0, 0, 0]);
    addCollider(x, 19, .24, 6.4, { ...wallOpts, maxY: .4 });
  }
  stairRailsB(rail);
  entranceFrame(addPart, concrete, hazard, sign, B.x, B.z1 + .15, Math.PI / 2);
}

function wedgeGeometry(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals(); return geometry;
}

function beamBetween(material, from, to, radius = .035) {
  const direction = to.clone().sub(from), length = direction.length();
  const beam = mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material, from.clone().add(to).multiplyScalar(.5).toArray(), { cast: false });
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return beam;
}

function stairRailsA(material) {
  for (const z of [A.z - 1.34, A.z + 1.34]) {
    beamBetween(material, new THREE.Vector3(A.x0, .82, z), new THREE.Vector3(A.x1, FLOOR + .82, z), .045);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, y = FLOOR * t;
      mesh(new THREE.CylinderGeometry(.035, .035, .72, 8), material, [A.x0 + t * 6, y + .36, z], { cast: false });
    }
  }
}

function stairRailsB(material) {
  for (const x of [B.x - 1.34, B.x + 1.34]) {
    beamBetween(material, new THREE.Vector3(x, FLOOR + .82, B.z0), new THREE.Vector3(x, .82, B.z1), .045);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, y = FLOOR * (1 - t);
      mesh(new THREE.CylinderGeometry(.035, .035, .72, 8), material, [x, y + .36, B.z0 + t * 6], { cast: false });
    }
  }
}

function entranceFrame(addPart, concrete, hazard, sign, x, z, yaw) {
  if (yaw === 0) {
    addPart(new THREE.BoxGeometry(.28, 2.15, .34), concrete, [x, 1.075, z - 1.52]);
    addPart(new THREE.BoxGeometry(.28, 2.15, .34), concrete, [x, 1.075, z + 1.52]);
    addPart(new THREE.BoxGeometry(.3, .28, 3.35), concrete, [x, 2.02, z]);
    addPart(new THREE.BoxGeometry(.18, .12, 2.85), hazard, [x + .14, .08, z]);
    const board = addPart(new THREE.PlaneGeometry(1.7, .43), sign, [x - .16, 1.68, z], { receive: false }); board.rotation.y = -Math.PI / 2;
  } else {
    addPart(new THREE.BoxGeometry(.34, 2.15, .28), concrete, [x - 1.52, 1.075, z]);
    addPart(new THREE.BoxGeometry(.34, 2.15, .28), concrete, [x + 1.52, 1.075, z]);
    addPart(new THREE.BoxGeometry(3.35, .28, .3), concrete, [x, 2.02, z]);
    addPart(new THREE.BoxGeometry(2.85, .12, .18), hazard, [x, .08, z - .14]);
    addPart(new THREE.PlaneGeometry(1.7, .43), sign, [x, 1.68, z + .16], { receive: false });
  }
  const lamp = new THREE.PointLight(0xffb34f, S.quality.lowPower ? 1.25 : 2.1, 7, 2);
  if (yaw === 0) lamp.position.set(x + .5, 1.55, z); else lamp.position.set(x, 1.55, z - .5);
  S.scene.add(lamp);
}
