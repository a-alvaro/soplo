// DXF importer.
//
// DXF is a flat list of (group-code, value) pairs. We support the entities
// real CAD tools (Fusion 360, AutoCAD, FreeCAD…) emit for 2D outlines:
//
//   LWPOLYLINE   — closed/open polyline. Most concise form.
//   POLYLINE     — legacy polyline with VERTEX/SEQEND children.
//   LINE         — single straight segment. Stitched into chains.
//   ARC          — circular arc. Tessellated then stitched.
//   CIRCLE       — full circle. Always closed.
//   SPLINE       — uses fit points if present, else control points as a
//                  piecewise-linear approximation. Stitched.
//
// Open segments (LINE/ARC/SPLINE/open polylines) are joined by endpoint
// matching ("stitching") into closed loops. Anything that fails to close
// is discarded — Soplo's rasteriser needs closed polygons.

import { rasterizePolygon } from './rasterize';

export interface RasterisedDxf {
  mask: Uint8Array;
  Nx: number;
  Ny: number;
  widthCells: number;
  heightCells: number;
  polygonCount: number;
  entityCounts: Record<string, number>;
  openChainsDiscarded: number;
}

interface DxfPair {
  code: number;
  value: string;
}

interface Chain {
  points: [number, number][];
  closed: boolean;
}

type Pt = [number, number];

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

