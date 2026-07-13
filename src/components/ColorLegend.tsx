import { useEffect, useRef } from 'react';
import type { ViewField } from '../types/SimConfig';
import {
  divergentGradient,
  viridisGradient,
} from '../rendering/colormaps';

interface Props {
  view: ViewField;
  /** Width in pixels — matches the canvas width above. */
  width: number;
  /** Min value in physical units. */
  min: number;
  /** Max value in physical units. */
  max: number;
  /** Units string ("m/s", "1/s", ...). */
  units: string;
}

const LABELS: Record<ViewField, string> = {
  magnitude: '|U|  VELOCITY MAGNITUDE',
  ux: 'Ux  HORIZONTAL VELOCITY',
  uy: 'Uy  VERTICAL VELOCITY',
  vorticity: 'ωz  VORTICITY',
};

const BAR_HEIGHT = 10;

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs < 0.01 || abs >= 10000) return v.toExponential(2);
  if (abs < 1) return v.toFixed(3);
  if (abs < 100) return v.toFixed(2);
  return v.toFixed(1);
}

/**
 * Colour bar shown below the canvas. Uses the same colormap as Canvas2D —
 * sequential viridis for magnitude, diverging blue→white→red otherwise.
 */
export function ColorLegend({ view, width, min, max, units }: Props) {
  const barRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = barRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const useDivergent = view !== 'magnitude';
    const pixels = useDivergent ? divergentGradient(w) : viridisGradient(w);

    // Stretch the 1px-tall gradient over the full bar height.
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = 1;
    const tmpCtx = tmp.getContext('2d')!;
    const img = tmpCtx.createImageData(w, 1);
    img.data.set(pixels);
    tmpCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, w, 1, 0, 0, canvas.width, canvas.height);
  }, [view, width]);

  const useDivergent = view !== 'magnitude';
  const midLabel = useDivergent ? '0' : formatNumber((min + max) / 2);

  return (
    <div className="legend" style={{ width }}>
      <div className="legend-header">
        <span className="legend-title">{LABELS[view]}</span>
        <span className="legend-units">{units}</span>
      </div>
      <canvas
        ref={barRef}
        width={width}
        height={BAR_HEIGHT}
        className="legend-bar"
      />
      <div className="legend-ticks">
        <span>{formatNumber(min)}</span>
        <span>{midLabel}</span>
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}
