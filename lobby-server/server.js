import "dotenv/config";
import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { createSkinResolver } from "./lib/skins.js";

const env = process.env;
const num = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanBase = String(env.BASE_PATH || "/lobby")
  .trim()
  .replace(/^\/+|\/+$/g, "");
const cfg = {
  host: env.HOST || "127.0.0.1",
  port: num(env.PORT, 8081),
  basePath: cleanBase ? `/${cleanBase}` : "",
  maxPlayers: Math.min(20, Math.max(2, num(env.MAX_PLAYERS, 20))),
  mapUrl: env.MAP_URL || "https://web.peacefulvanilla.club/maps/",
  skinUrl: env.SKIN_URL || `${cleanBase ? `/${cleanBase}` : ""}/skin/`,
  shopUrl: env.SHOP_URL || "https://pvcstorefinder.vercel.app/",
  frontendUrl: env.FRONTEND_URL || "https://pvcstorefinder.vercel.app/pvc-lobby-3d/",
  boardFile: path.resolve(env.BOARD_FILE || "./data/chalkboard.json"),
  squaremapUrl: String(env.SQUAREMAP_URL || "https://web.peacefulvanilla.club/maps/").replace(/\/+$/, ""),
  publicMapApi: env.PUBLIC_MAP_API || "https://api.theyasked.co/lobby/api/map",
};
const route = (suffix) => `${cfg.basePath}${suffix}` || "/";
const WIKI_ORIGIN = "https://wiki.peacefulvanilla.club";
const WIKI_HOME = "/wiki/Peaceful_Vanilla_Club_Wiki";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: route("/ws"), perMessageDeflate: false, maxPayload: 32_768 });
const players = new Map();
const seats = new Map();
const weatherPresets = new Set(["clear", "cloudy", "rain", "storm", "snow", "fog"]);
const weatherTimes = new Set(["night", "sunset", "day"]);
const shared = {
  jukebox: { playing: false, track: 0, startedAt: null },
  cabinOpen: false,
  mapWorld: "overworld",
  mapView: { x: 256, z: 256, zoom: 1 },
  weather: {
    preset: weatherPresets.has(env.WEATHER_PRESET) ? env.WEATHER_PRESET : "rain",
    time: weatherTimes.has(env.WEATHER_TIME) ? env.WEATHER_TIME : "night",
  },
};
let chalkboard = { revision: 0, strokes: [] };
try {
  const saved = JSON.parse(fs.readFileSync(cfg.boardFile, "utf8"));
  if (Array.isArray(saved.strokes)) chalkboard = saved;
} catch {}
let boardSaveTimer = null;
const saveBoard = () => {
  clearTimeout(boardSaveTimer);
  boardSaveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(cfg.boardFile), { recursive: true });
    fs.writeFileSync(cfg.boardFile, JSON.stringify(chalkboard));
  }, 250);
};
const getSkin = createSkinResolver();

