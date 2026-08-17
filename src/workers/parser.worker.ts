import init, { type Format } from '@firecrawl/anydoc-wasm';
import wasmUrl from '@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url';
import { processDocument, type ConversionResult } from '../utils/documentConverter';

let isWasmInitialized = false;

async function ensureInit() {
  if (!isWasmInitialized) {
    await init(wasmUrl);
    isWasmInitialized = true;
  }
}

export interface WorkerParseRequest {
  id: string;
  bytes: Uint8Array;
  format: Format | null;
  filename: string;
}

export interface WorkerParseResponse {
  id: string;
  success: boolean;
  result?: ConversionResult;
  stats?: {
    timeMs: number;
    sizeBytes: number;
  };
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerParseRequest>) => {
  const { id, bytes, format } = e.data;

  try {
    const startTime = performance.now();
    await ensureInit();

    // Run heavy AST extraction and parsing off the main UI thread
    const result = processDocument(bytes, format);
    const endTime = performance.now();

    const response: WorkerParseResponse = {
      id,
      success: true,
      result,
      stats: {
        timeMs: Math.round(endTime - startTime),
        sizeBytes: bytes.length,
      },
    };

    // Collect all asset ArrayBuffers for zero-copy transfer to main thread.
    // Without this, postMessage does a structured clone that DOUBLES the memory
    // (e.g. 2GB of images cloned into another 2GB on the main thread).
    const transferables: ArrayBuffer[] = [];
    if (result.assets) {
      for (const asset of result.assets) {
        if (asset.data && asset.data.buffer) {
          transferables.push(asset.data.buffer);
        }
      }
    }

    self.postMessage(response, transferables);
  } catch (err: any) {
    console.error('Worker parse error:', err);
    let errorMessage = err?.message || 'Failed to parse document.';
    if (errorMessage.includes('memory') || errorMessage.includes('allocation')) {
      errorMessage = 'Out of memory: The file is too large for the WebAssembly memory limit.';
    }

    self.postMessage({
      id,
      success: false,
      error: errorMessage,
    });
  }
};
