// Spectral estimation of the vortex-shedding frequency (Strouhal number).
//
// One pure, headless-testable module shared by the app and the test suite, so
// the St the user reads is produced by the same code the BM-3 benchmark
// validated (docs/specs/phase-1-3a-strouhal-fft.md §1).
//
// Lives in physics/ (protected layer): no React, no DOM, no imports from
// components/ or rendering/, and no external dependency — the radix-2 FFT is
// implemented here.
//
// THE INPUT SIGNAL IS Cl, NEVER Cd. Cd oscillates at twice the shedding
// frequency, so feeding it in yields a silently doubled St (SP-5 pins this).

export type StrouhalStatus = 'ok' | 'filling' | 'no-peak' | 'band-edge';

export interface StrouhalEstimate {
  /** f·D/u0, dimensionless. Null unless status is 'ok'. */
  st: number | null;
  /** Shedding frequency in 1/steps (NOT 1/sample). Null unless 'ok'. */
  frequency: number | null;
  /** Shedding periods contained in the record. */
  periods: number;
  /** Peak magnitude / in-band median magnitude. */
  prominence: number;
  status: StrouhalStatus;
}

/** Samples per record the FFT will accept; caps the zero-padded length. */
const MAX_FFT = 8192;

/**
 * Minimum shedding periods a record must contain for the peak to be
 * resolvable. This single number sets the lower edge of the search band,
 * which is what replaces a separate DC exclusion and period guard.
 */
const MIN_PERIODS = 6;

/**
 * Peak-to-median ratio below which the spectrum is called featureless.
 *
 * Raised from 10 to 100 in rev 2 (spec §Rev 2 b). Measured evidence, re-taken
 * under the rev-2 St-capped band (the narrower band lifts the in-band median,
 * so these are lower than the rev-1 figures the first draft quoted; both tests
 * are seeded, so this is a band change, not run variance):
 *   - white-noise floor          2.24  (SP-7)
 *   - heavy-noise reject case    14.8   (SP-12)
 *   - real tone + realistic noise 183.5 (SP-3)
 *   - BM-3 fixture, real solver   281.7 (SP-9)
 *   - clean converged limit cycle O(10⁴)
 * 100 rejects 2.24 and 14.8 and accepts 183.5, 281.7 and O(10⁴), so it
 * discriminates at every measured point. The margin is ASYMMETRIC: ~6.8×
 * toward reject (vs 14.8) but only ~2.8× toward accept (vs the BM-3 fixture's
 * 281.7, the one real-solver point on the accept side). This is within the 3×
 * that spec §Validity guards flags as a finding — recorded here rather than
 * silently retuned. The threshold stands; the accept-side headroom is thinner
 * than a first reading of "well above the floor" suggests, and a body whose
 * shedding peak is weak (low Cl amplitude, short record) could approach it.
 */
const MIN_PROMINENCE = 100;

/**
 * Upper bound on the Strouhal number a physical bluff-body wake can shed at,
 * used to cap the search band in St space (spec §Rev 2 a). Laminar-subcritical
 * shedding lives well below this: cylinder 0.16–0.21, square ≈ 0.13, Roshko's
 * universal number 0.16–0.20. Nothing sheds above ≈ 0.35.
 *
 * This is what rejects the impulsive-start acoustic box mode (F2), whose
 * frequency is fixed by the domain, not the body, and lands at St ≫ 0.35 for
 * app-scale geometries (St ≈ 1.2 at D = 10). A temporal-stability guard would
 * not catch it: a box mode's frequency does not drift, so successive estimates
 * agree. The physical bound does.
 *
 * Chosen 0.35, not 0.40: the vertical acoustic fundamental sits at
 * St_ac = c_s·β/(2·u0) = 4.12·β, i.e. 0.41 at β = 10%. A cap of 0.40 would
 * admit it; 0.35 excludes it down to β ≈ 8.5%. Below that β the fundamental
 * falls inside the band and the band no longer discriminates — prominence
 * does. In particular at the β = 5% BM-3 setup the fundamental sits at
 * St ≈ 0.206, only ≈ 3.5 bins from the shedding peak on the fixture record
 * (measured on the padded nfft = 2048 grid for L = 1575; ≈ 2.7 on the raw
 * L-length grid); the prominence gate is what separates them there.
 */
const ST_MAX = 0.35;

// ─── Radix-2 Cooley–Tukey FFT ─────────────────────────────────────────────────

/**
 * In-place complex FFT. `re`/`im` must have the same power-of-two length.
 * Exported so SP-1 can gate it against a naive DFT.
 */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterflies. Twiddles are evaluated directly rather than accumulated by
  // recurrence: the record is at most 8,192 points and this runs once per
  // second at most, so the exactness is worth more than the trig calls.
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    for (let base = 0; base < n; base += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = base + k;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
      }
    }
  }
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

