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
          this.state = {
            stage: 'ready',
            progress: 100,
            loadedBytes: expectedTotal,
            totalBytes: expectedTotal,
          };
          this.notify();
          return;
        }

        const reader = response.body.getReader();
        let receivedBytes = 0;

        // Drain stream to report accurate download progress to the UI
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            receivedBytes += value.length;
            const progress = Math.min(99, Math.round((receivedBytes / expectedTotal) * 100));
            this.state.loadedBytes = receivedBytes;
            this.state.progress = progress;
            this.notify();
          }
        }

        this.state = {
          stage: 'ready',
          progress: 100,
          loadedBytes: receivedBytes,
          totalBytes: receivedBytes,
        };
        this.notify();
      } catch (err: any) {
        console.error('WASM cache warming error:', err);
        this.state = {
          stage: 'ready', // Non-fatal, workers will load directly via URL
          progress: 100,
          loadedBytes: 6753520,
          totalBytes: 6753520,
        };
        this.notify();
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
