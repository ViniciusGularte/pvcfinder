// All the tweakable numbers live here.

export const API = 'https://pvc.coolwebsite.uk';
export const WORLD = 'minecraft_overworld';
export const MAP_START = { x: 256, z: 256, zoom: 1 }; // useful overview of the populated map tile
export const MAP_SPAWN = { x: 54, z: 51, zoom: 1 };   // PVC server spawn
export const GOTO_ZOOM = 1;

export const ROOM = { w: 24, d: 24, h: 4.2 };       // x: -12..12, z: -12..12
export const SURFACE_AREA = { centerX: 30, centerZ: 10, radius: 82, minX: -52, maxX: 112, minZ: -72, maxZ: 92 }; // circular exterior + mountain boundary
export const SCREEN = { x: -5, y: 2.2, w: 5.6, h: 3.15, px: 1600 };  // live map on the back wall
export const WIN = { z: 3, y: 2.35, w: 3.4, h: 2.2 };                // window on the right wall (x = +12)
export const SPAWN = { x: 0, z: 5, yaw: Math.PI };

// Skin sources, tried in order. All of them send CORS headers so the image can be used as a texture.
export const SKIN_SOURCES = [
  (nick, uuid) => uuid ? `https://crafatar.com/skins/${uuid}` : null,
  (nick) => `https://mc-heads.net/skin/${encodeURIComponent(nick)}`,
  (nick) => `https://minotar.net/skin/${encodeURIComponent(nick)}`,
];

export const BOARD_REFRESH_MS = 60_000;   // server status board: once a minute is plenty

export const LOBBY_WS = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  ? 'ws://127.0.0.1:8081/lobby/ws'
  : 'wss://api.theyasked.co/lobby/ws';
export const WIKI_READER = `${LOBBY_WS.replace(/^ws/, 'http').replace(/\/ws$/, '')}/wiki`;
