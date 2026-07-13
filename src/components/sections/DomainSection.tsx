import { useEffect, useRef, useState } from 'react';
import {
  type DomainConfig,
  type GeometryConfig,
  type TunnelMode,
  geometryHeightM,
} from '../../types/SimConfig';
import { rasteriseSvg } from '../../geometry/svgImport';
import { rasteriseDxf } from '../../geometry/dxfImport';

interface Props {
  value: DomainConfig;
  geometry: GeometryConfig;
  onChange: (next: DomainConfig) => void;
  /** Lattice size derived from the rest of the config — used to rasterise
   *  the tunnel SVG into a fluid-region mask of matching dimensions. */
  Nx: number;
  Ny: number;
  /** Tunnel SVG mask. App owns the state; this callback writes it. */
  onTunnelMask: (mask: Uint8Array | null) => void;
  hasTunnelMask: boolean;
  disabled?: boolean;
}

const TUNNEL_MIN = 0.01;
const TUNNEL_MAX = 50;

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return '—';
  return `${p.toFixed(1)}%`;
}

export function DomainSection({
  value,
  geometry,
  onChange,
  Nx,
  Ny,
  onTunnelMask,
  hasTunnelMask,
  disabled,
}: Props) {
  const [tunnelSvgError, setTunnelSvgError] = useState<string | null>(null);
  const [tunnelSvgInfo, setTunnelSvgInfo] = useState<string | null>(null);
  /**
   * Persist the original file across canvas-size changes. If the user picks
   * a file with one geometry selected and then changes geometry (which moves
   * Nx/Ny), we transparently re-rasterise so the mask still matches the
   * current canvas. Without this, the mask becomes stale and gets silently
   * dropped at run time because tunnelMask.length !== Nx*Ny.
   */
  const [tunnelFile, setTunnelFile] = useState<File | null>(null);

  const setTunnelMode = (tunnelMode: TunnelMode) => {
    onTunnelMask(null);
    setTunnelFile(null);
    setTunnelSvgError(null);
    setTunnelSvgInfo(null);
    onChange({ ...value, tunnelMode });
  };

  // Refs let the effect read the latest values without listing them as deps,
  // which would re-fire the rasterisation on every parent re-render.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onTunnelMaskRef = useRef(onTunnelMask);
  onTunnelMaskRef.current = onTunnelMask;

  /**
   * Rasterise the tunnel file whenever it changes or the canvas size moves,
   * and align `heightM` to the file's aspect ratio so the imported shape
   * fits the canvas exactly — no clipping, no empty bands.
   *
   * Strategy:
   *  - fitMode='contain' so the shape never overflows the canvas.
   *  - marginX = marginY = 0 so when aspects match it touches every edge.
   *  - After each raster, compare the file's natural aspect (widthCells /
   *    heightCells) to the canvas aspect. If they differ by >2 %, adjust
   *    `heightM` once and let the effect re-fire to lock it in. Two passes
   *    converge: first measures, second confirms with no further change.
   *
   * The mask is only pushed up after convergence, so callers never see a
   * stale-size mask in App state.
   */
  useEffect(() => {
    if (!tunnelFile) return;
    let cancelled = false;

    void (async () => {
      setTunnelSvgError(null);
      const file = tunnelFile;
      const name = file.name.toLowerCase();
      const isDxf = name.endsWith('.dxf');
      const isSvg = name.endsWith('.svg') || file.type === 'image/svg+xml';
      if (!isDxf && !isSvg) {
        setTunnelSvgError('Unsupported tunnel file. Use .svg or .dxf.');
        onTunnelMaskRef.current(null);
        return;
      }
      const opts = {
        marginX: 0,
        marginY: 0,
        fitMode: 'contain' as const,
      };
      try {
        const result = isDxf
          ? await rasteriseDxf(file, Nx, Ny, opts)
          : await rasteriseSvg(file, Nx, Ny, opts);
        if (cancelled) return;

        // Aspect-match the canvas to the file. The reported widthCells /
        // heightCells preserve the file's aspect (rasteriser scales
        // uniformly), so this gives us the file's true aspect.
        const v = valueRef.current;
        const fileHWRatio =
          result.widthCells > 0
            ? result.heightCells / result.widthCells
            : 1;
        const desiredHeightM = v.widthM * fileHWRatio;
        const denom = Math.max(desiredHeightM, v.heightM);
        const relDiff =
          denom > 0
            ? Math.abs(desiredHeightM - v.heightM) / denom
            : 1;
        if (relDiff > 0.02 && desiredHeightM > 0) {
          // Push the heightM update; the effect will re-fire with a canvas
          // whose aspect matches the file, and contain mode will then yield
          // a tight, no-clip fit.
          onChangeRef.current({ ...v, heightM: desiredHeightM });
          return;
        }

        // Aspect already matches → publish the mask.
        onTunnelMaskRef.current(result.mask);
        const tag = isDxf ? 'DXF' : 'SVG';
        let extra = '';
        if ('entityCounts' in result) {
          const ec = (result as { entityCounts: Record<string, number> })
            .entityCounts;
          const parts = Object.entries(ec).map(([k, n]) => `${n} ${k}`);
          if (parts.length > 0) extra = ` (${parts.join(', ')})`;
        }
        setTunnelSvgInfo(
          `Tunnel loaded · ${tag} · ${file.name} · ${result.widthCells}×${result.heightCells} cells${extra}`,
        );
      } catch (err) {
        if (cancelled) return;
        onTunnelMaskRef.current(null);
        setTunnelSvgError(
          err instanceof Error ? err.message : 'Tunnel import failed',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tunnelFile, Nx, Ny]);

  const handleTunnelFile = (file: File) => {
    setTunnelFile(file);
    // The effect above performs the actual rasterisation — running it
    // synchronously here would race with the props update.
  };

  // Blockage indicator (only meaningful for manual + obstacle present).
  const objH = geometryHeightM(geometry);
  const blockage =
    value.mode === 'windtunnel' &&
    value.tunnelMode === 'manual' &&
    objH > 0 &&
    value.heightM > 0
      ? (objH / value.heightM) * 100
      : null;
  const blockageSev: 'ok' | 'warn' | 'error' | null =
    blockage === null
      ? null
      : blockage > 30
        ? 'error'
        : blockage > 15
          ? 'warn'
          : 'ok';

  return (
    <section>
      {/* Domain mode toggle hidden — always freeflow. Wind tunnel logic kept below. */}

      {value.mode === 'windtunnel' && (
        <>
          <div className="subsection-label">TUNNEL DEFINITION</div>
          <div className="select-grid">
            <button
              className={`pill${value.tunnelMode === 'manual' ? ' active' : ''}`}
              onClick={() => setTunnelMode('manual')}
              disabled={disabled}
              title="Rectangular duct with explicit width and height"
            >
              MANUAL
            </button>
            <button
              className={`pill${value.tunnelMode === 'svg' ? ' active' : ''}`}
              onClick={() => setTunnelMode('svg')}
              disabled={disabled}
              title="Import tunnel cross-section from an SVG or DXF outline"
            >
              SVG / DXF
            </button>
          </div>

          {value.tunnelMode === 'manual' && (
            <>
              <div className="field-grid">
                <label className="field">
                  <span>WIDTH [m]</span>
                  <input
                    type="number"
                    min={TUNNEL_MIN}
                    max={TUNNEL_MAX}
                    step={0.01}
                    value={value.widthM}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        widthM: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>HEIGHT [m]</span>
                  <input
                    type="number"
                    min={TUNNEL_MIN}
                    max={TUNNEL_MAX}
                    step={0.01}
                    value={value.heightM}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        heightM: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </label>
              </div>
              <p className="hint">
                The tunnel is a rectangular duct. Top and bottom walls are
                solid no-slip boundaries. Place an object inside using the
                GEOMETRY section below.
              </p>
              {blockage !== null && blockageSev && (
                <p className={`hint ${blockageSev === 'ok' ? '' : blockageSev === 'warn' ? 'warn' : 'err'}`}>
                  Blockage: {fmtPct(blockage)}{' '}
                  {blockageSev === 'warn' && '⚠ (>15% affects results)'}
                  {blockageSev === 'error' && '⚠ (>30% — strongly affects results)'}
                </p>
              )}
            </>
          )}

          {value.tunnelMode === 'svg' && (
            <>
              <label className="dropzone">
                <input
                  type="file"
                  accept=".svg,image/svg+xml,.dxf,application/dxf,application/octet-stream"
                  disabled={disabled}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleTunnelFile(f);
                  }}
                />
                <span>DROP TUNNEL .SVG / .DXF OR CLICK</span>
              </label>
              <p className="hint">
                Upload an SVG or DXF defining the tunnel cross-section. The
                flow domain matches the outline; walls are its boundary. DXF
                supports LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE and SPLINE.
                Tunnel height auto-adjusts to the imported aspect ratio so
                the shape fits without clipping.
              </p>
              {tunnelSvgInfo && <p className="hint ok">{tunnelSvgInfo}</p>}
              {tunnelSvgError && <p className="hint err">{tunnelSvgError}</p>}
              {!tunnelSvgInfo && !tunnelSvgError && hasTunnelMask && (
                <p className="hint ok">Tunnel mask active.</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
