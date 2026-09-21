import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeLBM,
  resolveDomainSize,
  validateSimulationConfig,
} from '../simulation/buildSimulation';
import { geometryCharCells, type SimConfig } from '../types/SimConfig';
import {
  SimulationWorkerClient,
  type VisibilitySource,
  type WorkerPort,
} from '../workers/SimulationWorkerClient';
import type {
  ForceSample,
  FramePayload,
  RunMetadata,
  WorkerToMainMessage,
} from '../workers/simulationProtocol';
import { NO_STROUHAL } from '../workers/simulationProtocol';

export { computeLBM, resolveDomainSize } from '../simulation/buildSimulation';

const FRAME_INTERVAL_MS = 1000 / 30;
const FORCE_HISTORY_LIMIT = 500;

export interface Built extends RunMetadata {
  ux: Float64Array;
  uy: Float64Array;
  solid: Uint8Array;
}

interface FpsCounter {
  frames: number;
  startedAt: number;
}

export function useSimulation(
  config: SimConfig,
  objectMask: Uint8Array | null,
  tunnelMask: Uint8Array | null,
) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [running, setRunning] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [umaxLattice, setUmaxLattice] = useState(0);
  const [redrawTick, setRedrawTick] = useState(0);
  const [forceHistory, setForceHistory] = useState<ForceSample[]>([]);
  const [strouhal, setStrouhal] = useState(NO_STROUHAL);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const clientRef = useRef<SimulationWorkerClient | null>(null);
  const fpsCounterRef = useRef<FpsCounter>({ frames: 0, startedAt: 0 });

  const liveLbm = useMemo(() => computeLBM(config), [config]);
  const liveCharCells = useMemo(
    () => geometryCharCells(config.geometry),
    [config.geometry],
  );
  const validationError = useMemo(
    () => validateSimulationConfig(config, objectMask, tunnelMask),
    [config, objectMask, tunnelMask],
  );
  const { Nx: previewNx, Ny: previewNy } = useMemo(
    () => resolveDomainSize(config),
    [config],
  );

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/simulation.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const applyFrame = (frame: FramePayload, countFps: boolean) => {
      setStepCount(frame.step);
      setUmaxLattice(frame.umax);
      setForceHistory((previous) =>
        [...previous, ...frame.forceSamples].slice(-FORCE_HISTORY_LIMIT),
      );
      setStrouhal(frame.strouhal);
      setRedrawTick((tick) => tick + 1);

      if (!countFps) return;
      const now = performance.now();
      const counter = fpsCounterRef.current;
      if (counter.startedAt === 0) counter.startedAt = now;
      counter.frames++;
      if (now - counter.startedAt >= 500) {
        setFps((counter.frames * 1000) / (now - counter.startedAt));
        counter.frames = 0;
        counter.startedAt = now;
      }
    };

    const handleMessage = (message: WorkerToMainMessage) => {
      switch (message.type) {
        case 'ready':
          setBuilt({
            ...message.metadata,
            ux: message.ux,
            uy: message.uy,
            solid: message.solid,
          });
          setRunning(message.running);
          applyFrame(message, false);
          break;
        case 'frame':
          setBuilt((previous) =>
            previous
              ? { ...previous, ux: message.ux, uy: message.uy }
              : previous,
          );
          applyFrame(message, true);
          break;
        case 'paused':
          setBuilt((previous) =>
            previous
              ? { ...previous, ux: message.ux, uy: message.uy }
              : previous,
          );
          setRunning(false);
          setFps(0);
          applyFrame(message, false);
          break;
        case 'suspended':
          setBuilt((previous) =>
            previous
              ? { ...previous, ux: message.ux, uy: message.uy }
              : previous,
          );
          setFps(0);
          applyFrame(message, false);
          break;
        case 'error':
          setRunning(false);
          setFps(0);
          setSimulationError(`Simulation ${message.phase} error: ${message.message}`);
          break;
      }
    };

    const client = new SimulationWorkerClient(
      worker as unknown as WorkerPort,
      handleMessage,
    );
    client.attachVisibility(document as unknown as VisibilitySource);
    clientRef.current = client;

    return () => {
      client.terminate();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, []);

  const hasBuilt = built !== null;
  useEffect(() => {
    if (!running || !hasBuilt) return;
    let animationFrameId = 0;
    let lastRequestAt = 0;

    const requestFrame = (now: number) => {
      if (now - lastRequestAt >= FRAME_INTERVAL_MS) {
        if (clientRef.current?.requestFrame()) lastRequestAt = now;
      }
      animationFrameId = requestAnimationFrame(requestFrame);
    };

    animationFrameId = requestAnimationFrame(requestFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [running, hasBuilt]);

  const clearRunState = () => {
    setBuilt(null);
    setStepCount(0);
    setUmaxLattice(0);
    setFps(0);
    setForceHistory([]);
    setStrouhal(NO_STROUHAL);
    setSimulationError(null);
    fpsCounterRef.current = { frames: 0, startedAt: 0 };
    setRedrawTick((tick) => tick + 1);
  };

  const run = () => {
    if (validationError) return;
    const client = clientRef.current;
    if (!client) {
      setSimulationError('Simulation Worker is not available.');
      return;
    }
    clearRunState();
    setRunning(true);
    client.run(config, objectMask, tunnelMask);
  };

  const pause = () => clientRef.current?.pause();

  const reset = () => {
    if (!built) return;
    const client = clientRef.current;
    if (!client) {
      setSimulationError('Simulation Worker is not available.');
      return;
    }
    setRunning(false);
    clearRunState();
    client.reset(config, objectMask, tunnelMask);
  };

  const requestRedraw = useCallback(() => {
    setRedrawTick((tick) => tick + 1);
  }, []);

  return {
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
  };
}
