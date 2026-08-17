import React, { useState, useMemo, useEffect } from 'react';
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

const INITIAL_CHUNK_BYTES = 100 * 1024; // 100KB initial safe render (~30-50 pages)
const STEP_CHUNK_BYTES = 150 * 1024;    // 150KB per incremental chunk

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const totalLength = content?.length || 0;
  const isLarge = totalLength > INITIAL_CHUNK_BYTES;

  // Max characters to render currently
  const [renderedLength, setRenderedLength] = useState<number>(
    isLarge ? INITIAL_CHUNK_BYTES : totalLength
  );

  // Reset rendered length if content changes
  useEffect(() => {
    setRenderedLength(totalLength > INITIAL_CHUNK_BYTES ? INITIAL_CHUNK_BYTES : totalLength);
  }, [content, totalLength]);

  const hasMore = renderedLength < totalLength;

  // Slice content up to safe boundary (nearest newline to avoid breaking tags)
  const slicedContent = useMemo(() => {
    if (!content || !content.trim()) {
      return '';
    }
    if (!isLarge || renderedLength >= totalLength) {
      return content;
    }
    
    // Find nearest paragraph break \n\n around renderedLength
    const sliceEnd = content.indexOf('\n\n', renderedLength);
    if (sliceEnd !== -1 && sliceEnd < renderedLength + 4096) {
      return content.slice(0, sliceEnd);
    }
    return content.slice(0, renderedLength);
  }, [content, renderedLength, isLarge, totalLength]);

  // Fast HTML generation
  const html = useMemo(() => {
    if (!slicedContent) {
      return '<p class="text-on-surface-variant italic">*(No content)*</p>';
    }
    try {
      return marked.parse(slicedContent) as string;
    } catch (err) {
      console.error('Markdown parse error:', err);
      return `<pre class="whitespace-pre-wrap font-mono text-xs text-error">${slicedContent}</pre>`;
    }
  }, [slicedContent]);

  const handleLoadMore = () => {
    setRenderedLength(prev => Math.min(prev + STEP_CHUNK_BYTES, totalLength));
  };

  const handleLoadAll = () => {
    setRenderedLength(totalLength);
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <div
        className={`markdown-body prose prose-invert max-w-none text-on-surface leading-relaxed text-sm font-body-rt ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Memory-Safe Progressive Loading Banner */}
      {hasMore && (
        <div className="mt-4 p-4 rounded-xl glass-panel border border-primary/20 bg-surface-container-low/80 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-primary text-base">memory</span>
            <span>
              Large document: Displaying first <strong>{(renderedLength / 1024).toFixed(0)} KB</strong> of{' '}
              <strong>{(totalLength / 1024).toFixed(0)} KB</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadMore}
              className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-xs font-label-caps text-on-surface transition-all active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">expand_more</span>
              Load More (+150KB)
            </button>
            <button
              onClick={handleLoadAll}
              className="btn-primary-glow px-3 py-1.5 rounded-lg text-xs font-label-caps text-on-primary transition-all active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">read_more</span>
              Render All
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
