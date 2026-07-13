// Parametric NACA 4-digit airfoil generation.
//
// Given a 4-digit code MPXX (e.g. "2412"):
//   M = max camber, percent of chord                (digit 0)
//   P = position of max camber, tenths of chord     (digit 1)
//   XX = thickness, percent of chord                (digits 2-3)
//
// Returns a closed polygon in normalised coords (chord = 1, leading edge at
// x=0, trailing edge at x=1). Upper surface first (LE -> TE), then lower
// surface reversed (TE -> LE) so the result winds consistently.

const A0 = 0.2969;
const A1 = -0.126;
const A2 = -0.3516;
const A3 = 0.2843;
// -0.1015 produces an open trailing edge. -0.1036 closes it (preferred for
// our rasteriser, which needs a closed boundary).
const A4 = -0.1036;

function thickness(x: number, t: number): number {
  return (
    5 *
    t *
    (A0 * Math.sqrt(x) + A1 * x + A2 * x * x + A3 * x * x * x + A4 * x * x * x * x)
  );
}

function camber(x: number, m: number, p: number): { yc: number; dyc: number } {
  if (m === 0 || p === 0) return { yc: 0, dyc: 0 };
  if (x < p) {
    return {
      yc: (m / (p * p)) * (2 * p * x - x * x),
      dyc: ((2 * m) / (p * p)) * (p - x),
    };
  }
  const oneMinusP = 1 - p;
  return {
    yc: (m / (oneMinusP * oneMinusP)) * (1 - 2 * p + 2 * p * x - x * x),
    dyc: ((2 * m) / (oneMinusP * oneMinusP)) * (p - x),
  };
}

/**
 * Cosine-spaced sampling concentrates points near the leading edge, where
 * curvature is highest — this gives a much smoother rasterisation than
 * uniform spacing for the same total point count.
 */
function cosineSpacing(numPoints: number): number[] {
  const xs: number[] = new Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    const beta = (Math.PI * i) / (numPoints - 1);
    xs[i] = 0.5 * (1 - Math.cos(beta));
  }
  return xs;
}

/**
 * Generate a closed NACA 4-digit polygon.
 *
 * @param code  4-character string, e.g. "0012" or "2412"
 * @param numPoints  samples along each surface (upper and lower)
 */
export function naca4(code: string, numPoints = 80): [number, number][] {
  if (code.length !== 4 || !/^\d{4}$/.test(code)) {
    throw new Error(`Invalid NACA 4-digit code: ${code}`);
  }
  const m = parseInt(code[0], 10) / 100;
  const p = parseInt(code[1], 10) / 10;
  const t = parseInt(code.slice(2), 10) / 100;

  const xs = cosineSpacing(numPoints);
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];

  for (const x of xs) {
    const yt = thickness(x, t);
    const { yc, dyc } = camber(x, m, p);
    const theta = Math.atan(dyc);
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    upper.push([x - yt * sinT, yc + yt * cosT]);
    lower.push([x + yt * sinT, yc - yt * cosT]);
  }

  // Close the polygon: upper LE->TE, then lower TE->LE.
  const poly = upper.concat(lower.slice(1, -1).reverse());
  return poly;
}