function tokenize(text: string): DxfPair[] {
  const lines = text.split(/\r?\n/);
  const out: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = lines[i].trim();
    if (codeStr === '') {
      i -= 1;
      continue;
    }
    const code = parseInt(codeStr, 10);
    if (Number.isNaN(code)) {
      i -= 1;
      continue;
    }
    out.push({ code, value: lines[i + 1] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-entity parsers. Each returns the chain produced and the index after it.
// ---------------------------------------------------------------------------

function parseLwPolyline(
  pairs: DxfPair[],
  start: number,
): { chain: Chain; next: number } {
  const points: Pt[] = [];
  let pendingX: number | null = null;
  let isClosed = false;
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    const { code, value } = pairs[i];
    if (code === 70) {
      isClosed = (parseInt(value, 10) & 1) === 1;
    } else if (code === 10) {
      if (pendingX !== null) points.push([pendingX, 0]);
      pendingX = parseFloat(value);
    } else if (code === 20 && pendingX !== null) {
      points.push([pendingX, parseFloat(value)]);
      pendingX = null;
    }
    i++;
  }
  return { chain: { points, closed: isClosed }, next: i };
}

function parsePolyline(
  pairs: DxfPair[],
  start: number,
): { chain: Chain; next: number } {
  const points: Pt[] = [];
  let isClosed = false;
  let i = start;
  while (i < pairs.length) {
    if (pairs[i].code === 0) {
      const entity = pairs[i].value.trim().toUpperCase();
      if (entity === 'SEQEND') {
        i++;
        break;
      }
      if (entity === 'VERTEX') {
        i++;
        let vx: number | null = null;
        let vy: number | null = null;
        while (i < pairs.length && pairs[i].code !== 0) {
          if (pairs[i].code === 10) vx = parseFloat(pairs[i].value);
          else if (pairs[i].code === 20) vy = parseFloat(pairs[i].value);
          i++;
        }
        if (vx !== null && vy !== null) points.push([vx, vy]);
      } else {
        break;
      }
    } else {
      // Pre-VERTEX header pairs (e.g. flag 70 on the POLYLINE record itself).
      if (pairs[i].code === 70) {
        isClosed = (parseInt(pairs[i].value, 10) & 1) === 1;
      }
      i++;
    }
  }
  return { chain: { points, closed: isClosed }, next: i };
}

function parseLine(
  pairs: DxfPair[],
  start: number,
): { chain: Chain; next: number } {
  let x1 = 0,
    y1 = 0,
    x2 = 0,
    y2 = 0;
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    const { code, value } = pairs[i];
    if (code === 10) x1 = parseFloat(value);
    else if (code === 20) y1 = parseFloat(value);
    else if (code === 11) x2 = parseFloat(value);
    else if (code === 21) y2 = parseFloat(value);
    i++;
  }
  return {
    chain: { points: [[x1, y1], [x2, y2]], closed: false },
    next: i,
  };
}

function parseArc(
  pairs: DxfPair[],
  start: number,
): { chain: Chain; next: number } {
  let cx = 0,
    cy = 0,
    r = 0,
    startAng = 0,
    endAng = 0;
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    const { code, value } = pairs[i];
    if (code === 10) cx = parseFloat(value);
    else if (code === 20) cy = parseFloat(value);
    else if (code === 40) r = parseFloat(value);
    else if (code === 50) startAng = parseFloat(value) * DEG;
    else if (code === 51) endAng = parseFloat(value) * DEG;
    i++;
  }
  // Normalise: DXF arcs go CCW from start to end. If end < start, wrap.
  while (endAng < startAng - 1e-9) endAng += 2 * Math.PI;
  const span = Math.max(0, endAng - startAng);
  // ~11° per segment, minimum 8 segments.
  const N = Math.max(8, Math.ceil(span / (11 * DEG)));
  const points: Pt[] = [];
  for (let k = 0; k <= N; k++) {
    const a = startAng + (span * k) / N;
    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return { chain: { points, closed: false }, next: i };
}

function parseCircle(
  pairs: DxfPair[],
  start: number,
): { chain: Chain; next: number } {
  let cx = 0,
    cy = 0,
    r = 0;
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    const { code, value } = pairs[i];
    if (code === 10) cx = parseFloat(value);
    else if (code === 20) cy = parseFloat(value);
    else if (code === 40) r = parseFloat(value);
    i++;
  }
  const N = 64;
  const points: Pt[] = [];
  if (r > 0) {
    for (let k = 0; k < N; k++) {
      const a = (2 * Math.PI * k) / N;
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return { chain: { points, closed: true }, next: i };
}

function parseSpline(
  pairs: DxfPair[],
  start: number,
): { chain: Chain; next: number } {
  // We don't evaluate the NURBS analytically; we approximate with the fit
  // points (the user-defined points the curve passes through). If the file
  // doesn't carry fit points, we fall back to control points — accuracy
  // suffers but the topology survives, which is what stitching cares about.
  let isClosed = false;
  const ctrl: Pt[] = [];
  const fit: Pt[] = [];
  let pX10: number | null = null;
  let pX11: number | null = null;
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    const { code, value } = pairs[i];
    if (code === 70) {
      const flag = parseInt(value, 10);
      isClosed = (flag & 1) === 1 || (flag & 2) === 2;
    } else if (code === 10) {
      if (pX10 !== null) ctrl.push([pX10, 0]);
      pX10 = parseFloat(value);
    } else if (code === 20 && pX10 !== null) {
      ctrl.push([pX10, parseFloat(value)]);
      pX10 = null;
    } else if (code === 11) {
      if (pX11 !== null) fit.push([pX11, 0]);
      pX11 = parseFloat(value);
    } else if (code === 21 && pX11 !== null) {
      fit.push([pX11, parseFloat(value)]);
      pX11 = null;
    }
    i++;
  }
  const points = fit.length >= 2 ? fit : ctrl;
  return { chain: { points, closed: isClosed }, next: i };
}

// ---------------------------------------------------------------------------
// Section-aware entity walker
// ---------------------------------------------------------------------------

interface ExtractResult {
  chains: Chain[];
  counts: Record<string, number>;
}

function extractChains(pairs: DxfPair[]): ExtractResult {
  const chains: Chain[] = [];
  const counts: Record<string, number> = {};
  const bump = (name: string) => {
    counts[name] = (counts[name] ?? 0) + 1;
  };

  let inEntities = false;
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];

    // Track ENTITIES section so we don't accidentally parse BLOCK definitions.
    if (p.code === 0) {
      const v = p.value.trim().toUpperCase();
      if (v === 'SECTION') {
        i++;
        if (i < pairs.length && pairs[i].code === 2) {
          inEntities = pairs[i].value.trim().toUpperCase() === 'ENTITIES';
          i++;
        }
        continue;
      }
      if (v === 'ENDSEC') {
        inEntities = false;
        i++;
        continue;
      }
      if (!inEntities) {
        i++;
        continue;
      }

      i++;
      let res: { chain: Chain; next: number } | null = null;
      if (v === 'LWPOLYLINE') res = parseLwPolyline(pairs, i);
      else if (v === 'POLYLINE') res = parsePolyline(pairs, i);
      else if (v === 'LINE') res = parseLine(pairs, i);
      else if (v === 'ARC') res = parseArc(pairs, i);
      else if (v === 'CIRCLE') res = parseCircle(pairs, i);
      else if (v === 'SPLINE') res = parseSpline(pairs, i);

      if (res) {
        bump(v);
        if (res.chain.points.length >= 2) chains.push(res.chain);
        i = res.next;
        continue;
      }
    } else {
      i++;
    }
  }

  return { chains, counts };
}

// ---------------------------------------------------------------------------
// Stitching: connect open chains by endpoint matching into closed loops.
// ---------------------------------------------------------------------------

