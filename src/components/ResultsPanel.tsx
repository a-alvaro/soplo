import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  williamsonSt,
  type StrouhalEstimate,
  type StrouhalStatus,
} from '../physics/spectral';
import {
  forceConvergenceStatus,
  interpretFlow,
  type ConvergenceStatus,
  type InterpretationConfidence,
  type NumericalSafety,
} from '../interpretation/flowInterpretation';
import type { GeometryType } from '../types/SimConfig';

export interface ForceSnapshot {
  step: number;
  Cd: number;
  Cl: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  history: ForceSnapshot[];
  /** Spectral estimate of the shedding frequency, from useSimulation. */
  strouhal: StrouhalEstimate;
  /** Geometry of the *built* solver — gates the literature reference. */
  geometryType: GeometryType | null;
  /** Reynolds number of the built solver — the reference is Re-dependent. */
  Re: number;
  /** Numerical safety of the built solver, never the editable live controls. */
  numericalSafety: NumericalSafety;
  /** Body size in cells (D) of the built solver — for the blockage ratio β = D/Ny. */
  charCells: number | null;
  /** Cross-stream domain size in cells of the built solver — the β denominator. */
  Ny: number | null;
}

function mean(arr: number[]): number {
  return arr.length === 0
    ? 0
    : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[], m: number): number {
  return arr.length === 0
    ? 0
    : Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// ─── Strouhal ─────────────────────────────────────────────────────────────────

const STROUHAL_STATUS_TEXT: Record<StrouhalStatus, string> = {
  ok: '',
  filling: 'collecting samples — needs ≥ 6 shedding periods',
  'no-peak': 'no dominant frequency resolved in this record',
  'band-edge': 'peak unresolved at the low edge of the search band',
};

/**
 * Literature reference for the measured St, or null when there is none to
 * honestly show.
 *
 * Only the built-in circle gets one: a cylinder correlation printed beside a
 * NACA, SVG or DXF body is a false reference, and AGENTS.md rule 2 makes
 * weakening physical honesty a physics change. Outside 49 < Re < 178 the
 * Williamson correlation itself does not apply — below ≈ 47 there is no
 * shedding, above ≈ 180 the wake is three-dimensional and a 2D value is not
 * comparable.
 */
function literatureSt(geometryType: GeometryType | null, Re: number): number | null {
  if (geometryType !== 'cylinder') return null;
  return williamsonSt(Re);
}

/** Blockage ratio β = D/Ny, or null when the built quantities are unavailable. */
function blockageRatio(charCells: number | null, Ny: number | null): number | null {
  if (charCells === null || Ny === null || Ny <= 0) return null;
  return charCells / Ny;
}

/**
 * Confinement caption for the literature reference, or null when β is unknown
 * or ≤ 5% (unconfined-comparable — no caveat needed). Williamson's correlation
 * is unconfined; every in-app cylinder is confined (β = 10/20/40%, since Ny is
 * fixed at 100 and the tunnel mode is hidden), so measured St legitimately runs
 * above the reference. Saying so keeps the reference honest (AGENTS.md rule 2)
 * instead of letting the gap read as a solver error.
 */
export function blockageCaption(beta: number | null): string | null {
  if (beta === null || beta <= 0.05) return null;
  const pct = Math.round(beta * 100);
  return `Your setup: β = ${pct}% (confined) — measured St runs above the unconfined value; the difference is blockage, not solver error.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResultsPanel({
  open,
  onClose,
  history,
  strouhal,
  geometryType,
  Re,
  numericalSafety,
  charCells,
  Ny,
}: Props) {
  // Last snapshot for live readout
  const last = history.at(-1);
  const Cd = last?.Cd ?? 0;
  const Cl = last?.Cl ?? 0;
  const LD =
    Math.abs(Cd) > 1e-6 ? Cl / Cd : 0;

  // Stats over the last 500 points
  const window500 = history.slice(-500);
  const cdArr = window500.map((h) => h.Cd);
  const clArr = window500.map((h) => h.Cl);
  const cdMean = mean(cdArr);
  const clMean = mean(clArr);
  const cdStd = std(cdArr, cdMean);
  const clStd = std(clArr, clMean);

  const status = forceConvergenceStatus(history);
  const stReference = literatureSt(geometryType, Re);
  const blockage = blockageRatio(charCells, Ny);
  const confinementCaption = blockageCaption(blockage);
  const interpretation = interpretFlow({
    geometryType,
    re: Re,
    numericalSafety,
    convergence: status,
    strouhal,
    blockageRatio: blockage,
  });

  // Chart data — last 200 points, rounded for performance
  const chartData = history.slice(-200).map((h) => ({
    step: h.step,
    Cd: parseFloat(h.Cd.toFixed(3)),
    Cl: parseFloat(h.Cl.toFixed(3)),
  }));

  const statusLabel: Record<ConvergenceStatus, string> = {
    insufficient: 'INSUFFICIENT DATA',
    converging: '● FORCE SIGNAL SETTLING',
    oscillating: `● FORCE SIGNAL OSCILLATING\n  Cd mean = ${fmt(cdMean)} ± ${fmt(cdStd)}`,
    unstable: '⚠ FORCE SIGNAL UNSETTLED',
  };

  const statusClass: Record<ConvergenceStatus, string> = {
    insufficient: 'results-status--neutral',
    converging: 'results-status--ok',
    oscillating: 'results-status--warn',
    unstable: 'results-status--err',
  };

  const confidenceLabel: Record<InterpretationConfidence, string> = {
    'not-applicable': 'NOT APPLICABLE',
    collecting: 'COLLECTING',
    supported: 'SUPPORTED',
    caution: 'CAUTION',
    unreliable: 'UNRELIABLE',
  };

  return (
    <div className={`results-panel${open ? ' results-panel--open' : ''}`}>
      {/* Header */}
      <div className="results-panel-header">
        <span className="results-panel-title">// AERODYNAMIC COEFFICIENTS</span>
        <button className="results-panel-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>

      {history.length === 0 ? (
        <p className="hint" style={{ padding: '12px 16px' }}>
          Start the simulation to compute forces.
        </p>
      ) : (
        <>
          {/* Live readout */}
          <div className="results-metrics">
            <div className="results-metric">
              <span className="results-metric-label">Cd</span>
              <span className="results-metric-value">{fmt(Cd)}</span>
              <span className="results-metric-desc">drag</span>
            </div>
            <div className="results-metric">
              <span className="results-metric-label">Cl</span>
              <span className="results-metric-value">{fmt(Cl)}</span>
              <span className="results-metric-desc">lift</span>
            </div>
            <div className="results-metric">
              <span className="results-metric-label">L/D</span>
              <span className="results-metric-value">{fmt(LD)}</span>
              <span className="results-metric-desc">efficiency</span>
            </div>
          </div>

          {/* Convergence chart */}
          <div className="results-section-label">// CONVERGENCE</div>
          <div className="results-chart">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart
                data={chartData}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="step"
                  tick={{ fontSize: 9, fill: '#555' }}
                  tickLine={false}
                  axisLine={{ stroke: '#222' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#555' }}
                  tickLine={false}
                  axisLine={{ stroke: '#222' }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: '#111',
                    border: '1px solid #333',
                    fontSize: 10,
                    padding: '4px 8px',
                  }}
                  labelStyle={{ color: '#666' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: '#666', paddingTop: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="Cd"
                  stroke="#ff2f00"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="Cl"
                  stroke="#00cc66"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stats */}
          {window500.length >= 20 && (
            <div className="results-stats">
              <span className="results-stats-label">
                Averaging window: last {window500.length} steps
              </span>
              <div className="results-stats-row">
                <span style={{ color: '#ff2f00' }}>Cd</span>
                <span>
                  {fmt(cdMean)} ± {fmt(cdStd)}
                </span>
              </div>
              <div className="results-stats-row">
                <span style={{ color: '#00cc66' }}>Cl</span>
                <span>
                  {fmt(clMean)} ± {fmt(clStd)}
                </span>
              </div>
            </div>
          )}

          {/* Strouhal */}
          <div className="results-section-label">// STROUHAL</div>
          <div className="results-stats">
            <div className="results-stats-row">
              <span style={{ color: '#00cc66' }}>St = f·D/u₀</span>
              <span>
                {strouhal.status === 'ok' && strouhal.st !== null
                  ? fmt(strouhal.st, 4)
                  : '—'}
              </span>
            </div>
            {strouhal.status === 'ok' ? (
              <span className="results-stats-label">
                {strouhal.periods.toFixed(0)} shedding periods in the record ·
                peak prominence {strouhal.prominence.toFixed(0)}×
              </span>
            ) : (
              <span className="results-stats-label">
                {STROUHAL_STATUS_TEXT[strouhal.status]}
              </span>
            )}
            {stReference !== null && (
              <>
                <span className="results-stats-label">
                  Circular cylinder, Re {Math.round(Re)}: {fmt(stReference, 4)}{' '}
                  — Williamson (1989), unconfined laminar correlation
                </span>
                {confinementCaption !== null && (
                  <span className="results-stats-label">{confinementCaption}</span>
                )}
              </>
            )}
          </div>

          {/* Status */}
          <div className="results-section-label">// STATUS</div>
          <div className={`results-status ${statusClass[status]}`} style={{ whiteSpace: 'pre-line' }}>
            {statusLabel[status]}
          </div>

          {/* Contextual interpretation */}
          <div className="results-section-label">// WHAT YOU ARE SEEING</div>
          <section
            className={`results-interpretation results-interpretation--${interpretation.confidence}`}
          >
            <div className="results-interpretation-heading">
              <span className="results-interpretation-confidence">
                {confidenceLabel[interpretation.confidence]}
              </span>
              <span className="results-interpretation-title">
                {interpretation.title}
              </span>
            </div>
            <p className="results-interpretation-summary">
              {interpretation.summary}
            </p>
            {interpretation.evidence.length > 0 && (
              <ul className="results-interpretation-list">
                {interpretation.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {interpretation.caveats.length > 0 && (
              <ul className="results-interpretation-list results-interpretation-list--caveat">
                {interpretation.caveats.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Disclaimer */}
          <p className="results-disclaimer">
            Values are approximate. Suitable for design comparison, not
            certification.
          </p>
        </>
      )}
    </div>
  );
}
