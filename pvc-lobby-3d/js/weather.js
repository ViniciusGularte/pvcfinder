// Outdoor scene seen through the window. Weather controls are temporarily disabled.
import * as THREE from 'three';
import { S } from './core.js';
import { ROOM, WIN, SURFACE_AREA } from './config.js';
import { V, rnd, clamp01, canvasTex, softDot, addCollider, addRotCollider } from './util.js';
import { R } from './room.js';
import { audioFX } from './audio.js';
import { SEWER_OPENINGS } from './sewer.js';

export const PRESETS = {
  clear:  { icon: '✨', label: 'Clear',  rain: 0,   snow: 0,  clouds: .1,  fog: .05, wind: .15, lightning: false },
  cloudy: { icon: '☁️', label: 'Cloudy', rain: 0,   snow: 0,  clouds: .85, fog: .2,  wind: .35, lightning: false },
  rain:   { icon: '🌧️', label: 'Rain',   rain: .65, snow: 0,  clouds: .9,  fog: .3,  wind: .3,  lightning: false },
  storm:  { icon: '⛈️', label: 'Storm',  rain: 1,   snow: 0,  clouds: 1,   fog: .35, wind: .85, lightning: true },
  snow:   { icon: '❄️', label: 'Snow',   rain: 0,   snow: .8, clouds: .8,  fog: .35, wind: .2,  lightning: false },
  fog:    { icon: '🌫️', label: 'Fog',    rain: 0,   snow: 0,  clouds: .6,  fog: .9,  wind: .05, lightning: false },
};
// Multiplayer weather updates are intentionally ignored until the controls return.
export function setGlobalWeather() {}
const TIMES = { night: { icon: '🌙', label: 'Night' }, sunset: { icon: '🌅', label: 'Sunset' }, day: { icon: '☀️', label: 'Day' } };
const TIME_KEYS = Object.keys(TIMES);
const KEYS = ['rain', 'snow', 'clouds', 'fog', 'wind'];
const PAL = {
  night:  { top: new THREE.Color(0x0a1030), bot: new THREE.Color(0x253660), sun: new THREE.Color(0x8fa6ff), sunI: .45, hemiI: .6, bright: .1,  dir: V(20, 14, 4) },
  sunset: { top: new THREE.Color(0x2c2f6e), bot: new THREE.Color(0xff9a5a), sun: new THREE.Color(0xff9550), sunI: 1.9, hemiI: .72, bright: .55, dir: V(20, 7, -4) },
  day:    { top: new THREE.Color(0x3a78d0), bot: new THREE.Color(0xbfe0ff), sun: new THREE.Color(0xfff0d8), sunI: 3,   hemiI: .95, bright: 1,   dir: V(14, 16, 6) },
};

