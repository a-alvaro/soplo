import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSimulation, computeLBM, resolveDomainSize } from '../../src/simulation/buildSimulation';
import { defaultConfig, type SimConfig } from '../../src/types/SimConfig';
import {
  FORCE_SAMPLE_CADENCE,
  PERTURBATION_STEPS,
  SimulationEngine,
  type SimulationEngineOptions,
} from '../../src/workers/SimulationEngine';
import {
  BATCH_INTERVAL_MS,
  SimulationRuntime,
  type RuntimeEngine,
  type RuntimeTimer,
} from '../../src/workers/SimulationRuntime';
import {
  SimulationWorkerClient,
  type VisibilitySource,
  type WorkerPort,
} from '../../src/workers/SimulationWorkerClient';
import type {
  FramePayload,
  MainToWorkerMessage,
  RunMetadata,
  WorkerToMainMessage,
} from '../../src/workers/simulationProtocol';
import { NO_STROUHAL } from '../../src/workers/simulationProtocol';
import type { StrouhalEstimate } from '../../src/physics/spectral';

function cloneConfig(): SimConfig {
  return structuredClone(defaultConfig);
}

function countSolid(mask: Uint8Array, value: number): number {
  let count = 0;
  for (const cell of mask) if (cell === value) count++;
  return count;
}

function maxAbsDifference(left: Float64Array, right: Float64Array): number {
  expect(left.length).toBe(right.length);
  let maximum = 0;
  for (let index = 0; index < left.length; index++) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  }
  return maximum;
}

class RecordingEstimator {
  readonly values: number[] = [];
  estimateCount = 0;

  push(value: number): void {
    this.values.push(value);
  }

  estimate(): StrouhalEstimate {
    this.estimateCount++;
    return { ...NO_STROUHAL, periods: this.values.length };
  }
}

class FakeTimer implements RuntimeTimer {
  private nowMs = 0;
  private nextId = 1;
  private tasks = new Map<number, { due: number; callback: () => void }>();
  maxPending = 0;

  now(): number {
    return this.nowMs;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { due: this.nowMs + delayMs, callback });
    this.maxPending = Math.max(this.maxPending, this.tasks.size);
    return id;
  }

  clearTimeout(timerId: number): void {
    this.tasks.delete(timerId);
  }

  get pendingCount(): number {
    return this.tasks.size;
  }

  advanceNormally(milliseconds: number): void {
    const target = this.nowMs + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= target)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.nowMs = task.due;
      task.callback();
    }
    this.nowMs = target;
  }

  wakeAfter(milliseconds: number): void {
    this.nowMs += milliseconds;
    const due = [...this.tasks.entries()]
      .filter(([, task]) => task.due <= this.nowMs)
      .sort((left, right) => left[1].due - right[1].due)[0];
    if (!due) return;
    this.tasks.delete(due[0]);
    due[1].callback();
  }
}

class FakeRuntimeEngine implements RuntimeEngine {
  readonly metadata: RunMetadata;
  step = 0;
  throwOnAdvance = false;

  constructor(config: SimConfig) {
    this.metadata = {
      Nx: 1,
      Ny: 1,
      charCells: 1,
      lbm: computeLBM(config),
      config,
    };
  }

  copySolid(): Uint8Array {
    return new Uint8Array(1);
  }

  advanceBatch(steps: number): void {
    if (this.throwOnAdvance) throw new Error('advance failed');
    this.step += steps;
  }

  createFrame(running: boolean): FramePayload {
    return {
      step: this.step,
      ux: new Float64Array([0.07]),
      uy: new Float64Array(1),
      umax: 0.07,
      forceSamples: [],
      strouhal: NO_STROUHAL,
      running,
    };
  }
}

class FakeWorker implements WorkerPort {
  readonly posted: Array<{ message: MainToWorkerMessage; transfer: ArrayBuffer[] }> = [];
  private listeners = new Map<string, Set<EventListener>>();
  terminateCount = 0;

  postMessage(message: MainToWorkerMessage, transfer: ArrayBuffer[] = []): void {
    this.posted.push({ message, transfer });
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminateCount++;
  }

