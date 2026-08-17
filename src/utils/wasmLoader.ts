import init from '@firecrawl/anydoc-wasm';
import wasmUrl from '@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url';
import { useState, useEffect } from 'react';

export type WasmLoadingStage = 'idle' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface WasmProgressState {
  stage: WasmLoadingStage;
  progress: number; // 0 - 100
  loadedBytes: number;
  totalBytes: number;
  error?: string;
}

type ProgressListener = (state: WasmProgressState) => void;

class WasmManager {
  private static instance: WasmManager;
  private state: WasmProgressState = {
    stage: 'idle',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
  };
  private listeners = new Set<ProgressListener>();
  private initPromise: Promise<void> | null = null;

  public static getInstance(): WasmManager {
    if (!WasmManager.instance) {
      WasmManager.instance = new WasmManager();
    }
    return WasmManager.instance;
  }

  public subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn({ ...this.state }));
  }

  public async load(): Promise<void> {
    if (this.state.stage === 'ready') return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        this.state = {
          stage: 'downloading',
          progress: 0,
          loadedBytes: 0,
          totalBytes: 0,
        };
        this.notify();

        const response = await fetch(wasmUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch WASM binary (${response.status} ${response.statusText})`);
        }

        const contentLengthHeader = response.headers.get('content-length');
        const expectedTotal = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 6753520; // Fallback ~6.75MB
        this.state.totalBytes = expectedTotal;

        if (!response.body) {
          // Fallback if ReadableStream is not available
          const buffer = await response.arrayBuffer();
          this.state.stage = 'compiling';
          this.state.progress = 100;
          this.notify();
          await init(buffer);
          this.state.stage = 'ready';
          this.notify();
          return;
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            const progress = Math.min(99, Math.round((receivedBytes / expectedTotal) * 100));
            this.state.loadedBytes = receivedBytes;
            this.state.progress = progress;
            this.notify();
          }
        }

        // Merge chunks
        this.state.stage = 'compiling';
        this.state.progress = 99;
        this.notify();

        const allBytes = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          allBytes.set(chunk, offset);
          offset += chunk.length;
        }

        // Initialize WASM module with memory buffer
        await init(allBytes);

        this.state = {
          stage: 'ready',
          progress: 100,
          loadedBytes: receivedBytes,
          totalBytes: receivedBytes,
        };
        this.notify();
      } catch (err: any) {
        console.error('WASM loading error:', err);
        this.state = {
          stage: 'error',
          progress: 0,
          loadedBytes: 0,
          totalBytes: 0,
          error: err?.message || 'Failed to initialize WASM engine.',
        };
        this.notify();
        throw err;
      }
    })();

    return this.initPromise;
  }
}

export const wasmManager = WasmManager.getInstance();

export function useWasmLoader() {
  const [state, setState] = useState<WasmProgressState>({
    stage: 'idle',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
  });

  useEffect(() => {
    const unsubscribe = wasmManager.subscribe(setState);
    wasmManager.load().catch(() => {});
    return unsubscribe;
  }, []);

  return state;
}
