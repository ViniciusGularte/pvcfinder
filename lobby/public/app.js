import * as THREE from "./vendor/three.module.js";

const $ = (selector) => document.querySelector(selector);
const ui = {
  scene: $("#scene"),
  join: $("#joinScreen"),
  joinForm: $("#joinForm"),
  joinStatus: $("#joinStatus"),
  name: $("#playerName"),
  topbar: $("#topbar"),
  online: $("#onlineCount"),
  players: $("#playersPanel"),
  playersList: $("#playersList"),
  chat: $("#chatPanel"),
  chatLog: $("#chatLog"),
  chatForm: $("#chatForm"),
  chatInput: $("#chatInput"),
  crosshair: $("#crosshair"),
  interaction: $("#interaction"),
  interactionText: $("#interactionText"),
  toast: $("#toast"),
  map: $("#mapOverlay"),
  mapFrame: $("#mapFrame"),
  mapTitle: $("#mapTitle"),
  terminal: $("#terminalOverlay"),
  terminalTitle: $("#terminalTitle"),
  terminalFrame: $("#terminalFrame"),
  coreFps: $("#coreFps"),
  coreTriangles: $("#coreTriangles"),
  coreCalls: $("#coreCalls"),
  corePlayers: $("#corePlayers"),
  help: $("#helpOverlay"),
  audio: $("#jukeboxAudio"),
};

const state = {
  id: null,
  joined: false,
  ready: false,
  socket: null,
  config: {},
  shared: { jukeboxPlaying: false, mapWorld: "overworld" },
  players: new Map(),
  avatars: new Map(),
  seats: {},
  keys: new Set(),
  position: new THREE.Vector3(0, 1.65, 7),
  yaw: Math.PI,
  pitch: 0,
  moving: false,
  seated: null,
  activeInteraction: null,
  lastSent: 0,
  fps: 0,
  frameCount: 0,
  fpsStartedAt: performance.now(),
  firstPersonHand: null,
  handActionStarted: 0,
  handActionUntil: 0,
  handActionType: "use",
};
const seatPositions = {
  "sofa-1": { x: -1.4, y: 1.25, z: 6.7, yaw: Math.PI },
  "sofa-2": { x: 1.4, y: 1.25, z: 6.7, yaw: Math.PI },
  "chair-1": { x: -5.4, y: 1.2, z: 4.5, yaw: -Math.PI / 2 },
  "chair-2": { x: 5.4, y: 1.2, z: 4.5, yaw: Math.PI / 2 },
  "chair-3": { x: 0, y: 1.2, z: -1.5, yaw: 0 },
};

ui.name.value = localStorage.getItem("pvc-lobby-name") || "";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc9dc);
scene.fog = new THREE.Fog(0x9bc9dc, 34, 92);
const camera = new THREE.PerspectiveCamera(
  68,
  innerWidth / innerHeight,
  0.05,
  100,
);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
ui.scene.append(renderer.domElement);

const world = new THREE.Group();
const interactables = [];
const animatedProps = [];
scene.add(world);
scene.add(camera);
const raycaster = new THREE.Raycaster();
raycaster.far = 3.2;
const clock = new THREE.Clock();

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.12,
    ...extra,
  });
