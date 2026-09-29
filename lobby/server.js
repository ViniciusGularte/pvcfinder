import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  maxPlayers: Math.min(100, Math.max(2, num(env.MAX_PLAYERS, 40))),
  chatHistory: Math.min(200, Math.max(10, num(env.CHAT_HISTORY, 50))),
  mapUrl: env.MAP_URL || "https://web.peacefulvanilla.club/maps/",
  skinUrl: env.SKIN_URL || "https://api.theyasked.co/grveye/skin/",
  shopUrl: env.SHOP_URL || "https://pvcstorefinder.vercel.app/",
};
const route = (suffix) => `${cfg.basePath}${suffix}` || "/";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: route("/ws") });
const players = new Map();
const seats = new Map();
const chat = [];
const shared = { jukeboxPlaying: false, mapWorld: "overworld" };
const seatIds = new Set(["sofa-1", "sofa-2", "chair-1", "chair-2", "chair-3"]);

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
  };
  players.set(id, player);

  send(socket, {
    type: "welcome",
    id,
    players: [...players.values()]
      .filter((entry) => entry.joined)
      .map(publicPlayer),
    seats: Object.fromEntries(seats),
    chat,
    shared,
    config: {
      maxPlayers: cfg.maxPlayers,
      mapUrl: cfg.mapUrl,
      skinUrl: cfg.skinUrl,
      shopUrl: cfg.shopUrl,
    },
  });

  socket.on("message", (raw) => {
    if (raw.length > 4096) return;
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join" && !player.joined) {
      player.name = text(message.name, 24) || player.name;
      player.skin =
        text(message.skin, 32).replace(/[^A-Za-z0-9_.*-]/g, "") || "Steve";
      player.joined = true;
      broadcast({ type: "player-join", player: publicPlayer(player) });
      return;
    }
    if (!player.joined) return;

    if (message.type === "move") {
      const now = Date.now();
      if (now - player.lastMove < 40 || player.seatId) return;
      player.lastMove = now;
      player.x = Math.max(-12.5, Math.min(12.5, finite(message.x, player.x)));
      player.z = Math.max(-9.5, Math.min(9.5, finite(message.z, player.z)));
      player.y = 0;
      player.yaw = finite(message.yaw, player.yaw);
      player.moving = !!message.moving;
      broadcast({ type: "player-move", player: publicPlayer(player) }, socket);
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
      chat.push(row);
      if (chat.length > cfg.chatHistory) chat.shift();
      broadcast({ type: "chat", row });
      return;
    }

    if (message.type === "sit") {
      const seatId = text(message.seatId, 24);
      if (player.seatId) seats.delete(player.seatId);
      player.seatId = null;
      if (seatIds.has(seatId) && !seats.has(seatId)) {
        seats.set(seatId, id);
        player.seatId = seatId;
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
      broadcast({
        type: "seats",
        seats: Object.fromEntries(seats),
        player: publicPlayer(player),
      });
      return;
    }

    if (message.type === "jukebox") {
      shared.jukeboxPlaying = !!message.playing;
      broadcast({ type: "shared", shared });
      return;
    }

    if (message.type === "map-world") {
      shared.mapWorld = message.world === "nether" ? "nether" : "overworld";
      broadcast({ type: "shared", shared });
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
app.get(route("/api/status"), (_req, res) => {
  res.json({
    ok: true,
    players: [...players.values()].filter((entry) => entry.joined).length,
    maxPlayers: cfg.maxPlayers,
    shared,
  });
});
app.get(route("/media/jukebox.mp3"), (_req, res) => {
  res.sendFile(
    path.resolve(
      __dirname,
      "../grv-eye/public/The Batcave _ Brother Eye [kk4oSLA8jD4].mp3",
    ),
  );
});
app.use(
  route("/vendor"),
  express.static(path.join(__dirname, "node_modules/three/build"), {
    maxAge: "30d",
  }),
);
app.use(
  route("/"),
  express.static(path.join(__dirname, "public"), { index: "index.html" }),
);
if (cfg.basePath)
  app.get(cfg.basePath, (_req, res) => res.redirect(308, `${cfg.basePath}/`));

server.listen(cfg.port, cfg.host, () => {
  console.log(
    `PVC Lobby listening at http://${cfg.host}:${cfg.port}${cfg.basePath}/`,
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
