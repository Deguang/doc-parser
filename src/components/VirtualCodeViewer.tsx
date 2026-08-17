import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

interface VirtualCodeViewerProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

const LINES_PER_CHUNK = 500; // 500 lines per virtualized chunk

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

  // IntersectionObserver-based visibility tracking
  const [visibleSet, setVisibleSet] = useState<Set<number>>(() => new Set([0, 1]));
  const observerRef = useRef<IntersectionObserver | null>(null);
  const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Reset visibility when content changes
  useEffect(() => {
    setVisibleSet(new Set([0, 1]));
  }, [totalChunks]);

  // Setup IntersectionObserver for true virtual rendering
  useEffect(() => {
    if (!isLarge || totalChunks <= 2) return;

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
        rootMargin: '100% 0px', // 1 viewport buffer
        threshold: 0,
      }
    );

    observerRef.current = observer;
    chunkRefs.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [isLarge, totalChunks]);

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

  const totalLines = useMemo(() => (content ? content.split('\n').length : 0), [content]);

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

  return (
    <div className="w-full flex flex-col">
      {chunks.map((chunkText, idx) => {
        const isVisible = visibleSet.has(idx);

        return (
          <div
            key={idx}
            ref={(el) => setChunkRef(idx, el)}
            data-chunk-idx={idx}
            style={{
              minHeight: isVisible ? undefined : '800px',
              contentVisibility: isVisible ? 'visible' : 'auto',
              containIntrinsicSize: 'auto 800px',
            }}
          >
            {isVisible ? (
              <pre
                className={`whitespace-pre-wrap font-mono select-text text-xs leading-relaxed text-slate-300 ${className}`}
              >
                {chunkText}
                {idx === chunks.length - 1 && isStreaming && (
                  <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle rounded-xs" />
                )}
              </pre>
            ) : null}
          </div>
        );
      })}

      {/* Status bar */}
      <div className="mt-4 p-3 rounded-xl bg-[#121722]/90 border border-white/[0.08] flex items-center gap-2 text-xs text-slate-400 font-mono">
        <span className="material-symbols-outlined text-blue-400 text-base">code</span>
        <span>
          {totalLines.toLocaleString()} lines • {(content.length / 1024).toFixed(0)} KB • Virtual scroll active
        </span>
      </div>
    </div>
  );
};
