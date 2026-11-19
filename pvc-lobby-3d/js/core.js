// Shared state: scene, camera, renderers, and lists every module adds to.
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export const S = {
  mode: 'walk',          // 'walk' | 'map' | 'pc'
  nick: 'Guest',
  colliders: [],         // AABBs the player can't walk through
  pickables: [],         // objects the mouse can click
  interactables: [],     // things with an action (see interact.js)
  camBlockers: [],       // walls/floor/ceiling the 3rd-person camera can't pass
  updaters: [],          // per-frame callbacks (dt, t)
  resizers: [],
  camOverride: null,     // { pos, look } when the camera is taken over (map, computer)
  camChangeT: -9,
};
const cpuCores = navigator.hardwareConcurrency || 8;
const deviceMemory = navigator.deviceMemory || 8;
const lowPower = cpuCores <= 4 || deviceMemory <= 4;
S.quality = {
  lowPower,
  pixelRatio: Math.min(devicePixelRatio, lowPower ? 1 : 1.35),
};
S.onFrame = fn => S.updaters.push(fn);

S.scene = new THREE.Scene();
S.cssScene = new THREE.Scene();
S.scene.fog = new THREE.Fog(0x253660, 20, 120);   // only outdoor materials use fog

S.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 600);
S.camera.rotation.order = 'YXZ';

const r = S.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
r.setPixelRatio(S.quality.pixelRatio);
r.setSize(innerWidth, innerHeight);
r.setClearColor(0x000000, 0);
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.3;
document.getElementById('gl').appendChild(r.domElement);

S.cssRenderer = new CSS3DRenderer();
S.cssRenderer.setSize(innerWidth, innerHeight);
document.getElementById('css').appendChild(S.cssRenderer.domElement);

S.clock = new THREE.Clock();

addEventListener('resize', () => {
  S.camera.aspect = innerWidth / innerHeight; S.camera.updateProjectionMatrix();
  S.renderer.setSize(innerWidth, innerHeight); S.cssRenderer.setSize(innerWidth, innerHeight);
  S.resizers.forEach(f => f());
});
