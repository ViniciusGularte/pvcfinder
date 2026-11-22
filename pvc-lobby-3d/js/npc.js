import * as THREE from 'three';
import { S } from './core.js';
import { audioFX } from './audio.js';
import { $, V } from './util.js';

const HOME = { minX: -13.5, maxX: 13.5, minZ: -13.5, maxZ: 13.5 };

function createSlenderModel() {
  const root = new THREE.Group(); root.name = 'SlenderNPC';
  const upper = new THREE.Group(); upper.position.y = 1.16; root.add(upper);
  const suit = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: .92 });
  const suitEdge = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: .86 });
  const bone = new THREE.MeshStandardMaterial({ color: 0x22272b, roughness: .88 });
  const claw = new THREE.MeshStandardMaterial({ color: 0x6e777a, roughness: .72, metalness: .08 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xd95b00, emissive: 0x401000, emissiveIntensity: .32, roughness: .8 });
  const add = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z);
    object.castShadow = false; object.receiveShadow = false; parent.add(object); return object;
  };
  const limb = (parent, length, topRadius, bottomRadius, material) =>
    add(new THREE.CylinderGeometry(topRadius, bottomRadius, length, 7), material, parent, 0, -length / 2, 0);

  add(new THREE.CylinderGeometry(.31, .23, 1.05, 7), suit, upper, 0, .52, 0);
  add(new THREE.BoxGeometry(.82, .14, .28), suitEdge, upper, 0, 1.03, .005);
  add(new THREE.BoxGeometry(.46, .24, .3), suit, upper, 0, .05, 0);
  const tie = add(new THREE.ConeGeometry(.055, .48, 4), orange, upper, 0, .55, .174); tie.rotation.z = Math.PI;
  add(new THREE.CylinderGeometry(.09, .115, .24, 7), bone, upper, 0, 1.22, 0);

  const head = new THREE.Group(); head.position.set(0, 1.57, .015); upper.add(head);
  add(new THREE.BoxGeometry(.54, .66, .5), orange, head);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#d95b00'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#321b16'; g.fillRect(8, 7, 112, 31);
  g.fillStyle = '#e9dfc9'; g.font = 'bold 28px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PVC', 64, 23);
  for (const x of [28, 89]) {
    g.fillStyle = '#141718'; g.fillRect(x, 49, 17, 38);
    g.fillStyle = '#353a3b'; g.fillRect(x + 3, 51, 11, 7);
    g.fillStyle = '#eee9d7'; g.fillRect(x + 9, 52, 4, 5);
  }
  g.fillStyle = '#1b1e20';
  g.beginPath(); g.moveTo(34, 86); g.lineTo(94, 83); g.lineTo(90, 99); g.lineTo(80, 99); g.lineTo(77, 106); g.lineTo(50, 103); g.lineTo(46, 97); g.lineTo(37, 97); g.closePath(); g.fill();
  g.fillStyle = '#8f5152'; g.fillRect(55, 98, 25, 9);
  g.fillStyle = '#49251b'; g.fillRect(13, 43, 4, 18); g.fillRect(111, 66, 4, 22); g.fillRect(18, 112, 27, 3);
  const faceTexture = new THREE.CanvasTexture(canvas); faceTexture.colorSpace = THREE.SRGBColorSpace;
  faceTexture.magFilter = THREE.NearestFilter; faceTexture.minFilter = THREE.NearestFilter; faceTexture.generateMipmaps = false;
  add(new THREE.PlaneGeometry(.51, .62), new THREE.MeshBasicMaterial({ map: faceTexture }), head, 0, 0, .255);

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .43, 1.02, .01); upper.add(shoulder);
    limb(shoulder, .76, .075, .06, suitEdge);
    const elbow = new THREE.Group(); elbow.position.y = -.76; shoulder.add(elbow);
    add(new THREE.IcosahedronGeometry(.075, 0), suitEdge, elbow);
    limb(elbow, .82, .058, .045, bone);
    const wrist = new THREE.Group(); wrist.position.y = -.82; elbow.add(wrist);
    add(new THREE.IcosahedronGeometry(.072, 0), bone, wrist);
    const palm = add(new THREE.BoxGeometry(.12, .22, .09), bone, wrist, 0, -.1, .015); palm.rotation.z = side * .12;
    for (let finger = -1; finger <= 1; finger++) {
      const digit = add(new THREE.CylinderGeometry(.014, .006, .3 + Math.abs(finger) * .03, 5), claw, wrist,
        finger * .042, -.31 - Math.abs(finger) * .025, .035);
      digit.rotation.z = side * (.09 + finger * .045); digit.rotation.x = -.12 + Math.abs(finger) * .08;
    }
    arms.push({ shoulder, elbow, wrist, side });
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * .15, 1.2, 0); root.add(hip);
    limb(hip, .63, .105, .085, suit);
    const knee = new THREE.Group(); knee.position.y = -.63; hip.add(knee);
    add(new THREE.IcosahedronGeometry(.092, 0), suit, knee);
    limb(knee, .61, .082, .065, suitEdge);
    const foot = add(new THREE.BoxGeometry(.16, .1, .34), suitEdge, knee, 0, -.62, .1); foot.rotation.x = -.04;
    legs.push({ hip, knee, side });
  }

  let phase = 0;
  function update(dt, state) {
    const moving = !!state.moving, hunting = !!state.hunting;
    const pace = hunting ? 10.8 : 4.8;
    if (moving) phase += dt * pace;
    else phase += dt * .8;
    const stride = Math.sin(phase), step = Math.cos(phase);
    const amount = moving ? (hunting ? .82 : .42) : .025;
    upper.position.y = 1.16 + (moving ? Math.abs(step) * (hunting ? .045 : .022) : Math.sin(state.t * .9) * .012);
    upper.rotation.x = hunting ? .16 + Math.abs(stride) * .035 : .025;
    upper.rotation.z = moving ? stride * (hunting ? .035 : .018) : Math.sin(state.t * .45) * .012;
    head.rotation.x = hunting ? -.13 + Math.abs(stride) * .04 : Math.sin(state.t * .55) * .035;
    head.rotation.y = hunting ? -stride * .055 : Math.sin(state.t * .33) * .08;
    legs.forEach(({ hip, knee, side }) => {
      const wave = stride * side;
      hip.rotation.x = wave * amount;
      knee.rotation.x = Math.max(0, -wave) * (hunting ? .72 : .38);
      hip.rotation.z = -side * .025;
    });
    arms.forEach(({ shoulder, elbow, wrist, side }, index) => {
      const counter = Math.sin(phase + index * Math.PI);
      shoulder.rotation.x = hunting ? -.48 + counter * .22 : -.16 + counter * amount * .22;
      shoulder.rotation.z = side * (hunting ? .34 : .27) + Math.sin(state.t * .7 + index) * .025;
      elbow.rotation.x = hunting ? -.36 + Math.abs(counter) * .2 : -.14;
      elbow.rotation.z = -side * (hunting ? .5 : .42);
      wrist.rotation.x = -.12 + Math.sin(state.t * 2.1 + index) * .08;
      wrist.rotation.z = side * .14;
    });
  }
  return { root, update };
}