const materials = {
  floor: mat(0x514a40),
  wall: mat(0xddd2bf),
  dark: mat(0x20282b, { metalness: 0.52, roughness: 0.38 }),
  wood: mat(0x85532f),
  leather: mat(0x86512f),
  amber: mat(0xf59e0b, { emissive: 0x7a3300, emissiveIntensity: 1.4 }),
  screen: mat(0x13222a, { emissive: 0x1c7891, emissiveIntensity: 1.25 }),
  green: mat(0x3bd27b, { emissive: 0x126335, emissiveIntensity: 1 }),
};
function box(name, size, position, material = materials.dark, parent = world) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(
  name,
  radiusTop,
  radiusBottom,
  height,
  position,
  material = materials.dark,
  parent = world,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12),
    material,
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function monitorTexture(kind, title, subtitle = "", accent = "#f59e0b") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
  gradient.addColorStop(0, "#071116");
  gradient.addColorStop(1, "#0d0905");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(115,190,210,.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x < 1024; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y < 512; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 992, 480);

  if (kind.startsWith("map")) {
    const nether = kind.includes("nether");
    const colors = nether
      ? ["#541d17", "#8a2f1d", "#c2582e", "#27100e"]
      : ["#315d3d", "#557d47", "#af9a65", "#24465a"];
    for (let y = 0; y < 11; y += 1)
      for (let x = 0; x < 25; x += 1) {
        const noise = Math.abs(Math.sin(x * 9.13 + y * 3.77));
        ctx.fillStyle =
          colors[
            Math.min(colors.length - 1, Math.floor(noise * colors.length))
          ];
        ctx.fillRect(60 + x * 36, 62 + y * 31, 34, 29);
      }
    ctx.strokeStyle = nether ? "#ff9a62" : "#f9d26f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(110, 350);
    ctx.bezierCurveTo(300, 80, 610, 450, 910, 160);
    ctx.stroke();
    [
      [270, 210],
      [520, 300],
      [760, 175],
    ].forEach(([x, y]) => {
      ctx.fillStyle = "#fff4c6";
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (kind === "store") {
    ["DIAMOND BLOCK", "RED MUSHROOM", "ELYTRA"].forEach((item, index) => {
      const y = 92 + index * 105;
      ctx.fillStyle = "rgba(245,158,11,.12)";
      ctx.fillRect(62, y, 900, 76);
      ctx.fillStyle = ["#62d8f1", "#ef5c45", "#b9c0c9"][index];
      ctx.fillRect(82, y + 14, 48, 48);
      ctx.fillStyle = "#f4eadb";
      ctx.font = "bold 26px monospace";
      ctx.textAlign = "left";
      ctx.fillText(item, 158, y + 45);
      ctx.fillStyle = "#7cf0a5";
      ctx.textAlign = "right";
      ctx.fillText(["IN STOCK", "RESTOCKED", "5 SHOPS"][index], 928, y + 45);
    });
  } else if (kind === "eye") {
    ctx.strokeStyle = "rgba(89,227,145,.55)";
    ctx.lineWidth = 4;
    [80, 145, 210].forEach((radius) => {
      ctx.beginPath();
      ctx.arc(512, 260, radius, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(280, 260);
    ctx.lineTo(744, 260);
    ctx.moveTo(512, 28);
    ctx.lineTo(512, 492);
    ctx.stroke();
    [
      [430, 170],
      [605, 310],
      [350, 335],
      [690, 145],
    ].forEach(([x, y]) => {
      ctx.fillStyle = "#59e391";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "#59e391";
      ctx.shadowBlur = 20;
    });
    ctx.shadowBlur = 0;
  } else if (kind === "core") {
    ctx.strokeStyle = "#64cce5";
    ctx.lineWidth = 4;
    const points = [
      [512, 75],
      [260, 225],
      [385, 420],
      [665, 420],
      [775, 225],
    ];
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      ctx.beginPath();
      ctx.moveTo(...p);
      ctx.lineTo(...q);
      ctx.stroke();
    });
    points.forEach(([x, y]) => {
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(x - 12, y - 12, 24, 24);
    });
    ctx.fillStyle = "#9ce5f5";
    ctx.font = "22px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SCENE 60 FPS  //  WEBSOCKET LIVE", 512, 470);
  }

  ctx.fillStyle = "rgba(5,7,8,.86)";
  ctx.fillRect(34, 28, 956, 54);
  ctx.fillStyle = accent;
  ctx.font = "bold 30px monospace";
  ctx.textAlign = "left";
  ctx.fillText(title, 58, 64);
  ctx.fillStyle = "#b9aa98";
  ctx.font = "18px monospace";
  ctx.textAlign = "right";
  ctx.fillText(subtitle, 965, 63);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function screenPlane(
  name,
  size,
  position,
  rotation,
  title,
  subtitle,
  action,
  kind = "sign",
) {
  const material = new THREE.MeshBasicMaterial({
    map: monitorTexture(kind, title, subtitle),
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.userData.interaction = action;
  world.add(mesh);
  interactables.push(mesh);
  return mesh;
}
function addInteraction(mesh, label, action) {
  mesh.userData.interaction = { label, action };
  interactables.push(mesh);
}

function buildVoxelLetters() {
  const patterns = {
    P: ["1110", "1001", "1110", "1000", "1000"],
    V: ["10001", "10001", "01010", "01010", "00100"],
    C: ["0111", "1000", "1000", "1000", "0111"],
  };
  let cursor = -9.2;
  for (const letter of ["P", "V", "C"]) {
    const rows = patterns[letter];
    rows.forEach((row, rowIndex) =>
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") return;
        const block = box(
          `PVC-${letter}`,
          [1.15, 1.15, 0.8],
          [cursor + columnIndex * 1.2, 6.4 - rowIndex * 1.2, 31],
          materials.amber,
        );
        block.castShadow = false;
      }),
    );
    cursor += Math.max(...rows.map((row) => row.length)) * 1.2 + 1.2;
  }
  box("pvc-sign-base", [22, 0.7, 2.2], [0, 0.15, 31], materials.dark);
}

function buildExterior() {
  const grass = mat(0x64834e, { roughness: 1 });
  box("outside-ground", [90, 0.6, 75], [0, -0.45, 36], grass);
  const sun = new THREE.DirectionalLight(0xfff2d1, 3.2);
  sun.position.set(-18, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  world.add(sun);
  const hillMaterial = mat(0x78945a, { roughness: 1 });
  [
    [-24, 24, 8, 4],
    [24, 22, 10, 3],
    [-18, 44, 14, 6],
    [20, 48, 18, 5],
  ].forEach(([x, z, w, h]) =>
    box("hill", [w, h, 8], [x, h / 2 - 0.1, z], hillMaterial),
  );
  [
    [-10, 18],
    [12, 20],
    [-25, 38],
    [27, 36],
  ].forEach(([x, z]) => {
    box("tree-trunk", [1.1, 5, 1.1], [x, 2.2, z], mat(0x795033));
    box(
      "tree-leaves",
      [4.2, 3.8, 4.2],
      [x, 5.1, z],
      mat(0x426d3d, { roughness: 1 }),
    );
    box(
      "tree-leaves",
      [3, 2.5, 3],
      [x, 7.5, z],
      mat(0x527f45, { roughness: 1 }),
    );
  });
  buildVoxelLetters();
}

function buildRoomDetails() {
  const trim = mat(0xb56b24, {
    emissive: 0x351500,
    emissiveIntensity: 0.45,
    metalness: 0.5,
  });
  const rug = mat(0x26383d, { roughness: 1 });
  const leaf = mat(0x3e8157, { roughness: 0.95 });
  const pot = mat(0xa75b32, { roughness: 0.9 });

  box("lounge-rug", [8.2, 0.04, 5.4], [0, 0.015, 3.8], rug);
  box("rug-stripe-a", [8.25, 0.025, 0.1], [0, 0.045, 2], trim);
  box("rug-stripe-b", [8.25, 0.025, 0.1], [0, 0.045, 5.6], trim);
  [-13.72, 13.72].forEach((x) =>
    box("wall-trim", [0.08, 0.08, 20], [x, 2.8, 0], trim),
  );

  [-11.8, 11.8].forEach((x) => {
    cylinder("plant-pot", 0.45, 0.34, 0.75, [x, 0.38, 8.9], pot);
    const crown = new THREE.Group();
    crown.position.set(x, 1.15, 8.9);
    world.add(crown);
    for (let index = 0; index < 5; index += 1) {
      const frond = box(
        "plant-leaf",
        [0.17, 1.15, 0.42],
        [0, 0.35, 0],
        leaf,
        crown,
      );
      frond.rotation.z = (index - 2) * 0.24;
      frond.rotation.y = index * 1.7;
    }
  });

  const holo = new THREE.Group();
  holo.position.set(0, 1.2, 3.1);
  world.add(holo);
  [0.42, 0.62, 0.82].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.025, 8, 32),
      materials.screen,
    );
    ring.rotation.x = Math.PI / 2 + index * 0.35;
    ring.rotation.y = index * 0.7;
    holo.add(ring);
  });
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3, 0),
    materials.amber,
  );
  core.castShadow = true;
  holo.add(core);
  const holoLight = new THREE.PointLight(0x69d4e8, 4, 4, 2);
  holo.add(holoLight);
  animatedProps.push({ type: "hologram", object: holo });

  const dustGeometry = new THREE.BufferGeometry();
  const dust = new Float32Array(90 * 3);
  for (let index = 0; index < 90; index += 1) {
    dust[index * 3] = (Math.random() - 0.5) * 25;
    dust[index * 3 + 1] = 0.3 + Math.random() * 6.7;
    dust[index * 3 + 2] = (Math.random() - 0.5) * 18;
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const dustCloud = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: 0xffdca1,
      size: 0.025,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  world.add(dustCloud);
  animatedProps.push({ type: "dust", object: dustCloud });
}

