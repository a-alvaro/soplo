import { useEffect, useMemo, useRef } from 'react';
import type { ViewField } from '../types/SimConfig';
import { divergent, viridis } from './colormaps';

interface Props {
  Nx: number;
  Ny: number;
  ux: Float64Array;
  uy: Float64Array;
  solid: Uint8Array;
  width: number;
  height: number;
  /** Reference scale for the active view. Always > 0. */
  vmax: number;
  view: ViewField;
  /** Bumped each frame to trigger redraw. */
  redrawTick: number;
}

const SOLID_RGB: [number, number, number] = [30, 30, 30];

/**
 * Render the active scalar field at (Nx × Ny) into a small offscreen canvas
 * (1 px per cell), then blit it scaled with bilinear smoothing onto the
 * visible canvas.
 */
export function Canvas2D({
  Nx,
  Ny,
  ux,
  uy,
  solid,
  width,
  height,
  vmax,
  view,
  redrawTick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const offscreen = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Nx;
    c.height = Ny;
    return c;
  }, [Nx, Ny]);

  const offscreenImage = useMemo(
    () => new ImageData(Nx, Ny),
    [Nx, Ny],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const offCtx = offscreen.getContext('2d');
    if (!ctx || !offCtx) return;

    const data = offscreenImage.data;

    const useDivergent = view === 'ux' || view === 'uy' || view === 'vorticity';
    const cmap = useDivergent ? divergent : viridis;
    const safeVmax = vmax > 0 ? vmax : 1;

    for (let cx = 0; cx < Nx; cx++) {
      for (let cy = 0; cy < Ny; cy++) {
        const k = cx * Ny + cy;
        const py = Ny - 1 - cy;
        const off = (py * Nx + cx) * 4;

        let r: number, g: number, b: number;
        if (solid[k] === 1) {
          [r, g, b] = SOLID_RGB;
        } else {
          let value: number;
          switch (view) {
            case 'magnitude': {
              const vxv = ux[k];
              const vyv = uy[k];
              value = Math.sqrt(vxv * vxv + vyv * vyv);
              break;
            }
            case 'ux':
              value = ux[k];
              break;
            case 'uy':
              value = uy[k];
              break;
            case 'vorticity': {
              if (cx <= 0 || cx >= Nx - 1 || cy <= 0 || cy >= Ny - 1) {
                value = 0;
              } else {
                const dUydx = (uy[(cx + 1) * Ny + cy] - uy[(cx - 1) * Ny + cy]) / 2;
                const dUxdy = (ux[cx * Ny + (cy + 1)] - ux[cx * Ny + (cy - 1)]) / 2;
                value = dUydx - dUxdy;
              }
              break;
            }
          }

          let t: number;
          if (useDivergent) {
            t = 0.5 + 0.5 * Math.max(-1, Math.min(1, value / safeVmax));
          } else {
            t = Math.max(0, Math.min(1, value / safeVmax));
          }
          [r, g, b] = cmap(t);
        }

        data[off] = r;
        data[off + 1] = g;
        data[off + 2] = b;
        data[off + 3] = 255;
      }
    }

    offCtx.putImageData(offscreenImage, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreen, 0, 0, Nx, Ny, 0, 0, width, height);
  }, [Nx, Ny, ux, uy, solid, offscreen, offscreenImage, width, height, vmax, view, redrawTick]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  );
}
