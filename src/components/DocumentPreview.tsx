import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

interface DocumentPreviewProps {
  name: string;
  content: Uint8Array;
  className?: string;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ name, content, className = '' }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const docxContainerRef = useRef<HTMLDivElement>(null);
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
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(content);
        setTextContent(text);
        setLoading(false);
      } else if (ext === 'docx') {
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = '';
          renderAsync(content.buffer, docxContainerRef.current, undefined, {
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            className: 'docx-rendered',
          })
            .then(() => {
              setLoading(false);
            })
            .catch((err) => {
              console.error('Docx render error:', err);
              setError('Unable to parse Word document visual layout.');
              setLoading(false);
            });
        }
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

  // DOCX Render container
  if (ext === 'docx') {
    return (
      <div className={`w-full h-full relative overflow-auto ${className}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low/80 backdrop-blur-sm z-10">
            <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
            <span className="ml-2 font-label-caps text-xs text-on-surface-variant">Rendering Word Layout...</span>
          </div>
        )}
        {error && (
          <div className="p-4 text-xs text-error bg-error-container/20 rounded border border-error/30 m-4">
            {error}
          </div>
        )}
        <div 
          ref={docxContainerRef} 
          className="docx-container p-4 min-h-full bg-slate-900/40 text-slate-100 rounded-lg text-sm [&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-0 [&_.docx-rendered]:!bg-slate-950/80 [&_.docx-rendered]:!text-slate-100 [&_.docx-rendered]:!border [&_.docx-rendered]:!border-white/10 [&_.docx-rendered]:!shadow-xl [&_.docx-rendered]:!p-8 [&_.docx-rendered]:!rounded-lg"
        />
      </div>
    );
  }

  // PDF Preview
  if (ext === 'pdf' && objectUrl) {
    return (
      <div className={`w-full h-full relative ${className}`}>
        <iframe
          src={`${objectUrl}#toolbar=0&navpanes=0`}
          className="w-full h-full border-none rounded-lg bg-surface-container-low"
          title={`PDF Preview: ${name}`}
        />
      </div>
    );
  }

  // Image Preview
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext) && objectUrl) {
    return (
      <div className={`w-full h-full flex items-center justify-center p-6 bg-surface-container-low/40 rounded-lg overflow-auto ${className}`}>
        <img
          src={objectUrl}
          alt={name}
          className="max-w-full max-h-full object-contain rounded shadow-lg border border-white/10"
        />
      </div>
    );
  }

  // Text / Code / Markdown Preview
  if (textContent !== null) {
    return (
      <div className={`w-full h-full overflow-auto p-4 font-code-md text-xs leading-relaxed text-on-surface/90 bg-surface-container-low/40 rounded-lg ${className}`}>
        <pre className="whitespace-pre-wrap break-words font-mono select-text">
          {textContent}
        </pre>
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
