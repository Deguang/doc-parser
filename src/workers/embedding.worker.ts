import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import { type EmbeddingRequest, type EmbeddingProgress } from '../utils/workerTypes';

// Skip local check, download directly from HuggingFace Hub
env.allowLocalModels = false;
env.useBrowserCache = true;
// Use HF Mirror for regions where huggingface.co is blocked (e.g. China)
env.remoteHost = 'https://hf-mirror.com';

let embedder: FeatureExtractionPipeline | null = null;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// Throttle mechanism to prevent thousands of messages from freezing the UI thread
let lastProgressTime = 0;

self.onmessage = async (event: MessageEvent<EmbeddingRequest>) => {
  const { id, chunks } = event.data;

  try {
    if (!embedder) {
      self.postMessage({ id, status: 'init' } as EmbeddingProgress);
      embedder = await pipeline('feature-extraction', MODEL_NAME, {
        progress_callback: (info: any) => {
          const now = Date.now();
          // Throttle progress updates to at most 10 FPS (100ms) to avoid React re-render freezes
          if (info.status === 'progress' && (now - lastProgressTime > 100 || info.progress === 100)) {
            lastProgressTime = now;
            self.postMessage({
              id,
              status: 'progress',
              progress: info.progress
            } as EmbeddingProgress);
          }
        }
      });
    }

    self.postMessage({ id, status: 'progress', current: 0, total: chunks.length } as EmbeddingProgress);

    const results = [];
    let lastChunkTime = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Generate embeddings
      const output = await embedder(chunk.text, { pooling: 'mean', normalize: true });
      results.push({
        id: chunk.id,
        embedding: Array.from(output.data) as number[]
      });

      // Report progress every chunk, throttled to 10 FPS
      const now = Date.now();
      if (now - lastChunkTime > 100 || i === chunks.length - 1) {
        lastChunkTime = now;
        self.postMessage({ id, status: 'progress', current: i + 1, total: chunks.length } as EmbeddingProgress);
      }
    }

    self.postMessage({
      id,
      status: 'done',
      embeddings: results
    } as EmbeddingProgress);

  } catch (error: any) {
    self.postMessage({ id, status: 'error', error: error.message } as EmbeddingProgress);
  }
};