// ─── Estimator ────────────────────────────────────────────────────────────────

export interface StrouhalEstimatorOptions {
  /** Ring-buffer length in samples. Default 4,096 (≈ 31 periods at D = 30). */
  capacity?: number;
  /** Solver steps between samples. Default 20 — the forceHistory tick. */
  cadence?: number;
}

/**
 * Ring buffer of Cl samples plus the FFT pipeline that turns them into a
 * Strouhal number.
 *
 * The estimator never sees step counts: it works in the sample domain and
 * converts to 1/steps by dividing by `cadence`. A missing or wrong cadence is
 * therefore a clean factor-`cadence` error (SP-2 catches it by 20× margin).
 *
 * Capacity derivation (spec §1): periods = N·cadence·St·u0/D ≈ 0.231·N/D, so
 * 4,096 samples hold 31.5 periods at D = 30 and still clear the 6-period guard
 * for bodies up to D = 158 cells.
 */
export class StrouhalEstimator {
  private readonly buffer: Float64Array;
  private readonly cadence: number;
  /** Write cursor into the ring buffer. */
  private head = 0;
  /** Samples pushed since the last reset, capped at capacity. */
  private filled = 0;

  constructor(opts: StrouhalEstimatorOptions = {}) {
    const capacity = opts.capacity ?? 4096;
    const cadence = opts.cadence ?? 20;
    if (!Number.isFinite(capacity) || capacity < 2) {
      throw new Error(`StrouhalEstimator: capacity must be ≥ 2, got ${capacity}`);
    }
    if (!Number.isFinite(cadence) || cadence <= 0) {
      throw new Error(`StrouhalEstimator: cadence must be > 0, got ${cadence}`);
    }
    this.buffer = new Float64Array(Math.floor(capacity));
    this.cadence = cadence;
  }

  /** Append one Cl sample. Call once per sampling tick. */
  push(cl: number): void {
    this.buffer[this.head] = cl;
    this.head = (this.head + 1) % this.buffer.length;
    if (this.filled < this.buffer.length) this.filled++;
  }

