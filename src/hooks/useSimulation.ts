import { useEffect, useMemo, useRef, useState } from 'react';
import { LBMSolver } from '../lbm/LBMSolver';
import type { ForceSnapshot } from '../components/ResultsPanel';
import {
  geometryCharCells,
  RESOLUTION_CELLS,
  type SimConfig,
} from '../types/SimConfig';
import { physicsToLBM, type LBMParams } from '../physics/physicsToLBM';
import { naca4 } from '../geometry/naca';
import { placePoints, rotatePoints } from '../geometry/rasterize';

const STEPS_PER_FRAME = 5;
const PERTURB_STEPS = 200;

export interface Built {
  solver: LBMSolver;
  Nx: number;
  Ny: number;
  charCells: number;
  lbm: LBMParams;
  config: SimConfig;
}

function dxMeters(cfg: SimConfig): number {
  const D = RESOLUTION_CELLS[cfg.geometry.resolution];
  if (cfg.geometry.type === 'none' || D <= 0) {
    return cfg.domain.widthM > 0 ? cfg.domain.widthM / 400 : 0.001;
  }
  return cfg.geometry.charLengthM / D;
}

export function resolveDomainSize(cfg: SimConfig): { Nx: number; Ny: number } {
  if (cfg.domain.mode === 'windtunnel') {
    const dx = dxMeters(cfg);
    return {
      Nx: Math.max(50, Math.round(cfg.domain.widthM / dx)),
      Ny: Math.max(20, Math.round(cfg.domain.heightM / dx)),
    };
  }
  if (cfg.geometry.type === 'naca') {
    return { Nx: 200, Ny: 100 };
  }
  const D = RESOLUTION_CELLS[cfg.geometry.resolution];
  const geomW = (cfg.geometry.type === 'svg' || cfg.geometry.type === 'dxf') ? 80 : D;
  return {
    Nx: Math.max(200, Math.round(geomW * 20)),
    Ny: 100,
  };
}

export function computeLBM(cfg: SimConfig): LBMParams {
  return physicsToLBM({
    speedMs: cfg.boundaries.speedMs,
    charLengthM: cfg.geometry.charLengthM,
    nuPhysical: cfg.fluid.nuPhysical,
    gridCells: geometryCharCells(cfg.geometry),
  });
}

function buildSolverFromConfig(
  cfg: SimConfig,
  svgMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
): Built {
  const { Nx, Ny } = resolveDomainSize(cfg);
  const lbm = computeLBM(cfg);
  const D = RESOLUTION_CELLS[cfg.geometry.resolution];

  const solver = new LBMSolver({ Nx, Ny, tau: lbm.tau, u0: lbm.u0 });

  const useTunnelSvg =
    cfg.domain.mode === 'windtunnel' &&
    cfg.domain.tunnelMode === 'svg' &&
    tunnelMask &&
    tunnelMask.length === Nx * Ny;

  if (useTunnelSvg) {
    const inverted = new Uint8Array(Nx * Ny);
    for (let i = 0; i < inverted.length; i++) inverted[i] = tunnelMask[i] ? 0 : 1;
    solver.addMask(inverted, 1); // tunnel walls = solid=1, excluded from force calc
  } else {
    solver.addWalls();
  }

  const cx = Math.floor(Nx / 4);
  const cy = Math.floor(Ny / 2) + 3;

  switch (cfg.geometry.type) {
    case 'cylinder':
      solver.addCircle(cx, cy, D / 2);
      break;
    case 'square':
      solver.addSquare(cx, cy, D);
      break;
    case 'naca': {
      const code = cfg.geometry.nacaCode ?? '0012';
      const aoa = ((cfg.geometry.angleOfAttack ?? 0) * Math.PI) / 180;
      let pts = naca4(code);
      pts = placePoints(pts, D, cx, cy);
      pts = rotatePoints(pts, -aoa, cx, cy);
      solver.addPolygon(pts);
      break;
    }
    case 'svg':
    case 'dxf':
      if (svgMask && svgMask.length === Nx * Ny) solver.addMask(svgMask, 2); // object = solid=2
      break;
    case 'none':
      break;
  }

  solver.initialise();
  return { solver, Nx, Ny, charCells: geometryCharCells(cfg.geometry), lbm, config: cfg };
}

