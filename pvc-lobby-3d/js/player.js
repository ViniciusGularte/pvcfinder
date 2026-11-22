// Player: first-person movement, temporary emote camera, clicking and interaction prompt.
import * as THREE from 'three';
import { S } from './core.js';
import { ROOM, SPAWN, SURFACE_AREA } from './config.js';
import { $, V, angleLerp, damp, store } from './util.js';
import { createAvatar, HIP } from './avatar.js';
import { createFlashlightModel } from './flashlight.js';
import { pick, nearestInteractable, labelOf } from './interact.js';

export function createPlayer() {
  const av = createAvatar();
  S.scene.add(av.root);
  const flashlightModel = createFlashlightModel(); flashlightModel.name = 'PlayerFlashlightThirdPerson'; av.attachToHand(flashlightModel, 'r');
  const fpFlashlight = createFlashlightModel(); fpFlashlight.name = 'PlayerFlashlightFirstPerson'; fpFlashlight.scale.setScalar(.78); fpFlashlight.visible = false; S.scene.add(fpFlashlight);
  const flashlightTarget = new THREE.Object3D(); S.scene.add(flashlightTarget);
  const flashlight = new THREE.SpotLight(0xfff0cf, 85, 42, .34, .55, 1.25);
  flashlight.target = flashlightTarget; flashlight.castShadow = !S.quality.lowPower;
  flashlight.shadow.mapSize.set(S.quality.lowPower ? 256 : 512, S.quality.lowPower ? 256 : 512);
  flashlight.shadow.bias = -.00035; flashlight.shadow.normalBias = .04; S.scene.add(flashlight);
  const flashlightFill = new THREE.PointLight(0xffdba0, 1.1, 3.2, 2); S.scene.add(flashlightFill);

  const cam = S.cam = { yaw: 0, pitch: -.18, dist: 0, distT: 0 };
  const P = S.player = {
    pos: V(SPAWN.x, 0, SPAWN.z), yaw: SPAWN.yaw, vy: 0, groundY: 0, lift: 0,
    state: 'walk', seat: null, sitFrom: null, sitT: 0,
    walkTarget: null, onArrive: null, stuck: 0, speed: 0, avatar: av,
    sit, stand, walkTo, interact, flashlightOn: store.get().flashlight === true, toggleFlashlight, showEmoteView,
  };
  const keys = {};
  const canvas = S.renderer.domElement;
  const tip = $('tip'), prompt = $('prompt'), seatbar = $('seatbar');
  const flashSource = V(), flashDirection = V(), fpRight = V(), fpUp = V();
  const fpCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  let emoteViewUntil = 0;

  function syncFlashlightButton() {
    const button = $('flashBtn'); if (!button) return;
    button.textContent = P.flashlightOn ? '🔦 On' : '🔦 Off';
    button.title = `Turn flashlight ${P.flashlightOn ? 'off' : 'on'} (F)`;
    button.setAttribute('aria-pressed', String(P.flashlightOn));
    button.classList.toggle('on', P.flashlightOn); button.classList.toggle('ghost', !P.flashlightOn);
  }
  function toggleFlashlight(value) {
    P.flashlightOn = typeof value === 'boolean' ? value : !P.flashlightOn;
    flashlightModel.visible = P.flashlightOn; flashlightModel.userData.setLit(P.flashlightOn);
    fpFlashlight.userData.setLit(P.flashlightOn);
    flashlight.visible = flashlightFill.visible = P.flashlightOn && S.mode !== 'map';
    store.set({ flashlight: P.flashlightOn }); syncFlashlightButton();
  }
  toggleFlashlight(P.flashlightOn);

  function showEmoteView(duration = 1800) {
    emoteViewUntil = Math.max(emoteViewUntil, performance.now() + duration);
    cam.distT = 3.6; S.camChangeT = S.clock.elapsedTime;
  }

  /* ---------- actions ---------- */
  function sit(seat) {
    if (P.seat) stand(true);
    P.state = 'sit'; P.seat = seat; P.walkTarget = null; P.sitFrom = P.pos.clone(); P.sitT = 0;
    $('seatText').textContent = 'Sitting · move or press E to stand up';
    seatbar.classList.add('show');
    S.multiplayer?.sit(seat);
  }
  function stand(silent) {
    const s = P.seat; if (!s) return;
    const exit = P.sitFrom || s.approach;
    P.state = 'walk'; P.seat = null; P.lift = 0;
    P.pos.set(exit.x, 0, exit.z); P.sitFrom = null;
    S.multiplayer?.stand(P.pos, P.yaw);
    seatbar.classList.remove('show');
    s.onLeave && s.onLeave(); s.onLeave = null;
    void silent;
  }
  function walkTo(target, onArrive) {
    if (P.state === 'sit') stand();
    P.walkTarget = V(target.x, 0, target.z); P.onArrive = onArrive || null; P.stuck = 0;
  }
  function interact(it) {
    if (!it || S.mode !== 'walk') return;
    const a = it.anchor, d = Math.hypot(P.pos.x - a.x, P.pos.z - a.z);
    if (d <= it.range) { if (P.state === 'sit' && it.verb !== 'Sit on') stand(); it.action(); return; }
    let ap = it.approach && it.approach();
    if (!ap) { const dir = V(P.pos.x - a.x, 0, P.pos.z - a.z).normalize(); ap = a.clone().addScaledVector(dir, it.range * .6); }
    walkTo(ap, () => it.action());
  }
  seatbar.querySelector('button').onclick = () => stand();

  /* ---------- pointer ---------- */
  let down = null;
  canvas.addEventListener('pointerdown', e => {
    if (S.mode === 'map') return;
    down = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false };
    tip.classList.remove('show'); canvas.classList.remove('hover');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 5) { down.moved = true; canvas.classList.add('dragging'); }
      if (down.moved && S.mode === 'walk') {
        cam.yaw = down.yaw - dx * .005;
        cam.pitch = THREE.MathUtils.clamp(down.pitch - dy * .005, -1.25, .9);
      }
      return;
    }
    if (S.mode !== 'walk') return;
    const { inter } = pick(e.clientX, e.clientY);
    canvas.classList.toggle('hover', !!inter);
    tip.textContent = inter ? labelOf(inter) : '';
    tip.classList.toggle('show', !!inter);
  });
  canvas.addEventListener('pointerup', e => {
    canvas.classList.remove('dragging');
    if (down && !down.moved && S.mode === 'walk') {
      const { hit, inter } = pick(e.clientX, e.clientY);
      if (inter) interact(inter);
      else if (hit && hit.point.y < .06) {
        const inLobby = Math.abs(hit.point.x) < ROOM.w / 2 && Math.abs(hit.point.z) < ROOM.d / 2;
        const inBunker = hit.point.x > -10.8 && hit.point.x < -5.2 && hit.point.z > ROOM.d / 2 - .2 && hit.point.z < ROOM.d / 2 + 8.1;
        if (inLobby || inBunker) walkTo(hit.point);
      }
    }
    down = null;
  });
  /* ---------- keys ---------- */
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (S.mode === 'pc') { if (e.code === 'Escape') stand(); return; }
    keys[e.code] = true;
    if (S.mode !== 'walk') return;
    if (e.code === 'KeyE') { if (P.state === 'sit') stand(); else interact(nearestInteractable(P.pos)); }
    if (e.code === 'Escape' && P.state === 'sit') stand();
    if (e.code === 'KeyF' && !e.repeat) toggleFlashlight();
    if (e.code === 'Space' && P.state === 'walk' && P.pos.y <= P.groundY + .02) { P.vy = 5.2; e.preventDefault(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  /* ---------- movement ---------- */
  S.isBlocked = (x, z, radius = .3, y = S.player?.pos.y ?? 0) => {
    const inLobby = x >= -ROOM.w / 2 + .4 && x <= ROOM.w / 2 - .45 && z >= -ROOM.d / 2 + .4 && z <= ROOM.d / 2 - .4;
    const inBunker = x >= -10.7 && x <= -5.3 && z >= ROOM.d / 2 - .8 && z <= ROOM.d / 2 + 8.2;
    const surfaceRadius = SURFACE_AREA.radius - radius;
    const inSurfaceArea = Math.hypot(x - SURFACE_AREA.centerX, z - SURFACE_AREA.centerZ) <= surfaceRadius;
    if (!inLobby && !inBunker && !inSurfaceArea) return true;
    return S.colliders.some(c => y >= c.minY && y <= c.maxY && x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius);
  };
  const groundAt = (x, z, y = P.pos.y) => S.groundHeightAt?.(x, z, y) ?? 0;
  function blocked(x, z) { const floor = groundAt(x, z); return S.isBlocked(x, z, .3, Math.min(P.pos.y, floor) + .05); }
  function tryMove(dx, dz) {
    const p = P.pos;
    const grounded = Math.abs(p.y - P.groundY) < .08 && P.vy <= 0;
    const commit = (x, z) => { p.x = x; p.z = z; P.groundY = groundAt(x, z); if (grounded) p.y = P.groundY; };
    if (!blocked(p.x + dx, p.z + dz)) { commit(p.x + dx, p.z + dz); return true; }
    if (!blocked(p.x + dx, p.z)) { commit(p.x + dx, p.z); return true; }
    if (!blocked(p.x, p.z + dz)) { commit(p.x, p.z + dz); return true; }
    return false;
  }

  /* ---------- camera ---------- */
  const ray = new THREE.Raycaster(), head = V(), dir = V(), rayDir = V(), want = V(), wantQ = new THREE.Quaternion(), m4 = new THREE.Matrix4(), eul = new THREE.Euler(0, 0, 0, 'YXZ');

  S.onFrame((dt, t) => {
    const x0 = P.pos.x, z0 = P.pos.z;
    P.groundY = groundAt(P.pos.x, P.pos.z);
    const anyMove = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight;

    if (S.mode === 'walk' && P.state === 'sit' && anyMove) stand();
    if (S.mode === 'walk' && P.state === 'walk') {
      let f = 0, s = 0;
      if (keys.KeyW || keys.ArrowUp) f++; if (keys.KeyS || keys.ArrowDown) f--;
      if (keys.KeyD || keys.ArrowRight) s++; if (keys.KeyA || keys.ArrowLeft) s--;
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.6 : 2.6) * dt;
      if (f || s) {
        P.walkTarget = null;
        const cy = cam.yaw;
        let mx = -Math.sin(cy) * f + Math.cos(cy) * s, mz = -Math.cos(cy) * f - Math.sin(cy) * s;
        const l = Math.hypot(mx, mz); mx /= l; mz /= l;
        P.yaw = angleLerp(P.yaw, Math.atan2(mx, mz), damp(dt, 14));
        tryMove(mx * sp, mz * sp);
      } else if (P.walkTarget) {
        const dx = P.walkTarget.x - P.pos.x, dz = P.walkTarget.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d < .12) { P.walkTarget = null; const cb = P.onArrive; P.onArrive = null; cb && cb(); }
        else {
          P.yaw = angleLerp(P.yaw, Math.atan2(dx, dz), damp(dt, 12));
          const moved = tryMove(dx / d * Math.min(sp, d), dz / d * Math.min(sp, d));
          const prog = Math.hypot(P.pos.x - x0, P.pos.z - z0);
          P.stuck = (!moved || prog < sp * .3) ? P.stuck + dt : 0;
          if (P.stuck > .5) { const cb = P.onArrive; P.walkTarget = null; P.onArrive = null; if (cb && d < 2.2) cb(); }
        }
      }
      // jump
      if (P.pos.y > P.groundY || P.vy > 0) {
        P.vy -= 15 * dt; P.pos.y += P.vy * dt;
        if (P.pos.y <= P.groundY) { P.pos.y = P.groundY; P.vy = 0; }
      }
    }
    if (P.state === 'sit' && P.seat) {
      P.sitT = Math.min(1, P.sitT + dt * 3.5);
      const k = P.sitT * P.sitT * (3 - 2 * P.sitT);
      P.pos.x = P.sitFrom.x + (P.seat.pos.x - P.sitFrom.x) * k;
      P.pos.z = P.sitFrom.z + (P.seat.pos.z - P.sitFrom.z) * k;
      P.lift = (P.seat.pos.y - HIP) * k;
      P.yaw = angleLerp(P.yaw, P.seat.yaw, damp(dt, 10));
    }
    P.speed = P.state === 'walk' ? Math.hypot(P.pos.x - x0, P.pos.z - z0) / Math.max(dt, 1e-3) : 0;

    // avatar
    av.root.position.set(P.pos.x, P.pos.y + P.lift, P.pos.z);
    av.root.rotation.y = P.yaw;
    av.update(dt, { speed: P.speed, sitting: P.state === 'sit', typing: S.mode === 'pc' && t - (S.activePC?.lastKey ?? -9) < .4, airborne: P.pos.y > P.groundY + .05, t, emote: performance.now() < (S.localEmoteUntil || 0) ? S.localEmote : null });

    // First person is permanent; emotes briefly pull the camera back to show the animation.
    const emoteView = performance.now() < emoteViewUntil;
    const desiredCameraDistance = emoteView ? 3.6 : 0;
    const returningFromEmote = !emoteView && cam.distT !== 0;
    if (cam.distT !== desiredCameraDistance) {
      cam.distT = desiredCameraDistance; S.camChangeT = t;
      // A low frame rate must not leave the avatar or hand model between camera modes.
      if (returningFromEmote) cam.dist = 0;
    }
    cam.dist += (cam.distT - cam.dist) * damp(dt, 10);
    head.set(P.pos.x, av.root.position.y + 1.5, P.pos.z);
    if (S.camOverride) {
      want.copy(S.camOverride.pos);
      m4.lookAt(S.camOverride.pos, S.camOverride.look, S.camera.up); wantQ.setFromRotationMatrix(m4);
    } else {
      eul.set(cam.pitch, cam.yaw, 0); wantQ.setFromEuler(eul);
      dir.set(-Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch));
      let d = cam.dist;
      if (d > .05) {
        ray.set(head, rayDir.copy(dir).negate()); ray.far = d + .3;
        const h = ray.intersectObjects(S.camBlockers, false)[0];
        if (h) d = Math.max(.2, h.distance - .3);
      }
      want.copy(head).addScaledVector(dir, -d);
      if (cam.dist < .3) want.copy(head).addScaledVector(dir, .12);
    }
    const rate = !S.camOverride && cam.distT === 0 ? 16 : t - S.camChangeT < 1.4 ? 4.5 : 28;
    if (returningFromEmote) {
      S.camera.position.copy(want); S.camera.quaternion.copy(wantQ);
    } else {
      S.camera.position.lerp(want, damp(dt, rate));
      S.camera.quaternion.slerp(wantQ, damp(dt, rate));
    }
    av.root.visible = !(S.camOverride?.hideAvatar) && S.mode !== 'map' && S.camera.position.distanceTo(head) > .55;

    const firstPerson = !S.camOverride && cam.dist < .45;
    flashlightModel.visible = P.flashlightOn && !firstPerson;
    fpFlashlight.visible = P.flashlightOn && firstPerson && S.mode !== 'map';
    if (fpFlashlight.visible) {
      S.camera.getWorldDirection(flashDirection);
      fpRight.set(1, 0, 0).applyQuaternion(S.camera.quaternion);
      fpUp.set(0, 1, 0).applyQuaternion(S.camera.quaternion);
      fpFlashlight.position.copy(S.camera.position)
        .addScaledVector(fpRight, .24).addScaledVector(fpUp, -.2).addScaledVector(flashDirection, .38);
      fpFlashlight.quaternion.copy(S.camera.quaternion).multiply(fpCorrection);
      fpFlashlight.updateMatrixWorld(true);
    }

    const flashActive = P.flashlightOn && S.mode !== 'map';
    flashlight.visible = flashlightFill.visible = flashActive;
    if (flashActive) {
      if (firstPerson) fpFlashlight.userData.lens.getWorldPosition(flashSource);
      else flashlightModel.userData.lens.getWorldPosition(flashSource);
      S.camera.getWorldDirection(flashDirection);
      flashlight.position.copy(flashSource); flashlightFill.position.copy(flashSource);
      flashlightTarget.position.copy(flashSource).addScaledVector(flashDirection, 18);
      flashlightTarget.updateMatrixWorld();
    }

    // E prompt
    const near = S.mode === 'walk' && P.state === 'walk' && !P.walkTarget ? nearestInteractable(P.pos) : null;
    if (near) { prompt.querySelector('span').textContent = labelOf(near); prompt.classList.add('show'); }
    else prompt.classList.remove('show');
  });

  return P;
}