function buildRoom() {
  box("floor", [28, 0.35, 22], [0, -0.2, 0], materials.floor);
  box("ceiling", [28, 0.25, 22], [0, 7.8, 0], materials.dark);
  box("back-wall", [28, 8, 0.35], [0, 3.8, -11], materials.wall);
  box("left-wall", [0.35, 8, 22], [-14, 3.8, 0], materials.wall);
  box("right-wall", [0.35, 8, 22], [14, 3.8, 0], materials.wall);
  box("window-sill", [28, 1.1, 0.55], [0, 0.35, 10.85], materials.wall);
  box("window-header", [28, 0.65, 0.55], [0, 7.45, 10.85], materials.dark);
  [-14, -9.3, -4.65, 0, 4.65, 9.3, 14].forEach((x) =>
    box("window-frame", [0.28, 6.5, 0.48], [x, 4, 10.8], materials.dark),
  );
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbde9f2,
    transparent: true,
    opacity: 0.2,
    roughness: 0.08,
    metalness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  [-11.65, -7, -2.32, 2.32, 7, 11.65].forEach((x) => {
    const glass = box(
      "window-glass",
      [4.35, 6.2, 0.08],
      [x, 4, 10.76],
      glassMaterial,
    );
    glass.castShadow = false;
  });
  buildExterior();
  for (let x = -11; x <= 11; x += 5.5) {
    const light = new THREE.PointLight(0xf59e0b, 16, 12, 2);
    light.position.set(x, 6.8, 0);
    light.castShadow = x === 0;
    world.add(light);
    box("ceiling-light", [2.5, 0.12, 0.35], [x, 7.58, 0], materials.amber);
  }
  scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x62513b, 2.15));
  buildRoomDetails();

  box("map-frame", [12.5, 5.7, 0.45], [0, 4.25, -10.55], materials.dark);
  const mapScreen = screenPlane(
    "map-screen",
    [11.7, 4.9],
    [0, 4.3, -10.3],
    [0, 0, 0],
    "PVC LIVE MAP",
    "OVERWORLD // E TO OPEN",
    { label: "OPEN SHARED SERVER MAP", action: "map" },
    "map-overworld",
  );
  state.mapScreen = mapScreen;
  box("map-console", [8, 0.8, 1.5], [0, 0.4, -8.8], materials.dark);
  box("map-console-glow", [5, 0.04, 0.7], [0, 0.82, -8.55], materials.screen);

  const terminals = [
    {
      x: -9,
      title: "PVC STORE",
      sub: "MARKET TERMINAL",
      action: "shop",
      kind: "store",
    },
    {
      x: -5.8,
      title: "THREE.JS CORE",
      sub: "ROOM RENDER NODE",
      action: "core",
      kind: "core",
    },
    {
      x: 8.2,
      title: "GRV EYE",
      sub: "OBSERVATION NODE",
      action: "eye",
      kind: "eye",
    },
  ];
  terminals.forEach((t) => {
    box("desk", [2.8, 0.18, 1.4], [t.x, 1.05, -5.8], materials.wood);
    box("terminal", [2.2, 1.55, 0.25], [t.x, 2, -6.2], materials.dark);
    screenPlane(
      t.title,
      [1.85, 1.15],
      [t.x, 2.05, -6.05],
      [0, 0, 0],
      t.title,
      t.sub,
      { label: `USE ${t.title}`, action: t.action },
      t.kind,
    );
    box("keyboard", [1.25, 0.07, 0.48], [t.x, 1.18, -5.55], materials.dark);
    for (let key = -4; key <= 4; key += 1)
      box(
        "keyboard-key",
        [0.09, 0.025, 0.09],
        [t.x + key * 0.12, 1.23, -5.5],
        materials.screen,
      );
  });

  box("sofa-base", [4.7, 0.7, 1.7], [0, 0.55, 7.2], materials.leather);
  box("sofa-back", [4.7, 1.7, 0.45], [0, 1.35, 7.9], materials.leather);
  [
    [-1.4, "sofa-1"],
    [1.4, "sofa-2"],
  ].forEach(([x, id]) => {
    const cushion = box(id, [1.8, 0.22, 1.25], [x, 1, 6.85], mat(0x53301b));
    addInteraction(cushion, "SIT ON SOFA", { type: "sit", seatId: id });
  });
  [
    [-5.4, 4.5, "chair-1", Math.PI / 2],
    [5.4, 4.5, "chair-2", -Math.PI / 2],
    [0, -1.5, "chair-3", 0],
  ].forEach(([x, z, id, rotation]) => {
    const chair = new THREE.Group();
    chair.position.set(x, 0, z);
    chair.rotation.y = rotation;
    world.add(chair);
    box(
      "chair-seat",
      [1.25, 0.25, 1.25],
      [0, 0.75, 0],
      materials.leather,
      chair,
    );
    box(
      "chair-back",
      [1.25, 1.6, 0.25],
      [0, 1.35, 0.55],
      materials.leather,
      chair,
    );
    const hit = box(
      id,
      [1.4, 1.8, 1.4],
      [0, 1, 0],
      new THREE.MeshBasicMaterial({ visible: false }),
      chair,
    );
    addInteraction(hit, "SIT DOWN", { type: "sit", seatId: id });
  });

  const jukebox = box(
    "jukebox",
    [1.35, 1.7, 1.35],
    [-11.6, 0.85, 7.2],
    mat(0x552510),
  );
  box("jukebox-slot", [0.75, 0.12, 0.08], [-11.6, 1.28, 6.51], materials.amber);
  addInteraction(jukebox, "TOGGLE JUKEBOX", { type: "jukebox" });
  state.jukebox = jukebox;
  const coffee = box(
    "coffee-machine",
    [1.5, 2.1, 1.2],
    [11.4, 1.05, 6.7],
    materials.dark,
  );
  addInteraction(coffee, "BREW COFFEE", { type: "coffee" });
  box("coffee-glow", [0.9, 0.55, 0.06], [11.4, 1.45, 6.08], materials.amber);
  box("coffee-spout", [0.22, 0.5, 0.35], [11.4, 0.73, 6.02], materials.dark);
  cylinder("coffee-cup", 0.27, 0.22, 0.42, [11.4, 0.27, 6.05], mat(0xe7dcc8));
  box("food-counter", [5.5, 1.05, 1.6], [9.5, 0.52, 1.3], materials.wood);
  [
    [7.8, 0xed6b3a, "APPLE"],
    [9.4, 0xe0b04f, "BREAD"],
    [11, 0xc94835, "CAKE"],
  ].forEach(([x, color, name]) => {
    const food = box(name, [0.65, 0.45, 0.65], [x, 1.35, 1.3], mat(color));
    addInteraction(food, `TAKE ${name}`, { type: "food", name });
  });
  box("center-table", [3.8, 0.28, 2.4], [0, 0.72, 3.1], materials.wood);
  screenPlane(
    "room-sign",
    [6.5, 1.5],
    [0, 6.55, -10.25],
    [0, 0, 0],
    "PVC COMMON ROOM",
    "MARKET // MAP // PEOPLE",
    { label: "PVC SOCIAL NODE", action: "noop" },
    "sign",
  );
}
buildRoom();

