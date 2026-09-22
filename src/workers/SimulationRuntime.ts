import type { SimConfig } from '../types/SimConfig';
import { SimulationEngine, STEPS_PER_BATCH } from './SimulationEngine';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './simulationProtocol';

export const BATCH_INTERVAL_MS = 1000 / 60;

export interface RuntimeTimer {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

export type RuntimeState = 'idle' | 'running' | 'paused' | 'suspended';

export interface RuntimeEngine {
  readonly metadata: SimulationEngine['metadata'];
  readonly step: number;
  copySolid(): Uint8Array;
  advanceBatch(steps: number, now: number): void;
  createFrame(running: boolean): ReturnType<SimulationEngine['createFrame']>;
}

export type RuntimeEngineFactory = (
  config: SimConfig,
  objectMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
) => RuntimeEngine;

export class SimulationRuntime {
  private engine: RuntimeEngine | null = null;
  private generation = 0;
  private timerId: number | null = null;
  private state: RuntimeState = 'idle';

  constructor(
    private readonly emit: (message: WorkerToMainMessage) => void,
    private readonly timer: RuntimeTimer,
    private readonly createEngine: RuntimeEngineFactory = (
      config,
      objectMask,
      tunnelMask,
    ) => new SimulationEngine(config, objectMask, tunnelMask),
  ) {}

  get currentState(): RuntimeState {
    return this.state;
  }

  get hasScheduledBatch(): boolean {
    return this.timerId !== null;
  }

  handle(message: MainToWorkerMessage): void {
    try {
      switch (message.type) {
        case 'run':
          this.rebuild(message, true);
          break;
        case 'reset':
          this.rebuild(message, false);
          break;
        case 'pause':
          this.pause(message.generation);
          break;
        case 'suspend':
          this.suspend(message.generation);
          break;
        case 'resume':
          this.resume(message.generation);
          break;
        case 'request-frame':
          this.publishFrame(message.generation, message.requestId);
          break;
      }
    } catch (error) {
      const phase = message.type === 'run' || message.type === 'reset'
        ? 'build'
        : 'runtime';
      this.fail(message.generation, phase, error);
    }
  }

  dispose(): void {
    this.cancelTimer();
    this.engine = null;
    this.state = 'idle';
  }

  private rebuild(
    message: Extract<MainToWorkerMessage, { type: 'run' | 'reset' }>,
    running: boolean,
  ): void {
    this.cancelTimer();
    this.generation = message.generation;
    this.engine = this.createEngine(
      message.config,
      message.objectMask,
      message.tunnelMask,
    );
    this.state = running ? 'running' : 'paused';
    const frame = this.engine.createFrame(running);
    this.emit({
      type: 'ready',
      generation: this.generation,
      metadata: this.engine.metadata,
      solid: this.engine.copySolid(),
      ...frame,
    });
    if (running) this.scheduleNextBatch();
  }

  private pause(generation: number): void {
    if (!this.isCurrent(generation) || this.state === 'paused') return;
    if (this.state !== 'running' && this.state !== 'suspended') return;
    this.cancelTimer();
    this.state = 'paused';
    this.emit({
      type: 'paused',
      generation,
      ...this.requireEngine().createFrame(false),
    });
  }

  private suspend(generation: number): void {
    if (!this.isCurrent(generation) || this.state !== 'running') return;
    this.cancelTimer();
    this.state = 'suspended';
    this.emit({
      type: 'suspended',
      generation,
      ...this.requireEngine().createFrame(true),
    });
  }

  private resume(generation: number): void {
    if (!this.isCurrent(generation) || this.state !== 'suspended') return;
    this.state = 'running';
    this.scheduleNextBatch();
  }

  private publishFrame(generation: number, requestId: number): void {
    if (!this.isCurrent(generation)) return;
    this.emit({
      type: 'frame',
      generation,
      requestId,
      ...this.requireEngine().createFrame(this.state === 'running'),
    });
  }

  private scheduleNextBatch(): void {
    if (this.state !== 'running' || this.timerId !== null) return;
    this.timerId = this.timer.setTimeout(() => {
      this.timerId = null;
      if (this.state !== 'running') return;
      try {
        this.requireEngine().advanceBatch(STEPS_PER_BATCH, this.timer.now());
        this.scheduleNextBatch();
      } catch (error) {
        this.fail(this.generation, 'runtime', error);
      }
    }, BATCH_INTERVAL_MS);
  }

  private fail(
    generation: number,
    phase: 'build' | 'runtime' | 'protocol',
    error: unknown,
  ): void {
    this.cancelTimer();
    this.state = 'paused';
    this.emit({
      type: 'error',
      generation,
      phase,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  private cancelTimer(): void {
    if (this.timerId === null) return;
    this.timer.clearTimeout(this.timerId);
    this.timerId = null;
  }

  private isCurrent(generation: number): boolean {
    return this.engine !== null && generation === this.generation;
  }

  private requireEngine(): RuntimeEngine {
    if (!this.engine) throw new Error('Simulation runtime has no active engine.');
    return this.engine;
  }
}
