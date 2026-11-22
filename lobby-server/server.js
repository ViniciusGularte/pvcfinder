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
const npc = {
  id: "slender", name: "Slender", skin: "Slender", x: 62, y: 0, z: -8,
  yaw: Math.PI, moving: false, state: "wandering", targetId: null,
  hiddenUntil: 0, nextShiftAt: Date.now() + 12_000, patrol: 0, revision: 0,
  aggression: 1, beamCount: 0, preferredTargetId: null, ambushAt: 0, observedSince: 0,
};
const npcPublic = () => ({
  id: npc.id, name: npc.name, skin: npc.skin, x: npc.x, y: npc.y, z: npc.z,
  yaw: npc.yaw, moving: npc.moving, state: npc.state, targetId: npc.targetId,
  hidden: Date.now() < npc.hiddenUntil, revision: npc.revision,
  aggression: npc.aggression, beamCount: npc.beamCount,
});
const insideHouse = (x, z) => x > -13.5 && x < 13.5 && z > -13.5 && z < 13.5;
const insideBunker = (x, z) => x > -11.5 && x < -4.5 && z > 10.5 && z < 21;
const insideSewerOpening = (x, z) =>
  (x > 16 && x < 25 && z > -23 && z < -17) ||
  (x > 55 && x < 61 && z > 14.5 && z < 24);
const npcPositionValid = (x, z) =>
  Math.hypot(x - SURFACE.x, z - SURFACE.z) < SURFACE.radius - 5 &&
  !insideHouse(x, z) && !insideBunker(x, z) && !insideSewerOpening(x, z);
const sewerPosition = (x, z) =>
  (x >= 17.5 && x <= 58.5 && z >= -21.5 && z <= -18.5) ||
  (x >= 56.5 && x <= 59.5 && z >= -20.5 && z <= 22.5);
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

const chooseShiftPoint = (target, minDistance = 13) => {
  const candidates = NPC_PATROL
    .map(([x, z]) => ({ x, z, distance: Math.hypot(x - target.x, z - target.z) }))
    .filter((point) => point.distance >= minDistance && npcPositionValid(point.x, point.z))
    .sort((a, b) => b.distance - a.distance);
  return candidates[Math.floor(Math.random() * Math.max(1, Math.min(3, candidates.length)))] || { x: 62, z: -8 };
};

const viewDot = (player, x, z) => {
  const dx = x - player.x, dz = z - player.z, distance = Math.hypot(dx, dz);
  if (distance < .001) return 1;
  return (-Math.sin(player.lookYaw) * dx - Math.cos(player.lookYaw) * dz) / distance;
};
const seesPoint = (player, x, z, threshold = .5, range = 46) =>
  Math.hypot(x - player.x, z - player.z) < range && Math.abs(player.lookPitch) < .9 && viewDot(player, x, z) > threshold;
const lightsNpc = (player) => player.flashlight && Math.abs(player.lookPitch) < .72 &&
  Math.hypot(npc.x - player.x, npc.z - player.z) < 38 && viewDot(player, npc.x, npc.z) > .9;

const chooseTarget = (eligible, excludeId = null) => {
  const pool = eligible.filter((player) => player.id !== excludeId);
  const candidates = pool.length ? pool : eligible;
  return candidates.map((player) => {
    const support = eligible.filter((other) => other.id !== player.id && Math.hypot(other.x - player.x, other.z - player.z) < 12).length;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    return { player, score: support * 9 + distance * .08 + (seesPoint(player, npc.x, npc.z) ? 6 : 0) + Math.random() * 1.5 };
  }).sort((a, b) => a.score - b.score)[0]?.player || null;
};

const chooseAmbushPoint = (target, observers, minDistance = 9, maxDistance = 15) => {
  let best = null;
  const start = Math.random() * Math.PI * 2;
  for (let i = 0; i < 32; i++) {
    const angle = start + i / 32 * Math.PI * 2;
    const radius = minDistance + (maxDistance - minDistance) * (.25 + ((i * 17) % 23) / 30);
    const point = { x: target.x + Math.cos(angle) * radius, z: target.z + Math.sin(angle) * radius };
    if (!npcPositionValid(point.x, point.z)) continue;
    const visibleCount = observers.filter((player) => seesPoint(player, point.x, point.z, .42, 50)).length;
    const targetDot = viewDot(target, point.x, point.z);
    const closestPlayer = Math.min(...observers.map((player) => Math.hypot(point.x - player.x, point.z - player.z)));
    const score = visibleCount * 100 + Math.max(0, targetDot + .12) * 35 + Math.max(0, 4.5 - closestPlayer) * 12 + Math.random() * 2;
    if (!best || score < best.score) best = { ...point, score };
  }
  return best || chooseShiftPoint(target, minDistance);
};

