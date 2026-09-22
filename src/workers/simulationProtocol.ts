import type { LBMParams } from '../physics/physicsToLBM';
import type { StrouhalEstimate } from '../physics/spectral';
import type { SimConfig } from '../types/SimConfig';

export const NO_STROUHAL: StrouhalEstimate = {
  st: null,
  frequency: null,
  periods: 0,
  prominence: 0,
  status: 'filling',
};

export interface ForceSample {
  step: number;
  Cd: number;
  Cl: number;
}

export interface RunMetadata {
  Nx: number;
  Ny: number;
  charCells: number;
  lbm: LBMParams;
  config: SimConfig;
}

export interface FramePayload {
  step: number;
  ux: Float64Array;
  uy: Float64Array;
  umax: number;
  forceSamples: ForceSample[];
  strouhal: StrouhalEstimate;
  running: boolean;
}

interface BuildCommandPayload {
  config: SimConfig;
  objectMask: Uint8Array | null;
  tunnelMask: Uint8Array | null;
}

export type MainToWorkerMessage =
  | ({ type: 'run'; generation: number } & BuildCommandPayload)
  | ({ type: 'reset'; generation: number } & BuildCommandPayload)
  | { type: 'pause'; generation: number }
  | { type: 'suspend'; generation: number }
  | { type: 'resume'; generation: number }
  | { type: 'request-frame'; generation: number; requestId: number };

export interface ReadyMessage extends FramePayload {
  type: 'ready';
  generation: number;
  metadata: RunMetadata;
  solid: Uint8Array;
}

export interface FrameMessage extends FramePayload {
  type: 'frame';
  generation: number;
  requestId: number;
}

export interface PausedMessage extends FramePayload {
  type: 'paused';
  generation: number;
}

export interface SuspendedMessage extends FramePayload {
  type: 'suspended';
  generation: number;
}

export interface SimulationErrorMessage {
  type: 'error';
  generation: number;
  phase: 'build' | 'runtime' | 'protocol';
  message: string;
}

export type WorkerToMainMessage =
  | ReadyMessage
  | FrameMessage
  | PausedMessage
  | SuspendedMessage
  | SimulationErrorMessage;