function dist(a: Pt, b: Pt): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function bboxDiagonal(chains: Chain[]): number {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const c of chains) {
    for (const [x, y] of c.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return 1;
  const dx = maxX - minX;
  const dy = maxY - minY;
  return Math.sqrt(dx * dx + dy * dy) || 1;
}

function stitch(input: Chain[]): { closed: Chain[]; openCount: number } {
  const closed: Chain[] = [];
  // Work on a mutable list of open chains.
  let open: Chain[] = [];
  for (const c of input) {
    if (c.closed && c.points.length >= 3) closed.push(c);
    else open.push({ points: c.points.slice(), closed: false });
  }

  if (open.length === 0) return { closed, openCount: 0 };

  const tol = Math.max(1e-9, 1e-5 * bboxDiagonal(input));

  // Greedy stitching: pick a chain, try to extend it from either end by
  // finding another open chain whose endpoint matches. Repeat until no
  // more matches are possible.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < open.length; i++) {
      const a = open[i];
      const aStart = a.points[0];
      const aEnd = a.points[a.points.length - 1];

      for (let j = 0; j < open.length; j++) {
        if (i === j) continue;
        const b = open[j];
        const bStart = b.points[0];
        const bEnd = b.points[b.points.length - 1];

        if (dist(aEnd, bStart) < tol) {
          a.points.push(...b.points.slice(1));
        } else if (dist(aEnd, bEnd) < tol) {
          a.points.push(...b.points.slice(0, -1).reverse());
        } else if (dist(aStart, bEnd) < tol) {
          a.points = [...b.points, ...a.points.slice(1)];
        } else if (dist(aStart, bStart) < tol) {
          a.points = [...b.points.slice().reverse(), ...a.points.slice(1)];
        } else {
          continue;
        }

        // Connection made — remove b, restart loops.
        open.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }

    // Promote any chain that has just become closed.
    for (let i = open.length - 1; i >= 0; i--) {
      const c = open[i];
      if (
        c.points.length >= 3 &&
        dist(c.points[0], c.points[c.points.length - 1]) < tol
      ) {
        c.points.pop(); // drop duplicate end so the polygon is implicit-close
        c.closed = true;
        closed.push(c);
        open.splice(i, 1);
        changed = true;
      }
    }
  }

  return { closed, openCount: open.length };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RasteriseDxfOptions {
  /** Cells of empty space kept on each horizontal side. Default 5.
   *  Set to 0 for tunnel-style imports where the shape must reach the
   *  inlet and outlet faces. */
  marginX?: number;
  /** Cells of empty space kept on each vertical side. Default 5. */
  marginY?: number;
  /**
   * Fit strategy:
   *   - 'contain' (default): bbox fits inside the available area.
   *   - 'cover': bbox fills the area, possibly overflowing one axis.
   *     Used for tunnel imports so the shape reaches the canvas edges.
   */
  fitMode?: 'contain' | 'cover';
}

export async function rasteriseDxf(
  file: File,
  Nx: number,
  Ny: number,
  options: RasteriseDxfOptions = {},
): Promise<RasterisedDxf> {
  const text = await file.text();
  const pairs = tokenize(text);
  const { chains, counts } = extractChains(pairs);

  if (chains.length === 0) {
    throw new Error(
      'DXF has no usable geometry. Soplo reads LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE and SPLINE.',
    );
  }

  const { closed, openCount } = stitch(chains);

  if (closed.length === 0) {
    throw new Error(
      `DXF parsed (${Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}) but no closed loop was formed. Check the sketch for gaps between segments.`,
    );
  }

  // Combined bounding box of all closed polygons.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const c of closed) {
    for (const [x, y] of c.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) throw new Error('DXF has zero extent');

  // Fit into lattice with margin. DXF y grows up — same as our lattice.
  const marginX = options.marginX ?? 5;
  const marginY = options.marginY ?? 5;
  const fitMode = options.fitMode ?? 'contain';
  const availW = Math.max(1, Nx - 2 * marginX);
  const availH = Math.max(1, Ny - 2 * marginY);
  const fitFn = fitMode === 'cover' ? Math.max : Math.min;
  const scale = fitFn(availW / bw, availH / bh);
  const drawW = bw * scale;
  const drawH = bh * scale;
  const offsetX = (Nx - drawW) / 2;
  const offsetY = (Ny - drawH) / 2;

  const mask = new Uint8Array(Nx * Ny);
  for (const c of closed) {
    const transformed: Pt[] = c.points.map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (y - minY) * scale,
    ]);
    rasterizePolygon(mask, Nx, Ny, transformed);
  }

  return {
    mask,
    Nx,
    Ny,
    widthCells: Math.round(drawW),
    heightCells: Math.round(drawH),
    polygonCount: closed.length,
    entityCounts: counts,
    openChainsDiscarded: openCount,
  };
}
