import {
  type FluidConfig,
  type FluidPreset,
  FLUID_PRESETS,
} from '../../types/SimConfig';
import type { LBMParams, PhysicsWarning } from '../../physics/physicsToLBM';
import { InfoTip } from '../InfoTip';

interface Props {
  value: FluidConfig;
  lbm: LBMParams;
  warnings: PhysicsWarning[];
  onChange: (next: FluidConfig) => void;
  disabled?: boolean;
}

function pickPreset(p: FluidPreset, prev: FluidConfig): FluidConfig {
  if (p === 'custom') return { ...prev, preset: 'custom' };
  const def = FLUID_PRESETS[p];
  return { preset: p, nuPhysical: def.nu, rhoPhysical: def.rho };
}

function fmtRe(re: number): string {
  if (!Number.isFinite(re)) return '∞';
  if (re >= 10000) return re.toExponential(2);
  if (re >= 100) return Math.round(re).toString();
  return re.toFixed(1);
}

export function FluidSection({
  value,
  lbm,
  warnings,
  onChange,
  disabled,
}: Props) {
  const setPreset = (preset: FluidPreset) => onChange(pickPreset(preset, value));
  const setNu = (nu: number) =>
    onChange({ ...value, preset: 'custom', nuPhysical: nu });

  return (
    <section>
      <div className="section-label">FLUID</div>

      <div className="field-grid">
        <label className="field">
          <span>PRESET</span>
          <select
            value={value.preset}
            disabled={disabled}
            onChange={(e) => setPreset(e.target.value as FluidPreset)}
          >
            <option value="air">AIR</option>
            <option value="water">WATER</option>
            <option value="custom">CUSTOM</option>
          </select>
        </label>
        <label className="field">
          <span>
            ν&nbsp;[m²/s]{' '}
            <InfoTip label="Viscosidad cinemática">
              <strong>ν — Kinematic viscosity</strong>
              <p>
                Resistencia interna del fluido al cizallamiento. A mayor ν,
                flujo más laminar.
              </p>
              <ul>
                <li><code>Air</code> ≈ 1.5·10⁻⁵ m²/s</li>
                <li><code>Water</code> ≈ 1.0·10⁻⁶ m²/s</li>
              </ul>
            </InfoTip>
          </span>
          <input
            type="number"
            min={1e-7}
            max={1}
            step={1e-6}
            value={value.nuPhysical}
            disabled={disabled}
            onChange={(e) => setNu(parseFloat(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="subsection-label">COMPUTED</div>
      <div className="telemetry">
        <span
          className="telemetry-label"
          title="Reynolds number from physical inputs"
        >
          Re
        </span>
        <span className="telemetry-value accent">{fmtRe(lbm.Re)}</span>
        <span
          className="telemetry-label"
          title="LBM relaxation time, derived from Re and lattice resolution"
        >
          τ
        </span>
        <span className="telemetry-value">{lbm.tau.toFixed(4)}</span>
        <span
          className="telemetry-label"
          title="Internal lattice velocity (fixed at 0.07 lu for stability)"
        >
          u₀&nbsp;(lu)
        </span>
        <span className="telemetry-value">{lbm.u0.toFixed(3)}</span>
      </div>

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <p key={i} className={`hint ${w.severity === 'error' ? 'err' : 'warn'}`}>
              {w.severity === 'error' ? '⚠ ' : '· '}
              {w.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
