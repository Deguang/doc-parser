import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Configure marked with GitHub Flavored Markdown (GFM)
marked.setOptions({
  gfm: true,
  breaks: true,
});

const CHUNK_SIZE_BYTES = 80 * 1024; // 80KB per virtualized chunk (~30 pages)
const INITIAL_VISIBLE_CHUNKS = 2;   // Show first ~60 pages immediately

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const totalLength = content?.length || 0;

  // Split content into clean paragraph-boundary chunks
  const allRawChunks = useMemo(() => {
    if (!content || !content.trim()) return [];
    if (content.length <= CHUNK_SIZE_BYTES) return [content];

    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      let targetEnd = start + CHUNK_SIZE_BYTES;
      if (targetEnd >= content.length) {
        chunks.push(content.slice(start));
        break;
      }

      // Find nearest paragraph break \n\n to avoid splitting mid-sentence or mid-codeblock
      let splitPos = content.indexOf('\n\n', targetEnd);
      if (splitPos === -1 || splitPos > targetEnd + 8192) {
        splitPos = content.indexOf('\n', targetEnd);
      }
      if (splitPos === -1 || splitPos > targetEnd + 8192) {
        splitPos = targetEnd;
      } else {
        splitPos += 2; // Include \n\n
      }

      chunks.push(content.slice(start, splitPos));
      start = splitPos;
    }

    return chunks;
  }, [content]);

  const totalChunks = allRawChunks.length;
  const isLarge = totalChunks > INITIAL_VISIBLE_CHUNKS;

  const [visibleChunkCount, setVisibleChunkCount] = useState<number>(
    isLarge ? INITIAL_VISIBLE_CHUNKS : totalChunks
  );

  // Incremental parse cache to avoid re-parsing previous chunks when expanding
  const parseCacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    parseCacheRef.current.clear();
    setVisibleChunkCount(allRawChunks.length > INITIAL_VISIBLE_CHUNKS ? INITIAL_VISIBLE_CHUNKS : allRawChunks.length);
    return () => {
      // Release all cached parsed HTML strings on content change or unmount
      parseCacheRef.current.clear();
    };
  }, [allRawChunks]);

  const hasMore = visibleChunkCount < totalChunks;

  // Pre-parse only visible chunks with caching
  const parsedChunks = useMemo(() => {
    const rendered: string[] = [];
    const count = Math.min(visibleChunkCount, allRawChunks.length);
    const cache = parseCacheRef.current;

    for (let i = 0; i < count; i++) {
      if (cache.has(i)) {
        rendered.push(cache.get(i)!);
      } else {
        try {
          const parsed = marked.parse(allRawChunks[i]) as string;
          cache.set(i, parsed);
          rendered.push(parsed);
        } catch (err) {
          console.error('Markdown chunk parse error:', err);
          const fallback = `<pre class="whitespace-pre-wrap font-mono text-xs text-rose-400">${allRawChunks[i]}</pre>`;
          cache.set(i, fallback);
          rendered.push(fallback);
        }
      }
    }
    return rendered;
  }, [allRawChunks, visibleChunkCount]);

  const handleLoadMore = () => {
    setVisibleChunkCount(prev => Math.min(prev + 3, totalChunks));
  };

  const handleLoadAll = () => {
    setVisibleChunkCount(totalChunks);
  };

  if (!content || !content.trim()) {
    return <p className="text-slate-500 text-sm italic">*(No content)*</p>;
  }

  const renderedKB = Math.round((Math.min(visibleChunkCount, totalChunks) / totalChunks) * (totalLength / 1024));
  const totalKB = Math.round(totalLength / 1024);

  return (
    <div className={`w-full flex flex-col gap-2 ${className}`}>
      {/* Chunk-Virtualized DOM Nodes */}
      {parsedChunks.map((chunkHtml, idx) => (
        <div
          key={idx}
          className="markdown-body prose prose-invert max-w-none text-slate-200 leading-relaxed text-sm font-body-rt"
          style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
          dangerouslySetInnerHTML={{ __html: chunkHtml }}
        />
      ))}

      {/* Memory-Safe Progressive Loading Banner */}
      {hasMore && (
        <div className="mt-6 p-4 rounded-xl bg-[#121722]/90 border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-outlined text-blue-400 text-base">auto_stories</span>
            <span>
              Large Book Mode: Displaying <strong>{renderedKB} KB</strong> of <strong>{totalKB} KB</strong> ({visibleChunkCount} of {totalChunks} sections)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadMore}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-all active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">expand_more</span>
              Load More (+3 Sections)
            </button>
            <button
              onClick={handleLoadAll}
              className="btn-primary-glow px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">read_more</span>
              Render All Sections
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