const skinFaces = {
  head: [
    [0, 8, 8, 8],
    [16, 8, 8, 8],
    [8, 0, 8, 8],
    [16, 0, 8, 8],
    [8, 8, 8, 8],
    [24, 8, 8, 8],
  ],
  body: [
    [16, 20, 4, 12],
    [28, 20, 4, 12],
    [20, 16, 8, 4],
    [28, 16, 8, 4],
    [20, 20, 8, 12],
    [32, 20, 8, 12],
  ],
  armR: [
    [40, 20, 4, 12],
    [48, 20, 4, 12],
    [44, 16, 4, 4],
    [48, 16, 4, 4],
    [44, 20, 4, 12],
    [52, 20, 4, 12],
  ],
  armL: [
    [32, 52, 4, 12],
    [40, 52, 4, 12],
    [36, 48, 4, 4],
    [40, 48, 4, 4],
    [36, 52, 4, 12],
    [44, 52, 4, 12],
  ],
  legR: [
    [0, 20, 4, 12],
    [8, 20, 4, 12],
    [4, 16, 4, 4],
    [8, 16, 4, 4],
    [4, 20, 4, 12],
    [12, 20, 4, 12],
  ],
  legL: [
    [16, 52, 4, 12],
    [24, 52, 4, 12],
    [20, 48, 4, 4],
    [24, 48, 4, 4],
    [20, 52, 4, 12],
    [28, 52, 4, 12],
  ],
};

function cropTexture(image, x, y, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, w * 8);
  canvas.height = Math.max(4, h * 8);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}
function faceMaterials(image, faces) {
  return faces.map(
    ([x, y, w, h]) =>
      new THREE.MeshStandardMaterial({
        map: cropTexture(image, x, y, w, h),
        roughness: 0.82,
        metalness: 0,
        transparent: true,
      }),
  );
}
function addSkinPart(group, image, size, pos, faces, name) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    faceMaterials(image, faces),
  );
  mesh.position.set(...pos);
  mesh.name = name;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}