const send = (socket, value) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
};
const broadcast = (value, except = null) => {
  const data = JSON.stringify(value);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN)
      client.send(data);
  }
};
const text = (value, max = 24) =>
  String(value || "")
    .replace(/[<>\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const SURFACE = { x: 30, z: 10, radius: 82 };
const NPC_PATROL = [
  [31, -13], [48, -10], [69, 5], [62, 34], [35, 48], [4, 37], [-18, 24],
];
const NPC_SPEED = {
  far: 4.65,
  close: 5.25,
  aggressionFar: .14,
  aggressionClose: .12,
};
const NPC_CLEARANCE = 1.2;
const NPC_CATCH_DISTANCE = 1.5;
const NAV_CELL = 2;
const NAV_MIN_X = SURFACE.x - SURFACE.radius + 5;
const NAV_MIN_Z = SURFACE.z - SURFACE.radius + 5;
const NAV_SIZE = Math.floor((SURFACE.radius * 2 - 10) / NAV_CELL) + 1;
const npc = {
  id: "slender", name: "Slender", skin: "Slender", x: 62, y: 0, z: -8,
  yaw: Math.PI, moving: false, state: "wandering", targetId: null,
  patrol: 0, revision: 0, aggression: 1, beamCount: 0, preferredTargetId: null,
  navPath: [], navTargetX: null, navTargetZ: null, navAt: 0,
};
const npcPublic = () => ({
  id: npc.id, name: npc.name, skin: npc.skin, x: npc.x, y: npc.y, z: npc.z,
  yaw: npc.yaw, moving: npc.moving, state: npc.state, targetId: npc.targetId,
  hidden: false, revision: npc.revision,
  aggression: npc.aggression, beamCount: npc.beamCount,
});
const insideHouse = (x, z) => x > -13.5 && x < 13.5 && z > -13.5 && z < 13.5;
const insideBunker = (x, z) => x > -11.5 && x < -4.5 && z > 10.5 && z < 21;
const insideCabin = (x, z) => x > -26.6 && x < -19.4 && z > -36.9 && z < -31.1;
const insideNpcHouseClearance = (x, z) =>
  x > -13.5 - NPC_CLEARANCE && x < 13.5 + NPC_CLEARANCE &&
  z > -13.5 - NPC_CLEARANCE && z < 13.5 + NPC_CLEARANCE;
const insideNpcBunkerClearance = (x, z) =>
  x > -11.5 - NPC_CLEARANCE && x < -4.5 + NPC_CLEARANCE &&
  z > 10.5 - NPC_CLEARANCE && z < 21 + NPC_CLEARANCE;
const insideNpcCabinClearance = (x, z) =>
  x > -26.6 - NPC_CLEARANCE && x < -19.4 + NPC_CLEARANCE &&
  z > -36.9 - NPC_CLEARANCE && z < -31.1 + NPC_CLEARANCE;
const insideNpcSewerClearance = (x, z) =>
  (x > 16 - NPC_CLEARANCE && x < 25 + NPC_CLEARANCE && z > -23 - NPC_CLEARANCE && z < -17 + NPC_CLEARANCE) ||
  (x > 55 - NPC_CLEARANCE && x < 61 + NPC_CLEARANCE && z > 14.5 - NPC_CLEARANCE && z < 24 + NPC_CLEARANCE);
const npcPositionValid = (x, z) =>
  Math.hypot(x - SURFACE.x, z - SURFACE.z) < SURFACE.radius - 5 &&
  !insideNpcHouseClearance(x, z) && !insideNpcBunkerClearance(x, z) &&
  !insideNpcCabinClearance(x, z) && !insideNpcSewerClearance(x, z);
const sewerPosition = (x, z) =>
  (x >= 17.5 && x <= 59.5 && z >= -21.55 && z <= -18.45) ||
  (x >= 56.45 && x <= 59.55 && z >= -21.55 && z <= 22.5);
const publicPlayer = (player) => ({
  id: player.id,
  name: player.name,
  skin: player.skin,
  x: player.x,
  y: player.y,
  z: player.z,
  yaw: player.yaw,
  moving: player.moving,
  flashlight: player.flashlight,
  seatId: player.seatId,
});
const movingPlayer = (player) => ({
  id: player.id,
  x: player.x,
  y: player.y,
  z: player.z,
  yaw: player.yaw,
  moving: player.moving,
  flashlight: player.flashlight,
  seatId: player.seatId,
});

wss.on("connection", (socket) => {
  if (players.size >= cfg.maxPlayers) {
    send(socket, { type: "error", message: "The lounge is full." });
    socket.close(1013, "Lobby full");
    return;
  }

  const id = crypto.randomUUID();
  const player = {
    id,
    name: `Guest-${id.slice(0, 4)}`,
    skin: "Steve",
    x: 0,
    y: 0,
    z: 7,
    yaw: Math.PI,
    lookYaw: 0,
    lookPitch: 0,
    moving: false,
    flashlight: false,
    seatId: null,
    joined: false,
    lastMove: 0,
    lastChat: 0,
    lastEmote: 0,
    lastBunker: 0,
    lastCabinDoor: 0,
    lastJukebox: 0,
    deadUntil: 0,
  };
  players.set(id, player);

  send(socket, {
    type: "welcome",
    id,
    players: [...players.values()]
      .filter((entry) => entry.joined)
      .map(publicPlayer),
    seats: Object.fromEntries(seats),
    shared,
    chalkboard,
    npc: npcPublic(),
    config: {
      maxPlayers: cfg.maxPlayers,
      mapUrl: cfg.mapUrl,
      skinUrl: cfg.skinUrl,
      shopUrl: cfg.shopUrl,
      mapApi: cfg.publicMapApi,
      map: {
        world: "minecraft_overworld",
        tileSize: 512,
        maxZoom: 8,
        extraZoom: 2,
      },
    },
  });

  socket.on("message", (raw) => {
    if (raw.length > 32_768) return;
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join" && !player.joined) {
      player.name = text(message.name, 32) || player.name;
      player.skin =
        text(message.skin || player.name, 32).replace(
          /[^A-Za-z0-9_.*-]/g,
          "",
        ) || "Steve";
      player.joined = true;
      broadcast({ type: "player-join", player: publicPlayer(player) });
      return;
    }
    if (!player.joined) return;

    if (message.type === "move") {
      const now = Date.now();
      if (now - player.lastMove < 40 || player.seatId) return;
      player.lastMove = now;
      const x = Math.max(-52.5, Math.min(112.5, finite(message.x, player.x)));
      const z = Math.max(-72.5, Math.min(92.5, finite(message.z, player.z)));
      const inLobby = x >= -11.6 && x <= 11.55 && z >= -11.6 && z <= 11.6;
      const inBunker = x >= -10.7 && x <= -5.3 && z >= 11.2 && z <= 20.2;
      const inSurface = Math.hypot(x - SURFACE.x, z - SURFACE.z) <= SURFACE.radius;
      if (inLobby || inBunker || inSurface) { player.x = x; player.z = z; }
      const requestedY = Math.max(-3.6, Math.min(3.2, finite(message.y, player.y)));
      player.y = requestedY < -.45 && !sewerPosition(player.x, player.z) ? 0 : requestedY;
      player.yaw = finite(message.yaw, player.yaw);
      player.lookYaw = finite(message.lookYaw, player.lookYaw);
      player.lookPitch = Math.max(-1.4, Math.min(1.2, finite(message.lookPitch, player.lookPitch)));
      player.moving = !!message.moving;
      player.flashlight = !!message.flashlight;
      broadcast({ type: "player-move", player: movingPlayer(player) }, socket);
      return;
    }

    if (message.type === "npc-respawn") {
      player.x = 0; player.y = 0; player.z = 5; player.yaw = Math.PI;
      player.moving = false; player.deadUntil = 0;
      broadcast({ type: "player-move", player: movingPlayer(player) });
      send(socket, { type: "npc-respawned", player: movingPlayer(player) });
      return;
    }

    if (message.type === "chat") {
      const now = Date.now();
      const body = text(message.message, 220);
      if (!body || now - player.lastChat < 750) return;
      player.lastChat = now;
      const row = {
        id: crypto.randomUUID(),
        playerId: id,
        name: player.name,
        message: body,
        ts: now,
      };
      broadcast({ type: "chat", row });
      return;
    }

    if (message.type === "bunker-open") {
      const now = Date.now();
      if (now - player.lastBunker < 1200) return;
      player.lastBunker = now;
      broadcast({ type: "bunker-open", name: player.name, until: now + 2500 });
      return;
    }

    if (message.type === "cabin-door") {
      const now = Date.now();
      if (now - player.lastCabinDoor < 500) return;
      player.lastCabinDoor = now;
      shared.cabinOpen = !!message.open;
      broadcast({ type: "cabin-door", open: shared.cabinOpen, playerId: id });
      return;
    }

    if (message.type === "emote") {
      const now = Date.now();
      if (now - player.lastEmote < 700) return;
      player.lastEmote = now;
      const emote = ["wave", "heart", "celebrate", "dance", "clap", "laugh", "overcharge"].includes(message.emote)
        ? message.emote
        : "wave";
      broadcast({ type: "emote", id, emote, ts: now });
      return;
    }

    if (message.type === "sit") {
      const seatId = text(message.seatId, 24);
      if (player.seatId) seats.delete(player.seatId);
      player.seatId = null;
      if (/^(seat|pc)-[a-z0-9-]+$/i.test(seatId) && !seats.has(seatId)) {
        seats.set(seatId, id);
        player.seatId = seatId;
        player.x = Math.max(-12.5, Math.min(12.5, finite(message.x, player.x)));
        player.y = Math.max(0, Math.min(2, finite(message.y, player.y)));
        player.z = Math.max(-12.5, Math.min(12.5, finite(message.z, player.z)));
        player.yaw = finite(message.yaw, player.yaw);
        player.moving = false;
      }
      broadcast({
        type: "seats",
        seats: Object.fromEntries(seats),
        player: publicPlayer(player),
      });
      return;
    }

    if (message.type === "stand" && player.seatId) {
      seats.delete(player.seatId);
      player.seatId = null;
      player.x = Math.max(-12.5, Math.min(12.5, finite(message.x, player.x)));
      player.y = 0;
      player.z = Math.max(-12.5, Math.min(12.5, finite(message.z, player.z)));
      player.yaw = finite(message.yaw, player.yaw);
      broadcast({
        type: "seats",
        seats: Object.fromEntries(seats),
        player: publicPlayer(player),
      });
      return;
    }

    if (message.type === "jukebox") {
      const now = Date.now();
      if (now - player.lastJukebox < 250) return;
      player.lastJukebox = now;
      const playing = !!message.playing;
      const track = Math.max(0, Math.min(3, Math.floor(finite(message.track, shared.jukebox.track))));
      const restarted = playing && (!shared.jukebox.playing || track !== shared.jukebox.track);
      shared.jukebox = { playing, track, startedAt: playing ? (restarted ? now : shared.jukebox.startedAt || now) : null };
      broadcast({ type: "shared", shared });
      return;
    }

    if (message.type === "map-world") {
      shared.mapWorld = message.world === "nether" ? "nether" : "overworld";
      broadcast({ type: "shared", shared });
      return;
    }

    if (message.type === "map-view") {
      shared.mapView = {
        x: Math.max(-30_000_000, Math.min(30_000_000, finite(message.x))),
        z: Math.max(-30_000_000, Math.min(30_000_000, finite(message.z))),
        zoom: Math.max(-8, Math.min(6, finite(message.zoom, -2))),
      };
      broadcast({ type: "shared", shared });
      return;
    }

    if (message.type === "board-stroke") {
      const colors = new Set(["#f2efe4", "#ffd27a", "#a8f0b4", "#8fd3ff", "#ff9b9b", "#23372c"]);
      const points = Array.isArray(message.points) ? message.points.slice(0, 256).map((point) => [
        Math.max(0, Math.min(1, finite(point?.[0]))),
        Math.max(0, Math.min(1, finite(point?.[1]))),
      ]) : [];
      if (points.length < 2) return;
      const stroke = {
        id: crypto.randomUUID(),
        color: colors.has(message.color) ? message.color : "#f2efe4",
        width: Math.max(2, Math.min(36, finite(message.width, 8))),
        points,
      };
      chalkboard.strokes.push(stroke);
      if (chalkboard.strokes.length > 800) chalkboard.strokes.splice(0, chalkboard.strokes.length - 800);
      chalkboard.revision += 1; saveBoard();
      broadcast({ type: "board-stroke", stroke, revision: chalkboard.revision }, socket);
      return;
    }

    if (message.type === "board-clear") {
      chalkboard = { revision: chalkboard.revision + 1, strokes: [] };
      saveBoard(); broadcast({ type: "board-clear", revision: chalkboard.revision });
    }
  });

  socket.on("close", () => {
    if (player.seatId) seats.delete(player.seatId);
    players.delete(id);
    if (player.joined)
      broadcast({ type: "player-leave", id, seats: Object.fromEntries(seats) });
  });
});

const chooseTarget = (eligible) =>
  eligible.map((player) => {
    const support = eligible.filter((other) => other.id !== player.id && Math.hypot(other.x - player.x, other.z - player.z) < 12).length;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    return { player, score: support * 9 + distance * .08 + Math.random() * 1.5 };
  }).sort((a, b) => a.score - b.score)[0]?.player || null;

const segmentValidForNpc = (x0, z0, x1, z1) => {
  const distance = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(distance / .45));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    if (!npcPositionValid(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k)) return false;
  }
  return true;
};

