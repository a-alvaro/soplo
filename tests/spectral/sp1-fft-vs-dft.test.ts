import { expect, it } from 'vitest';
import { fft } from '../../src/physics/spectral';
import { mulberry32 } from '../invariants/helpers';

// SP-1 (docs/specs/phase-1-3a-strouhal-fft.md §3): the in-module radix-2
// Cooley–Tukey transform against a naive O(N²) DFT on 64-point random input.
// Acceptance: max abs error ≤ 1e-12.
//
// The FFT carries no dependency, so nothing else gates it. If this drifts,
// every Strouhal number the app displays drifts with it.

/** Textbook DFT, X[k] = Σ x[n]·e^(−2πikn/N). Reference implementation. */
function naiveDft(re: number[], im: number[]): { re: number[]; im: number[] } {
  const n = re.length;
  const outRe = new Array<number>(n).fill(0);
  const outIm = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      outRe[k] += re[t] * c - im[t] * s;
      outIm[k] += re[t] * s + im[t] * c;
    }
  }
  return { re: outRe, im: outIm };
}

it('SP-1: radix-2 FFT matches a naive DFT on 64 random points', () => {
  const N = 64;
  const rand = mulberry32(0x5150);
  const re = Array.from({ length: N }, () => rand() * 2 - 1);
  const im = Array.from({ length: N }, () => rand() * 2 - 1);

  const ref = naiveDft(re, im);

  const fre = Float64Array.from(re);
  const fim = Float64Array.from(im);
  fft(fre, fim);

  let maxErr = 0;
  for (let k = 0; k < N; k++) {
    maxErr = Math.max(
      maxErr,
      Math.abs(fre[k] - ref.re[k]),
      Math.abs(fim[k] - ref.im[k]),
    );
  }

  process.stdout.write(`SP-1: max |FFT − DFT| = ${maxErr.toExponential(3)}\n`);
  expect(maxErr, `max abs error ${maxErr.toExponential(3)} exceeds 1e-12`).toBeLessThanOrEqual(1e-12);
});

it('SP-1: FFT rejects a non-power-of-two length', () => {
  expect(() => fft(new Float64Array(48), new Float64Array(48))).toThrow(/power of two/);
});