function addSkinLimb(group, image, size, pivot, faces, name) {
  const joint = new THREE.Group();
  joint.name = name;
  joint.position.set(...pivot);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    faceMaterials(image, faces),
  );
  mesh.position.y = -size[1] / 2;
  mesh.castShadow = true;
  joint.add(mesh);
  group.add(joint);
  return joint;
}
function buildAvatar(player) {
  const group = new THREE.Group();
  group.position.set(player.x, 0, player.z);
  group.userData.target = new THREE.Vector3(player.x, 0, player.z);
  group.userData.yaw = player.yaw;
  group.userData.moving = false;
  group.userData.seated = false;
  group.userData.emote = null;
  group.userData.emoteStarted = 0;
  group.userData.emoteUntil = 0;
  group.userData.phase = Math.random() * Math.PI * 2;
  const rig = new THREE.Group();
  rig.name = "avatarRig";
  group.add(rig);
  const placeholder = box(
    "placeholder",
    [0.55, 1.8, 0.35],
    [0, 0.9, 0],
    mat(0x8b5e34),
    rig,
  );
  const sprite = nameSprite(player.name);
  sprite.position.set(0, 2.35, 0);
  group.add(sprite);
  scene.add(group);
  state.avatars.set(player.id, group);
  const img = new Image();
  img.crossOrigin = "anonymous";
  let triedSteve = String(player.skin).toLowerCase() === "steve";
  img.onload = () => {
    rig.remove(placeholder);
    addSkinPart(
      rig,
      img,
      [0.5, 0.5, 0.5],
      [0, 1.75, 0],
      skinFaces.head,
      "head",
    );
    addSkinPart(
      rig,
      img,
      [0.5, 0.75, 0.25],
      [0, 1.12, 0],
      skinFaces.body,
      "body",
    );
    addSkinLimb(
      rig,
      img,
      [0.25, 0.75, 0.25],
      [-0.39, 1.49, 0],
      skinFaces.armL,
      "armL",
    );
    addSkinLimb(
      rig,
      img,
      [0.25, 0.75, 0.25],
      [0.39, 1.49, 0],
      skinFaces.armR,
      "armR",
    );
    addSkinLimb(
      rig,
      img,
      [0.25, 0.75, 0.25],
      [-0.14, 0.75, 0],
      skinFaces.legL,
      "legL",
    );
    addSkinLimb(
      rig,
      img,
      [0.25, 0.75, 0.25],
      [0.14, 0.75, 0],
      skinFaces.legR,
      "legR",
    );
  };
  img.onerror = () => {
    if (triedSteve) return;
    triedSteve = true;
    img.src = `${state.config.skinUrl}${encodeURIComponent("Steve")}`;
  };
  img.src = `${state.config.skinUrl}${encodeURIComponent(player.skin)}`;
  return group;
}
function buildFirstPersonHand(skin) {
  if (state.firstPersonHand) camera.remove(state.firstPersonHand);
  const hand = new THREE.Group();
  hand.position.set(0.52, -0.5, -0.82);
  hand.rotation.set(-0.42, -0.18, -0.14);
  camera.add(hand);
  state.firstPersonHand = hand;

  const img = new Image();
  img.crossOrigin = "anonymous";
  let triedSteve = String(skin).toLowerCase() === "steve";
  img.onload = () => {
    addSkinPart(
      hand,
      img,
      [0.26, 0.82, 0.26],
      [0, -0.18, 0],
      skinFaces.armR,
      "viewHand",
    );
  };
  img.onerror = () => {
    if (triedSteve) return;
    triedSteve = true;
    img.src = `${state.config.skinUrl}${encodeURIComponent("Steve")}`;
  };
  img.src = `${state.config.skinUrl}${encodeURIComponent(skin)}`;
}
function triggerHandAction(type = "use", duration = 620) {
  state.handActionStarted = performance.now();
  state.handActionUntil = state.handActionStarted + duration;
  state.handActionType = type;
}
function nameSprite(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(5,5,5,.82)";
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 508, 92);
  ctx.fillStyle = "#fff4de";
  ctx.font = "bold 30px monospace";
  ctx.textAlign = "center";
  ctx.fillText(name, 256, 61);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  );
  sprite.scale.set(2.2, 0.42, 1);
  return sprite;
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const base = location.pathname.startsWith("/lobby") ? "/lobby" : "";
  const socket = new WebSocket(`${protocol}://${location.host}${base}/ws`);
  state.socket = socket;
  socket.onopen = () => {
    ui.joinStatus.textContent = "SYNCING ROOM STATE";
  };
  socket.onclose = () => {
    state.ready = false;
    ui.joinStatus.textContent = "CONNECTION LOST // RETRYING";
    if (state.joined) toast("LOUNGE CONNECTION LOST");
    setTimeout(connect, 2500);
  };
  socket.onmessage = ({ data }) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    handleMessage(msg);
  };
}
function send(message) {
  if (state.socket?.readyState === WebSocket.OPEN)
    state.socket.send(JSON.stringify(message));
}
function handleMessage(msg) {
  if (msg.type === "welcome") {
    state.ready = true;
    ui.joinStatus.textContent = "LOUNGE ONLINE // ENTER WHEN READY";
    state.id = msg.id;
    state.config = msg.config;
    state.shared = msg.shared;
    state.seats = msg.seats || {};
    msg.players.forEach((p) => upsertPlayer(p));
    msg.chat.forEach(addChat);
    syncShared();
    renderPlayers();
    if (state.joined)
      send({
        type: "join",
        name: ui.name.value.trim(),
        skin: ui.name.value.trim(),
      });
    return;
  }
  if (msg.type === "player-join") {
    upsertPlayer(msg.player);
    addSystem(`${msg.player.name} entered the lounge`);
    renderPlayers();
    return;
  }
  if (msg.type === "player-leave") {
    removePlayer(msg.id);
    state.seats = msg.seats || {};
    renderPlayers();
    return;
  }
  if (msg.type === "player-move") {
    upsertPlayer(msg.player);
    return;
  }
  if (msg.type === "emote") {
    const avatar = state.avatars.get(msg.id);
    if (avatar) {
      avatar.userData.emote = msg.emote;
      avatar.userData.emoteStarted = performance.now();
      avatar.userData.emoteUntil = performance.now() + 1400;
    }
    return;
  }
  if (msg.type === "chat") {
    addChat(msg.row);
    return;
  }
  if (msg.type === "seats") {
    state.seats = msg.seats || {};
    upsertPlayer(msg.player);
    syncSeatState(msg.player);
    return;
  }
  if (msg.type === "shared") {
    state.shared = msg.shared;
    syncShared();
    return;
  }
  if (msg.type === "error") toast(msg.message);
}
function upsertPlayer(player) {
  state.players.set(player.id, player);
  if (player.id === state.id) {
    syncSeatState(player);
    return;
  }
  let avatar = state.avatars.get(player.id);
  if (!avatar) avatar = buildAvatar(player);
  avatar.userData.target.set(player.x, 0, player.z);
  avatar.userData.yaw = player.yaw;
  avatar.userData.moving = player.moving;
  avatar.userData.seated = !!player.seatId;
  if (player.seatId && seatPositions[player.seatId]) {
    const seat = seatPositions[player.seatId];
    avatar.userData.target.set(seat.x, 0, seat.z);
    avatar.userData.yaw = seat.yaw;
  }
}
function removePlayer(id) {
  const avatar = state.avatars.get(id);
  if (avatar) scene.remove(avatar);
  state.avatars.delete(id);
  state.players.delete(id);
}
function syncSeatState(player) {
  if (player.id !== state.id) return;
  state.seated = player.seatId || null;
  if (state.seated && seatPositions[state.seated]) {
    const seat = seatPositions[state.seated];
    state.position.set(seat.x, seat.y, seat.z);
    state.yaw = seat.yaw;
    toast("SEATED // PRESS E TO STAND");
  } else state.position.y = 1.65;
}
function renderPlayers() {
  ui.online.textContent = String(
    state.players.size + (state.joined && !state.players.has(state.id) ? 1 : 0),
  );
  ui.playersList.innerHTML = [...state.players.values()]
    .map(
      (p) =>
        `<div class="player-row"><i></i><span>${escapeHtml(p.name)}</span></div>`,
    )
    .join("");
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function addChat(row) {
  const node = document.createElement("div");
  node.className = "chat-row";
  node.innerHTML = `<strong>${escapeHtml(row.name)}</strong> ${escapeHtml(row.message)}`;
  ui.chatLog.append(node);
  while (ui.chatLog.children.length > 50) ui.chatLog.firstChild.remove();
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}
function addSystem(message) {
  const node = document.createElement("div");
  node.className = "chat-row system";
  node.textContent = `// ${message}`;
  ui.chatLog.append(node);
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2200);
}

