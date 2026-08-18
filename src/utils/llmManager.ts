import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine, type InitProgressReport } from '@mlc-ai/web-llm';
import { type VectorChunk, searchTopK } from './vectorSearch';
import { generateEmbeddings } from './embeddingManager';
import { chunkMarkdown } from './chunker';

let engine: WebWorkerMLCEngine | null = null;
let currentVectorDb: VectorChunk[] | null = null;

export const DEFAULT_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

/**
 * Initializes the WebWorkerMLCEngine.
 */
export async function initLLM(
  onProgress: (progress: InitProgressReport) => void,
  modelId: string = DEFAULT_MODEL
): Promise<WebWorkerMLCEngine> {
  if (engine) return engine;
  
  const worker = new Worker(new URL('../workers/chat.worker.ts', import.meta.url), {
    type: 'module',
  });

  engine = await CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: onProgress,
  });

  return engine as WebWorkerMLCEngine;
}

/**
 * Builds the local Vector DB from Markdown if not already built.
 */
export async function buildLocalVectorDB(
  markdown: string, 
  onProgress: (msg: string) => void
): Promise<void> {
  onProgress("Chunking document...");
  const chunks = chunkMarkdown(markdown);
  
  onProgress(`Vectorizing ${chunks.length} chunks...`);
  const embedInput = chunks.map(c => ({ id: c.id, text: c.content }));
  
  const embeddings = await generateEmbeddings(embedInput, (prog) => {
    if (prog.progress) {
      onProgress(`Downloading Embedding Model: ${Math.round(prog.progress)}%`);
    } else if (prog.current) {
      onProgress(`Embedding chunks: ${prog.current}/${prog.total}`);
    }
  });

  const embedMap = new Map(embeddings.map(e => [e.id, e.embedding]));
  currentVectorDb = chunks.map(c => ({
    id: c.id,
    content: c.content,
    embedding: embedMap.get(c.id) || []
  })).filter(c => c.embedding.length > 0);
  
  onProgress("Vector DB Ready.");
}

/**
 * Performs a RAG query using the local Vector DB and local WebLLM.
 */
export async function chatWithDocument(
  question: string,
  onUpdate: (partialReply: string) => void
): Promise<string> {
  if (!engine) throw new Error("LLM Engine not initialized.");
  if (!currentVectorDb) throw new Error("Vector DB not built. Please index document first.");

  // 1. Embed the user's query
  const queryEmbeddings = await generateEmbeddings([{ id: 'query', text: question }]);
  const queryVec = queryEmbeddings[0].embedding;

  // 2. Search Top 3 relevant chunks
  const topChunks = searchTopK(queryVec, currentVectorDb, 3);
  
  const context = topChunks.map((c, i) => `[Reference ${i+1}]:\n${c.content}`).join('\n\n');

  // 3. Formulate the RAG prompt
  const systemPrompt = `You are a helpful AI assistant. Answer the user's question based strictly on the provided Context. If the answer is not in the context, say so. Keep your answer concise and accurate.
  
Context:
${context}
`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: question }
  ];

  // 4. Stream response from local LLM
  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
  });

  let fullReply = '';
  for await (const chunk of chunks) {
    const text = chunk.choices[0]?.delta.content || '';
    fullReply += text;
    onUpdate(fullReply);
  }

  return fullReply;
}
