import * as THREE from 'three';

export function createFlashlightModel() {
  const group = new THREE.Group();
  group.position.set(0, -.57, .1);
  const shell = new THREE.MeshStandardMaterial({ color: 0x202523, metalness: .72, roughness: .3, fog: false });
  const rim = new THREE.MeshStandardMaterial({ color: 0x69716d, metalness: .82, roughness: .24, fog: false });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xfff0bd, emissive: 0xffd77d, emissiveIntensity: 0, roughness: .18, metalness: .05, fog: false,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.045, .052, .27, 10), shell);
  body.rotation.x = Math.PI / 2; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(.072, .052, .09, 12), rim);
  head.rotation.x = Math.PI / 2; head.position.z = .17; head.castShadow = true; group.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.058, 14), lensMat);
  lens.position.z = .218; group.add(lens);
  const button = new THREE.Mesh(new THREE.BoxGeometry(.035, .018, .055), rim);
  button.position.set(0, .053, -.025); group.add(button);
  group.userData.lens = lens;
  group.userData.setLit = value => { lensMat.emissiveIntensity = value ? 3.2 : 0; };
  return group;
}
