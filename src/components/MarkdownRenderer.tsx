import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const totalLength = content?.length || 0;
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Track which chunks are visible via IntersectionObserver
  const [visibleSet, setVisibleSet] = useState<Set<number>>(() => new Set([0, 1]));

  // Incremental parse cache to avoid re-parsing chunks when they come back into view
  const parseCacheRef = useRef<Map<number, string>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Reset on content change
  useEffect(() => {
    parseCacheRef.current.clear();
    setVisibleSet(new Set([0, 1]));
    return () => {
      parseCacheRef.current.clear();
    };
  }, [allRawChunks]);

  // Setup IntersectionObserver for true virtual rendering
  useEffect(() => {
    if (totalChunks <= 2) return; // Small docs don't need virtualization

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleSet(prev => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const idx = Number(entry.target.getAttribute('data-chunk-idx'));
            if (isNaN(idx)) continue;
            if (entry.isIntersecting && !next.has(idx)) {
              next.add(idx);
              changed = true;
            } else if (!entry.isIntersecting && next.has(idx)) {
              next.delete(idx);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      {
        // 1 viewport height buffer above/below for smooth scrolling
        rootMargin: '100% 0px',
        threshold: 0,
      }
    );

    observerRef.current = observer;

    // Observe all chunk placeholders
    chunkRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [totalChunks, allRawChunks]);

  // Callback ref for chunk divs — observe/unobserve as they mount
  const setChunkRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) {
      chunkRefs.current.set(idx, el);
      observerRef.current?.observe(el);
    } else {
      const prev = chunkRefs.current.get(idx);
      if (prev) observerRef.current?.unobserve(prev);
      chunkRefs.current.delete(idx);
    }
  }, []);

  // Parse only chunks that are visible
  const getParsedHtml = useCallback((idx: number): string | null => {
    if (!visibleSet.has(idx)) return null;
    const cache = parseCacheRef.current;
    if (cache.has(idx)) return cache.get(idx)!;
    try {
      const parsed = marked.parse(allRawChunks[idx]) as string;
      cache.set(idx, parsed);
      return parsed;
    } catch (err) {
      console.error('Markdown chunk parse error:', err);
      const fallback = `<pre class="whitespace-pre-wrap font-mono text-xs text-rose-400">${allRawChunks[idx]}</pre>`;
      cache.set(idx, fallback);
      return fallback;
    }
  }, [allRawChunks, visibleSet]);

  if (!content || !content.trim()) {
    return <p className="text-slate-500 text-sm italic">*(No content)*</p>;
  }

  // Small doc: render everything directly
  if (totalChunks <= 2) {
    const allHtml = allRawChunks.map((chunk, i) => {
      const cached = parseCacheRef.current.get(i);
      if (cached) return cached;
      try {
        const parsed = marked.parse(chunk) as string;
        parseCacheRef.current.set(i, parsed);
        return parsed;
      } catch {
        return `<pre class="whitespace-pre-wrap font-mono text-xs text-rose-400">${chunk}</pre>`;
      }
    }).join('');

    return (
      <div
        className={`w-full markdown-body prose prose-invert max-w-none text-slate-200 leading-relaxed text-sm font-body-rt ${className}`}
        dangerouslySetInnerHTML={{ __html: allHtml }}
      />
    );
  }

  return (
    <div ref={containerRef} className={`w-full flex flex-col ${className}`}>
      {allRawChunks.map((_, idx) => {
        const html = getParsedHtml(idx);
        const isVisible = visibleSet.has(idx);

        return (
          <div
            key={idx}
            ref={(el) => setChunkRef(idx, el)}
            data-chunk-idx={idx}
            style={{
              // Reserve space for off-screen chunks to maintain scroll position
              minHeight: isVisible ? undefined : '600px',
              contentVisibility: isVisible ? 'visible' : 'auto',
              containIntrinsicSize: 'auto 600px',
            }}
          >
            {html ? (
              <div
                className="markdown-body prose prose-invert max-w-none text-slate-200 leading-relaxed text-sm font-body-rt"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
