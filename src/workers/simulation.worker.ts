import { SimulationRuntime, type RuntimeTimer } from './SimulationRuntime';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './simulationProtocol';

interface WorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MainToWorkerMessage>) => void,
  ): void;
  postMessage(message: WorkerToMainMessage, transfer: ArrayBuffer[]): void;
}

const workerScope = self as unknown as WorkerScope;
const timer: RuntimeTimer = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => self.setTimeout(callback, delayMs),
  clearTimeout: (timerId) => self.clearTimeout(timerId),
};

function transferables(message: WorkerToMainMessage): ArrayBuffer[] {
  if (message.type === 'error') return [];
  const buffers = [message.ux.buffer as ArrayBuffer, message.uy.buffer as ArrayBuffer];
  if (message.type === 'ready') buffers.push(message.solid.buffer as ArrayBuffer);
  return buffers;
}

const runtime = new SimulationRuntime(
  (message) => workerScope.postMessage(message, transferables(message)),
  timer,
);

workerScope.addEventListener('message', (event) => runtime.handle(event.data));
