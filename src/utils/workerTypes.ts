import type { Format } from '@firecrawl/anydoc-wasm';
import type { ConversionResult } from './documentConverter';

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

export interface EmbeddingRequest {
  id: string;
  chunks: { id: string; text: string }[];
}

export interface EmbeddingProgress {
  id: string;
  status: 'init' | 'progress' | 'done' | 'error';
  progress?: number;
  current?: number;
  total?: number;
  embeddings?: { id: string; embedding: number[] }[];
  error?: string;
}