  emit(message: WorkerToMainMessage): void {
    this.dispatch('message', { data: message } as MessageEvent<WorkerToMainMessage>);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  private dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeVisibility implements VisibilitySource {
  visibilityState: 'hidden' | 'visible' | 'prerender' = 'visible';
  private listeners = new Set<EventListener>();

  addEventListener(_type: 'visibilitychange', listener: EventListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: EventListener): void {
    this.listeners.delete(listener);
  }

  setHidden(hidden: boolean): void {
    this.visibilityState = hidden ? 'hidden' : 'visible';
    for (const listener of this.listeners) listener(new Event('visibilitychange'));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

function frameMessage(
  type: 'frame' | 'paused' | 'suspended',
  generation: number,
  requestId = 1,
): WorkerToMainMessage {
  const payload: FramePayload = {
    step: 5,
    ux: new Float64Array(1),
    uy: new Float64Array(1),
    umax: 0.07,
    forceSamples: [],
    strouhal: NO_STROUHAL,
    running: type !== 'paused',
  };
  if (type === 'frame') return { type, generation, requestId, ...payload };
  return { type, generation, ...payload };
}

function readyMessage(generation: number): WorkerToMainMessage {
  const config = cloneConfig();
  return {
    type: 'ready',
    generation,
    metadata: {
      Nx: 1,
      Ny: 1,
      charCells: 1,
      lbm: computeLBM(config),
      config,
    },
    solid: new Uint8Array(1),
    step: 0,
    ux: new Float64Array(1),
    uy: new Float64Array(1),
    umax: 0.07,
    forceSamples: [],
    strouhal: NO_STROUHAL,
    running: false,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 2.0 Web Worker gates', () => {
  it('WK-1: preserves builder domain, metadata and solid encoding', () => {
    const cylinder = buildSimulation(cloneConfig(), null, null);
    expect({ Nx: cylinder.Nx, Ny: cylinder.Ny, charCells: cylinder.charCells }).toEqual({
      Nx: 200,
      Ny: 100,
      charCells: 10,
    });
    expect(countSolid(cylinder.solver.solid, 1)).toBe(400);
    expect(countSolid(cylinder.solver.solid, 2)).toBeGreaterThan(0);

    const nacaConfig = cloneConfig();
    nacaConfig.geometry = {
      ...nacaConfig.geometry,
      type: 'naca',
      resolution: 'medium',
      nacaCode: '2412',
      angleOfAttack: 5,
    };
    const naca = buildSimulation(nacaConfig, null, null);
    expect({ Nx: naca.Nx, Ny: naca.Ny, charCells: naca.charCells }).toEqual({
      Nx: 200,
      Ny: 100,
      charCells: 40,
    });
    expect(countSolid(naca.solver.solid, 2)).toBeGreaterThan(0);

    const importedConfig = cloneConfig();
    importedConfig.domain = {
      mode: 'windtunnel',
      tunnelMode: 'manual',
      widthM: 0.06,
      heightM: 0.03,
    };
    importedConfig.geometry = {
      type: 'svg',
      charLengthM: 0.01,
      resolution: 'low',
      svgPoints: [[0, 0], [12, 4]],
    };
    const importedSize = resolveDomainSize(importedConfig);
    const objectMask = new Uint8Array(importedSize.Nx * importedSize.Ny);
    const objectIndex = 20 * importedSize.Ny + 10;
    objectMask[objectIndex] = 1;
    const imported = buildSimulation(importedConfig, objectMask, null);
    expect(importedSize).toEqual({ Nx: 60, Ny: 30 });
    expect(imported.charCells).toBe(12);
    expect(imported.solver.solid[objectIndex]).toBe(2);
  });

  it('WK-2: matches direct solver stepping after 40 deterministic steps', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const config = cloneConfig();
    const direct = buildSimulation(config, null, null);
    for (let index = 0; index < 40; index++) {
      if (direct.solver.step < PERTURBATION_STEPS) {
        direct.solver.injectPerturbation();
      }
      direct.solver.iterate();
    }

    const engine = new SimulationEngine(config, null, null);
    for (let batch = 0; batch < 8; batch++) engine.advanceBatch(5, batch * 20);
    const state = engine.copySolverState();
    expect(state.step).toBe(40);
    expect(maxAbsDifference(state.f, direct.solver.f)).toBe(0);
    expect(maxAbsDifference(state.rho, direct.solver.rho)).toBe(0);
    expect(maxAbsDifference(state.ux, direct.solver.ux)).toBe(0);
    expect(maxAbsDifference(state.uy, direct.solver.uy)).toBe(0);
    const directForces = direct.solver.computeForces(direct.charCells);
    const engineForces = engine.createFrame(true).forceSamples.at(-1);
    expect(engineForces).toEqual({
      step: 40,
      Cd: directForces.Cd,
      Cl: directForces.Cl,
    });
  });

  it('WK-3: samples forces every 20 steps, caps delivery and feeds Cl', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const estimator = new RecordingEstimator();
    const options: SimulationEngineOptions = { estimator, forceHistoryLimit: 3 };
    const engine = new SimulationEngine(cloneConfig(), null, null, options);
    engine.advanceBatch(80, 1000);
    const frame = engine.createFrame(true);
    expect(frame.forceSamples.map((sample) => sample.step)).toEqual([40, 60, 80]);
    expect(estimator.values).toHaveLength(4);
    expect(estimator.values.slice(-3)).toEqual(
      frame.forceSamples.map((sample) => sample.Cl),
    );
    expect(estimator.estimateCount).toBe(1);

    engine.advanceBatch(FORCE_SAMPLE_CADENCE, 1500);
    expect(estimator.estimateCount).toBe(1);
    engine.advanceBatch(FORCE_SAMPLE_CADENCE, 2000);
    expect(estimator.estimateCount).toBe(2);
  });

  it('WK-4: transfers snapshot copies without detaching live solver arrays', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new SimulationEngine(cloneConfig(), null, null);
    const before = engine.copySolverState();
    const frame = engine.createFrame(true);
    const transferred = structuredClone(frame, {
      transfer: [frame.ux.buffer, frame.uy.buffer],
    });
    expect(frame.ux.byteLength).toBe(0);
    expect(transferred.ux).toEqual(before.ux);
    expect(engine.copySolverState().ux).toEqual(before.ux);
    engine.advanceBatch(5, 20);
    expect(engine.step).toBe(5);

    const worker = new FakeWorker();
    const client = new SimulationWorkerClient(worker, () => undefined);
    const objectMask = new Uint8Array([1, 0, 1]);
    client.run(cloneConfig(), objectMask, null);
    const sent = worker.posted[0].message;
    expect(sent.type).toBe('run');
    if (sent.type !== 'run') throw new Error('Expected run command.');
    expect(sent.objectMask).not.toBe(objectMask);
    expect(sent.objectMask).toEqual(objectMask);
    sent.objectMask![0] = 0;
    expect(objectMask[0]).toBe(1);
    client.terminate();
  });

  it('WK-5: preserves lifecycle state across pause, reset and visibility', () => {
    const timer = new FakeTimer();
    const events: WorkerToMainMessage[] = [];
    const engines: FakeRuntimeEngine[] = [];
    const runtime = new SimulationRuntime(
      (message) => events.push(message),
      timer,
      (config) => {
        const engine = new FakeRuntimeEngine(config);
        engines.push(engine);
        return engine;
      },
    );
    const config = cloneConfig();
    runtime.handle({ type: 'run', generation: 1, config, objectMask: null, tunnelMask: null });
    timer.advanceNormally(BATCH_INTERVAL_MS);
    expect(engines[0].step).toBe(5);

    runtime.handle({ type: 'suspend', generation: 1 });
    timer.advanceNormally(1000);
    expect(engines[0].step).toBe(5);
    runtime.handle({ type: 'resume', generation: 1 });
    timer.advanceNormally(BATCH_INTERVAL_MS);
    expect(engines[0].step).toBe(10);
    runtime.handle({ type: 'pause', generation: 1 });
    timer.advanceNormally(1000);
    expect(engines[0].step).toBe(10);

    runtime.handle({ type: 'reset', generation: 2, config, objectMask: null, tunnelMask: null });
    expect(engines[1].step).toBe(0);
    expect(runtime.currentState).toBe('paused');
    expect(events.at(-1)?.type).toBe('ready');
  });

  it('WK-6: ignores stale generations and mismatched frame responses', () => {
    const worker = new FakeWorker();
    const received: WorkerToMainMessage[] = [];
    const client = new SimulationWorkerClient(worker, (message) => received.push(message));
    const config = cloneConfig();
    const firstGeneration = client.run(config, null, null);
    client.requestFrame();
    const secondGeneration = client.run(config, null, null);
    client.requestFrame();
    expect(client.hasPendingFrame).toBe(true);

    worker.emit(frameMessage('frame', firstGeneration, 1));
    worker.emit(readyMessage(firstGeneration));
    worker.emit(frameMessage('paused', firstGeneration));
    worker.emit(frameMessage('suspended', firstGeneration));
    worker.emit({
      type: 'error',
      generation: firstGeneration,
      phase: 'runtime',
      message: 'stale',
    });
    worker.emit(frameMessage('frame', secondGeneration, 99));
    expect(client.hasPendingFrame).toBe(true);
    expect(client.currentState).toBe('running');
    expect(received).toHaveLength(0);

    worker.emit(frameMessage('frame', secondGeneration, 1));
    expect(client.hasPendingFrame).toBe(false);
    expect(received).toHaveLength(1);
  });

  it('WK-7: terminates each StrictMode-style client exactly once', () => {
    const visibility = new FakeVisibility();
    const firstWorker = new FakeWorker();
    const first = new SimulationWorkerClient(firstWorker, () => undefined);
    first.attachVisibility(visibility);
    expect(visibility.listenerCount).toBe(1);
    first.terminate();
    first.terminate();
    expect(firstWorker.terminateCount).toBe(1);
    expect(firstWorker.listenerCount('message')).toBe(0);
    expect(visibility.listenerCount).toBe(0);

    const secondWorker = new FakeWorker();
    const second = new SimulationWorkerClient(secondWorker, () => undefined);
    second.attachVisibility(visibility);
    expect(secondWorker.terminateCount).toBe(0);
    expect(secondWorker.listenerCount('message')).toBe(1);
    expect(visibility.listenerCount).toBe(1);
    second.terminate();
  });

  it('WK-8: reports build/runtime failures without a fallback loop', () => {
    const timer = new FakeTimer();
    const events: WorkerToMainMessage[] = [];
    const buildRuntime = new SimulationRuntime((message) => events.push(message), timer);
    const invalid = cloneConfig();
    invalid.geometry = { ...invalid.geometry, type: 'svg' };
    buildRuntime.handle({
      type: 'run',
      generation: 1,
      config: invalid,
      objectMask: null,
      tunnelMask: null,
    });
    expect(events.at(-1)).toMatchObject({ type: 'error', phase: 'build' });
    expect(timer.pendingCount).toBe(0);

    const runtime = new SimulationRuntime(
      (message) => events.push(message),
      timer,
      (config) => {
        const engine = new FakeRuntimeEngine(config);
        engine.throwOnAdvance = true;
        return engine;
      },
    );
    runtime.handle({
      type: 'run',
      generation: 2,
      config: cloneConfig(),
      objectMask: null,
      tunnelMask: null,
    });
    timer.advanceNormally(BATCH_INTERVAL_MS);
    expect(events.at(-1)).toMatchObject({ type: 'error', phase: 'runtime' });
    expect(runtime.currentState).toBe('paused');
    expect(timer.pendingCount).toBe(0);
  });

  it('WK-9: paces one batch per interval with no hidden-tab catch-up', () => {
    const timer = new FakeTimer();
    const engine = new FakeRuntimeEngine(cloneConfig());
    const runtime = new SimulationRuntime(
      () => undefined,
      timer,
      () => engine,
    );
    const config = cloneConfig();
    runtime.handle({ type: 'run', generation: 1, config, objectMask: null, tunnelMask: null });
    timer.advanceNormally(BATCH_INTERVAL_MS * 60);
    expect(engine.step).toBe(300);
    expect(timer.maxPending).toBe(1);

    runtime.handle({ type: 'suspend', generation: 1 });
    timer.wakeAfter(60_000);
    expect(engine.step).toBe(300);
    expect(timer.pendingCount).toBe(0);

    runtime.handle({ type: 'resume', generation: 1 });
    timer.wakeAfter(10_000);
    expect(engine.step).toBe(305);
    expect(timer.pendingCount).toBe(1);
    runtime.handle({ type: 'pause', generation: 1 });
    runtime.handle({ type: 'resume', generation: 1 });
    timer.advanceNormally(1000);
    expect(engine.step).toBe(305);
  });
});
