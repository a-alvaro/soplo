// Polygon rasterisation helpers used by the LBM solver and geometry builders.

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (px, py) is strictly inside the polygon described by
 * `points` (closed implicitly — last vertex connects to first).
 */
export function pointInPolygon(
  px: number,
  py: number,
  points: readonly [number, number][],
): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Bounding box of a list of points. */
export function boundingBox(
  points: readonly [number, number][],
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Rotate `points` by `radians` around `(cx, cy)`. */
export function rotatePoints(
  points: readonly [number, number][],
  radians: number,
  cx: number,
  cy: number,
): [number, number][] {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return points.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

/**
 * Translate + uniformly scale `points` so that the bounding box has the
 * requested width along x. Aspect ratio is preserved.
 *
 * `anchorX`/`anchorY` are the lattice coordinates where the leading-edge
 * (min-x point on the centreline) of the geometry will sit.
 */
export function placePoints(
  points: readonly [number, number][],
  targetWidth: number,
  anchorX: number,
  anchorY: number,
): [number, number][] {
  const { minX, maxX, minY, maxY } = boundingBox(points);
  const w = maxX - minX;
  const scale = w > 0 ? targetWidth / w : 1;
  const cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [
    anchorX + (x - minX) * scale,
    anchorY + (y - cy) * scale,
  ]);
}

/**
 * Rasterise a closed polygon into the given solid mask (Uint8Array, [Nx*Ny]).
 * `value` controls the flag written (1 = wall, 2 = aerodynamic object).
 */
export function rasterizePolygon(
  solid: Uint8Array,
  Nx: number,
  Ny: number,
  points: readonly [number, number][],
  value = 1,
): void {
  const { minX, maxX, minY, maxY } = boundingBox(points);
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(Nx - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(Ny - 1, Math.ceil(maxY));
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) {
        solid[x * Ny + y] = value;
      }
    }
  }
}
