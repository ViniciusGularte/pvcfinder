import { S } from './core.js';
import { createAvatar, defaultSkin, fetchSkin } from './avatar.js';
import { audioFX, sfx } from './audio.js';
import { $, toast, V } from './util.js';

const HOME = { minX: -13.5, maxX: 13.5, minZ: -13.5, maxZ: 13.5 };

export function initNPC() {
  const avatar = createAvatar({ shadows: false });
  avatar.setSkin(defaultSkin());
  avatar.root.name = 'SlenderNPC';
  avatar.root.scale.set(.9, 1.38, .9);
  avatar.root.visible = false; S.scene.add(avatar.root);
  const target = V(62, 0, -8);
  const state = { target, yaw: Math.PI, targetYaw: Math.PI, moving: false, mode: 'hidden', revision: -1, ready: false };
  const gameOver = $('gameOver'), respawn = $('respawnBtn');

  fetchSkin('Slender').then(skin => { if (skin) avatar.setSkin(skin); });

  function apply(data = {}) {
    if (!Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
    target.set(data.x, Number(data.y) || 0, data.z);
    state.targetYaw = Number(data.yaw) || 0;
    state.moving = !!data.moving; state.mode = data.state || 'stalking';
    state.aggression = Number(data.aggression) || 1; state.beamCount = Number(data.beamCount) || 0;
    const revision = Number(data.revision) || 0;
    if (!state.ready || revision !== state.revision) {
      avatar.root.position.copy(target); state.yaw = state.targetYaw;
    }
    state.ready = true; state.revision = revision;
    avatar.root.visible = !data.hidden;
  }

  function onGameOver(message) {
    if (message.playerId !== S.netId) return;
    S.mode = 'gameover';
    returnToLodge();
    gameOver?.classList.add('open');
    requestAnimationFrame(() => respawn?.focus());
  }

  function returnToLodge() {
    S.player?.stand?.();
    if (S.player) {
      S.player.pos.set(0, 0, 5); S.player.groundY = 0; S.player.vy = 0;
      S.player.walkTarget = null; S.player.onArrive = null; S.player.state = 'walk';
    }
    // Clear the server-side death timer and publish the safe lodge position now,
    // so other players never see the caught avatar standing beside Slender.
    S.multiplayer?.respawnNPC();
  }

  function onEvent(message) {
    const player = S.player;
    const outside = player && player.pos.y >= -.45 &&
      !(player.pos.x > HOME.minX && player.pos.x < HOME.maxX && player.pos.z > HOME.minZ && player.pos.z < HOME.maxZ);
    if (outside && (message.event === 'repelled' || message.event === 'team-repel')) sfx.slenderVanish();
    if (message.event === 'repelled') {
      if (message.sourceId === S.netId) toast('🔦 Slender vanished into the forest. You bought the team some time.', 3800);
      else toast('🔦 Someone drove Slender back. Watch another direction when he returns.', 3400);
    } else if (message.event === 'team-repel') {
      toast('⚡ Crossfire! Your team banished Slender for longer.', 3600);
    } else if (message.event === 'target-switch') {
      if (message.targetId === S.netId) toast('⚠ Something moved behind you — your team must cover you!', 3800);
      else if (message.fromId === S.netId) toast('🔦 Slender fled your light and switched targets.', 3200);
    }
  }

  respawn?.addEventListener('click', () => {
    gameOver?.classList.remove('open'); S.mode = 'walk';
  });

  S.onFrame((dt, t) => {
    if (state.ready) {
      avatar.root.position.lerp(target, 1 - Math.exp(-dt * 7));
      state.yaw += Math.atan2(Math.sin(state.targetYaw - state.yaw), Math.cos(state.targetYaw - state.yaw)) * (1 - Math.exp(-dt * 8));
      avatar.root.rotation.y = state.yaw;
      avatar.update(dt, { speed: state.moving ? (state.mode === 'hunting' ? 5.4 : 1.2) : 0, sitting: false, typing: false, airborne: false, t, emote: null });
    }
    const player = S.player;
    const indoors = !player || player.pos.y < -.45 ||
      (player.pos.x > HOME.minX && player.pos.x < HOME.maxX && player.pos.z > HOME.minZ && player.pos.z < HOME.maxZ);
    const distance = player ? Math.hypot(player.pos.x - avatar.root.position.x, player.pos.z - avatar.root.position.z) : 99;
    audioFX.updateSlenderFootsteps(distance, !indoors && avatar.root.visible && state.moving);
  });

  S.npc = { apply, onGameOver, onEvent, avatar, state };
  return S.npc;
}
