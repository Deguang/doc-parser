import { type Format } from '@firecrawl/anydoc-wasm';
import { type ConversionResult } from './documentConverter';
import { type WorkerParseRequest, type WorkerParseResponse } from '../workers/parser.worker';

let workerInstance: Worker | null = null;
let currentRequestId = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (val: { result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }) => void;
    reject: (err: Error) => void;
  }
>();

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../workers/parser.worker.ts', import.meta.url), {
      type: 'module',
    });

    workerInstance.onmessage = (e: MessageEvent<WorkerParseResponse>) => {
      const { id, success, result, stats, error } = e.data;
      const pending = pendingRequests.get(id);
      if (pending) {
        pendingRequests.delete(id);
        if (success && result && stats) {
          pending.resolve({ result, stats });
        } else {
          pending.reject(new Error(error || 'Document parsing failed.'));
        }
      }
    };

    workerInstance.onerror = (err) => {
      console.error('WebWorker runtime error:', err);
      // Reject all pending
      pendingRequests.forEach(({ reject }) => {
        reject(new Error('Background worker encountered an unexpected error.'));
      });
      pendingRequests.clear();
      workerInstance?.terminate();
      workerInstance = null;
    };
  }
  return workerInstance;
}

export function parseDocumentInWorker(
  bytes: Uint8Array,
  format: Format | null,
  filename: string
): Promise<{ result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }> {
  return new Promise((resolve, reject) => {
    const id = `req_${++currentRequestId}_${Date.now()}`;
    pendingRequests.set(id, { resolve, reject });

    try {
      const worker = getWorker();
      const payload: WorkerParseRequest = {
        id,
        bytes,
        format,
        filename,
      };

      // Zero-copy transfer of ArrayBuffer to worker thread
      worker.postMessage(payload, [bytes.buffer]);
    } catch (err: any) {
      pendingRequests.delete(id);
      reject(err);
    }
  });
}
