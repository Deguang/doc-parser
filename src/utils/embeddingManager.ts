import { type EmbeddingRequest, type EmbeddingProgress } from '../workers/embedding.worker';

let worker: Worker | null = null;

export function getEmbeddingWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

export function generateEmbeddings(
  chunks: { id: string; text: string }[],
  onProgress?: (progress: EmbeddingProgress) => void
): Promise<{ id: string; embedding: number[] }[]> {
  return new Promise((resolve, reject) => {
    const w = getEmbeddingWorker();
    const requestId = `req_${Date.now()}`;

    const handleMessage = (e: MessageEvent<EmbeddingProgress>) => {
      if (e.data.id !== requestId) return;

      if (onProgress) {
        onProgress(e.data);
      }

      if (e.data.status === 'done') {
        w.removeEventListener('message', handleMessage);
        resolve(e.data.result!);
      } else if (e.data.status === 'error') {
        w.removeEventListener('message', handleMessage);
        reject(new Error(e.data.error || 'Embedding generation failed'));
      }
    };

    w.addEventListener('message', handleMessage);

    w.postMessage({
      id: requestId,
      chunks
    } as EmbeddingRequest);
  });
}
