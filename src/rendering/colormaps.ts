// Colormaps for the velocity / vorticity visualisation.

const VIRIDIS_STOPS: [number, number, number][] = [
  [68, 1, 84],
  [72, 35, 116],
  [64, 67, 135],
  [52, 94, 141],
  [41, 120, 142],
  [32, 144, 140],
  [34, 167, 132],
  [68, 190, 112],
  [253, 231, 36],
];

function interpolate(
  stops: [number, number, number][],
  t: number,
): [number, number, number] {
  if (!Number.isFinite(t)) return [0, 0, 0];
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length - 1];
  const scaled = t * (stops.length - 1);
  const i = Math.floor(scaled);
  const frac = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

/** Sequential viridis-like colormap. Input t in [0, 1]. */
export function viridis(t: number): [number, number, number] {
  return interpolate(VIRIDIS_STOPS, t);
}

// Diverging colormap: deep blue -> light grey -> deep red. Centred at t=0.5.
const DIVERGENT_STOPS: [number, number, number][] = [
  [33, 102, 172],
  [103, 169, 207],
  [209, 229, 240],
  [247, 247, 247],
  [253, 219, 199],
  [239, 138, 98],
  [178, 24, 43],
];

/** Diverging blue→white→red colormap. Input t in [0, 1], 0.5 is neutral. */
export function divergent(t: number): [number, number, number] {
  return interpolate(DIVERGENT_STOPS, t);
}

/** Sample a viridis gradient bar across width pixels. */
export function viridisGradient(width: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) {
    const t = width === 1 ? 0 : x / (width - 1);
    const [r, g, b] = viridis(t);
    out[x * 4 + 0] = r;
    out[x * 4 + 1] = g;
    out[x * 4 + 2] = b;
    out[x * 4 + 3] = 255;
  }
  return out;
}

/** Sample a diverging gradient bar across width pixels. */
export function divergentGradient(width: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) {
    const t = width === 1 ? 0 : x / (width - 1);
    const [r, g, b] = divergent(t);
    out[x * 4 + 0] = r;
    out[x * 4 + 1] = g;
    out[x * 4 + 2] = b;
    out[x * 4 + 3] = 255;
  }
  return out;
}
