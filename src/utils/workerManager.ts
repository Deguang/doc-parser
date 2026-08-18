import { attachMainThreadBlobUrls, type ConversionResult } from './documentConverter';
import { type WorkerParseRequest, type WorkerParseResponse } from './workerTypes';
import type { Format } from '@firecrawl/anydoc-wasm';

export async function parseDocumentInWorker(
  bytes: Uint8Array,
  format: Format | null,
  filename: string
): Promise<{ result: ConversionResult; stats: { timeMs: number; sizeBytes: number } }> {
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

    // Lazy-load WASM only if Worker path fails — keeps main bundle ~100KB lighter
    console.warn('Worker execution failed, falling back to main thread:', workerErr);
    const startTime = performance.now();
    const { processDocument, ensureWasmInit } = await import('./documentConverter');
    await ensureWasmInit();
    
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
}
