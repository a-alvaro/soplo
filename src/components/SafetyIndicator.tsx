import {
  reAbsoluteLimit,
  reSafeLimit,
  TAU_STABLE_HI,
  TAU_STABLE_LO,
  type LBMParams,
} from '../physics/physicsToLBM';

export type Severity = 'ok' | 'warn' | 'error';

interface Props {
  lbm: LBMParams;
  /** Cells across the characteristic length (D_cells). */
  charCells: number;
}

const CS = 1 / Math.sqrt(3); // lattice speed of sound

const SEVERITY_COLOR: Record<Severity, string> = {
  ok: '#00cc66',
  warn: '#d6a55c',
  error: '#ff2f00',
};

/** Most severe of two severities. */
function worst(a: Severity, b: Severity): Severity {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'warn' || b === 'warn') return 'warn';
  return 'ok';
}

export interface SafetyState {
  re: Severity;
  tau: Severity;
  ma: Severity;
  overall: Severity;
  reSafe: number;
  reLimit: number;
  maValue: number;
  message: string | null;
}

export function safetyForLbm(
  lbm: LBMParams,
  charCells: number,
): SafetyState {
  const reSafe = reSafeLimit(charCells);
  const reLimit = reAbsoluteLimit(charCells);

  const re: Severity =
    !Number.isFinite(lbm.Re) || lbm.Re > reLimit
      ? 'error'
      : lbm.Re > reSafe
        ? 'warn'
        : 'ok';

  const tau: Severity =
    lbm.tauRaw < TAU_STABLE_LO
      ? 'error'
      : lbm.tauRaw < 0.53
        ? 'warn'
        : 'ok';

  const maValue = lbm.u0 / CS;
  // u0 is fixed at 0.07 lu so Ma is always ~0.121 — purely informational.
  const ma: Severity = maValue > 0.3 ? 'warn' : 'ok';

  let message: string | null = null;
  if (tau === 'error') {
    message = `Re exceeds safe limit for current resolution. Safe up to Re ≈ ${Math.round(
      reSafe,
    )}. Reduce speed or switch to HIGH resolution.`;
  } else if (lbm.tauRaw > TAU_STABLE_HI) {
    message = 'Very low Re — laminar flow, minimal features.';
  } else if (tau === 'warn') {
    message =
      'Borderline stability. Results may show minor numerical artefacts at high step count.';
  }

  return {
    re,
    tau,
    ma,
    overall: worst(worst(re, tau), ma),
    reSafe,
    reLimit,
    maValue,
    message,
  };
}

interface RowProps {
  label: string;
  value: string;
  sev: Severity;
}

function Row({ label, value, sev }: RowProps) {
  return (
    <>
      <span className="telemetry-label">{label}</span>
      <span className="safety-value">
        <span>{value}</span>
        <span
          className="safety-dot"
          style={{ background: SEVERITY_COLOR[sev] }}
        />
      </span>
    </>
  );
}

export function SafetyIndicator({ lbm, charCells }: Props) {
  const s = safetyForLbm(lbm, charCells);
  return (
    <section className="stability">
      <div className="section-label">STABILITY</div>
      <div className="telemetry safety-grid">
        <Row
          label="Re"
          value={
            Number.isFinite(lbm.Re)
              ? Math.round(lbm.Re).toLocaleString()
              : '∞'
          }
          sev={s.re}
        />
        <Row label="τ" value={lbm.tau.toFixed(3)} sev={s.tau} />
        <Row label="MA" value={s.maValue.toFixed(3)} sev={s.ma} />
      </div>
      {s.message && (
        <p className={`hint ${s.tau === 'error' ? 'err' : 'warn'}`}>
          {s.message}
        </p>
      )}
    </section>
  );
}