function validate(
  cfg: SimConfig,
  svgMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
): string | null {
  if (cfg.boundaries.inletFace === cfg.boundaries.outletFace) {
    return 'Inlet and outlet must be different faces.';
  }
  if (cfg.boundaries.inletFace !== 'left' || cfg.boundaries.outletFace !== 'right') {
    return 'For now inlet must be LEFT and outlet RIGHT.';
  }
  if (cfg.boundaries.speedMs <= 0) return 'Speed must be > 0 m/s.';
  if (cfg.geometry.charLengthM <= 0) return 'Char. length must be > 0 m.';
  if (cfg.fluid.nuPhysical <= 0) return 'ν must be > 0 m²/s.';
  if ((cfg.geometry.type === 'svg' || cfg.geometry.type === 'dxf') && !svgMask) {
    return 'Upload a vector file (.svg / .dxf) or pick another geometry.';
  }
  if (cfg.domain.mode === 'windtunnel') {
    if (cfg.domain.tunnelMode === 'manual') {
      if (cfg.domain.widthM <= 0 || cfg.domain.heightM <= 0) {
        return 'Tunnel width and height must be > 0 m.';
      }
    }
    if (cfg.domain.tunnelMode === 'svg' && !tunnelMask) {
      return 'Upload a tunnel SVG/DXF or switch to MANUAL.';
    }
  }
  return null;
}

/**
 * Owns the simulation lifecycle: solver construction, the rAF stepping loop,
 * force sampling and the run/pause/reset controls. App.tsx stays a pure
 * composition root that renders whatever this hook reports.
 */
export function useSimulation(
  config: SimConfig,
  svgMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [running, setRunning] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [umaxLattice, setUmaxLattice] = useState(0);
  const [redrawTick, setRedrawTick] = useState(0);
  const [forceHistory, setForceHistory] = useState<ForceSnapshot[]>([]);

  const builtRef = useRef<Built | null>(null);
  builtRef.current = built;

  const liveLbm = useMemo(() => computeLBM(config), [config]);
  const liveCharCells = useMemo(() => geometryCharCells(config.geometry), [config.geometry]);

  const validationError = useMemo(
    () => validate(config, svgMask, tunnelMask),
    [config, svgMask, tunnelMask],
  );

  const { Nx: previewNx, Ny: previewNy } = useMemo(() => resolveDomainSize(config), [config]);

  // Animation loop
  useEffect(() => {
    if (!running || !built) return;
    let rafId = 0;
    let frames = 0;
    let lastFpsT = performance.now();

    const tick = () => {
      const b = builtRef.current;
      if (!b) return;
      const { solver } = b;
      for (let s = 0; s < STEPS_PER_FRAME; s++) {
        if (solver.step < PERTURB_STEPS) solver.injectPerturbation();
        solver.iterate();
      }

      let maxMag2 = 0;
      const { ux, uy, solid } = solver;
      for (let i = 0; i < ux.length; i++) {
        if (solid[i] === 1) continue;
        const m2 = ux[i] * ux[i] + uy[i] * uy[i];
        if (m2 > maxMag2) maxMag2 = m2;
      }

      setStepCount(solver.step);
      setUmaxLattice(Math.sqrt(maxMag2));
      setRedrawTick((t) => t + 1);

      // Compute aerodynamic forces every 20 steps (not every frame — expensive)
      if (solver.step % 20 === 0 && solver.step > 0) {
        const forces = solver.computeForces(b.charCells);
        setForceHistory((prev) => {
          const next = [
            ...prev,
            { step: solver.step, Cd: forces.Cd, Cl: forces.Cl },
          ];
          return next.slice(-500); // keep last 500 points
        });
      }

      frames++;
      const now = performance.now();
      if (now - lastFpsT >= 500) {
        setFps((frames * 1000) / (now - lastFpsT));
        frames = 0;
        lastFpsT = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [running, built]);

  const run = () => {
    if (validationError) return;
    const next = buildSolverFromConfig(config, svgMask, tunnelMask);
    setBuilt(next);
    setStepCount(0);
    setUmaxLattice(0);
    setFps(0);
    setForceHistory([]);
    setRedrawTick((t) => t + 1);
    setRunning(true);
  };

  const pause = () => setRunning(false);

  const reset = () => {
    setRunning(false);
    if (!built) return;
    const next = buildSolverFromConfig(config, svgMask, tunnelMask);
    setBuilt(next);
    setStepCount(0);
    setUmaxLattice(0);
    setFps(0);
    setForceHistory([]);
    setRedrawTick((t) => t + 1);
  };

  const requestRedraw = () => setRedrawTick((t) => t + 1);

  return {
    built,
    running,
    stepCount,
    fps,
    umaxLattice,
    forceHistory,
    redrawTick,
    requestRedraw,
    run,
    pause,
    reset,
    validationError,
    liveLbm,
    liveCharCells,
    previewNx,
    previewNy,
  };
}
