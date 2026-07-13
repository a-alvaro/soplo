// Minimal SVG path importer.
//
// We don't ship a full SVG path parser. Instead we use the browser's own
// Path2D + an offscreen canvas to rasterise the path at lattice resolution,
// then walk the resulting pixel grid to mark cells as solid.

export interface RasterisedSvg {
  /** Boolean mask, `mask[x*Ny + y] === 1` if cell is inside the shape. */
  mask: Uint8Array;
  Nx: number;
  Ny: number;
  /** Bounding-box width in lattice cells. */
  widthCells: number;
  /** Bounding-box height in lattice cells. */
  heightCells: number;
}

export interface RasteriseOptions {
  /** Cells of empty space kept on each horizontal side. Default 5.
   *  Set to 0 for tunnel-style imports where the shape must reach the
   *  inlet and outlet faces. */
  marginX?: number;
  /** Cells of empty space kept on each vertical side. Default 5. */
  marginY?: number;
  /**
   * Fit strategy:
   *   - 'contain' (default): scale so the bbox fits entirely inside the
   *     available area, possibly leaving margin on one axis.
   *   - 'cover': scale so the bbox fills the available area, possibly
   *     overflowing on one axis. Used for tunnels — guarantees the shape
   *     reaches the canvas edges so inlet/outlet have fluid cells.
   */
  fitMode?: 'contain' | 'cover';
}

/**
 * Read an SVG file and rasterise its first <path> element into a lattice
 * mask. Caller decides the lattice resolution (Nx, Ny) it wants.
 *
 * The path's bounding box is fitted with a margin into the (Nx, Ny) grid,
 * preserving aspect ratio. Margins are configurable via `options`.
 */
export async function rasteriseSvg(
  file: File,
  Nx: number,
  Ny: number,
  options: RasteriseOptions = {},
): Promise<RasterisedSvg> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const path = doc.querySelector('path');
  if (!path) throw new Error('SVG has no <path> element');
  const d = path.getAttribute('d');
  if (!d) throw new Error('SVG <path> has no "d" attribute');

  // Use the browser's measurement to find the path's bounding box. We render
  // it once into an offscreen SVG to get the bbox, then re-render scaled.
  const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tmpSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  tmpSvg.style.position = 'absolute';
  tmpSvg.style.left = '-99999px';
  const tmpPath = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  tmpPath.setAttribute('d', d);
  tmpSvg.appendChild(tmpPath);
  document.body.appendChild(tmpSvg);
  const bbox = tmpPath.getBBox();
  document.body.removeChild(tmpSvg);

  if (bbox.width <= 0 || bbox.height <= 0) {
    throw new Error('SVG path has zero size');
  }

  // Fit bounding box into the lattice with a 5-cell margin on each side.
  const marginX = options.marginX ?? 5;
  const marginY = options.marginY ?? 5;
  const fitMode = options.fitMode ?? 'contain';
  const availW = Math.max(1, Nx - 2 * marginX);
  const availH = Math.max(1, Ny - 2 * marginY);
  const fitFn = fitMode === 'cover' ? Math.max : Math.min;
  const scale = fitFn(availW / bbox.width, availH / bbox.height);
  const drawW = bbox.width * scale;
  const drawH = bbox.height * scale;
  const offsetX = (Nx - drawW) / 2 - bbox.x * scale;
  const offsetY = (Ny - drawH) / 2 - bbox.y * scale;

  // Rasterise into a canvas of size (Nx, Ny). One canvas pixel == one
  // lattice cell, so we read the alpha channel directly.
  const canvas = document.createElement('canvas');
  canvas.width = Nx;
  canvas.height = Ny;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, Nx, Ny);
  ctx.fillStyle = '#fff';

  // Vertical flip: SVG y grows downward, lattice y grows upward.
  ctx.save();
  ctx.translate(0, Ny);
  ctx.scale(1, -1);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  const path2d = new Path2D(d);
  ctx.fill(path2d);
  ctx.restore();

  const img = ctx.getImageData(0, 0, Nx, Ny);
  const mask = new Uint8Array(Nx * Ny);
  for (let y = 0; y < Ny; y++) {
    for (let x = 0; x < Nx; x++) {
      const px = (y * Nx + x) * 4;
      // White pixel = inside the shape.
      if (img.data[px] > 128) {
        mask[x * Ny + y] = 1;
      }
    }
  }

  return {
    mask,
    Nx,
    Ny,
    widthCells: Math.round(drawW),
    heightCells: Math.round(drawH),
  };
}