const nearestNavCell = (x, z, requireReachable = false) => {
  const baseX = Math.max(0, Math.min(NAV_SIZE - 1, Math.round((x - NAV_MIN_X) / NAV_CELL)));
  const baseZ = Math.max(0, Math.min(NAV_SIZE - 1, Math.round((z - NAV_MIN_Z) / NAV_CELL)));
  let best = null;
  for (let radius = 0; radius <= 5; radius++) {
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      if (radius && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
      const gx = baseX + dx, gz = baseZ + dz;
      if (gx < 0 || gz < 0 || gx >= NAV_SIZE || gz >= NAV_SIZE) continue;
      const wx = NAV_MIN_X + gx * NAV_CELL, wz = NAV_MIN_Z + gz * NAV_CELL;
      if (!npcPositionValid(wx, wz)) continue;
      if (requireReachable && !segmentValidForNpc(x, z, wx, wz)) continue;
      const distance = Math.hypot(wx - x, wz - z);
      if (!best || distance < best.distance) best = { gx, gz, wx, wz, distance };
    }
    if (best) return best;
  }
  return null;
};

const planNpcPath = (targetX, targetZ) => {
  const start = nearestNavCell(npc.x, npc.z, true), goal = nearestNavCell(targetX, targetZ);
  if (!start || !goal) return [];
  const total = NAV_SIZE * NAV_SIZE, startId = start.gz * NAV_SIZE + start.gx, goalId = goal.gz * NAV_SIZE + goal.gx;
  if (startId === goalId) return [];
  const costs = new Float64Array(total); costs.fill(Infinity);
  const cameFrom = new Int32Array(total); cameFrom.fill(-1);
  const closed = new Uint8Array(total), heap = [];
  const push = item => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= heap[i].score) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]]; i = parent;
    }
  };
  const pop = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0;;) {
        const left = i * 2 + 1, right = left + 1;
        if (left >= heap.length) break;
        const next = right < heap.length && heap[right].score < heap[left].score ? right : left;
        if (heap[i].score <= heap[next].score) break;
        [heap[i], heap[next]] = [heap[next], heap[i]]; i = next;
      }
    }
    return first;
  };
  costs[startId] = 0; push({ id: startId, score: Math.hypot(goal.gx - start.gx, goal.gz - start.gz) });
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const current = pop(), id = current.id;
    if (closed[id]) continue;
    if (id === goalId) break;
    closed[id] = 1;
    const gx = id % NAV_SIZE, gz = Math.floor(id / NAV_SIZE);
    for (const [dx, dz] of directions) {
      const nx = gx + dx, nz = gz + dz;
      if (nx < 0 || nz < 0 || nx >= NAV_SIZE || nz >= NAV_SIZE) continue;
      const wx = NAV_MIN_X + nx * NAV_CELL, wz = NAV_MIN_Z + nz * NAV_CELL;
      if (!npcPositionValid(wx, wz)) continue;
      if (dx && dz) {
        const sideAX = NAV_MIN_X + nx * NAV_CELL, sideAZ = NAV_MIN_Z + gz * NAV_CELL;
        const sideBX = NAV_MIN_X + gx * NAV_CELL, sideBZ = NAV_MIN_Z + nz * NAV_CELL;
        if (!npcPositionValid(sideAX, sideAZ) || !npcPositionValid(sideBX, sideBZ)) continue;
      }
      const nextId = nz * NAV_SIZE + nx, nextCost = costs[id] + (dx && dz ? Math.SQRT2 : 1);
      if (nextCost >= costs[nextId]) continue;
      costs[nextId] = nextCost; cameFrom[nextId] = id;
      push({ id: nextId, score: nextCost + Math.hypot(goal.gx - nx, goal.gz - nz) });
    }
  }
  if (cameFrom[goalId] < 0) return [];
  const raw = [];
  for (let id = goalId; id !== startId; id = cameFrom[id]) {
    const gx = id % NAV_SIZE, gz = Math.floor(id / NAV_SIZE);
    raw.push({ x: NAV_MIN_X + gx * NAV_CELL, z: NAV_MIN_Z + gz * NAV_CELL });
  }
  raw.reverse();
  raw.unshift({ x: start.wx, z: start.wz });
  // Collapse the grid path into long visible segments for smooth, inexpensive movement.
  const path = [];
  let fromX = npc.x, fromZ = npc.z;
  for (let index = 0; index < raw.length;) {
    let farthest = index;
    if (!segmentValidForNpc(fromX, fromZ, raw[farthest].x, raw[farthest].z)) return [];
    while (farthest + 1 < raw.length && segmentValidForNpc(fromX, fromZ, raw[farthest + 1].x, raw[farthest + 1].z)) farthest++;
    const point = raw[farthest]; path.push(point); fromX = point.x; fromZ = point.z; index = farthest + 1;
  }
  return path;
};