export function buildWeather() {
  const wx = S.wx = { ...PRESETS.fog, clouds: .9, fog: 1, wind: 0, lightning: false, time: 'night' };
  const cur = { rain: wx.rain, snow: wx.snow, clouds: wx.clouds, fog: wx.fog, wind: wx.wind, lightning: wx.lightning ? 1 : 0,
    night: wx.time === 'night' ? 1 : 0, sunset: wx.time === 'sunset' ? 1 : 0, day: wx.time === 'day' ? 1 : 0, wet: wx.rain, snowAcc: wx.snow * .8 };
  const wx0 = ROOM.w / 2, wy0 = WIN.y - WIN.h / 2;

  /* ---------- lights shared with the room ---------- */
  const hemi = new THREE.HemisphereLight(0xffe2c0, 0x3a2418, .45); S.scene.add(hemi);
  S.scene.add(new THREE.AmbientLight(0xffd2a8, .22));   // keeps the big room from going pitch black
  const sun = new THREE.DirectionalLight(0x8fa6ff, .4);
  sun.castShadow = true; sun.shadow.mapSize.set(S.quality.lowPower ? 768 : 1024, S.quality.lowPower ? 768 : 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  sun.target.position.set(4, 0, WIN.z); S.scene.add(sun, sun.target);
  const winLight = new THREE.PointLight(0x9fb4ff, .4, 10, 1.5); winLight.position.set(wx0 - .8, WIN.y, WIN.z); S.scene.add(winLight);

  /* ---------- outside ---------- */
  const out = new THREE.Group(); S.scene.add(out);
  const skyUni = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, flash: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUni,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float flash; varying vec3 vDir;
      void main(){ float h = smoothstep(-.02, .5, vDir.y); vec3 c = mix(bottom, top, h); c += flash * vec3(.55,.6,.8) * (1. - h*.4);
      gl_FragColor = vec4(c, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; out.add(sky);

  const starN = 700, starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) { const th = rnd(0, Math.PI * 2), el = Math.asin(rnd(.05, 1)), r = 280; starPos.set([Math.cos(th) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(th) * Math.cos(el) * r], i * 3); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff8e0, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  out.add(stars);

  const squareGlow = (inner, outer) => canvasTex(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = inner; g.fillRect(40, 40, 48, 48);
  });
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: squareGlow('#fff7d6', 'rgba(220,230,255,.35)'), transparent: true, fog: false, depthWrite: false }));
  moon.position.set(160, 36, WIN.z + 8); moon.scale.setScalar(26); out.add(moon);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: squareGlow('#fff2b0', 'rgba(255,170,80,.6)'), transparent: true, fog: false, depthWrite: false }));
  sunSprite.position.set(160, 12, WIN.z - 6); sunSprite.scale.setScalar(36); out.add(sunSprite);

  const cloudTex = canvasTex(256, 128, g => {
    for (let i = 0; i < 26; i++) {
      const x = rnd(40, 216), y = rnd(50, 90) - Math.abs(x - 128) * .15, r = rnd(18, 38);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    s.position.set(rnd(60, 180), rnd(22, 55), rnd(-140, 140)); s.scale.set(rnd(40, 75), rnd(18, 30), 1);
    s.userData.speed = rnd(.6, 1.2); out.add(s); clouds.push(s);
  }

  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3f5a30 });
  // A real opening is cut for each sewer stairwell. A single PlaneGeometry used to
  // cover the steps from above and disappear from below, which looked transparent.
  const groundCenterX = wx0 + 120;
  const groundShape = new THREE.Shape();
  groundShape.moveTo(-120, -160); groundShape.lineTo(120, -160);
  groundShape.lineTo(120, 160); groundShape.lineTo(-120, 160); groundShape.closePath();
  for (const opening of SEWER_OPENINGS) {
    const hole = new THREE.Path();
    const x0 = opening.minX - groundCenterX, x1 = opening.maxX - groundCenterX;
    const y0 = -opening.maxZ, y1 = -opening.minZ;
    hole.moveTo(x0, y0).lineTo(x0, y1).lineTo(x1, y1).lineTo(x1, y0).closePath();
    groundShape.holes.push(hole);
  }
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(groundShape), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(groundCenterX, -.02, 0); ground.receiveShadow = true; out.add(ground);
  S.camBlockers.push(ground);
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x2e4628 });
  for (let i = 0; i < 9; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hillMat);
    const hx = rnd(100, 210), hz = rnd(-160, 160), sx = rnd(25, 50), sz = rnd(25, 50);
    h.position.set(hx, -2, hz); h.scale.set(sx, rnd(8, 22), sz); out.add(h);
    if (Math.hypot(hx - SURFACE_AREA.centerX, hz - SURFACE_AREA.centerZ) < SURFACE_AREA.radius + Math.max(sx, sz)) addCollider(hx, hz, sx * 1.35, sz * 1.35);
  }
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 }), pineMat = new THREE.MeshLambertMaterial({ color: 0x2b4a2c });
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0 });
  const trees = [
    { x: wx0 + 7, z: WIN.z - 7, s: 1.3 }, { x: wx0 + 9.5, z: WIN.z + 6.5, s: 1.6 },
    { x: wx0 + 12, z: WIN.z - 12, s: 1.2 }, { x: wx0 + 6.5, z: WIN.z + 11, s: 1.1 },
  ];
  const inReservedSurface = (x, z) =>
    (x > -16 && x < 18 && z > -18 && z < 24) ||
    (x > -7 && x < 55 && z > 11 && z < 31) ||
    (x > 5 && x < 75 && z > 28 && z < 46) ||
    (x > 15 && x < 61 && z > -23 && z < -17) ||
    (x > 55 && x < 61 && z > -23 && z < 25);
  for (let attempts = 0; trees.length < 74 && attempts < 500; attempts++) {
    const tree = { x: rnd(wx0 + 14, wx0 + 100), z: rnd(-90, 90), s: rnd(.9, 2.2) };
    if (!inReservedSurface(tree.x, tree.z)) trees.push(tree);
  }
  trees.forEach(tree => addCollider(tree.x, tree.z, .48 * tree.s, .48 * tree.s));
  const treeDummy = new THREE.Object3D();
  const treeInstances = (geometry, material, y, cast = false) => {
    const batch = new THREE.InstancedMesh(geometry, material, trees.length);
    trees.forEach((tree, index) => {
      treeDummy.position.set(tree.x, y * tree.s, tree.z); treeDummy.scale.setScalar(tree.s); treeDummy.updateMatrix();
      batch.setMatrixAt(index, treeDummy.matrix);
    });
    batch.instanceMatrix.needsUpdate = true; batch.castShadow = cast; batch.receiveShadow = false; batch.computeBoundingSphere(); out.add(batch);
  };
  treeInstances(new THREE.CylinderGeometry(.18, .25, 1.4, 6), trunkMat, .7);
  for (let k = 0; k < 3; k++) {
    treeInstances(new THREE.ConeGeometry(1.5 - k * .38, 1.9, 7), pineMat, 1.7 + k * 1.05, true);
    treeInstances(new THREE.ConeGeometry(1.0 - k * .26, .8, 7), snowMat, 2.25 + k * 1.05);
  }

  // A future exploration area: visible from indoors, but deliberately outside the walkable room.
  // Most repeated scenery is instanced so the richer skyline stays cheap to render.
  const detail = S.quality.lowPower ? .55 : 1;
  const dummy = new THREE.Object3D();
  const instances = (geometry, material, items, place, cast = false) => {
    const batch = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, index) => { place(dummy, item); dummy.updateMatrix(); batch.setMatrixAt(index, dummy.matrix); });
    batch.instanceMatrix.needsUpdate = true; batch.castShadow = cast; batch.receiveShadow = true;
    batch.computeBoundingSphere(); out.add(batch); return batch;
  };

  // Cracked country road and faded lane markings beyond the fence.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 118), new THREE.MeshLambertMaterial({ color: 0x292b2a }));
  road.rotation.x = -Math.PI / 2; road.position.set(wx0 + 17, .006, 2); road.receiveShadow = true; out.add(road);
  const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x544d3e });
  for (const x of [wx0 + 10.55, wx0 + 23.45]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(.45, .025, 118), shoulderMat);
    shoulder.position.set(x, .015, 2); shoulder.receiveShadow = true; out.add(shoulder);
  }
  const marks = Array.from({ length: 12 }, (_, i) => ({ z: -52 + i * 10 }));
  instances(new THREE.BoxGeometry(.13, .025, 3.4), new THREE.MeshLambertMaterial({ color: 0xb8aa79 }), marks,
    (d, item) => { d.position.set(wx0 + 17, .026, item.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });

  // Broad-leaf trees break up the pine silhouette without adding individual draw calls.
  const deciduous = [];
  const deciduousCount = Math.round(30 * detail);
  for (let attempts = 0; deciduous.length < deciduousCount && attempts < 400; attempts++) {
    const tree = { x: rnd(wx0 + 11, wx0 + 76), z: rnd(-72, 76), s: rnd(.75, 1.65), r: rnd(0, Math.PI * 2) };
    if (!inReservedSurface(tree.x, tree.z)) deciduous.push(tree);
  }
  deciduous.forEach(tree => addCollider(tree.x, tree.z, .7 * tree.s, .7 * tree.s));
  const decidTrunk = new THREE.MeshLambertMaterial({ color: 0x58402a });
  const decidLeaf = new THREE.MeshLambertMaterial({ color: 0x385b2f });
  instances(new THREE.CylinderGeometry(.18, .28, 1.8, 6), decidTrunk, deciduous, (d, t) => {
    d.position.set(t.x, .9 * t.s, t.z); d.rotation.set(0, t.r, 0); d.scale.set(t.s, t.s, t.s);
  });
  const crownGeo = new THREE.IcosahedronGeometry(1.25, 1);
  instances(crownGeo, decidLeaf, deciduous, (d, t) => {
    d.position.set(t.x, 2.45 * t.s, t.z); d.rotation.set(t.r * .08, t.r, 0); d.scale.set(1.05 * t.s, .9 * t.s, 1.05 * t.s);
  }, true);

  const bushes = [];
  const bushCount = Math.round(58 * detail);
  for (let attempts = 0; bushes.length < bushCount && attempts < 400; attempts++) {
    const bush = { x: rnd(wx0 + 5, wx0 + 52), z: rnd(-36, 42), s: rnd(.35, .9), r: rnd(0, Math.PI * 2) };
    if (!inReservedSurface(bush.x, bush.z)) bushes.push(bush);
  }
  bushes.forEach(bush => addCollider(bush.x, bush.z, .65 * bush.s, .65 * bush.s));
  instances(new THREE.DodecahedronGeometry(.75, 0), new THREE.MeshLambertMaterial({ color: 0x456936 }), bushes, (d, b) => {
    d.position.set(b.x, .42 * b.s, b.z); d.rotation.set(0, b.r, 0); d.scale.set(1.3 * b.s, .75 * b.s, b.s);
  });

  const grass = [];
  const grassCount = Math.round(120 * detail);
  for (let attempts = 0; grass.length < grassCount && attempts < 600; attempts++) {
    const tuft = { x: rnd(wx0 + 4.6, wx0 + 45), z: rnd(-28, 34), s: rnd(.55, 1.35), r: rnd(0, Math.PI * 2) };
    if (!inReservedSurface(tuft.x, tuft.z)) grass.push(tuft);
  }
  instances(new THREE.ConeGeometry(.13, .55, 5), new THREE.MeshLambertMaterial({ color: 0x668044 }), grass, (d, g) => {
    d.position.set(g.x, .23 * g.s, g.z); d.rotation.set(0, g.r, 0); d.scale.set(g.s, g.s, g.s);
  });

  // Small rubble clusters imply a larger abandoned area while keeping the scene non-explorable.
  const rubble = [];
  const rubbleCount = Math.round(42 * detail);
  for (let attempts = 0; rubble.length < rubbleCount && attempts < 400; attempts++) {
    const rock = { x: rnd(wx0 + 5.5, wx0 + 28), z: rnd(-24, 30), s: rnd(.18, .62), r: rnd(0, Math.PI * 2) };
    if (!inReservedSurface(rock.x, rock.z)) rubble.push(rock);
  }
  rubble.forEach(rock => addCollider(rock.x, rock.z, .7 * rock.s, .7 * rock.s));
  instances(new THREE.DodecahedronGeometry(.65, 0), new THREE.MeshLambertMaterial({ color: 0x6b675d }), rubble, (d, rock) => {
    d.position.set(rock.x, rock.s * .24, rock.z); d.rotation.set(rock.r * .25, rock.r, rock.r * .12); d.scale.set(rock.s, rock.s * .65, rock.s * 1.15);
  });

  const carWheelMat = new THREE.MeshLambertMaterial({ color: 0x111312 });
  const carGlassMat = new THREE.MeshLambertMaterial({ color: 0x172629, transparent: true, opacity: .82 });
  const rustMat = new THREE.MeshLambertMaterial({ color: 0x713b24 });
  const abandonedCar = (x, z, yaw, color) => {
    const car = new THREE.Group(); car.position.set(x, 0, z); car.rotation.y = yaw; out.add(car);
    const paint = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, .54, 4.15), paint); body.position.y = .56; body.castShadow = true; car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.68, .72, 1.82), paint); cabin.position.set(0, 1.08, -.16); cabin.castShadow = true; car.add(cabin);
    for (const side of [-1, 1]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(.02, .43, 1.38), carGlassMat); window.position.set(side * .846, 1.12, -.16); car.add(window);
      for (const axle of [-1.35, 1.35]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .2, 10), carWheelMat);
        wheel.position.set(side * 1.0, .36, axle); wheel.rotation.z = Math.PI / 2; car.add(wheel);
      }
    }
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.45, .43, .025), carGlassMat); windshield.position.set(0, 1.12, .76); windshield.rotation.x = -.16; car.add(windshield);
    const rust = new THREE.Mesh(new THREE.BoxGeometry(.52, .015, .85), rustMat); rust.position.set(.48, .838, 1.2); rust.rotation.y = .24; car.add(rust);
    addRotCollider(x, z, 2.15, 4.35, yaw);
    return car;
  };
  abandonedCar(wx0 + 12.8, WIN.z + .1, .13, 0x596b63);
  abandonedCar(wx0 + 20.5, WIN.z + 7.4, -.24, 0x734a3f);
  abandonedCar(wx0 + 16.7, WIN.z - 10.5, .32, 0x4c5a70);

  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });
  const fenceSegments = [[-16, 12.4], [17.6, 22]]; // broad gate beside the house
  for (let z = -16; z <= 22; z += 1.6) if (z < 12.4 || z > 17.6) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.12, .9, .12), fenceMat); p.position.set(wx0 + 4.2, .45, z); out.add(p);
  }
  for (const gateZ of [12.4, 17.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.17, 1.15, .17), fenceMat); p.position.set(wx0 + 4.2, .575, gateZ); out.add(p); }
  for (const [z0, z1] of fenceSegments) {
    const len = z1 - z0, center = (z0 + z1) / 2;
    for (const y of [.35, .7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.06, .08, len), fenceMat); rail.position.set(wx0 + 4.2, y, center); out.add(rail); }
    const snowCap = new THREE.Mesh(new THREE.BoxGeometry(.14, .05, len), snowMat); snowCap.position.set(wx0 + 4.2, .76, center); out.add(snowCap);
    addCollider(wx0 + 4.2, center, .25, len);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 3, 8), new THREE.MeshLambertMaterial({ color: 0x222222 })); post.position.set(wx0 + 5.5, 1.5, WIN.z + 1.2); out.add(post);
  addCollider(wx0 + 5.5, WIN.z + 1.2, .25, .25);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(.3, .4, .3), new THREE.MeshBasicMaterial({ color: 0xffc070 })); lantern.position.set(wx0 + 5.5, 3.1, WIN.z + 1.2); out.add(lantern);
  const lanternLight = new THREE.PointLight(0xffb060, 3, 10, 1.5); lanternLight.position.set(wx0 + 5.5, 2.9, WIN.z + 1.2); out.add(lanternLight);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffb060, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(lantern.position); halo.scale.setScalar(2.2); out.add(halo);
  const sillSnow = new THREE.Mesh(new THREE.BoxGeometry(.28, .1, WIN.w), snowMat); sillSnow.position.set(wx0 + .16, wy0 + .03, WIN.z); out.add(sillSnow);

  const RAIN_N = S.quality.lowPower ? 1500 : 2400, rainPos = new Float32Array(RAIN_N * 6), rainSeed = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) rainSeed.set([rnd(wx0 + .5, wx0 + 48), rnd(0, 30), rnd(-30, 36)], i * 3);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xaab8d0, transparent: true, opacity: .5 });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; out.add(rain);
  const SNOW_N = S.quality.lowPower ? 1200 : 1800, snowPos = new Float32Array(SNOW_N * 3), snowPh = new Float32Array(SNOW_N);
  for (let i = 0; i < SNOW_N; i++) { snowPos.set([rnd(wx0 + .5, wx0 + 38), rnd(0, 25), rnd(-22, 28)], i * 3); snowPh[i] = rnd(0, 6.28); }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: softDot, color: 0xffffff, size: .16, transparent: true, depthWrite: false }));
  snow.frustumCulled = false; out.add(snow);
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef2ff, fog: false, transparent: true }));
  bolt.visible = false; bolt.frustumCulled = false; out.add(bolt);

  /* ---------- per-frame weather ---------- */
  const C = { top: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), tmp: new THREE.Color(), g1: new THREE.Color(), g2: new THREE.Color() };
  const timeWeight = { night: 0, sunset: 0, day: 0 };
  const GREY = { dTop: new THREE.Color(0x13161c), dBot: new THREE.Color(0x20242c), lTop: new THREE.Color(0x7f8893), lBot: new THREE.Color(0xa7aeb6) };
  const FLASH = new THREE.Color(0xdfe6ff), WARM = new THREE.Color(0xffe2c0), GRASS = new THREE.Color(0x3f5a30), SNOWC = new THREE.Color(0xe9eef7);
  const dirV = V();
  let strikes = [], nextStrike = rnd(2, 6), boltT = 9, audioT = 0;

  function strike(now) {
    strikes = [now, now + rnd(.07, .14), now + rnd(.2, .4)];
    const p = boltGeo.attributes.position, sx = wx0 + rnd(40, 110), sz = rnd(-50, 50);
    let x = sx, y = 60, z = sz;
    for (let i = 0; i < 60; i++) { p.setXYZ(i, x, y, z); x += rnd(-1.6, 1.6); z += rnd(-2.2, 2.2); y -= 60 / 59; }
    p.needsUpdate = true; boltT = 0;
    const dist = Math.hypot(sx - wx0, sz);
    audioFX.thunder(THREE.MathUtils.mapLinear(dist, 40, 130, .25, 2.6), clamp01(1.25 - dist / 130));
  }

  S.onFrame((dt, now) => {
    const k = 1 - Math.exp(-dt * 1.1);
    for (const key of KEYS) cur[key] += (wx[key] - cur[key]) * k;
    cur.lightning += ((wx.lightning ? 1 : 0) - cur.lightning) * k;
    for (const t of TIME_KEYS) cur[t] += ((wx.time === t ? 1 : 0) - cur[t]) * k * .8;
    cur.wet += (cur.rain - cur.wet) * (1 - Math.exp(-dt * .15));
    cur.snowAcc += ((cur.snow > .05 ? Math.max(cur.snowAcc, cur.snow) : 0) - cur.snowAcc) * (1 - Math.exp(-dt * (cur.snow > .05 ? .12 : .05 + cur.day * .1)));

    const sum = cur.night + cur.sunset + cur.day || 1, w = timeWeight;
    w.night = cur.night / sum; w.sunset = cur.sunset / sum; w.day = cur.day / sum;
    let bright = 0, sunI = 0, hemiI = 0;
    C.top.setRGB(0, 0, 0); C.bot.setRGB(0, 0, 0); C.sun.setRGB(0, 0, 0); dirV.set(0, 0, 0);
    for (const t of TIME_KEYS) {
      C.top.add(C.tmp.copy(PAL[t].top).multiplyScalar(w[t])); C.bot.add(C.tmp.copy(PAL[t].bot).multiplyScalar(w[t]));
      C.sun.add(C.tmp.copy(PAL[t].sun).multiplyScalar(w[t])); dirV.addScaledVector(PAL[t].dir, w[t]);
      sunI += PAL[t].sunI * w[t]; hemiI += PAL[t].hemiI * w[t]; bright += PAL[t].bright * w[t];
    }
    const cover = clamp01(Math.max(cur.clouds, cur.rain * .95, cur.snow * .85, cur.lightning * .95));
    C.g1.copy(GREY.dTop).lerp(GREY.lTop, bright); C.g2.copy(GREY.dBot).lerp(GREY.lBot, bright);
    C.top.lerp(C.g1, cover * .9); C.bot.lerp(C.g2, cover * .85); C.top.lerp(C.bot, cur.fog * .8);

    let flash = 0;
    if (cur.lightning > .5) { nextStrike -= dt; if (nextStrike <= 0) { strike(now); nextStrike = rnd(5, 16); } }
    for (const t0 of strikes) if (now >= t0) flash += Math.exp(-(now - t0) * 16);
    flash = Math.min(flash, 1.3);
    boltT += dt; bolt.visible = boltT < .32; bolt.material.opacity = 1 - boltT / .32;

    skyUni.top.value.copy(C.top); skyUni.bottom.value.copy(C.bot); skyUni.flash.value = flash;
    S.scene.fog.color.copy(C.bot);
    // Thick native scene fog hides the forest quickly without adding particles or draw calls.
    S.scene.fog.near = 3 + (1 - cur.fog) * 24; S.scene.fog.far = 72 + Math.pow(1 - cur.fog, 2) * 150;

    sun.color.copy(C.sun).lerp(FLASH, clamp01(flash));
    sun.intensity = sunI * (1 - cover * .75) + flash * 6;
    sun.position.copy(sun.target.position).add(dirV.normalize().multiplyScalar(45));
    hemi.intensity = hemiI * (1 - cover * .25) + flash * .4;
    hemi.color.copy(WARM).lerp(C.bot, .3);
    winLight.color.copy(C.bot); winLight.intensity = (.3 + bright * 2.6) * (1 - cover * .4) + flash * 6;

    stars.material.opacity = w.night * (1 - cover) * (1 - cur.fog);
    moon.material.opacity = w.night * (1 - cover * .92) * (1 - cur.fog * .85);
    sunSprite.material.opacity = w.sunset * (1 - cover * .92) * (1 - cur.fog * .85);
    C.tmp.setRGB(.17, .19, .24).lerp(C.g1.setRGB(1, 1, 1), bright * (1 - cur.rain * .45));
    if (w.sunset > .05) C.tmp.lerp(C.g2.setRGB(1, .72, .55), w.sunset * .5);
    C.tmp.lerp(FLASH, clamp01(flash * .8));
    for (const c of clouds) {
      c.material.color.copy(C.tmp); c.material.opacity = Math.min(.95, cover * 1.1);
      c.position.z += dt * c.userData.speed * (1 + cur.wind * 6); if (c.position.z > 150) c.position.z = -150;
    }
    groundMat.color.copy(GRASS).multiplyScalar(1 - cur.wet * .3).lerp(SNOWC, cur.snowAcc);
    snowMat.opacity = clamp01(cur.snowAcc * 1.2);
    sillSnow.scale.y = Math.max(.01, cur.snowAcc); sillSnow.position.y = wy0 + .005 + .05 * cur.snowAcc;
    lanternLight.intensity = (w.night + w.sunset * .6) * 3; halo.material.opacity = (w.night + w.sunset * .6) * (.35 + cur.fog * .4);

    const nRain = Math.floor(cur.rain * RAIN_N), drift = cur.wind * 9, fall = 22;
    for (let i = 0; i < nRain; i++) {
      let y = rainSeed[i * 3 + 1] - fall * dt, z = rainSeed[i * 3 + 2] + drift * dt;
      if (y < 0) { y += 30; z = rnd(-30, 36); }
      if (z > 36) z -= 66;
      rainSeed[i * 3 + 1] = y; rainSeed[i * 3 + 2] = z;
      const x = rainSeed[i * 3];
      const j = i * 6;
      rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z;
      rainPos[j + 3] = x; rainPos[j + 4] = y + .75; rainPos[j + 5] = z - drift * .034;
    }
    rainGeo.setDrawRange(0, nRain * 2); rainGeo.attributes.position.needsUpdate = true;
    rainMat.color.setRGB(.55, .6, .72).lerp(C.g1.setRGB(.85, .88, .95), bright).lerp(FLASH, clamp01(flash));
    const nSnow = Math.floor(cur.snow * SNOW_N), sp = snowGeo.attributes.position.array;
    for (let i = 0; i < nSnow; i++) {
      sp[i * 3 + 1] -= (1.1 + cur.wind) * dt;
      sp[i * 3 + 2] += (Math.sin(now * .8 + snowPh[i]) * .4 + cur.wind * 4) * dt;
      if (sp[i * 3 + 1] < 0) { sp[i * 3 + 1] = 25; sp[i * 3 + 2] = rnd(-22, 28); }
      if (sp[i * 3 + 2] > 28) sp[i * 3 + 2] -= 50;
    }
    snowGeo.setDrawRange(0, nSnow); snowGeo.attributes.position.needsUpdate = true;
    snow.material.color.setRGB(.5, .55, .65).lerp(C.g1.setRGB(1, 1, 1), Math.max(bright, .35));

    R.glassMat.opacity = .06 + cur.rain * .6 + cur.fog * .08;
    R.glass.material.map.offset.y += dt * (.02 + cur.rain * .05);
    audioT -= dt; if (audioT <= 0) { audioT = .2; audioFX.setWeather(cur); }
  });

  /* Weather panel and wall-plaque interaction intentionally disabled for now. */
  return {};
}
