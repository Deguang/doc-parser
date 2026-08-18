import { marked } from 'marked';

export interface SemanticChunk {
  id: string;
  headings: string[]; // Hierarchy of headings, e.g. ["Chapter 1", "Section 1.2"]
  content: string;    // The actual text content
  tokens?: number;    // Estimated token count
}

export interface ChunkingOptions {
  maxChunkSize?: number; // Approximate max characters per chunk (default 1000)
}

/**
 * Semantically chunks markdown text based on Markdown headers.
 * It groups paragraphs under their respective headers and splits them if they exceed maxChunkSize.
 */
export function chunkMarkdown(markdown: string, options: ChunkingOptions = {}): SemanticChunk[] {
  const maxChunkSize = options.maxChunkSize || 1000;
  
  const tokens = marked.lexer(markdown);
  const chunks: SemanticChunk[] = [];
  
  let currentHeadings: { depth: number; text: string }[] = [];
  let currentContent = '';
  
  const flushChunk = () => {
    if (currentContent.trim()) {
      chunks.push({
        id: `chunk_${Math.random().toString(36).substring(2, 11)}`,
        headings: currentHeadings.map(h => h.text),
        content: currentContent.trim(),
        tokens: Math.ceil(currentContent.length / 4), // Rough estimate for LLM tokens (4 chars/token)
      });
      currentContent = '';
    }
  };

  for (const token of tokens) {
    if (token.type === 'heading') {
      // If we encounter a new heading, flush the current chunk
      flushChunk();
      
      // Maintain heading hierarchy
      currentHeadings = currentHeadings.filter(h => h.depth < token.depth);
      currentHeadings.push({ depth: token.depth, text: token.text });
      
      // Include the heading itself in the new chunk content
      currentContent += `${'#'.repeat(token.depth)} ${token.text}\n\n`;
    } else {
      // Append non-heading content
      const rawText = token.raw || '';
      
      // If adding this token exceeds max size, flush first
      if (currentContent.length + rawText.length > maxChunkSize && currentContent.trim().length > 0) {
        flushChunk();
        // Re-inject current headings into the new split chunk for context
        currentContent += currentHeadings.map(h => `${'#'.repeat(h.depth)} ${h.text}\n\n`).join('');
      }
      
      currentContent += rawText;
    }
  }
  
  // Flush final chunk
  flushChunk();
  
  return chunks;
}