  /** Drop the record. Must be called wherever forceHistory is cleared. */
  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.buffer.fill(0);
  }

  /** Samples currently held. */
  get length(): number {
    return this.filled;
  }

  /**
   * Copy of the record in chronological order, oldest first, truncated to the
   * newest MAX_FFT samples.
   */
  private record(): Float64Array {
    const n = Math.min(this.filled, MAX_FFT);
    const out = new Float64Array(n);
    const cap = this.buffer.length;
    // The newest sample sits at head-1; walk back n places from there.
    const start = ((this.head - n) % cap + cap) % cap;
    for (let i = 0; i < n; i++) out[i] = this.buffer[(start + i) % cap];
    return out;
  }

  /**
   * Estimate St from the record.
   *
   * @param charCells full diameter / side / chord in cells — the same
   *   quantity the safety indicator uses for Re_safe (AGENTS.md), never a
   *   half-length.
   * @param u0 lattice inlet velocity.
   */
  estimate(charCells: number, u0: number): StrouhalEstimate {
    const filling = (periods: number, prominence = 0): StrouhalEstimate => ({
      st: null,
      frequency: null,
      periods,
      prominence,
      status: 'filling',
    });

    const x = this.record();
    const L = x.length;
    // Below 2·MIN_PERIODS samples the search band is empty by construction
    // (its lower edge MIN_PERIODS/L would sit above Nyquist at 0.5).
    if (L < 2 * MIN_PERIODS) return filling(0);

    // Mean removal, then a periodic Hann window.
    let mean = 0;
    for (let i = 0; i < L; i++) mean += x[i];
    mean /= L;

    const nfft = Math.min(MAX_FFT, nextPowerOfTwo(L));
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    for (let i = 0; i < L; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / L));
      re[i] = (x[i] - mean) * w;
    }
    fft(re, im);

    // One-sided magnitude spectrum. Bin k is k/nfft cycles/sample.
    const half = nfft >> 1;
    const mag = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]);

    // Search band, in 1/steps:
    //   lower = MIN_PERIODS/(L·cadence)              — 6 periods in the record
    //   upper = min( 1/(2·cadence) , ST_MAX·u0/D )   — Nyquist, capped in St
    // Divided through by cadence and multiplied by nfft to land on bins. The
    // lower edge folds the period guard and the DC exclusion into one rule;
    // the St cap on the upper edge is what rejects the acoustic box mode (F2).
    const kLo = Math.max(1, Math.ceil((MIN_PERIODS * nfft) / L));
    // ST_MAX·u0/charCells is a frequency in 1/steps; ·cadence → cycles/sample;
    // ·nfft → bin index. Guard against a degenerate charCells/u0 (→ no cap).
    // A non-finite/≤0 charCells disables only the cap here; the final st
    // conversion below can then return status 'ok' with st = null, which is
    // inconsistent with the "st is null only when not ok" contract. This path
    // is unreachable from the app (validate() requires charLengthM > 0) and the
    // UI degrades cleanly (fmt renders — for non-finite), so it is left as a
    // documented inconsistency rather than guarded twice.
    const stCapCyclesPerSample =
      charCells > 0 && Number.isFinite(charCells) ? (ST_MAX * u0 * this.cadence) / charCells : 0.5;
    const kCap = Math.floor(stCapCyclesPerSample * nfft);
    const kHi = Math.min(half, kCap);
    // Empty band: the St cap sits below six resolvable periods. Nothing in
    // physical shedding range can be resolved with this record — not broken,
    // still filling.
    if (kLo > kHi) return filling(0);

    // Dominant bin within the search band [1, kHi] — the St cap at kHi keeps
    // an above-cap box mode out of contention entirely. If the winner falls
    // below the lower band edge it cannot be resolved with this record length;
    // the buffer is still filling, not broken.
    let kPeak = 1;
    for (let k = 2; k <= kHi; k++) if (mag[k] > mag[kPeak]) kPeak = k;
    if (kPeak < kLo) return filling((L * kPeak) / nfft);

    const inBand: number[] = [];
    for (let k = kLo; k <= kHi; k++) inBand.push(mag[k]);
    const med = median(inBand);
    const prominence = med > 0 ? mag[kPeak] / med : Infinity;
    const periodsAtPeak = (L * kPeak) / nfft;

    if (!(prominence >= MIN_PROMINENCE)) {
      return {
        st: null,
        frequency: null,
        periods: periodsAtPeak,
        prominence,
        status: 'no-peak',
      };
    }
    if (kPeak === kLo) {
      // An under-resolved shoulder leaning on the band edge, not a peak.
      return {
        st: null,
        frequency: null,
        periods: periodsAtPeak,
        prominence,
        status: 'band-edge',
      };
    }

    // Three-point parabolic interpolation on the log-magnitude. For a
    // Hann-windowed near-monochromatic tone the bias is ≲ 0.02 bins; on the
    // BM-3 fixture that is ≈ 0.16% of f, ~6× inside the 1% gate.
    //
    // Note: when the peak sits at the capped upper edge (kPeak === kHi === kCap)
    // this reads mag[kPeak+1], one bin past the cap, and delta ∈ [−0.5, 0.5]
    // lets the reported frequency exceed ST_MAX by up to half a bin. No
    // out-of-range read (mag has half+1 entries and the kPeak < half guard
    // holds) and physically irrelevant — the cap is intentionally soft at the
    // ±½-bin level, since a real shedding peak never sits exactly on it.
    let delta = 0;
    if (kPeak > 0 && kPeak < half) {
      const yl = Math.log(mag[kPeak - 1]);
      const yc = Math.log(mag[kPeak]);
      const yr = Math.log(mag[kPeak + 1]);
      const denom = yl - 2 * yc + yr;
      if (Number.isFinite(denom) && denom !== 0) {
        const d = (0.5 * (yl - yr)) / denom;
        if (Number.isFinite(d) && Math.abs(d) <= 0.5) delta = d;
      }
    }

    const cyclesPerSample = (kPeak + delta) / nfft;
    const frequency = cyclesPerSample / this.cadence; // 1/steps
    const st = u0 > 0 ? (frequency * charCells) / u0 : null;

    return {
      st,
      frequency,
      periods: L * cyclesPerSample,
      prominence,
      status: 'ok',
    };
  }
}

// ─── Literature reference ─────────────────────────────────────────────────────

/** Validity window of the Williamson laminar correlation. */
export const WILLIAMSON_RE_MIN = 49;
export const WILLIAMSON_RE_MAX = 178;

/**
 * Williamson's laminar shedding correlation for a circular cylinder:
 *
 *   St(Re) = −3.3265/Re + 0.1816 + 1.6·10⁻⁴·Re,   valid 49 < Re < 178
 *
 * Returns 0.1643 at Re = 100, consistent with the 0.164 cited in
 * VALIDATION.md. Outside the window there is no reference: below ≈ 47 the
 * wake does not shed, above ≈ 180 it is three-dimensional and a 2D value is
 * not comparable.
 *
 * Williamson (1989) — verify page/volume before external use.
 */
export function williamsonSt(Re: number): number | null {
  if (!Number.isFinite(Re) || Re <= WILLIAMSON_RE_MIN || Re >= WILLIAMSON_RE_MAX) {
    return null;
  }
  return -3.3265 / Re + 0.1816 + 1.6e-4 * Re;
}
