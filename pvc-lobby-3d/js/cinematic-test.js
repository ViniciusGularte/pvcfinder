// Local-only populated lobby for client load tests and cinematic capture.
import * as THREE from 'three';
import { S } from './core.js';
import { createAvatar, defaultSkin, drawHead, fetchSkin, HIP } from './avatar.js';
import { V, $ } from './util.js';
import { setCinematicComputers } from './computers.js';

const params = new URLSearchParams(location.search);
const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
const enabled = localHost && params.get('test') === 'cinematic';
const UP = new THREE.Vector3(0, 1, 0);

const seat = (x, z, rot, height, lx = 0, lz = 0) => {
  const position = V(lx, height - HIP, lz).applyAxisAngle(UP, rot);
  position.x += x; position.z += z;
  return { position, yaw: Math.atan2(-Math.sin(rot), -Math.cos(rot)) };
};

const CAST = [
  { name: 'CopperByte', skin: 'MumboJumbo', role: 'pc', ...seat(6, -6.4, 0, .46, 0, .78), typing: true },
  { name: 'NovaQuill', skin: 'GeminiTay', role: 'pc', ...seat(8, -6.4, 0, .46, 0, .78), typing: true },
  { name: 'CircuitFox', skin: 'Xisuma', role: 'pc', ...seat(6, -7.2, Math.PI, .46, 0, .78), typing: true },
  { name: 'EmberVale', skin: 'GoodTimeWithScar', role: 'sofa', ...seat(-5, -4.6, 0, .56, -.7, -.02), emote: 'heart', cycle: 8.5 },
  { name: 'MossKnight', skin: 'Smallishbeans', role: 'sofa', ...seat(-5, -4.6, 0, .56, .7, -.02), emote: 'laugh', cycle: 10 },
  { name: 'RookZero', skin: 'Etho', role: 'chess', ...seat(-6, 4.2, Math.PI, .53), emote: 'celebrate', cycle: 12 },
  { name: 'IvoryPawn', skin: 'BdoubleO100', role: 'chess', ...seat(-6, 6.2, 0, .53), emote: 'clap', cycle: 9.5 },
  { name: 'BaristaBee', skin: 'PearlescentMoon', role: 'kitchen', ...seat(6.3, 10.67, Math.PI, .78), emote: 'wave', cycle: 11 },
  { name: 'CinderCup', skin: 'CaptainSparklez', role: 'kitchen', ...seat(7.6, 10.67, Math.PI, .78), emote: 'clap', cycle: 8 },
  { name: 'LoreKeeper', skin: 'Grian', role: 'books', position: V(.4, 0, -10.78), yaw: Math.PI, emote: 'heart', cycle: 13 },
  { name: 'HearthWitch', skin: 'Technoblade', role: 'chair', ...seat(-9.3, .5, Math.PI / 2 + .5, .56, 0, -.02), emote: 'laugh', cycle: 9 },
  { name: 'AtlasDrift', skin: 'Dream', role: 'map', position: V(-8.25, 0, -10.72), yaw: Math.PI },
  { name: 'WanderMint', skin: 'Sapnap', role: 'walker', position: V(1.2, 0, 1.2), yaw: Math.PI / 2 },
];

const MAP_ROUTE = [
  { x: 54, z: 51, zoom: 1 },
  { x: -1101, z: -7336, zoom: 1 },
  { x: 3452, z: -2728, zoom: 1 },
  { x: 5678, z: 391, zoom: 1 },
  { x: -5083, z: -7760, zoom: 1 },
  { x: -236, z: 10970, zoom: 1 },
  { x: -733, z: -323, zoom: 1 },
  { x: 4820, z: 6240, zoom: 1 },
];

function activeEmote(actor, t) {
  if (!actor.emote) return null;
  const local = (t + actor.phase) % actor.cycle;
  return local < (actor.emote === 'overcharge' ? 3 : 2.1) ? actor.emote : null;
}

function buildBadge(count) {
  const badge = document.createElement('aside');
  badge.id = 'cinematicTest'; badge.className = 'hud';
  badge.innerHTML = `<i></i><div><small>LOCAL CINEMATIC LOAD</small><b>${count} ACTORS · <span id="cinematicFps">-- FPS</span></b></div>`;
  document.body.appendChild(badge);
  return badge;
}

export function initCinematicTest() {
  if (!enabled) return false;

  $('login').classList.add('gone');
  S.nick = 'sr_dbage'; S.player.avatar.setName('sr_dbage');
  $('meName').textContent = 'sr_dbage';
  S.multiplayer?.join('sr_dbage');
  fetchSkin('sr_dbage').then(skin => {
    if (!skin) return;
    S.player.avatar.setSkin(skin);
    drawHead(skin.canvas, $('meHead'));
  });
  setCinematicComputers();

  const actors = CAST.map((spec, index) => {
    const avatar = createAvatar({ shadows: !S.quality.lowPower });
    avatar.setSkin(defaultSkin()); avatar.setName(spec.name);
    avatar.root.position.copy(spec.position); avatar.root.rotation.y = spec.yaw;
    S.scene.add(avatar.root);
    const actor = { ...spec, avatar, base: spec.position.clone(), phase: index * 1.73 };
    fetchSkin(spec.skin).then(skin => { if (skin) avatar.setSkin(skin); });
    return actor;
  });
  S.testActors = actors;
  $('onlineCount').textContent = `${actors.length + 1}/20 online`;

  const badge = buildBadge(actors.length);
  let nextChess = 3.5, nextMap = 2.5;
  let fpsFrames = 0, fpsTime = 0;

  S.onFrame((dt, t) => {
    for (const actor of actors) {
      let speed = 0;
      if (actor.role === 'walker') {
        const travel = Math.sin(t * .42 + actor.phase), direction = Math.cos(t * .42 + actor.phase);
        const x = actor.base.x + travel * 2.8;
        speed = Math.abs(x - actor.avatar.root.position.x) / Math.max(dt, .001);
        actor.avatar.root.position.x = x;
        actor.avatar.root.rotation.y = direction >= 0 ? Math.PI / 2 : -Math.PI / 2;
      } else if (actor.role === 'books') {
        actor.avatar.root.rotation.y = actor.yaw + Math.sin(t * .35) * .08;
      }
      actor.avatar.update(dt, {
        speed, sitting: ['pc', 'sofa', 'chess', 'kitchen', 'chair'].includes(actor.role),
        typing: !!actor.typing, airborne: false, t: t + actor.phase, emote: activeEmote(actor, t),
      });
    }

    if (t >= nextChess) {
      nextChess = t + 7.5;
      S.interactables.find(item => item.name === 'a chess piece')?.action();
    }
    if (t >= nextMap) {
      nextMap = t + 1;
      const step = Math.floor(t);
      const region = MAP_ROUTE[Math.floor(step / 10) % MAP_ROUTE.length];
      const orbit = step % 10, angle = orbit * Math.PI / 5;
      S.mapScreen?.applyShared({
        x: region.x + Math.sin(angle) * 44,
        z: region.z + Math.cos(angle) * 32,
        zoom: region.zoom,
      });
    }

    fpsFrames++; fpsTime += dt;
    if (fpsTime >= .75) {
      const fps = Math.round(fpsFrames / fpsTime);
      const memory = performance.memory ? ` · ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
      $('cinematicFps').textContent = `${fps} FPS${memory}`;
      badge.classList.toggle('strained', fps < 45);
      fpsFrames = 0; fpsTime = 0;
    }
  });
  return true;
}
