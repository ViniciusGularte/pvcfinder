// Geometry in block coordinates (x, z)

export function bboxOf(points) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function inBBox(b, x, z) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// Ray casting
export function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function zoneContains(zone, x, z) {
  return inBBox(zone.bbox, x, z) && pointInPolygon(x, z, zone.points);
}