const moveNpc = (dx, dz, speed, dt) => {
  const distance = Math.hypot(dx, dz);
  if (distance < .001) { npc.moving = false; return; }
  const targetX = npc.x + dx, targetZ = npc.z + dz, now = Date.now();
  let destination = { x: targetX, z: targetZ };
  if (segmentValidForNpc(npc.x, npc.z, targetX, targetZ)) {
    npc.navPath = [];
  } else {
    const targetMoved = npc.navTargetX === null || Math.hypot(targetX - npc.navTargetX, targetZ - npc.navTargetZ) > 3;
    if (!npc.navPath.length || targetMoved || now - npc.navAt > 2500) {
      npc.navPath = planNpcPath(targetX, targetZ);
      npc.navTargetX = targetX; npc.navTargetZ = targetZ; npc.navAt = now;
    }
    while (npc.navPath.length && Math.hypot(npc.navPath[0].x - npc.x, npc.navPath[0].z - npc.z) < .12) npc.navPath.shift();
    if (npc.navPath.length) destination = npc.navPath[0];
  }
  const moveX = destination.x - npc.x, moveZ = destination.z - npc.z, moveDistance = Math.hypot(moveX, moveZ);
  if (moveDistance < .001) { npc.moving = false; return; }
  const step = Math.min(moveDistance, speed * dt), heading = Math.atan2(moveX, moveZ);
  const nx = npc.x + moveX / moveDistance * step, nz = npc.z + moveZ / moveDistance * step;
  npc.yaw = heading;
  if (npcPositionValid(nx, nz)) { npc.x = nx; npc.z = nz; npc.moving = speed > .05; }
  else { npc.navAt = 0; npc.moving = false; }
};

let npcLastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(.2, (now - npcLastTick) / 1000); npcLastTick = now;
  const eligible = [...players.values()].filter((player) =>
    player.joined && now >= player.deadUntil && player.y > -.45 &&
    !insideHouse(player.x, player.z) && !insideBunker(player.x, player.z) && !insideCabin(player.x, player.z));
  if (!eligible.length) {
    npc.targetId = null; npc.preferredTargetId = null; npc.beamCount = 0;
    const [tx, tz] = NPC_PATROL[npc.patrol % NPC_PATROL.length];
    if (Math.hypot(tx - npc.x, tz - npc.z) < 1.2) npc.patrol = (npc.patrol + 1) % NPC_PATROL.length;
    const [nextX, nextZ] = NPC_PATROL[npc.patrol];
    npc.state = "wandering"; moveNpc(nextX - npc.x, nextZ - npc.z, .72, dt); return;
  }

  let target = eligible.find((player) => player.id === npc.preferredTargetId) || chooseTarget(eligible);
  if (!target) return;
  npc.targetId = target.id; npc.preferredTargetId = target.id;
  let targetDistance = Math.hypot(target.x - npc.x, target.z - npc.z);
  npc.beamCount = 0;
  targetDistance = Math.hypot(target.x - npc.x, target.z - npc.z);
  npc.state = "hunting";
  const speed = targetDistance < 7
    ? NPC_SPEED.close + npc.aggression * NPC_SPEED.aggressionClose
    : NPC_SPEED.far + npc.aggression * NPC_SPEED.aggressionFar;
  moveNpc(target.x - npc.x, target.z - npc.z, speed, dt);
  if (Math.hypot(target.x - npc.x, target.z - npc.z) < NPC_CATCH_DISTANCE) {
    target.deadUntil = now + 10_000;
    broadcast({ type: "npc-game-over", playerId: target.id, name: target.name, ts: now });
    npc.aggression = Math.max(1, npc.aggression - .45); npc.preferredTargetId = null;
    npc.targetId = null; npc.state = "wandering";
  }
}, 100).unref();