ui.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.ready) {
    toast("SERVER IS STILL CONNECTING");
    return;
  }
  const name = ui.name.value.trim();
  localStorage.setItem("pvc-lobby-name", name);
  send({ type: "join", name, skin: name });
  buildFirstPersonHand(name);
  state.joined = true;
  ui.join.classList.add("hidden");
  [ui.topbar, ui.players, ui.chat, ui.crosshair].forEach((el) =>
    el.classList.remove("hidden"),
  );
  addSystem("Connected to PVC Common Room");
  renderer.domElement.requestPointerLock();
  renderPlayers();
});
ui.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = ui.chatInput.value.trim();
  if (message) send({ type: "chat", message });
  ui.chatInput.value = "";
  ui.chatInput.blur();
  renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener("click", () => {
  if (
    state.joined &&
    !ui.map.classList.contains("open") &&
    !ui.terminal.classList.contains("open") &&
    !ui.help.classList.contains("open")
  )
    renderer.domElement.requestPointerLock();
});
document.addEventListener("pointerlockchange", () =>
  ui.crosshair.classList.toggle(
    "hidden",
    document.pointerLockElement !== renderer.domElement,
  ),
);
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  state.yaw -= event.movementX * 0.0022;
  state.pitch = Math.max(
    -1.3,
    Math.min(1.3, state.pitch - event.movementY * 0.0022),
  );
});
document.addEventListener("keydown", (event) => {
  if (
    event.code === "Enter" &&
    state.joined &&
    document.activeElement !== ui.chatInput
  ) {
    event.preventDefault();
    document.exitPointerLock();
    ui.chatInput.focus();
    return;
  }
  if (document.activeElement === ui.chatInput) return;
  state.keys.add(event.code);
  if (event.code === "KeyE" && !event.repeat) {
    if (state.seated) {
      send({ type: "stand" });
      return;
    }
    interact();
  }
  if (event.code === "KeyF" && !event.repeat && state.joined) {
    triggerHandAction("wave", 1200);
    send({ type: "emote", emote: "wave" });
    toast("WAVE SENT TO THE ROOM");
  }
});
document.addEventListener("keyup", (event) => state.keys.delete(event.code));
ui.helpButton = $("#helpButton");
ui.helpButton.addEventListener("click", () => openHelp(true));
$("#closeHelp").addEventListener("click", () => openHelp(false));
function openHelp(open) {
  ui.help.classList.toggle("open", open);
  ui.help.setAttribute("aria-hidden", String(!open));
  if (open) document.exitPointerLock();
}
$("#closeMap").addEventListener("click", closeMap);
$("#closeTerminal").addEventListener("click", closeTerminal);
document
  .querySelectorAll("[data-world]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      send({ type: "map-world", world: button.dataset.world }),
    ),
  );

