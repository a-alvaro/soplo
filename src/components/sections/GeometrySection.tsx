import { useState } from 'react';
import {
  type GeometryConfig,
  type GeometryType,
  type Resolution,
  NACA_OPTIONS,
  RESOLUTION_CELLS,
} from '../../types/SimConfig';
import { rasteriseSvg } from '../../geometry/svgImport';
import { rasteriseDxf } from '../../geometry/dxfImport';
import { InfoTip } from '../InfoTip';

interface Props {
  value: GeometryConfig;
  onChange: (next: GeometryConfig) => void;
  /** Lattice resolution to use when rasterising imported SVG/DXF. */
  Nx: number;
  Ny: number;
  /** Receives the rasterised mask so the caller can stash it for run. */
  onSvgMask: (mask: Uint8Array | null) => void;
  disabled?: boolean;
}

const TYPES: { id: GeometryType; label: string; desc: string }[] = [
  { id: 'cylinder', label: 'CYLINDER', desc: 'cilindro circular' },
  { id: 'square', label: 'SQUARE', desc: 'obstáculo cuadrado' },
  { id: 'naca', label: 'NACA', desc: 'perfil aerodinámico' },
  { id: 'svg', label: 'SVG', desc: 'silueta vectorial SVG' },
  { id: 'dxf', label: 'DXF', desc: 'silueta vectorial DXF (CAD)' },
  { id: 'none', label: 'NONE', desc: 'dominio vacío' },
];

const RESOLUTIONS: { id: Resolution; label: string }[] = [
  { id: 'low', label: 'LOW' },
  { id: 'medium', label: 'MED' },
  { id: 'high', label: 'HIGH' },
];

