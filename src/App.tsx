import { useEffect, useMemo, useState } from 'react';
import { Canvas2D } from './rendering/Canvas2D';
import { ColorLegend } from './components/ColorLegend';
import { SettingsPanelOverlay } from './components/SettingsPanelOverlay';
import { SimControlsOverlay } from './components/SimControlsOverlay';
import { ResultsPanel } from './components/ResultsPanel';
import { defaultConfig, type SimConfig, type ViewField } from './types/SimConfig';
import { useSimulation } from './hooks/useSimulation';
import { safetyForLbm } from './components/SafetyIndicator';

export default function App() {
  const [config, setConfig] = useState<SimConfig>(defaultConfig);
  const [svgMask, setSvgMask] = useState<Uint8Array | null>(null);
  const [tunnelMask, setTunnelMask] = useState<Uint8Array | null>(null);
  const [showResults, setShowResults] = useState(false);

  const {
    built,
    running,
    stepCount,
    fps,
    umaxLattice,
    forceHistory,
    strouhal,
    redrawTick,
    requestRedraw,
    run,
    pause,
    reset,
    validationError,
    simulationError,
    liveLbm,
    liveCharCells,
    previewNx,
    previewNy,
  } = useSimulation(config, svgMask, tunnelMask);

  // Force canvasSize recompute on window resize
  useEffect(() => {
    window.addEventListener('resize', requestRedraw);
    return () => window.removeEventListener('resize', requestRedraw);
    // requestRedraw is a stable-enough setter wrapper; re-subscribing per
    // render would churn the listener for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = (view: ViewField) => setConfig((c) => ({ ...c, view }));

  const canvasSize = useMemo(() => {
    const Nx = built?.Nx ?? previewNx;
    const Ny = built?.Ny ?? previewNy;
    const HEADER_H = 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight - HEADER_H;
    const scaleX = vw / Nx;
    const scaleY = vh / Ny;
    const scale = Math.min(scaleX, scaleY);
    return {
      w: Math.floor(Nx * scale),
      h: Math.floor(Ny * scale),
    };
  // redrawTick in deps so this recomputes on every resize
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, previewNx, previewNy, redrawTick]);

  const vmaxLattice = useMemo(() => {
    if (!built) return 1.5 * liveLbm.u0;
    if (config.view === 'vorticity') {
      return Math.max(1e-4, (2 * built.lbm.u0) / Math.max(1, built.charCells));
    }
    return 1.5 * built.lbm.u0;
  }, [built, liveLbm.u0, config.view]);

  const legend = useMemo(() => {
    const lbm = built?.lbm ?? liveLbm;
    const speed = built?.config.boundaries.speedMs ?? config.boundaries.speedMs;
    if (config.view === 'vorticity') {
      const omegaMaxPhys = lbm.dt > 0 ? vmaxLattice / lbm.dt : 0;
      return { min: -omegaMaxPhys, max: omegaMaxPhys, units: '1/s' };
    }
    if (config.view === 'magnitude') {
      const maxPhys = (vmaxLattice / lbm.u0) * speed;
      return { min: 0, max: maxPhys, units: 'm/s' };
    }
    const maxPhys = (vmaxLattice / lbm.u0) * speed;
    return { min: -maxPhys, max: maxPhys, units: 'm/s' };
  }, [built, liveLbm, vmaxLattice, config.view, config.boundaries.speedMs]);

  const umaxPhys = useMemo(() => {
    const lbm = built?.lbm ?? liveLbm;
    const speed = built?.config.boundaries.speedMs ?? config.boundaries.speedMs;
    return (umaxLattice / lbm.u0) * speed;
  }, [built, liveLbm, umaxLattice, config.boundaries.speedMs]);

  const liveSafety = useMemo(
    () => safetyForLbm(liveLbm, liveCharCells),
    [liveLbm, liveCharCells],
  );

  const headerStatus = running ? 'REC' : built ? 'PAUSED' : 'IDLE';
  const Nx = built?.Nx ?? previewNx;
  const Ny = built?.Ny ?? previewNy;
  const tau = built?.lbm.tau ?? liveLbm.tau;
  const re = built?.lbm.Re ?? liveLbm.Re;

  return (
    <div className="app">
      {/* ── Thin header ── */}
      <header className="header">
        <img className="header-logo" src="/SOPLO.png" alt="Soplo" />
        <span className="header-spacer" />
        <span className="header-rec">
          <span className={`rec-dot${running ? '' : ' idle'}`} />
          {headerStatus}
        </span>
        <span className="rec-counter">{stepCount.toLocaleString().padStart(8, ' ')}</span>
      </header>

      {/* ── Full-screen canvas area ── */}
      <div className="canvas-container">
        {built ? (
          <>
            {/* Field canvas (fills container, letter-boxed) */}
            <div className="canvas-letterbox">
              <Canvas2D
                Nx={built.Nx}
                Ny={built.Ny}
                ux={built.ux}
                uy={built.uy}
                solid={built.solid}
                width={canvasSize.w}
                height={canvasSize.h}
                vmax={vmaxLattice}
                view={config.view}
                redrawTick={redrawTick}
              />
            </div>

            {/* Color legend — bottom center overlay */}
            <div className="legend-overlay">
              <ColorLegend
                view={config.view}
                width={Math.min(canvasSize.w, 500)}
                min={legend.min}
                max={legend.max}
                units={legend.units}
              />
            </div>
          </>
        ) : (
          <div className="canvas-placeholder">
            <div>NO SOLVER LOADED</div>
            <div className="hint">Configure domain and geometry, then press RUN.</div>
          </div>
        )}

        {/* ── Overlays (always on top) ── */}

        {/* Settings — top left */}
        <SettingsPanelOverlay
          config={config}
          onChange={setConfig}
          Nx={previewNx}
          Ny={previewNy}
          onSvgMask={setSvgMask}
          onTunnelMask={setTunnelMask}
          hasTunnelMask={tunnelMask !== null}
          configLocked={running}
          lbm={liveLbm}
          charCells={liveCharCells}
          view={config.view}
          onViewChange={setView}
        />

        {/* Sim controls — bottom right */}
        <SimControlsOverlay
          onRun={run}
          onPause={pause}
          onReset={reset}
          running={running}
          hasSolver={built !== null}
          disabled={validationError !== null}
          disabledReason={validationError ?? simulationError ?? undefined}
          severity={liveSafety.overall}
          stepCount={stepCount}
          fps={fps}
          umaxPhys={umaxPhys}
          showResults={showResults}
          onResultsToggle={() => setShowResults((v) => !v)}
        />

        {/* Results panel — slides in from the right */}
        <ResultsPanel
          open={showResults}
          onClose={() => setShowResults(false)}
          history={forceHistory}
          strouhal={strouhal}
          // The built solver's geometry and Re, not the live config: the
          // displayed St belongs to the run that produced it.
          geometryType={built?.config.geometry.type ?? null}
          Re={built?.lbm.Re ?? NaN}
          // Blockage ratio β = D/Ny for the confinement caption on the
          // literature reference — both taken from the built solver.
          charCells={built?.charCells ?? null}
          Ny={built?.Ny ?? null}
        />

        {/* Status bar — bottom overlay */}
        <div className="status-overlay">
          <span>D2Q9 MRT</span>
          <span className="statusbar-sep">|</span>
          <span>τ {tau.toFixed(3)}</span>
          <span className="statusbar-sep">|</span>
          <span>Re {Number.isFinite(re) ? Math.round(re).toLocaleString() : '∞'}</span>
          <span className="statusbar-sep">|</span>
          <span>{Nx} × {Ny}</span>
          {liveSafety.overall !== 'ok' && (
            <>
              <span className="statusbar-sep">|</span>
              <span style={{ color: liveSafety.overall === 'error' ? '#ff2f00' : '#d6a55c' }}>
                {liveSafety.overall === 'error' ? '⚠ UNSTABLE' : '· BORDERLINE'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
