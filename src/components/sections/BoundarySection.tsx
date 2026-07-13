import type {
  BoundaryConfig,
  InletProfile,
  WallFace,
} from '../../types/SimConfig';
import { InfoTip } from '../InfoTip';

interface Props {
  value: BoundaryConfig;
  onChange: (next: BoundaryConfig) => void;
  disabled?: boolean;
}

const FACES: { id: WallFace; label: string; supported: boolean }[] = [
  { id: 'left', label: 'LEFT', supported: true },
  { id: 'right', label: 'RIGHT', supported: true },
  { id: 'top', label: 'TOP', supported: false },
  { id: 'bottom', label: 'BOTTOM', supported: false },
];

const SOON = 'Coming soon — for now inlet must be LEFT and outlet RIGHT';

export function BoundarySection({ value, onChange, disabled }: Props) {
  const setInletFace = (f: WallFace) => onChange({ ...value, inletFace: f });
  const setOutletFace = (f: WallFace) => onChange({ ...value, outletFace: f });
  const setSpeed = (v: number) => onChange({ ...value, speedMs: v });
  const setProfile = (p: InletProfile) =>
    onChange({ ...value, inletProfile: p });

  const inletEqOutlet = value.inletFace === value.outletFace;

  return (
    <section>
      <div className="section-label">BOUNDARIES</div>

      <div className="subsection-label">INLET</div>
      <div className="field-grid">
        <label className="field">
          <span>FACE</span>
          <select
            value={value.inletFace}
            disabled={disabled}
            onChange={(e) => setInletFace(e.target.value as WallFace)}
          >
            {FACES.map((f) => (
              <option
                key={f.id}
                value={f.id}
                disabled={!f.supported}
                title={!f.supported ? SOON : undefined}
              >
                {f.label}
                {!f.supported ? ' (soon)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>PROFILE</span>
          <select
            value={value.inletProfile}
            disabled={disabled}
            onChange={(e) => setProfile(e.target.value as InletProfile)}
          >
            <option value="uniform">UNIFORM</option>
            <option value="parabolic" disabled title="Coming soon">
              PARABOLIC (soon)
            </option>
          </select>
        </label>
        <label className="field">
          <span className="field-label-row">
            SPEED [m/s]
            <InfoTip label="Velocidad de entrada">
              <strong>Inlet speed (m/s)</strong>
              <p>
                Velocidad física del flujo en la entrada. Soplo la traduce
                internamente a unidades lattice manteniendo la velocidad
                lattice fija en <code>0.07 lu</code> (segura para Ma ≪ 1).
              </p>
              <p>
                Lo que importa físicamente es el Reynolds:{' '}
                <code>Re = U·L / ν</code>. Subir mucho U sin agrandar la malla
                obliga a τ a ir por debajo de 0.5, lo que el solver no puede
                resolver — verás un aviso.
              </p>
              <p className="dim">
                Rango sugerido: 0.01 – 100 m/s, según fluido y resolución.
              </p>
            </InfoTip>
          </span>
          <input
            type="number"
            min={0.001}
            max={200}
            step={0.1}
            value={value.speedMs}
            disabled={disabled}
            onChange={(e) => setSpeed(parseFloat(e.target.value) || 0)}
          />
        </label>
      </div>
      <div className="radio-row">
        <label className="radio active">
          <input type="radio" checked readOnly />
          <span>VELOCITY</span>
        </label>
        <label
          className="radio disabled"
          title="Pressure inlet — coming in a future version"
        >
          <input type="radio" disabled />
          <span>PRESSURE (soon)</span>
        </label>
      </div>

      <div className="subsection-label">OUTLET</div>
      <div className="field-grid">
        <label className="field">
          <span>FACE</span>
          <select
            value={value.outletFace}
            disabled={disabled}
            onChange={(e) => setOutletFace(e.target.value as WallFace)}
          >
            {FACES.map((f) => (
              <option
                key={f.id}
                value={f.id}
                disabled={!f.supported || f.id === value.inletFace}
                title={!f.supported ? SOON : undefined}
              >
                {f.label}
                {!f.supported ? ' (soon)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="radio-row">
        <label className="radio active">
          <input type="radio" checked readOnly />
          <span>ZERO GRADIENT</span>
        </label>
        <label
          className="radio disabled"
          title="Pressure outlet — coming in a future version"
        >
          <input type="radio" disabled />
          <span>PRESSURE (soon)</span>
        </label>
      </div>

      <div className="subsection-label">WALLS</div>
      <div className="field-grid">
        <label className="field">
          <span>COND</span>
          <select disabled value="noslip">
            <option value="noslip">NO-SLIP</option>
          </select>
        </label>
      </div>

      {inletEqOutlet && (
        <p className="hint err">Inlet and outlet must be different faces.</p>
      )}
    </section>
  );
}
