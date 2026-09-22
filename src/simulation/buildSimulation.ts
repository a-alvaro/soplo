import { naca4 } from '../geometry/naca';
import { placePoints, rotatePoints } from '../geometry/rasterize';
import { LBMSolver } from '../lbm/LBMSolver';
import { physicsToLBM, type LBMParams } from '../physics/physicsToLBM';
import {
  geometryCharCells,
  RESOLUTION_CELLS,
  type SimConfig,
} from '../types/SimConfig';

export interface BuiltSimulation {
  solver: LBMSolver;
  Nx: number;
  Ny: number;
  charCells: number;
  lbm: LBMParams;
  config: SimConfig;
}

function dxMeters(config: SimConfig): number {
  const diameter = RESOLUTION_CELLS[config.geometry.resolution];
  if (config.geometry.type === 'none' || diameter <= 0) {
    return config.domain.widthM > 0 ? config.domain.widthM / 400 : 0.001;
  }
  return config.geometry.charLengthM / diameter;
}

export function resolveDomainSize(config: SimConfig): { Nx: number; Ny: number } {
  if (config.domain.mode === 'windtunnel') {
    const dx = dxMeters(config);
    return {
      Nx: Math.max(50, Math.round(config.domain.widthM / dx)),
      Ny: Math.max(20, Math.round(config.domain.heightM / dx)),
    };
  }
  if (config.geometry.type === 'naca') {
    return { Nx: 200, Ny: 100 };
  }
  const diameter = RESOLUTION_CELLS[config.geometry.resolution];
  const geometryWidth =
    config.geometry.type === 'svg' || config.geometry.type === 'dxf'
      ? 80
      : diameter;
  return {
    Nx: Math.max(200, Math.round(geometryWidth * 20)),
    Ny: 100,
  };
}

export function computeLBM(config: SimConfig): LBMParams {
  return physicsToLBM({
    speedMs: config.boundaries.speedMs,
    charLengthM: config.geometry.charLengthM,
    nuPhysical: config.fluid.nuPhysical,
    gridCells: geometryCharCells(config.geometry),
  });
}

export function validateSimulationConfig(
  config: SimConfig,
  objectMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
): string | null {
  if (config.boundaries.inletFace === config.boundaries.outletFace) {
    return 'Inlet and outlet must be different faces.';
  }
  if (
    config.boundaries.inletFace !== 'left' ||
    config.boundaries.outletFace !== 'right'
  ) {
    return 'For now inlet must be LEFT and outlet RIGHT.';
  }
  if (config.boundaries.speedMs <= 0) return 'Speed must be > 0 m/s.';
  if (config.geometry.charLengthM <= 0) return 'Char. length must be > 0 m.';
  if (config.fluid.nuPhysical <= 0) return 'ν must be > 0 m²/s.';
  if (
    (config.geometry.type === 'svg' || config.geometry.type === 'dxf') &&
    !objectMask
  ) {
    return 'Upload a vector file (.svg / .dxf) or pick another geometry.';
  }
  if (config.domain.mode === 'windtunnel') {
    if (
      config.domain.tunnelMode === 'manual' &&
      (config.domain.widthM <= 0 || config.domain.heightM <= 0)
    ) {
      return 'Tunnel width and height must be > 0 m.';
    }
    if (config.domain.tunnelMode === 'svg' && !tunnelMask) {
      return 'Upload a tunnel SVG/DXF or switch to MANUAL.';
    }
  }
  return null;
}

export function buildSimulation(
  config: SimConfig,
  objectMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
): BuiltSimulation {
  const validationError = validateSimulationConfig(config, objectMask, tunnelMask);
  if (validationError) throw new Error(validationError);

  const { Nx, Ny } = resolveDomainSize(config);
  const lbm = computeLBM(config);
  const diameter = RESOLUTION_CELLS[config.geometry.resolution];
  const solver = new LBMSolver({ Nx, Ny, tau: lbm.tau, u0: lbm.u0 });

  const useTunnelMask =
    config.domain.mode === 'windtunnel' &&
    config.domain.tunnelMode === 'svg' &&
    tunnelMask !== null &&
    tunnelMask.length === Nx * Ny;

  if (useTunnelMask) {
    const inverted = new Uint8Array(Nx * Ny);
    for (let index = 0; index < inverted.length; index++) {
      inverted[index] = tunnelMask[index] ? 0 : 1;
    }
    solver.addMask(inverted, 1);
  } else {
    solver.addWalls();
  }

  const centerX = Math.floor(Nx / 4);
  const centerY = Math.floor(Ny / 2) + 3;

  switch (config.geometry.type) {
    case 'cylinder':
      solver.addCircle(centerX, centerY, diameter / 2);
      break;
    case 'square':
      solver.addSquare(centerX, centerY, diameter);
      break;
    case 'naca': {
      const code = config.geometry.nacaCode ?? '0012';
      const angle = ((config.geometry.angleOfAttack ?? 0) * Math.PI) / 180;
      let points = naca4(code);
      points = placePoints(points, diameter, centerX, centerY);
      points = rotatePoints(points, -angle, centerX, centerY);
      solver.addPolygon(points);
      break;
    }
    case 'svg':
    case 'dxf':
      if (objectMask?.length === Nx * Ny) solver.addMask(objectMask, 2);
      break;
    case 'none':
      break;
  }

  solver.initialise();
  return {
    solver,
    Nx,
    Ny,
    charCells: geometryCharCells(config.geometry),
    lbm,
    config,
  };
}
