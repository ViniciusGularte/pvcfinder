import * as THREE from 'three';
import { S } from './core.js';
import { LOBBY_WS } from './config.js';
import { createAvatar, defaultSkin, fetchSkin, HIP } from './avatar.js';
import { setGlobalWeather } from './weather.js';
import { audioFX } from './audio.js';
import { createFlashlightModel } from './flashlight.js';
import { $, glyphTex, spawnFloaters, V } from './util.js';

const remotes = new Map();
let socket = null;
let joinedName = null;
let lastMove = 0;
let lastMoveSentAt = 0;
let lastSentMove = null;
let reconnectTimer = null;

const send = message => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};

function addRemote(player) {
  if (!player?.id || player.id === S.netId || remotes.has(player.id)) return;
  const avatar = createAvatar({ shadows: false });
  avatar.setSkin(defaultSkin()); avatar.setName(player.name || 'Guest');
  const flashlight = createFlashlightModel(); avatar.attachToHand(flashlight, 'r');
  flashlight.visible = !!player.flashlight; flashlight.userData.setLit(!!player.flashlight);
  avatar.root.position.set(player.x || 0, player.y || 0, player.z || 0);
  S.scene.add(avatar.root);
  const row = {
    avatar,
    target: V(player.x || 0, player.y || 0, player.z || 0),
    yaw: player.yaw || 0,
    targetYaw: player.yaw || 0,
    moving: !!player.moving,
    seated: !!player.seatId,
    flashlight,
    emote: null,
    emoteUntil: 0,
    skinTimer: null,
  };
  remotes.set(player.id, row);
  // Avoid launching expensive skin downloads for brief reconnects. This also caps
  // transient Image/canvas allocations when a weak client sees connection churn.
  row.skinTimer = setTimeout(async () => {
    row.skinTimer = null;
    const skin = await fetchSkin(player.skin || player.name);
    if (skin && remotes.get(player.id) === row) avatar.setSkin(skin);
  }, 800);
}

function removeRemote(id) {
  const row = remotes.get(id); if (!row) return;
  clearTimeout(row.skinTimer);
  S.scene.remove(row.avatar.root); row.avatar.dispose(); remotes.delete(id);
}

function applyPlayer(player) {
  if (!remotes.has(player.id)) { addRemote(player); return; }
  const row = remotes.get(player.id);
  row.target.set(player.x || 0, player.y || 0, player.z || 0);
  row.targetYaw = player.yaw || 0; row.moving = !!player.moving;
  row.seated = !!player.seatId;
  row.flashlight.visible = !!player.flashlight; row.flashlight.userData.setLit(!!player.flashlight);
}

function applyShared(shared = {}) {
  S.shared = { ...(S.shared || {}), ...shared };
  if (shared.weather) setGlobalWeather(shared.weather);
  if (shared.mapView) S.mapScreen?.applyShared(shared.mapView);
  if (shared.cabinDoors) Object.entries(shared.cabinDoors).forEach(([id, open]) => S.cabinDoors?.get(id)?.apply(open));
  else if (typeof shared.cabinOpen === 'boolean') S.cabinDoor?.apply(shared.cabinOpen);
  if (shared.jukebox) audioFX.applyJukebox(shared.jukebox);
  else if (typeof shared.jukeboxPlaying === 'boolean') {
    // Compatibility with the previous VPS protocol until every node is upgraded.
    audioFX.applyJukebox({ playing: shared.jukeboxPlaying, track: 0, startedAt: Date.now() });
  }
}

function updateCount() {
  const el = $('onlineCount');
  if (el) el.textContent = `${remotes.size + (joinedName ? 1 : 0) + (S.testActors?.length || 0)}/20 online`;
}

const emoteDuration = emote => emote === 'overcharge' ? 3000 : ['dance', 'clap', 'laugh'].includes(emote) ? 2400 : 1600;

function handle(message) {
  if (message.type === 'welcome') {
    S.netId = message.id; S.netConfig = message.config || {};
    (message.players || []).forEach(addRemote); applyShared(message.shared);
    S.npc?.apply(message.npc);
    S.board?.applySnapshot(message.chalkboard);
    if (joinedName) send({ type: 'join', name: joinedName, skin: joinedName });
  } else if (message.type === 'player-join') addRemote(message.player);
  else if (message.type === 'player-move' || message.type === 'seats') applyPlayer(message.player);
  else if (message.type === 'npc-state') S.npc?.apply(message.npc);
  else if (message.type === 'npc-game-over') S.npc?.onGameOver(message);
  else if (message.type === 'npc-roar') S.npc?.onRoar(message);
  else if (message.type === 'npc-respawned') applyPlayer(message.player);
  else if (message.type === 'player-leave') removeRemote(message.id);
  else if (message.type === 'chat') S.chat?.receive(message.row);
  else if (message.type === 'bunker-open') S.bunker?.openDoor(message.until);
  else if (message.type === 'cabin-door') (S.cabinDoors?.get(message.cabinId || 'west') || S.cabinDoor)?.apply(message.open);
  else if (message.type === 'shared') applyShared(message.shared);
  else if (message.type === 'emote') {
    const row = remotes.get(message.id);
    if (row) { row.emote = message.emote; row.emoteUntil = performance.now() + emoteDuration(message.emote); showEmote(row.avatar.root, message.emote); }
  } else if (message.type === 'board-stroke') S.board?.applyStroke(message.stroke);
  else if (message.type === 'board-clear') S.board?.clear();
  else if (message.type === 'error') $('netStatus').textContent = message.message || 'Lobby unavailable';
  updateCount();
}

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(LOBBY_WS);
  socket.onopen = () => { $('netStatus').textContent = 'Connected to PVC Hub'; };
  socket.onmessage = event => { try { handle(JSON.parse(event.data)); } catch {} };
  socket.onclose = () => {
    $('netStatus').textContent = 'Reconnecting to the hub…';
    S.netId = null; [...remotes.keys()].forEach(removeRemote); updateCount();
    reconnectTimer = setTimeout(connect, 2500);
  };
}

