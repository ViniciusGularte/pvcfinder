// Interaction registry: anything clickable / usable with E.
//
// addInteractable(objects, {
//   verb: 'Sit on' | () => string,   // shown in the prompt / tooltip
//   name: 'sofa',
//   anchor: Vector3,                 // where the thing is (for distance checks)
//   range: 1.8,                      // how close you must be; farther → walk there first
//   approach?: () => Vector3,        // where to walk to (default: towards you, near the anchor)
//   action: () => void,
// })
import * as THREE from 'three';
import { S } from './core.js';

export function addInteractable(objects, opts) {
  const it = { range: 1.8, ...opts };
  [].concat(objects).forEach(o => o.traverse(c => { c.userData.inter = it; }));
  S.interactables.push(it);
  return it;
}

export const labelOf = it => `${typeof it.verb === 'function' ? it.verb() : it.verb} ${typeof it.name === 'function' ? it.name() : it.name}`;

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function pick(clientX, clientY) {
  ndc.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, S.camera);
  const hit = ray.intersectObjects(S.pickables, true).find(h => h.object.isMesh && h.object.visible);
  if (!hit) return {};
  let o = hit.object, inter = null;
  while (o && !inter) { inter = o.userData.inter; o = o.parent; }
  return { hit, inter };
}

export function nearestInteractable(pos) {
  let best = null, bd = Infinity;
  for (const it of S.interactables) {
    if (it.range > 6) continue;   // "remote" things (map, weather…) don't need a prompt
    const d = Math.hypot(it.anchor.x - pos.x, it.anchor.z - pos.z);
    if (d < it.range && d < bd) { bd = d; best = it; }
  }
  return best;
}
