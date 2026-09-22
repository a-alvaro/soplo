import { StrouhalEstimator, type StrouhalEstimate } from '../physics/spectral';
import { buildSimulation } from '../simulation/buildSimulation';
import type { SimConfig } from '../types/SimConfig';
import type {
  ForceSample,
  FramePayload,
  RunMetadata,
} from './simulationProtocol';
import { NO_STROUHAL } from './simulationProtocol';

export const STEPS_PER_BATCH = 5;
export const PERTURBATION_STEPS = 200;
export const FORCE_SAMPLE_CADENCE = 20;
export const FORCE_HISTORY_LIMIT = 500;
export const STROUHAL_INTERVAL_MS = 1000;

interface SpectralEstimator {
  push(value: number): void;
  estimate(charCells: number, u0: number): StrouhalEstimate;
}

export interface SimulationEngineOptions {
  forceHistoryLimit?: number;
  estimator?: SpectralEstimator;
}

export interface SolverStateSnapshot {
  step: number;
  f: Float64Array;
  rho: Float64Array;
  ux: Float64Array;
  uy: Float64Array;
  solid: Uint8Array;
}

export class SimulationEngine {
  private readonly built;
  private readonly estimator: SpectralEstimator;
  private readonly forceHistoryLimit: number;
  private pendingForceSamples: ForceSample[] = [];
  private strouhal: StrouhalEstimate = NO_STROUHAL;
  private lastEstimateAt = 0;

  constructor(
    config: SimConfig,
    objectMask: Uint8Array | null,
    tunnelMask: Uint8Array | null,
    options: SimulationEngineOptions = {},
  ) {
    this.built = buildSimulation(config, objectMask, tunnelMask);
    this.estimator = options.estimator ?? new StrouhalEstimator();
    this.forceHistoryLimit = options.forceHistoryLimit ?? FORCE_HISTORY_LIMIT;
  }

  get metadata(): RunMetadata {
    const { Nx, Ny, charCells, lbm, config } = this.built;
    return { Nx, Ny, charCells, lbm, config };
  }

  get step(): number {
    return this.built.solver.step;
  }

  copySolid(): Uint8Array {
    return this.built.solver.solid.slice();
  }

  advanceBatch(steps = STEPS_PER_BATCH, now = 0): void {
    if (!Number.isInteger(steps) || steps <= 0) {
      throw new Error(`SimulationEngine: steps must be a positive integer, got ${steps}`);
    }

    const { solver, charCells, lbm } = this.built;
    let sampled = false;
    for (let index = 0; index < steps; index++) {
      if (solver.step < PERTURBATION_STEPS) solver.injectPerturbation();
      solver.iterate();

      if (solver.step % FORCE_SAMPLE_CADENCE === 0) {
        const forces = solver.computeForces(charCells);
        const sample = { step: solver.step, Cd: forces.Cd, Cl: forces.Cl };
        this.pendingForceSamples.push(sample);
        if (this.pendingForceSamples.length > this.forceHistoryLimit) {
          this.pendingForceSamples.splice(
            0,
            this.pendingForceSamples.length - this.forceHistoryLimit,
          );
        }
        this.estimator.push(forces.Cl);
        sampled = true;
      }
    }

    if (sampled && now - this.lastEstimateAt >= STROUHAL_INTERVAL_MS) {
      this.lastEstimateAt = now;
      this.strouhal = this.estimator.estimate(charCells, lbm.u0);
    }
  }

  createFrame(running: boolean): FramePayload {
    const { solver } = this.built;
    const ux = solver.ux.slice();
    const uy = solver.uy.slice();
    let maxMagnitudeSquared = 0;
    for (let index = 0; index < ux.length; index++) {
      if (solver.solid[index] === 1) continue;
      const magnitudeSquared = ux[index] * ux[index] + uy[index] * uy[index];
      if (magnitudeSquared > maxMagnitudeSquared) {
        maxMagnitudeSquared = magnitudeSquared;
      }
    }

    const forceSamples = this.pendingForceSamples;
    this.pendingForceSamples = [];
    return {
      step: solver.step,
      ux,
      uy,
      umax: Math.sqrt(maxMagnitudeSquared),
      forceSamples,
      strouhal: this.strouhal,
      running,
    };
  }

  copySolverState(): SolverStateSnapshot {
    const { solver } = this.built;
    return {
      step: solver.step,
      f: solver.f.slice(),
      rho: solver.rho.slice(),
      ux: solver.ux.slice(),
      uy: solver.uy.slice(),
      solid: solver.solid.slice(),
    };
  }
}