const teleportNpc = (point, target, now, hiddenMs, state) => {
  npc.x = point.x; npc.z = point.z;
  if (target) npc.yaw = Math.atan2(target.x - npc.x, target.z - npc.z);
  npc.state = state; npc.hiddenUntil = now + hiddenMs; npc.moving = false; npc.revision += 1;
};

const moveNpc = (dx, dz, speed, dt) => {
  const distance = Math.hypot(dx, dz);
  if (distance < .001) { npc.moving = false; return; }
  const nx = npc.x + dx / distance * speed * dt;
  const nz = npc.z + dz / distance * speed * dt;
  npc.yaw = Math.atan2(dx, dz);
  npc.moving = speed > .05;
  if (npcPositionValid(nx, nz)) { npc.x = nx; npc.z = nz; return; }
  // Slide around protected structures instead of entering the lodge, bunker or sewer stairs.
  const sideX = npc.x + dz / distance * speed * dt;
  const sideZ = npc.z - dx / distance * speed * dt;
  if (npcPositionValid(sideX, sideZ)) { npc.x = sideX; npc.z = sideZ; }
  else npc.moving = false;
};

let npcLastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(.2, (now - npcLastTick) / 1000); npcLastTick = now;
  const eligible = [...players.values()].filter((player) =>
    player.joined && now >= player.deadUntil && player.y > -.45 &&
    !insideHouse(player.x, player.z) && !insideBunker(player.x, player.z));
  if (now < npc.hiddenUntil) { npc.moving = false; npc.state = "hidden"; return; }
  if (!eligible.length) {
    npc.targetId = null; npc.preferredTargetId = null; npc.ambushAt = 0; npc.beamCount = 0;
    const [tx, tz] = NPC_PATROL[npc.patrol % NPC_PATROL.length];
    if (Math.hypot(tx - npc.x, tz - npc.z) < 1.2) npc.patrol = (npc.patrol + 1) % NPC_PATROL.length;
    const [nextX, nextZ] = NPC_PATROL[npc.patrol];
    npc.state = "wandering"; moveNpc(nextX - npc.x, nextZ - npc.z, .72, dt); return;
  }

  let target = eligible.find((player) => player.id === npc.preferredTargetId) || chooseTarget(eligible);
  if (!target) return;
  const targetChanged = target.id !== npc.targetId;
  npc.targetId = target.id; npc.preferredTargetId = target.id;
  let targetDistance = Math.hypot(target.x - npc.x, target.z - npc.z);

  // Every hunt starts out in the forest, outside the group's view. From there Slender
  // stays visible and runs instead of repeatedly teleporting while being watched.
  if (targetChanged) {
    const point = chooseAmbushPoint(target, eligible, 25, 38);
    teleportNpc(point, target, now, 900, "spawning");
    npc.targetId = target.id; npc.preferredTargetId = target.id;
    return;
  }

  const illuminators = eligible.filter(lightsNpc);
  npc.beamCount = illuminators.length;
  if (illuminators.length) {
    const source = illuminators[0];
    const nextTarget = chooseTarget(eligible, source.id) || source;
    const point = chooseAmbushPoint(nextTarget, eligible, 28, 41);
    npc.aggression = Math.min(5, npc.aggression + (illuminators.length >= 2 ? .15 : .35));
    teleportNpc(point, nextTarget, now, illuminators.length >= 2 ? 5200 : 3800, "banished");
    npc.preferredTargetId = nextTarget.id; npc.targetId = nextTarget.id;
    broadcast({ type: "npc-event", event: "repelled", sourceId: source.id, targetId: nextTarget.id, aggression: npc.aggression });
    return;
  }

  targetDistance = Math.hypot(target.x - npc.x, target.z - npc.z);
  npc.state = "hunting";
  const speed = targetDistance < 7 ? 4.15 + npc.aggression * .1 : 3.35 + npc.aggression * .16;
  moveNpc(target.x - npc.x, target.z - npc.z, speed, dt);
  if (Math.hypot(target.x - npc.x, target.z - npc.z) < .85) {
    target.deadUntil = now + 10_000;
    broadcast({ type: "npc-game-over", playerId: target.id, name: target.name, ts: now });
    const point = chooseShiftPoint(target, 32);
    teleportNpc(point, target, now, 4200, "fed");
    npc.aggression = Math.max(1, npc.aggression - .45); npc.preferredTargetId = null;
    npc.nextShiftAt = now + 9000; npc.targetId = null;
  }
}, 100).unref();

setInterval(() => {
  if (wss.clients.size) broadcast({ type: "npc-state", npc: npcPublic() });
}, 200).unref();

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
