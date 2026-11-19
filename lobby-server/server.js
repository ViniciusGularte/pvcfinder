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
  frontendUrl: env.FRONTEND_URL || "https://pvcstorefinder.vercel.app/lobby/",
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
const publicPlayer = (player) => ({
  id: player.id,
  name: player.name,
  skin: player.skin,
  x: player.x,
  y: player.y,
  z: player.z,
  yaw: player.yaw,
  moving: player.moving,
  seatId: player.seatId,
});
const movingPlayer = (player) => ({
  id: player.id,
  x: player.x,
  y: player.y,
  z: player.z,
  yaw: player.yaw,
  moving: player.moving,
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
    moving: false,
    seatId: null,
    joined: false,
    lastMove: 0,
    lastChat: 0,
    lastEmote: 0,
    lastBunker: 0,
    lastOrbital: 0,
    lastJukebox: 0,
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
      const x = Math.max(-12.5, Math.min(12.5, finite(message.x, player.x)));
      const z = Math.max(-11.6, Math.min(20.2, finite(message.z, player.z)));
      const inLobby = x >= -11.6 && x <= 11.55 && z >= -11.6 && z <= 11.6;
      const inBunker = x >= -10.7 && x <= -5.3 && z >= 11.2 && z <= 20.2;
      if (inLobby || inBunker) { player.x = x; player.z = z; }
      player.y = 0;
      player.yaw = finite(message.yaw, player.yaw);
      player.moving = !!message.moving;
      broadcast({ type: "player-move", player: movingPlayer(player) }, socket);
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

    if (message.type === "orbital") {
      const now = Date.now();
      if (now - player.lastOrbital < 10_000) return;
      player.lastOrbital = now;
      broadcast({ type: "orbital", name: player.name, playerId: id, ts: now });
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