export function GeometrySection({
  value,
  onChange,
  Nx,
  Ny,
  onSvgMask,
  disabled,
}: Props) {
  const [svgError, setSvgError] = useState<string | null>(null);
  const [svgInfo, setSvgInfo] = useState<string | null>(null);

  const setType = (type: GeometryType) => {
    onSvgMask(null);
    setSvgError(null);
    setSvgInfo(null);
    const { charLengthM, resolution } = value;
    if (type === 'naca') {
      onChange({
        type,
        charLengthM,
        resolution,
        nacaCode: value.nacaCode ?? '0012',
        angleOfAttack: value.angleOfAttack ?? 0,
      });
    } else {
      onChange({ type, charLengthM, resolution });
    }
  };

  const setResolution = (resolution: Resolution) =>
    onChange({ ...value, resolution });

  /** Auto-dispatch the right rasteriser by file extension. */
  const handleVectorFile = async (file: File) => {
    setSvgError(null);
    setSvgInfo(null);
    const name = file.name.toLowerCase();
    const isDxf = name.endsWith('.dxf');
    const isSvg = name.endsWith('.svg') || file.type === 'image/svg+xml';
    if (!isDxf && !isSvg) {
      setSvgError('Unsupported file. Use .svg or .dxf.');
      return;
    }
    try {
      const result = isDxf
        ? await rasteriseDxf(file, Nx, Ny)
        : await rasteriseSvg(file, Nx, Ny);
      onSvgMask(result.mask);
      const tag = isDxf ? 'DXF' : 'SVG';
      let extra = '';
      if ('polygonCount' in result) extra += ` · ${result.polygonCount} poly`;
      if ('entityCounts' in result) {
        const ec = (result as { entityCounts: Record<string, number> })
          .entityCounts;
        const parts = Object.entries(ec).map(([k, v]) => `${v} ${k}`);
        if (parts.length > 0) extra += ` (${parts.join(', ')})`;
      }
      if (
        'openChainsDiscarded' in result &&
        (result as { openChainsDiscarded: number }).openChainsDiscarded > 0
      ) {
        extra += ` · ${(result as { openChainsDiscarded: number })
          .openChainsDiscarded} open segments dropped`;
      }
      setSvgInfo(
        `OK · ${tag} · ${file.name} · ${result.widthCells}×${result.heightCells} cells${extra}`,
      );
      onChange({ ...value, type: isDxf ? 'dxf' : 'svg' });
    } catch (err) {
      onSvgMask(null);
      setSvgError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const showResolution = value.type !== 'none';
  const isImport = value.type === 'svg' || value.type === 'dxf';

  return (
    <section>
      <div className="section-label">GEOMETRY</div>

      <div className="select-grid">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={`pill${value.type === t.id ? ' active' : ''}`}
            onClick={() => setType(t.id)}
            disabled={disabled}
            title={t.desc}
          >
            {t.label}
          </button>
        ))}
      </div>

      {value.type !== 'none' && (
        <div className="field-grid">
          <label className="field">
            <span>
              CHAR. LENGTH [m]{' '}
              <InfoTip label="Longitud característica">
                <strong>Characteristic length L</strong>
                <p>
                  Tamaño físico real del objeto en metros: diámetro del
                  cilindro, lado del cuadrado, cuerda del perfil, etc.
                </p>
                <p>
                  Es lo que define la escala del problema. Junto con la
                  velocidad y la viscosidad determina el Reynolds:{' '}
                  <code>Re = U·L / ν</code>.
                </p>
              </InfoTip>
            </span>
            <input
              type="number"
              min={0.001}
              max={10}
              step={0.001}
              value={value.charLengthM}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  charLengthM: parseFloat(e.target.value) || 0,
                })
              }
            />
          </label>
        </div>
      )}

      {showResolution && (
        <>
          <div className="subsection-label">
            RESOLUTION{' '}
            <InfoTip label="Resolución de malla">
              <strong>Resolution — cells across L</strong>
              <p>
                Cuántas celdas LBM ocupa la longitud característica del
                objeto. Más celdas → más Re estable resolvible y mejor
                detalle de la capa límite, pero coste cuadrático.
              </p>
              <ul>
                <li>
                  <code>LOW</code> · {RESOLUTION_CELLS.low} cells · Re_safe ≈{' '}
                  {Math.round(21 * RESOLUTION_CELLS.low)}
                </li>
                <li>
                  <code>MED</code> · {RESOLUTION_CELLS.medium} cells · Re_safe
                  ≈ {Math.round(21 * RESOLUTION_CELLS.medium)}
                </li>
                <li>
                  <code>HIGH</code> · {RESOLUTION_CELLS.high} cells · Re_safe ≈{' '}
                  {Math.round(21 * RESOLUTION_CELLS.high)}
                </li>
              </ul>
              {isImport && (
                <p className="dim">
                  Para SVG/DXF la resolución sólo influye en el tamaño de
                  rejilla — la silueta importada se ajusta a la bbox.
                </p>
              )}
            </InfoTip>
          </div>
          <div className="select-grid res-grid">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.id}
                className={`pill${value.resolution === r.id ? ' active' : ''}`}
                onClick={() => setResolution(r.id)}
                disabled={disabled}
                title={`${RESOLUTION_CELLS[r.id]} cells across L`}
              >
                {r.label} · {RESOLUTION_CELLS[r.id]}
              </button>
            ))}
          </div>
        </>
      )}

      {value.type === 'naca' && (
        <div className="field-grid">
          <label className="field">
            <span>PROFILE</span>
            <select
              value={value.nacaCode ?? '0012'}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, nacaCode: e.target.value })}
            >
              {NACA_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ANGLE [°]</span>
            <input
              type="number"
              min={-15}
              max={15}
              step={0.5}
              value={value.angleOfAttack ?? 0}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  angleOfAttack: parseFloat(e.target.value) || 0,
                })
              }
            />
          </label>
        </div>
      )}

      {isImport && (
        <div>
          <label className="dropzone">
            <input
              type="file"
              accept=".svg,image/svg+xml,.dxf,application/dxf,application/octet-stream"
              disabled={disabled}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleVectorFile(f);
              }}
            />
            <span>DROP .{value.type.toUpperCase()} OR CLICK</span>
          </label>
          {svgInfo && <p className="hint ok">{svgInfo}</p>}
          {svgError && <p className="hint err">{svgError}</p>}
          {!svgInfo && !svgError && value.type === 'svg' && (
            <p className="hint">Path cerrado, una sola silueta.</p>
          )}
          {!svgInfo && !svgError && value.type === 'dxf' && (
            <p className="hint">
              Soporta LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE y SPLINE. Los
              segmentos sueltos se enganchan por sus extremos.
            </p>
          )}
        </div>
      )}

      {value.type === 'none' && (
        <p className="hint">Channel flow only — no obstacle.</p>
      )}
    </section>
  );
}
