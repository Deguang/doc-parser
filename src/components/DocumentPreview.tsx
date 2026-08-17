import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

interface DocumentPreviewProps {
  name: string;
  content: Uint8Array;
  className?: string;
  onScrollRatioChange?: (ratio: number) => void;
  externalScrollRatio?: number | null;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ 
  name, 
  content, 
  className = '',
  onScrollRatioChange,
  externalScrollRatio
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(85); // Default to 85% for optimal sidebar fit

  const docxContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isSelfScrollingRef = useRef(false);
  const ext = name.split('.').pop()?.toLowerCase() || '';

  useEffect(() => {
    setLoading(true);
    setError(null);
    setTextContent(null);

    let url: string | null = null;

    try {
      if (ext === 'pdf') {
        const blob = new Blob([content as unknown as BlobPart], { type: 'application/pdf' });
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
        setLoading(false);
      } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext)) {
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const blob = new Blob([content as unknown as BlobPart], { type: mime });
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
        setLoading(false);
      } else if (['txt', 'md', 'json', 'csv', 'html', 'htm', 'xml', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'yaml', 'yml'].includes(ext)) {
        const MAX_PREVIEW_BYTES = 300 * 1024; // 300KB
        const decoder = new TextDecoder('utf-8');
        if (content.length > MAX_PREVIEW_BYTES) {
          const slice = content.subarray(0, MAX_PREVIEW_BYTES);
          const partialText = decoder.decode(slice);
          setTextContent(
            partialText + `\n\n--- [Preview truncated: Showing first 300 KB of ${(content.length / 1024 / 1024).toFixed(2)} MB file. Full content will be parsed into Markdown on the right pane] ---`
          );
        } else {
          const text = decoder.decode(content);
          setTextContent(text);
        }
        setLoading(false);
      } else if (ext === 'docx') {
        const isVeryLargeDoc = content.length > 5 * 1024 * 1024; // > 5MB
        setTimeout(() => {
          if (!docxContainerRef.current) {
            setLoading(false);
            return;
          }
          try {
            docxContainerRef.current.innerHTML = '';
            renderAsync(content.buffer, docxContainerRef.current, undefined, {
              inWrapper: false,
              ignoreWidth: true,
              ignoreHeight: true,
              ignoreFonts: isVeryLargeDoc,
              breakPages: !isVeryLargeDoc, // Avoid heavy page break layout on 100+ page books
              useBase64URL: true,
              className: 'docx-rendered',
            })
              .then(() => {
                setLoading(false);
              })
              .catch((err) => {
                console.warn('Docx preview render warning:', err);
                setError('Full visual preview skipped for large book. Markdown is ready on the right.');
                setLoading(false);
              });
          } catch (e) {
            console.warn('Docx sync preview error:', e);
            setError('Visual Word preview unavailable for this document.');
            setLoading(false);
          }
        }, 50);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Preview error:', err);
      setError(err?.message || 'Preview generation failed.');
      setLoading(false);
    }

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [name, content, ext]);

