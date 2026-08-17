import init, { type Format } from '@firecrawl/anydoc-wasm';
import wasmUrl from '@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url';
import { processDocument, type ConversionResult } from './documentConverter';
import { type WorkerParseRequest, type WorkerParseResponse } from '../workers/parser.worker';

let workerInstance: Worker | null = null;
let currentRequestId = 0;
let isWorkerSupported = typeof Worker !== 'undefined';
let isMainThreadWasmInitialized = false;

const pendingRequests = new Map<
  string,
  {
    resolve: (val: { result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }) => void;
    reject: (err: Error) => void;
  }
>();

async function ensureMainThreadWasm() {
  if (!isMainThreadWasmInitialized) {
    await init(wasmUrl);
    isMainThreadWasmInitialized = true;
  }
}

function getWorker(): Worker | null {
  if (!isWorkerSupported) return null;

  if (!workerInstance) {
    try {
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
        console.warn('Worker error encountered, will fallback to main thread:', err);
        // Reject all pending so they can fallback
        pendingRequests.forEach(({ reject }) => {
          reject(new Error('Worker error'));
        });
        pendingRequests.clear();
        workerInstance?.terminate();
        workerInstance = null;
        isWorkerSupported = false;
      };
    } catch (e) {
      console.warn('Worker creation failed, falling back to main thread:', e);
      isWorkerSupported = false;
      workerInstance = null;
    }
  }
  return workerInstance;
}

export async function parseDocumentInWorker(
  bytes: Uint8Array,
  format: Format | null,
  filename: string
): Promise<{ result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }> {
  const worker = getWorker();

  if (worker) {
    try {
      return await new Promise((resolve, reject) => {
        const id = `req_${++currentRequestId}_${Date.now()}`;
        pendingRequests.set(id, { resolve, reject });

        try {
          const payload: WorkerParseRequest = {
            id,
            bytes,
            format,
            filename,
          };
          worker.postMessage(payload);
        } catch (err: any) {
          pendingRequests.delete(id);
          reject(err);
        }
      });
    } catch (workerErr) {
      console.warn('Worker execution failed, executing on main thread:', workerErr);
    }
  }

  // Robust Main-thread fallback
  const startTime = performance.now();
  await ensureMainThreadWasm();
  const result = processDocument(bytes, format);
  const endTime = performance.now();

  return {
    result,
    stats: {
      timeMs: Math.round(endTime - startTime),
      sizeBytes: bytes.length,
    },
  };
}