function interact() {
  const data = state.activeInteraction;
  if (!data) return;
  triggerHandAction("use");
  send({ type: "emote", emote: "use" });
  const action = data.action;
  if (action?.type === "sit") {
    if (state.seats[action.seatId]) toast("THAT SEAT IS OCCUPIED");
    else send({ type: "sit", seatId: action.seatId });
    return;
  }
  if (action?.type === "jukebox") {
    send({ type: "jukebox", playing: !state.shared.jukeboxPlaying });
    return;
  }
  if (action?.type === "coffee") {
    toast("☕ COFFEE ACQUIRED // SPEED +0%");
    return;
  }
  if (action?.type === "food") {
    toast(`${action.name} ACQUIRED // DELICIOUS`);
    return;
  }
  if (action === "map") {
    openMap();
    return;
  }
  if (action === "shop") {
    openTerminal("PVC STORE // LIVE MARKET", state.config.shopUrl, false);
    return;
  }
  if (action === "eye") {
    openTerminal(
      "GRV EYE // OBSERVATION",
      "https://api.theyasked.co/grveye/",
      false,
    );
    return;
  }
  if (action === "core") {
    openTerminal("THREE.JS // LIVE RENDER CORE", "", true);
    return;
  }
}
function openMap() {
  document.exitPointerLock();
  ui.map.classList.add("open");
  ui.map.setAttribute("aria-hidden", "false");
  if (ui.mapFrame.src === "about:blank") ui.mapFrame.src = state.config.mapUrl;
  syncShared();
}
function closeMap() {
  ui.map.classList.remove("open");
  ui.map.setAttribute("aria-hidden", "true");
  renderer.domElement.requestPointerLock();
}
function openTerminal(title, url, coreMode) {
  document.exitPointerLock();
  ui.terminalTitle.textContent = title;
  ui.terminal.classList.toggle("core-mode", coreMode);
  ui.terminal.classList.add("open");
  ui.terminal.setAttribute("aria-hidden", "false");
  if (!coreMode && url) ui.terminalFrame.src = url;
}
function closeTerminal() {
  ui.terminal.classList.remove("open", "core-mode");
  ui.terminal.setAttribute("aria-hidden", "true");
  ui.terminalFrame.src = "about:blank";
  renderer.domElement.requestPointerLock();
}
function syncShared() {
  const worldName = state.shared.mapWorld === "nether" ? "NETHER" : "OVERWORLD";
  ui.mapTitle.textContent = `${worldName} // LIVE MAP`;
  document
    .querySelectorAll("[data-world]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.world === state.shared.mapWorld),
    );
  if (state.mapScreen) {
    state.mapScreen.material.map.dispose();
    state.mapScreen.material.map = monitorTexture(
      state.shared.mapWorld === "nether" ? "map-nether" : "map-overworld",
      "PVC LIVE MAP",
      `${worldName} // E TO OPEN`,
      state.shared.mapWorld === "nether" ? "#ef5f42" : "#f59e0b",
    );
    state.mapScreen.material.needsUpdate = true;
  }
  if (state.jukebox)
    state.jukebox.material.emissive?.setHex(
      state.shared.jukeboxPlaying ? 0x6d2500 : 0x000000,
    );
  if (state.shared.jukeboxPlaying) {
    ui.audio
      .play()
      .catch(() => toast("INTERACT WITH THE JUKEBOX TO ENABLE AUDIO"));
  } else ui.audio.pause();
}