  // Synchronize incoming external scroll position
  useEffect(() => {
    if (externalScrollRatio !== null && externalScrollRatio !== undefined && scrollContainerRef.current) {
      if (isSelfScrollingRef.current) return;
      const target = scrollContainerRef.current;
      const maxScroll = target.scrollHeight - target.clientHeight;
      if (maxScroll > 0) {
        target.scrollTop = externalScrollRatio * maxScroll;
      }
    }
  }, [externalScrollRatio]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll > 0 && onScrollRatioChange) {
      isSelfScrollingRef.current = true;
      onScrollRatioChange(target.scrollTop / maxScroll);
      setTimeout(() => {
        isSelfScrollingRef.current = false;
      }, 50);
    }
  };

  const ZoomToolbar = () => (
    <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-surface-container-high/90 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 shadow-lg z-20">
      <button
        onClick={() => setZoom(prev => Math.max(30, prev - 15))}
        className="text-outline hover:text-on-surface hover:bg-white/5 p-1 rounded transition-colors"
        title="Zoom Out"
      >
        <span className="material-symbols-outlined text-xs">remove</span>
      </button>
      <span className="text-[11px] font-label-caps font-mono w-10 text-center text-on-surface-variant select-none">
        {zoom}%
      </span>
      <button
        onClick={() => setZoom(prev => Math.min(200, prev + 15))}
        className="text-outline hover:text-on-surface hover:bg-white/5 p-1 rounded transition-colors"
        title="Zoom In"
      >
        <span className="material-symbols-outlined text-xs">add</span>
      </button>
      <div className="w-px h-3 bg-white/10 mx-0.5" />
      <button
        onClick={() => setZoom(100)}
        className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${zoom === 100 ? 'bg-primary/20 text-primary' : 'text-outline hover:text-on-surface hover:bg-white/5'}`}
      >
        100%
      </button>
      <button
        onClick={() => setZoom(75)}
        className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${zoom === 75 ? 'bg-secondary/20 text-secondary' : 'text-outline hover:text-on-surface hover:bg-white/5'}`}
      >
        Fit
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className={`w-full h-full relative flex flex-col items-center justify-center bg-surface-container-low/60 backdrop-blur-sm ${className}`}>
        <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
        <span className="mt-2 font-label-caps text-xs text-on-surface-variant">Loading Document Preview...</span>
      </div>
    );
  }

  // DOCX Render container
  if (ext === 'docx') {
    return (
      <div className={`w-full h-full relative overflow-hidden bg-slate-900/30 flex flex-col ${className}`}>
        {error && (
          <div className="p-4 text-xs text-error bg-error-container/20 rounded border border-error/30 m-4">
            {error}
          </div>
        )}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-grow overflow-auto p-4 flex justify-center"
        >
          <div 
            style={{ 
              transform: `scale(${zoom / 100})`, 
              transformOrigin: 'top center',
              width: `${100 * (100 / zoom)}%`,
              transition: 'transform 0.15s ease-out, width 0.15s ease-out'
            }}
          >
            <div 
              ref={docxContainerRef} 
              className="docx-container w-full max-w-full text-slate-100 text-sm [&_.docx-rendered]:!bg-slate-950/90 [&_.docx-rendered]:!text-slate-100 [&_.docx-rendered]:!border [&_.docx-rendered]:!border-white/10 [&_.docx-rendered]:!shadow-2xl [&_.docx-rendered]:!p-8 [&_.docx-rendered]:!rounded-lg [&_.docx-rendered]:!max-w-full [&_.docx-rendered]:!w-full [&_.docx-rendered]:!box-border [&_section.docx]:!max-w-full [&_section.docx]:!w-full [&_section.docx]:!box-border [&_table]:!max-w-full [&_table]:!w-full"
            />
          </div>
        </div>
        <ZoomToolbar />
      </div>
    );
  }

  // PDF Preview
  if (ext === 'pdf') {
    if (objectUrl) {
      return (
        <div className={`w-full h-full relative bg-surface-container-low ${className}`}>
          <iframe
            src={`${objectUrl}#toolbar=0&navpanes=0&view=FitH`}
            className="w-full h-full border-none rounded-lg"
            title={`PDF Preview: ${name}`}
          />
        </div>
      );
    }
  }

  // Image Preview
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext) && objectUrl) {
    return (
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`w-full h-full relative flex items-center justify-center p-6 bg-surface-container-low/40 rounded-lg overflow-auto ${className}`}
      >
        <div 
          className="flex items-center justify-center transition-transform duration-150 ease-out"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          <img
            src={objectUrl}
            alt={name}
            className="max-w-full max-h-[500px] object-contain rounded shadow-lg border border-white/10"
          />
        </div>
        <ZoomToolbar />
      </div>
    );
  }

  // Text / Code / Markdown Preview
  if (textContent !== null) {
    return (
      <div className={`w-full h-full relative overflow-hidden bg-surface-container-low/40 rounded-lg ${className}`}>
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="w-full h-full overflow-auto p-4 font-code-md text-xs leading-relaxed text-on-surface/90"
        >
          <pre 
            className="whitespace-pre-wrap break-words font-mono select-text transition-transform duration-150 ease-out"
            style={{ 
              transform: `scale(${zoom / 100})`, 
              transformOrigin: 'top left',
              width: `${100 * (100 / zoom)}%`
            }}
          >
            {textContent}
          </pre>
        </div>
        <ZoomToolbar />
      </div>
    );
  }

  // Fallback for PPTX, Excel, or other binary formats
  return (
    <div className={`w-full h-full flex flex-col items-center justify-center p-8 text-center text-on-surface-variant gap-4 bg-surface-container-low/30 rounded-lg ${className}`}>
      <div className="w-16 h-16 rounded-2xl glass-panel flex items-center justify-center border border-primary/20 text-primary">
        <span className="material-symbols-outlined text-3xl">
          {ext === 'pptx' || ext === 'ppt' ? 'slideshow' : ext === 'xlsx' || ext === 'xls' ? 'table_view' : 'description'}
        </span>
      </div>
      <div>
        <div className="font-headline-md text-base text-on-surface font-semibold">{name}</div>
        <div className="font-label-caps text-xs text-outline mt-1">
          {ext.toUpperCase()} File • {(content.length / 1024).toFixed(1)} KB
        </div>
      </div>
      <div className="max-w-xs text-xs font-body-rt text-on-surface-variant/70 leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5">
        Binary source loaded in-memory. Visual preview is processed directly into Markdown on the right pane.
      </div>
    </div>
  );
};
