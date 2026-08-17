import init, { type Format } from '@firecrawl/anydoc-wasm';
import wasmUrl from '@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url';
import { processDocument, attachMainThreadBlobUrls, type ConversionResult } from './documentConverter';
import { type WorkerParseRequest, type WorkerParseResponse } from '../workers/parser.worker';

let isMainThreadWasmInitialized = false;

async function ensureMainThreadWasm() {
  if (!isMainThreadWasmInitialized) {
    await init(wasmUrl);
    isMainThreadWasmInitialized = true;
  }
}

export async function parseDocumentInWorker(
  bytes: Uint8Array,
  format: Format | null,
  filename: string
): Promise<{ result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }> {
  const isWorkerSupported = typeof Worker !== 'undefined';

  if (isWorkerSupported) {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/parser.worker.ts', import.meta.url), {
        type: 'module',
      });

      const rawResult = await new Promise<{ result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }>((resolve, reject) => {
        const id = `req_${Date.now()}`;

        worker!.onmessage = (e: MessageEvent<WorkerParseResponse>) => {
          const { success, result, stats, error } = e.data;
          if (success && result && stats) {
            resolve({ result, stats });
          } else {
            reject(new Error(error || 'Document parsing failed.'));
          }
        };

        worker!.onerror = (err) => {
          reject(err);
        };

        const payload: WorkerParseRequest = {
          id,
          bytes,
          format,
          filename,
        };
        worker!.postMessage(payload, [bytes.buffer]);
      });

      // Terminate worker immediately: this forces OS to instantly reclaim all WebAssembly linear memory!
      worker.terminate();
      worker = null;

      // Attach fresh, revokable Blob URLs strictly on the main thread
      attachMainThreadBlobUrls(rawResult.result);

      return rawResult;
    } catch (workerErr) {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      console.warn('Worker execution failed, executing on main thread:', workerErr);
    }
  }

  // Robust Main-thread fallback
  const startTime = performance.now();
  await ensureMainThreadWasm();
  const result = processDocument(bytes, format);
  attachMainThreadBlobUrls(result);
  const endTime = performance.now();

  return {
    result,
    stats: {
      timeMs: Math.round(endTime - startTime),
      sizeBytes: bytes.length,
    },
  };
}
