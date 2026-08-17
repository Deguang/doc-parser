import init, { type Format } from '@firecrawl/anydoc-wasm';
import { processDocument, type ConversionResult } from '../utils/documentConverter';

let isWasmInitialized = false;

async function ensureInit() {
  if (!isWasmInitialized) {
    await init();
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

    self.postMessage(response);
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
