import type { SimConfig } from '../types/SimConfig';
import type {
  MainToWorkerMessage,
  SimulationErrorMessage,
  WorkerToMainMessage,
} from './simulationProtocol';

export type ClientState = 'idle' | 'running' | 'paused' | 'suspended';

export interface WorkerPort {
  postMessage(message: MainToWorkerMessage, transfer?: ArrayBuffer[]): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  terminate(): void;
}

export interface VisibilitySource {
  readonly visibilityState: 'hidden' | 'visible' | 'prerender';
  addEventListener(type: 'visibilitychange', listener: EventListener): void;
  removeEventListener(type: 'visibilitychange', listener: EventListener): void;
}

export class SimulationWorkerClient {
  private generation = 0;
  private requestId = 0;
  private pendingRequestId: number | null = null;
  private state: ClientState = 'idle';
  private terminated = false;
  private hidden = false;
  private resumeAfterVisibility = false;
  private visibilitySource: VisibilitySource | null = null;

  private readonly messageListener: EventListener = (event) => {
    this.handleMessage((event as MessageEvent<WorkerToMainMessage>).data);
  };

  private readonly errorListener: EventListener = (event) => {
    const errorEvent = event as ErrorEvent;
    const message: SimulationErrorMessage = {
      type: 'error',
      generation: this.generation,
      phase: 'runtime',
      message: errorEvent.message || 'The simulation Worker crashed.',
    };
    this.state = 'paused';
    this.pendingRequestId = null;
    this.onMessage(message);
  };

  private readonly visibilityListener: EventListener = () => {
    if (this.visibilitySource?.visibilityState === 'hidden') {
      this.suspendForVisibility();
    } else {
      this.resumeFromVisibility();
    }
  };

  constructor(
    private readonly worker: WorkerPort,
    private readonly onMessage: (message: WorkerToMainMessage) => void,
  ) {
    worker.addEventListener('message', this.messageListener);
    worker.addEventListener('error', this.errorListener);
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get currentState(): ClientState {
    return this.state;
  }

  get hasPendingFrame(): boolean {
    return this.pendingRequestId !== null;
  }

  attachVisibility(source: VisibilitySource): void {
    if (this.visibilitySource === source) return;
    this.detachVisibility();
    this.visibilitySource = source;
    this.hidden = source.visibilityState === 'hidden';
    source.addEventListener('visibilitychange', this.visibilityListener);
  }

  run(
    config: SimConfig,
    objectMask: Uint8Array | null,
    tunnelMask: Uint8Array | null,
  ): number {
    const generation = this.beginGeneration('running');
    this.postBuildCommand('run', generation, config, objectMask, tunnelMask);
    if (this.hidden) {
      this.resumeAfterVisibility = true;
      this.state = 'suspended';
      this.post({ type: 'suspend', generation });
    }
    return generation;
  }

  reset(
    config: SimConfig,
    objectMask: Uint8Array | null,
    tunnelMask: Uint8Array | null,
  ): number {
    const generation = this.beginGeneration('paused');
    this.postBuildCommand('reset', generation, config, objectMask, tunnelMask);
    return generation;
  }

  pause(): void {
    if (this.terminated || (this.state !== 'running' && this.state !== 'suspended')) {
      return;
    }
    this.state = 'paused';
    this.resumeAfterVisibility = false;
    this.post({ type: 'pause', generation: this.generation });
  }

  requestFrame(): boolean {
    if (
      this.terminated ||
      this.hidden ||
      this.state !== 'running' ||
      this.pendingRequestId !== null
    ) {
      return false;
    }
    const requestId = ++this.requestId;
    this.pendingRequestId = requestId;
    this.post({
      type: 'request-frame',
      generation: this.generation,
      requestId,
    });
    return true;
  }

  suspendForVisibility(): void {
    this.hidden = true;
    if (this.terminated || this.state !== 'running') return;
    this.state = 'suspended';
    this.resumeAfterVisibility = true;
    this.post({ type: 'suspend', generation: this.generation });
  }

  resumeFromVisibility(): void {
    this.hidden = false;
    if (
      this.terminated ||
      this.state !== 'suspended' ||
      !this.resumeAfterVisibility
    ) {
      return;
    }
    this.resumeAfterVisibility = false;
    this.state = 'running';
    this.post({ type: 'resume', generation: this.generation });
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.resumeAfterVisibility = false;
    this.pendingRequestId = null;
    this.detachVisibility();
    this.worker.removeEventListener('message', this.messageListener);
    this.worker.removeEventListener('error', this.errorListener);
    this.worker.terminate();
    this.state = 'idle';
  }

  private beginGeneration(state: ClientState): number {
    if (this.terminated) throw new Error('Simulation Worker client is terminated.');
    this.generation++;
    this.requestId = 0;
    this.pendingRequestId = null;
    this.resumeAfterVisibility = false;
    this.state = state;
    return this.generation;
  }

  private postBuildCommand(
    type: 'run' | 'reset',
    generation: number,
    config: SimConfig,
    objectMask: Uint8Array | null,
    tunnelMask: Uint8Array | null,
  ): void {
    const objectMaskCopy = objectMask?.slice() ?? null;
    const tunnelMaskCopy = tunnelMask?.slice() ?? null;
    const transfer: ArrayBuffer[] = [];
    if (objectMaskCopy) transfer.push(objectMaskCopy.buffer as ArrayBuffer);
    if (tunnelMaskCopy) transfer.push(tunnelMaskCopy.buffer as ArrayBuffer);
    this.worker.postMessage(
      {
        type,
        generation,
        config,
        objectMask: objectMaskCopy,
        tunnelMask: tunnelMaskCopy,
      },
      transfer,
    );
  }

  private handleMessage(message: WorkerToMainMessage): void {
    if (this.terminated || message.generation !== this.generation) return;
    if (message.type === 'frame') {
      if (message.requestId !== this.pendingRequestId) return;
      this.pendingRequestId = null;
    } else if (message.type === 'paused') {
      this.pendingRequestId = null;
      this.state = 'paused';
      this.resumeAfterVisibility = false;
    } else if (message.type === 'suspended') {
      this.pendingRequestId = null;
    } else if (message.type === 'error') {
      this.pendingRequestId = null;
      this.state = 'paused';
      this.resumeAfterVisibility = false;
    }
    this.onMessage(message);
  }

  private detachVisibility(): void {
    if (!this.visibilitySource) return;
    this.visibilitySource.removeEventListener(
      'visibilitychange',
      this.visibilityListener,
    );
    this.visibilitySource = null;
  }

  private post(message: MainToWorkerMessage): void {
    this.worker.postMessage(message);
  }
}
