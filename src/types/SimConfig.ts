// Configuration for one Soplo simulation run.
//
// SimConfig is in physical units (m, s, m²/s, kg/m³). The conversion to LBM
// lattice units happens at run time via physicsToLBM().
//
// Geometry size in lattice cells is NEVER edited directly by the user — it
// is derived from `charLengthM` (physical) + `resolution` (preset). This
// guarantees the physical scale and the lattice scale stay coherent.

export type DomainMode = 'freeflow' | 'windtunnel';
export type TunnelMode = 'manual' | 'svg';
export type GeometryType =
  | 'cylinder'
  | 'square'
  | 'naca'
  | 'svg'
  | 'dxf'
  | 'none';
export type InletProfile = 'uniform' | 'parabolic';
export type WallFace = 'left' | 'right' | 'top' | 'bottom';
export type FluidPreset = 'air' | 'water' | 'custom';
export type ViewField = 'magnitude' | 'ux' | 'uy' | 'vorticity';
export type Resolution = 'low' | 'medium' | 'high';

/** Cells across the characteristic length for cylinder/square/none. */
export const RESOLUTION_CELLS: Record<Resolution, number> = {
  low: 10,
  medium: 20,
  high: 40,
};

/** Chord cells for NACA profiles — larger because chord is the X dimension. */
export const NACA_CHORD_CELLS: Record<Resolution, number> = {
  low: 20,
  medium: 40,
  high: 80,
};

export interface DomainConfig {
  mode: DomainMode;
  /** Only meaningful when mode === 'windtunnel'. */
  tunnelMode: TunnelMode;
  /** Tunnel length (flow direction) in metres. Manual mode only. */
  widthM: number;
  /** Tunnel cross-section in metres. Manual mode only. */
  heightM: number;
}

export interface GeometryConfig {
  type: GeometryType;
  /** Physical characteristic length in metres (diameter, side, chord, …). */
  charLengthM: number;
  /** Discretisation level — sets cells across the characteristic length. */
  resolution: Resolution;
  // NACA-specific (non-dimensional):
  nacaCode?: string;
  angleOfAttack?: number;
  // Imported geometry (rasterised externally — bbox carried for Re):
  svgPoints?: [number, number][];
}

export interface BoundaryConfig {
  inletFace: WallFace;
  outletFace: WallFace;
  /** Inlet speed in m/s. */
  speedMs: number;
  inletProfile: InletProfile;
}

export interface FluidConfig {
  preset: FluidPreset;
  /** Kinematic viscosity ν in m²/s. */
  nuPhysical: number;
  /** Density ρ in kg/m³. Informational only — LBM is incompressible. */
  rhoPhysical: number;
}

export interface SimConfig {
  domain: DomainConfig;
  geometry: GeometryConfig;
  boundaries: BoundaryConfig;
  fluid: FluidConfig;
  view: ViewField;
}

export const NACA_OPTIONS = [
  '0006',
  '0009',
  '0012',
  '0015',
  '2412',
  '4412',
  '6412',
] as const;

export const FLUID_PRESETS: Record<
  Exclude<FluidPreset, 'custom'>,
  { label: string; nu: number; rho: number }
> = {
  air: { label: 'AIR', nu: 1.5e-5, rho: 1.225 },
  water: { label: 'WATER', nu: 1.0e-6, rho: 998 },
};

export const defaultConfig: SimConfig = {
  domain: {
    mode: 'freeflow',
    tunnelMode: 'manual',
    widthM: 0.5,
    heightM: 0.2,
  },
  geometry: { type: 'cylinder', charLengthM: 0.03, resolution: 'low' },
  boundaries: {
    inletFace: 'left',
    outletFace: 'right',
    speedMs: 0.1,
    inletProfile: 'uniform',
  },
  fluid: {
    preset: 'air',
    nuPhysical: FLUID_PRESETS.air.nu,
    rhoPhysical: FLUID_PRESETS.air.rho,
  },
  view: 'magnitude',
};

/**
 * Characteristic length of the geometry, in lattice cells. Used for Re and
 * the τ-stability check.
 *
 * For procedural geometries (cylinder/square/naca) this is exactly the
 * resolution preset — the geometry is built to occupy that many cells along
 * its full extent (diameter, side, chord). For imported SVG/DXF the value
 * comes from the rasterised bounding box; the resolution preset only affects
 * the offered lattice size.
 */
/**
 * Approximate vertical extent of the geometry in metres — for the tunnel
 * blockage indicator. For NACA we use thickness × chord; for everything
 * else the characteristic length is the height.
 */
export function geometryHeightM(g: GeometryConfig): number {
  if (g.type === 'naca') {
    const code = g.nacaCode ?? '0012';
    const t = parseInt(code.slice(2), 10) / 100;
    return g.charLengthM * Math.max(0.05, t);
  }
  if (g.type === 'none') return 0;
  return g.charLengthM;
}

export function geometryCharCells(g: GeometryConfig): number {
  if (g.type === 'naca') return NACA_CHORD_CELLS[g.resolution];
  if (g.type === 'svg' || g.type === 'dxf') {
    if (!g.svgPoints || g.svgPoints.length === 0) {
      return RESOLUTION_CELLS[g.resolution];
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of g.svgPoints) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return Math.max(maxX - minX, maxY - minY) || 1;
  }
  if (g.type === 'none') return 1;
  return RESOLUTION_CELLS[g.resolution];
}