setInterval(() => {
  if (wss.clients.size) broadcast({ type: "npc-state", npc: npcPublic() });
}, 200).unref();

// One shared roar event keeps every connected client on the same 20–30 second cadence.
const scheduleNpcRoar = () => {
  const timer = setTimeout(() => {
    if (wss.clients.size) broadcast({ type: "npc-roar", x: npc.x, z: npc.z, ts: Date.now() });
    scheduleNpcRoar();
  }, 20_000 + Math.random() * 10_000);
  timer.unref();
};
scheduleNpcRoar();

app.disable("x-powered-by");
const proxyWiki = async (req, res) => {
  const suffix = req.params[0] ? `/${req.params[0]}` : WIKI_HOME;
  if (!/^\/(?:wiki|w)\//i.test(suffix) || suffix.includes("..")) return res.sendStatus(400);
  const target = new URL(suffix, WIKI_ORIGIN);
  const queryAt = req.originalUrl.indexOf("?");
  if (queryAt >= 0) target.search = req.originalUrl.slice(queryAt);
  try {
    const upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "PVC-Hub-Wiki-Reader/1.0", Accept: "text/html,application/xhtml+xml" },
    });
    if (!upstream.ok) return res.sendStatus(upstream.status === 404 ? 404 : 502);
    const contentType = upstream.headers.get("content-type") || "text/html; charset=UTF-8";
    if (!contentType.includes("text/html")) {
      return res.set({ "Content-Type": contentType, "Cache-Control": "public, max-age=300" }).send(Buffer.from(await upstream.arrayBuffer()));
    }
    const proxyRoot = route("/wiki");
    let html = await upstream.text();
    // Keep assets on the official wiki, but route wiki navigation back through this reader.
    html = html
      .replace(/((?:src|href|action)=["'])\//gi, `$1${WIKI_ORIGIN}/`)
      .replace(/(<a\b[^>]*\bhref=["'])https:\/\/wiki\.peacefulvanilla\.club\/wiki\//gi, `$1${proxyRoot}/wiki/`)
      .replace(/(<a\b[^>]*\bhref=["'])https:\/\/wiki\.peacefulvanilla\.club\/w\//gi, `$1${proxyRoot}/w/`)
      .replace(/(<form\b[^>]*\baction=["'])https:\/\/wiki\.peacefulvanilla\.club\/w\//gi, `$1${proxyRoot}/w/`);
    return res.set({
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      "Content-Security-Policy": "frame-ancestors *",
      "Referrer-Policy": "no-referrer",
    }).send(html);
  } catch {
    return res.status(502).send("PVC Wiki is temporarily unavailable.");
  }
};
app.get(route("/wiki"), proxyWiki);
app.get(route("/wiki/*"), proxyWiki);
app.get(route("/skin/:name"), async (req, res) => {
  const name = text(req.params.name, 32).replace(/\.png$/i, "");
  if (!name || !/^[A-Za-z0-9_.*-]+$/.test(name)) {
    return res.status(400).json({ error: "Invalid skin name" });
  }
  try {
    const skin = await getSkin(name);
    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=1800, stale-while-revalidate=21600",
      "Access-Control-Allow-Origin": "*",
      "X-Skin-Source": skin.source,
    });
    return res.send(skin.buf);
  } catch {
    return res.status(502).json({ error: "Skin lookup failed" });
  }
});
app.get(route("/api/status"), (_req, res) => {
  res.json({
    ok: true,
    players: [...players.values()].filter((entry) => entry.joined).length,
    maxPlayers: cfg.maxPlayers,
    shared,
    npc: npcPublic(),
  });
});
const tileCache = new Map();
const tilePending = new Map();
app.get(route("/api/map/tiles/:world/:zoom/:tile"), async (req, res) => {
  const { world, zoom, tile } = req.params;
  if (!/^[a-z0-9_:-]+$/i.test(world) || !/^\d{1,2}$/.test(zoom) || Number(zoom) > 8 || !/^-?\d+_-?\d+\.png$/.test(tile)) return res.sendStatus(400);
  const key = `${world}/${zoom}/${tile}`;
  const hit = tileCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) {
    tileCache.delete(key); tileCache.set(key, hit);
    return res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "Access-Control-Allow-Origin": "*" }).send(hit.buf);
  }
  try {
    let pending = tilePending.get(key);
    if (!pending) {
      pending = (async () => {
        const upstream = await fetch(`${cfg.squaremapUrl}/tiles/${encodeURIComponent(world)}/${zoom}/${tile}`, { signal: AbortSignal.timeout(15_000) });
        if (!upstream.ok) return { status: upstream.status === 404 ? 404 : 502 };
        return { status: 200, buf: Buffer.from(await upstream.arrayBuffer()) };
      })();
      tilePending.set(key, pending);
      pending.then(() => tilePending.delete(key), () => tilePending.delete(key));
    }
    const result = await pending;
    if (result.status !== 200) return res.sendStatus(result.status);
    tileCache.set(key, { buf: result.buf, at: Date.now() });
    if (tileCache.size > 300) tileCache.delete(tileCache.keys().next().value);
    return res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "Access-Control-Allow-Origin": "*" }).send(result.buf);
  } catch { return res.sendStatus(502); }
});
app.get(route("/"), (_req, res) => res.redirect(308, cfg.frontendUrl));
if (cfg.basePath)
  app.get(cfg.basePath, (_req, res) => res.redirect(308, cfg.frontendUrl));

server.listen(cfg.port, cfg.host, () => {
  console.log(
    `PVC Lobby listening at http://${cfg.host}:${cfg.port}${cfg.basePath}/`,
  );
});

const shutdown = () => {
  for (const client of wss.clients) client.terminate();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
