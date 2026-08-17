import React, { useState, useMemo, useEffect } from 'react';

interface VirtualCodeViewerProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

const LINES_PER_CHUNK = 400; // 400 lines per virtualized chunk (~15-20 pages)
const INITIAL_CHUNKS = 2;    // Show first ~800 lines (~30-40 pages) instantly

export const VirtualCodeViewer: React.FC<VirtualCodeViewerProps> = ({
  content,
  isStreaming = false,
  className = '',
}) => {
  const isLarge = content.length > 80 * 1024; // > 80KB

  // Split into line-chunks only when large
  const chunks = useMemo(() => {
    if (!content) return [];
    if (!isLarge) return [content];

    const lines = content.split('\n');
    const result: string[] = [];
    for (let i = 0; i < lines.length; i += LINES_PER_CHUNK) {
      result.push(lines.slice(i, i + LINES_PER_CHUNK).join('\n'));
    }
    return result;
  }, [content, isLarge]);

  const totalChunks = chunks.length;
  const [visibleChunkCount, setVisibleChunkCount] = useState<number>(
    totalChunks > INITIAL_CHUNKS ? INITIAL_CHUNKS : totalChunks
  );

  useEffect(() => {
    setVisibleChunkCount(totalChunks > INITIAL_CHUNKS ? INITIAL_CHUNKS : totalChunks);
  }, [totalChunks]);

  const hasMore = visibleChunkCount < totalChunks;

  const handleLoadMore = () => {
    setVisibleChunkCount(prev => Math.min(prev + 3, totalChunks));
  };

  const handleLoadAll = () => {
    setVisibleChunkCount(totalChunks);
  };

  if (!content) {
    return null;
  }

  // Normal fast render for standard documents
  if (!isLarge) {
    return (
      <pre className={`whitespace-pre-wrap font-mono select-text text-xs leading-relaxed text-slate-300 ${className}`}>
        {content}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle rounded-xs" />
        )}
      </pre>
    );
  }

  const visibleChunks = chunks.slice(0, visibleChunkCount);
  const totalLines = useMemo(() => (content ? content.split('\n').length : 0), [content]);
  const renderedLines = Math.min(visibleChunkCount * LINES_PER_CHUNK, totalLines);

  return (
    <div className="w-full flex flex-col gap-2">
      {visibleChunks.map((chunkText, idx) => (
        <pre
          key={idx}
          className={`whitespace-pre-wrap font-mono select-text text-xs leading-relaxed text-slate-300 ${className}`}
          style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
        >
          {chunkText}
          {idx === visibleChunks.length - 1 && isStreaming && (
            <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle rounded-xs" />
          )}
        </pre>
      ))}

      {hasMore && (
        <div className="mt-4 p-3.5 rounded-xl bg-[#121722]/90 border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="material-symbols-outlined text-blue-400 text-base">code</span>
            <span>
              Book Preview: Showing lines 1–{renderedLines.toLocaleString()} of {totalLines.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadMore}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-all active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">expand_more</span>
              +1,200 Lines
            </button>
            <button
              onClick={handleLoadAll}
              className="btn-primary-glow px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">read_more</span>
              Show Entire Book
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
