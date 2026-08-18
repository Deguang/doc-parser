import { pipeline, env } from '@xenova/transformers';

// Skip local check, download directly from HuggingFace Hub
env.allowLocalModels = false;
env.useBrowserCache = true;

let embedder: any = null;

// Use a fast, multilingual or English model. 
// Xenova/all-MiniLM-L6-v2 is standard, Xenova/bge-small-zh-v1.5 is great for Chinese.
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

export interface EmbeddingRequest {
  id: string;
  chunks: { id: string; text: string }[];
}

export interface EmbeddingProgress {
  id: string;
  status: 'init' | 'downloading' | 'processing' | 'done' | 'error';
  progress?: number;
  total?: number;
  current?: number;
  result?: { id: string; embedding: number[] }[];
  error?: string;
  file?: string;
}

self.onmessage = async (event: MessageEvent<EmbeddingRequest>) => {
  const { id, chunks } = event.data;

  try {
    if (!embedder) {
      self.postMessage({ id, status: 'init' } as EmbeddingProgress);
      embedder = await pipeline('feature-extraction', MODEL_NAME, {
        progress_callback: (info: any) => {
          if (info.status === 'progress') {
            self.postMessage({
              id,
              status: 'downloading',
              progress: info.progress,
              file: info.file
            } as EmbeddingProgress);
          }
        }
      });
    }

    self.postMessage({ id, status: 'processing', current: 0, total: chunks.length } as EmbeddingProgress);

    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Generate embeddings
      const output = await embedder(chunk.text, { pooling: 'mean', normalize: true });
      results.push({
        id: chunk.id,
        embedding: Array.from(output.data) as number[]
      });

      // Report progress every chunk
      self.postMessage({ id, status: 'processing', current: i + 1, total: chunks.length } as EmbeddingProgress);
    }

    self.postMessage({
      id,
      status: 'done',
      result: results
    } as EmbeddingProgress);

  } catch (error: any) {
    self.postMessage({ id, status: 'error', error: error.message } as EmbeddingProgress);
  }
};
