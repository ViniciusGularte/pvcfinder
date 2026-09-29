import * as THREE from "./vendor/three.module.js";

const $ = (selector) => document.querySelector(selector);
const ui = {
  scene: $("#scene"),
  join: $("#joinScreen"),
  joinForm: $("#joinForm"),
  joinStatus: $("#joinStatus"),
  name: $("#playerName"),
  skin: $("#skinName"),
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
};
const seatPositions = {
  "sofa-1": { x: -1.4, y: 1.25, z: 6.7, yaw: Math.PI },
  "sofa-2": { x: 1.4, y: 1.25, z: 6.7, yaw: Math.PI },
  "chair-1": { x: -5.4, y: 1.2, z: 4.5, yaw: -Math.PI / 2 },
  "chair-2": { x: 5.4, y: 1.2, z: 4.5, yaw: Math.PI / 2 },
  "chair-3": { x: 0, y: 1.2, z: -1.5, yaw: 0 },
};

ui.name.value = localStorage.getItem("pvc-lobby-name") || "";
ui.skin.value = localStorage.getItem("pvc-lobby-skin") || "";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070503);
scene.fog = new THREE.FogExp2(0x070503, 0.018);
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
scene.add(world);
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
  floor: mat(0x17120d),
  wall: mat(0x21170f),
  dark: mat(0x0b0a09, { metalness: 0.52, roughness: 0.38 }),
  wood: mat(0x4b2d18),
  leather: mat(0x3a2115),
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
function labelTexture(title, subtitle = "", accent = "#f59e0b") {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#080705";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 744, 232);
  ctx.fillStyle = accent;
  ctx.font = "bold 34px monospace";
  ctx.textAlign = "center";
  ctx.fillText(title, 384, 112);
  ctx.fillStyle = "#b9aa98";
  ctx.font = "20px monospace";
  ctx.fillText(subtitle, 384, 158);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function screenPlane(name, size, position, rotation, title, subtitle, action) {
  const material = new THREE.MeshBasicMaterial({
    map: labelTexture(title, subtitle),
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

function buildRoom() {
  box("floor", [28, 0.35, 22], [0, -0.2, 0], materials.floor);
  box("ceiling", [28, 0.25, 22], [0, 7.8, 0], materials.dark);
  box("back-wall", [28, 8, 0.35], [0, 3.8, -11], materials.wall);
  box("front-wall", [28, 8, 0.35], [0, 3.8, 11], materials.wall);
  box("left-wall", [0.35, 8, 22], [-14, 3.8, 0], materials.wall);
  box("right-wall", [0.35, 8, 22], [14, 3.8, 0], materials.wall);
  for (let x = -11; x <= 11; x += 5.5) {
    const light = new THREE.PointLight(0xf59e0b, 16, 12, 2);
    light.position.set(x, 6.8, 0);
    light.castShadow = x === 0;
    world.add(light);
    box("ceiling-light", [2.5, 0.12, 0.35], [x, 7.58, 0], materials.amber);
  }
  scene.add(new THREE.HemisphereLight(0x8dbbd0, 0x241207, 1.35));

  box("map-frame", [12.5, 5.7, 0.45], [0, 4.25, -10.55], materials.dark);
  const mapScreen = screenPlane(
    "map-screen",
    [11.7, 4.9],
    [0, 4.3, -10.3],
    [0, 0, 0],
    "PVC LIVE MAP",
    "OVERWORLD // E TO OPEN",
    { label: "OPEN SHARED SERVER MAP", action: "map" },
  );
  state.mapScreen = mapScreen;
  box("map-console", [8, 0.8, 1.5], [0, 0.4, -8.8], materials.dark);
  box("map-console-glow", [5, 0.04, 0.7], [0, 0.82, -8.55], materials.screen);

  const terminals = [
    { x: -9, title: "PVC STORE", sub: "MARKET TERMINAL", action: "shop" },
    {
      x: -5.8,
      title: "THREE.JS CORE",
      sub: "ROOM RENDER NODE",
      action: "core",
    },
    { x: 8.2, title: "GRV EYE", sub: "OBSERVATION NODE", action: "eye" },
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
  );
}
buildRoom();

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
function buildAvatar(player) {
  const group = new THREE.Group();
  group.position.set(player.x, 0, player.z);
  group.userData.target = new THREE.Vector3(player.x, 0, player.z);
  group.userData.yaw = player.yaw;
  const placeholder = box(
    "placeholder",
    [0.55, 1.8, 0.35],
    [0, 0.9, 0],
    mat(0x8b5e34),
    group,
  );
  const sprite = nameSprite(player.name);
  sprite.position.set(0, 2.35, 0);
  group.add(sprite);
  scene.add(group);
  state.avatars.set(player.id, group);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    group.remove(placeholder);
    const H = [
      [0, 8, 8, 8],
      [16, 8, 8, 8],
      [8, 0, 8, 8],
      [16, 0, 8, 8],
      [8, 8, 8, 8],
      [24, 8, 8, 8],
    ];
    const B = [
      [16, 20, 4, 12],
      [28, 20, 4, 12],
      [20, 16, 8, 4],
      [28, 16, 8, 4],
      [20, 20, 8, 12],
      [32, 20, 8, 12],
    ];
    const RA = [
      [40, 20, 4, 12],
      [48, 20, 4, 12],
      [44, 16, 4, 4],
      [48, 16, 4, 4],
      [44, 20, 4, 12],
      [52, 20, 4, 12],
    ];
    const LA = [
      [32, 52, 4, 12],
      [40, 52, 4, 12],
      [36, 48, 4, 4],
      [40, 48, 4, 4],
      [36, 52, 4, 12],
      [44, 52, 4, 12],
    ];
    const RL = [
      [0, 20, 4, 12],
      [8, 20, 4, 12],
      [4, 16, 4, 4],
      [8, 16, 4, 4],
      [4, 20, 4, 12],
      [12, 20, 4, 12],
    ];
    const LL = [
      [16, 52, 4, 12],
      [24, 52, 4, 12],
      [20, 48, 4, 4],
      [24, 48, 4, 4],
      [20, 52, 4, 12],
      [28, 52, 4, 12],
    ];
    addSkinPart(group, img, [0.5, 0.5, 0.5], [0, 1.75, 0], H, "head");
    addSkinPart(group, img, [0.5, 0.75, 0.25], [0, 1.12, 0], B, "body");
    addSkinPart(group, img, [0.25, 0.75, 0.25], [-0.39, 1.12, 0], LA, "armL");
    addSkinPart(group, img, [0.25, 0.75, 0.25], [0.39, 1.12, 0], RA, "armR");
    addSkinPart(group, img, [0.25, 0.75, 0.25], [-0.14, 0.38, 0], LL, "legL");
    addSkinPart(group, img, [0.25, 0.75, 0.25], [0.14, 0.38, 0], RL, "legR");
  };
  img.src = `${state.config.skinUrl}${encodeURIComponent(player.skin)}`;
  return group;
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
    ui.joinStatus.textContent = "LOUNGE ONLINE // ENTER WHEN READY";
    state.ready = true;
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
        skin: ui.skin.value.trim(),
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
  if (player.seatId && seatPositions[player.seatId]) {
    const seat = seatPositions[player.seatId];
    avatar.userData.target.set(seat.x, 0, seat.z);
    avatar.userData.yaw = seat.yaw;
    avatar.scale.y = 0.78;
  } else avatar.scale.y = 1;
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
  const name = ui.name.value.trim(),
    skin = ui.skin.value.trim();
  localStorage.setItem("pvc-lobby-name", name);
  localStorage.setItem("pvc-lobby-skin", skin);
  send({ type: "join", name, skin });
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
    window.open(state.config.shopUrl, "_blank", "noopener");
    return;
  }
  if (action === "eye") {
    window.open("https://api.theyasked.co/grveye/", "_blank", "noopener");
    return;
  }
  if (action === "core") {
    toast(
      `THREE.JS r186 // ${renderer.info.render.triangles.toLocaleString()} TRIANGLES`,
    );
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
    state.mapScreen.material.map = labelTexture(
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
function animate(time = 0) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  updateMovement(delta, time);
  camera.position.copy(state.position);
  camera.rotation.order = "YXZ";
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
  for (const avatar of state.avatars.values()) {
    avatar.position.lerp(avatar.userData.target, 0.16);
    avatar.rotation.y += (avatar.userData.yaw - avatar.rotation.y) * 0.16;
    const swing = avatar.userData.moving ? Math.sin(time * 0.012) * 0.55 : 0;
    const armL = avatar.getObjectByName("armL"),
      armR = avatar.getObjectByName("armR"),
      legL = avatar.getObjectByName("legL"),
      legR = avatar.getObjectByName("legR");
    if (armL) {
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legL.rotation.x = -swing;
      legR.rotation.x = swing;
    }
  }
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