export function initNPC() {
  const avatar = createSlenderModel();
  avatar.root.visible = false; S.scene.add(avatar.root);
  const target = V(62, 0, -8);
  const state = { target, yaw: Math.PI, targetYaw: Math.PI, moving: false, mode: 'hidden', revision: -1, ready: false };
  const gameOver = $('gameOver'), respawn = $('respawnBtn');

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

  function onRoar() {
    const player = S.player;
    if (!player || !state.ready || !avatar.root.visible) return;
    const indoors = player.pos.y < -.45 ||
      (player.pos.x > HOME.minX && player.pos.x < HOME.maxX && player.pos.z > HOME.minZ && player.pos.z < HOME.maxZ);
    const distance = Math.hypot(player.pos.x - avatar.root.position.x, player.pos.z - avatar.root.position.z);
    audioFX.playSlenderRoar(distance, indoors);
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

  respawn?.addEventListener('click', () => {
    gameOver?.classList.remove('open'); S.mode = 'walk';
  });

  S.onFrame((dt, t) => {
    if (state.ready) {
      avatar.root.position.lerp(target, 1 - Math.exp(-dt * 7));
      state.yaw += Math.atan2(Math.sin(state.targetYaw - state.yaw), Math.cos(state.targetYaw - state.yaw)) * (1 - Math.exp(-dt * 8));
      avatar.root.rotation.y = state.yaw;
      avatar.update(dt, { moving: state.moving, hunting: state.mode === 'hunting', t });
    }
    const player = S.player;
    const indoors = !player || player.pos.y < -.45 ||
      (player.pos.x > HOME.minX && player.pos.x < HOME.maxX && player.pos.z > HOME.minZ && player.pos.z < HOME.maxZ);
    const distance = player ? Math.hypot(player.pos.x - avatar.root.position.x, player.pos.z - avatar.root.position.z) : 99;
    audioFX.updateSlenderFootsteps(distance, !indoors && avatar.root.visible && state.moving);
    audioFX.updateSlenderRoar(distance, indoors);
  });

  S.npc = { apply, onGameOver, onRoar, avatar, state };
  return S.npc;
}