function updateInteraction() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(interactables, true);
  let found = null;
  for (const hit of hits) {
    let object = hit.object;
    while (object && !object.userData.interaction) object = object.parent;
    if (object?.userData.interaction) {
      found = object.userData.interaction;
      break;
    }
  }
  state.activeInteraction = found;
  ui.interaction.classList.toggle(
    "hidden",
    !found || document.pointerLockElement !== renderer.domElement,
  );
  if (found) ui.interactionText.textContent = found.label;
}
function updateMovement(delta, time) {
  if (
    !state.joined ||
    state.seated ||
    document.pointerLockElement !== renderer.domElement
  ) {
    state.moving = false;
    return;
  }
  let forward = 0,
    side = 0;
  if (state.keys.has("KeyW")) forward += 1;
  if (state.keys.has("KeyS")) forward -= 1;
  if (state.keys.has("KeyD")) side += 1;
  if (state.keys.has("KeyA")) side -= 1;
  state.moving = !!(forward || side);
  if (state.moving) {
    const length = Math.hypot(forward, side);
    forward /= length;
    side /= length;
    const speed = 4.2 * delta;
    state.position.x +=
      (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * speed;
    state.position.z +=
      (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * side) * speed;
    state.position.x = Math.max(-12.6, Math.min(12.6, state.position.x));
    state.position.z = Math.max(-9.7, Math.min(9.7, state.position.z));
  }
  if (time - state.lastSent > 70) {
    state.lastSent = time;
    send({
      type: "move",
      x: state.position.x,
      z: state.position.z,
      yaw: state.yaw,
      moving: state.moving,
    });
  }
}
function damp(current, target, speed, delta) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta));
}
function dampAngle(current, target, speed, delta) {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * (1 - Math.exp(-speed * delta));
}
function animateAvatar(avatar, time, delta) {
  avatar.position.lerp(avatar.userData.target, 1 - Math.exp(-10 * delta));
  avatar.rotation.y = dampAngle(
    avatar.rotation.y,
    avatar.userData.yaw,
    12,
    delta,
  );

  const rig = avatar.getObjectByName("avatarRig");
  const armL = avatar.getObjectByName("armL");
  const armR = avatar.getObjectByName("armR");
  const legL = avatar.getObjectByName("legL");
  const legR = avatar.getObjectByName("legR");
  const head = avatar.getObjectByName("head");
  if (!rig || !armL) return;

  const walking = avatar.userData.moving && !avatar.userData.seated;
  const seated = avatar.userData.seated;
  const walk = Math.sin(time * 0.012);
  const idle = Math.sin(time * 0.0018 + avatar.userData.phase);
  const swing = walking ? walk * 0.72 : 0;
  let armLX = swing;
  let armRX = -swing;
  let armRZ = -idle * 0.025;
  let legLX = walking ? -swing : 0;
  let legRX = walking ? swing : 0;

  if (seated) {
    legLX = -1.45;
    legRX = -1.45;
    armLX = -0.16;
    armRX = -0.16;
  }
  if (avatar.userData.emoteUntil > performance.now()) {
    const elapsed = performance.now() - avatar.userData.emoteStarted;
    if (avatar.userData.emote === "wave") {
      armRX = -0.2;
      armRZ = 2.7 + Math.sin(elapsed * 0.018) * 0.3;
    } else {
      armRX = -1.25 + Math.sin(elapsed * 0.02) * 0.16;
    }
  }

  armL.rotation.x = damp(armL.rotation.x, armLX, 14, delta);
  armR.rotation.x = damp(armR.rotation.x, armRX, 14, delta);
  armR.rotation.z = damp(armR.rotation.z, armRZ, 16, delta);
  legL.rotation.x = damp(legL.rotation.x, legLX, 14, delta);
  legR.rotation.x = damp(legR.rotation.x, legRX, 14, delta);
  rig.position.y = damp(
    rig.position.y,
    seated ? 0.3 : walking ? Math.abs(walk) * 0.055 : idle * 0.012,
    12,
    delta,
  );
  rig.rotation.z = damp(
    rig.rotation.z,
    walking ? Math.sin(time * 0.006) * 0.025 : idle * 0.008,
    8,
    delta,
  );
  if (head) {
    head.rotation.y = damp(head.rotation.y, idle * 0.09, 3, delta);
    head.rotation.x = damp(
      head.rotation.x,
      Math.sin(time * 0.0011) * 0.025,
      3,
      delta,
    );
  }
}
function animateFirstPersonHand(time, delta) {
  const hand = state.firstPersonHand;
  if (!hand) return;
  const walk = state.moving ? Math.sin(time * 0.011) : 0;
  const active = time < state.handActionUntil;
  const duration = Math.max(1, state.handActionUntil - state.handActionStarted);
  const progress = THREE.MathUtils.clamp(
    (time - state.handActionStarted) / duration,
    0,
    1,
  );
  const action = active ? Math.sin(progress * Math.PI) : 0;
  hand.position.x = damp(hand.position.x, 0.52 + walk * 0.025, 14, delta);
  hand.position.y = damp(
    hand.position.y,
    -0.5 - Math.abs(walk) * 0.035 + action * 0.08,
    14,
    delta,
  );
  hand.rotation.x = damp(hand.rotation.x, -0.42 - action * 0.85, 16, delta);
  hand.rotation.z = damp(
    hand.rotation.z,
    state.handActionType === "wave" && active
      ? -0.14 + Math.sin(time * 0.026) * 0.32
      : -0.14 + walk * 0.025,
    18,
    delta,
  );
}
function animateEnvironment(time, delta) {
  for (const prop of animatedProps) {
    if (prop.type === "hologram") {
      prop.object.rotation.y += delta * 0.42;
      prop.object.position.y = 1.2 + Math.sin(time * 0.002) * 0.06;
      prop.object.children.forEach((child, index) => {
        if (child.isMesh) child.rotation.z += delta * (0.2 + index * 0.08);
      });
    } else if (prop.type === "dust") {
      prop.object.rotation.y += delta * 0.008;
    }
  }
  if (state.jukebox && state.shared.jukeboxPlaying) {
    state.jukebox.scale.setScalar(1 + Math.sin(time * 0.009) * 0.018);
  } else if (state.jukebox) {
    const scale = damp(state.jukebox.scale.x, 1, 10, delta);
    state.jukebox.scale.setScalar(scale);
  }
}
function animate(time = 0) {
  requestAnimationFrame(animate);
  state.frameCount += 1;
  if (time - state.fpsStartedAt >= 500) {
    state.fps = Math.round(
      (state.frameCount * 1000) / (time - state.fpsStartedAt),
    );
    state.frameCount = 0;
    state.fpsStartedAt = time;
    ui.coreFps.textContent = `${state.fps} FPS`;
    ui.coreTriangles.textContent =
      renderer.info.render.triangles.toLocaleString();
    ui.coreCalls.textContent = renderer.info.render.calls.toLocaleString();
    ui.corePlayers.textContent = `${state.players.size} PLAYERS`;
  }
  const delta = Math.min(clock.getDelta(), 0.05);
  updateMovement(delta, time);
  camera.position.copy(state.position);
  if (state.moving && !state.seated)
    camera.position.y += Math.abs(Math.sin(time * 0.011)) * 0.035;
  camera.rotation.order = "YXZ";
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
  for (const avatar of state.avatars.values())
    animateAvatar(avatar, time, delta);
  animateFirstPersonHand(time, delta);
  animateEnvironment(time, delta);
  updateInteraction();
  renderer.render(scene, camera);
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
connect();
animate();