function showEmote(root, emote) {
  const effects = {
    wave: ['👋', '#ffd36a', 3], heart: ['❤', '#ff6680', 3], celebrate: ['✦', '#ffd36a', 7],
    dance: ['♪', '#80e8ff', 6], clap: ['👏', '#ffd36a', 4], laugh: ['😂', '#ffe16b', 4],
    overcharge: ['⚡', '#6ff7ff', 9],
  };
  const [glyph, color, count] = effects[emote] || effects.wave;
  spawnFloaters(glyphTex(glyph, color, 48), root.position.clone().add(V(0, 1.9, 0)), count, { size: .16, disposeTexture: true });
}

export function initMultiplayer() {
  connect();
  S.onFrame((dt, t) => {
    for (const row of remotes.values()) {
      row.avatar.root.position.lerp(row.target, 1 - Math.exp(-dt * 10));
      row.yaw += Math.atan2(Math.sin(row.targetYaw - row.yaw), Math.cos(row.targetYaw - row.yaw)) * (1 - Math.exp(-dt * 10));
      row.avatar.root.rotation.y = row.yaw;
      row.avatar.update(dt, { speed: row.moving ? 2.6 : 0, sitting: row.seated, typing: false, airborne: false, t, emote: performance.now() < row.emoteUntil ? row.emote : null });
    }
    const now = performance.now();
    if (!joinedName || !S.player || now - lastMove < 100) return;
    lastMove = now;
    const next = { x: S.player.pos.x, y: S.player.pos.y, z: S.player.pos.z, yaw: S.player.yaw, lookYaw: S.cam.yaw, lookPitch: S.cam.pitch, moving: S.player.speed > .08, flashlight: S.player.flashlightOn };
    const changed = !lastSentMove
      || Math.hypot(next.x - lastSentMove.x, next.z - lastSentMove.z) > .012
      || Math.abs(next.y - lastSentMove.y) > .012
      || Math.abs(Math.atan2(Math.sin(next.yaw - lastSentMove.yaw), Math.cos(next.yaw - lastSentMove.yaw))) > .018
      || Math.abs(Math.atan2(Math.sin(next.lookYaw - lastSentMove.lookYaw), Math.cos(next.lookYaw - lastSentMove.lookYaw))) > .018
      || Math.abs(next.lookPitch - lastSentMove.lookPitch) > .018
      || next.moving !== lastSentMove.moving
      || next.flashlight !== lastSentMove.flashlight
      || now - lastMoveSentAt > 2000;
    if (!changed) return;
    lastSentMove = next; lastMoveSentAt = now; send({ type: 'move', ...next });
  });
  const api = S.multiplayer = {
    join(name) { joinedName = name; lastSentMove = null; send({ type: 'join', name, skin: name }); updateCount(); },
    emote(emote) {
      const duration = emoteDuration(emote);
      S.localEmote = emote; S.localEmoteUntil = performance.now() + duration;
      S.player?.showEmoteView(duration);
      showEmote(S.player.avatar.root, emote); send({ type: 'emote', emote });
    },
    setMapView(view) { send({ type: 'map-view', ...view }); },
    sit(seat) { send({ type: 'sit', seatId: seat.id, x: seat.pos.x, y: seat.pos.y - HIP, z: seat.pos.z, yaw: seat.yaw }); },
    stand(pos, yaw) { send({ type: 'stand', x: pos.x, z: pos.z, yaw }); },
    boardStroke(stroke) { send({ type: 'board-stroke', ...stroke }); },
    clearBoard() { send({ type: 'board-clear' }); },
    chat(message) { send({ type: 'chat', message }); },
    openBunker() { send({ type: 'bunker-open' }); },
    setCabinDoor(cabinId, open) { send({ type: 'cabin-door', cabinId, open: !!open }); },
    setJukebox(state) { send({ type: 'jukebox', ...state }); },
    respawnNPC() { send({ type: 'npc-respawn' }); },
  };
  return api;
}
