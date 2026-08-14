import { useState, useCallback, useEffect, useRef } from 'react';
import init, { toMarkdownBytes, formatFromExtension } from '@firecrawl/anydoc-wasm';
import MarkStream from 'markstream-react';

export default function Elegant() {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceData, setSourceData] = useState<{name: string, content: Uint8Array} | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parseStats, setParseStats] = useState<{ timeMs: number, sizeBytes: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init().then(() => setIsReady(true)).catch(err => {
      console.error(err);
      setError('Failed to initialize WASM parsing engine.');
    });
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setError('');
    setParseStats(null);
    setSourceData(null);
    setMarkdown('');
    
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setSourceData({ name: file.name, content: bytes });
      
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const format = formatFromExtension(ext) || null;
      
      const startTime = performance.now();
      const text = toMarkdownBytes(bytes, format);
      const endTime = performance.now();
      
      setMarkdown(text);
      setParseStats({
        timeMs: Math.round(endTime - startTime),
        sizeBytes: bytes.length
      });
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('memory') || err.message?.includes('allocation')) {
        setError('Error: File is too large, causing an out-of-memory exception.');
      } else {
        setError(err.message || 'Error parsing document.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(markdown).then(() => {
      alert('Copied to clipboard!');
    });
  };

  const downloadMarkdown = () => {
    if (!markdown || !sourceData) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sourceData.name.replace(/\.[^/.]+$/, "")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetView = () => {
    setSourceData(null);
    setMarkdown('');
    setError('');
    setParseStats(null);
  };

  return (
    <main className="flex-grow flex flex-col items-center px-4 md:px-margin-page py-12 md:py-24 max-w-container-max mx-auto w-full gap-16">
      
      {!sourceData ? (
        <section className="w-full flex flex-col items-center text-center gap-8 max-w-3xl z-10" id="upload-section">
          <div className="space-y-4">
            <h1 className="font-display-lg text-display-lg text-on-surface bg-clip-text text-transparent bg-gradient-to-r from-on-surface to-primary-fixed">
              Transform Documents into Clean Markdown
            </h1>
            <p className="font-body-rt text-body-rt text-on-surface-variant max-w-xl mx-auto">
              Drag and drop your .docx, .pdf, or .txt files. Our local-first engine parses complex formatting into pristine, developer-ready markdown instantly.
            </p>
          </div>

          <div 
            className={`drop-zone relative w-full h-64 md:h-80 glass-panel rounded-xl flex flex-col items-center justify-center border-dashed border-2 transition-colors duration-300 cursor-pointer overflow-hidden group ${isDragging || isProcessing ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary'}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {isProcessing ? (
              <div className="z-10 flex flex-col items-center gap-4 text-primary">
                <span className="material-symbols-outlined text-6xl animate-spin">autorenew</span>
                <div className="font-headline-md text-headline-md">Processing Document...</div>
              </div>
            ) : (
              <>
                <div className="scan-beam"></div>
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></div>
                <div className="z-10 flex flex-col items-center gap-4 text-on-surface-variant group-hover:text-primary transition-colors duration-300">
                  <span className="material-symbols-outlined text-6xl font-light">upload_file</span>
                  <div className="font-headline-md text-headline-md">Drop file here or click to browse</div>
                  <div className="font-label-caps text-label-caps text-outline group-hover:text-primary-fixed-dim transition-colors">Supports .DOCX, .PDF, .PPTX, .TXT</div>
                </div>
              </>
            )}
            <input 
              accept=".docx,.pdf,.pptx,.txt" 
              className="hidden" 
              type="file" 
              ref={fileInputRef}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
          {error && <div className="text-error font-body-rt bg-error-container/20 px-4 py-2 rounded-md border border-error/50">{error}</div>}
          {!isReady && <div className="text-secondary animate-pulse">Initializing WASM Parsing Engine...</div>}
        </section>
      ) : (
        <section className="w-full flex flex-col gap-editor-gap z-10 transition-opacity duration-1000 opacity-100" id="workspace-section">
          <div className="flex items-center justify-between w-full mb-2">
            <div className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">description</span>
              Document Parser
            </div>
            <div className="flex gap-4">
              <button 
                onClick={resetView}
                className="glass-panel text-on-surface-variant hover:text-primary px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span> New Conversion
              </button>
              <button 
                onClick={downloadMarkdown}
                className="btn-primary-glow px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95"
              >
                <span className="material-symbols-outlined text-sm">download</span> Download .md
              </button>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row w-full h-[600px] gap-editor-gap">
            <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50">
                <span className="font-label-caps text-label-caps text-on-surface-variant">{sourceData.name}</span>
                {parseStats && (
                  <span className="text-secondary font-label-caps text-xs">
                    Parsed {(parseStats.sizeBytes / 1024).toFixed(1)} KB in {parseStats.timeMs}ms
                  </span>
                )}
              </div>
              <div className="p-8 overflow-y-auto font-body-rt text-body-rt text-on-surface/80 bg-white/5 flex-grow">
                 <div className="streaming-text">
                    <MarkStream content={markdown} />
                 </div>
              </div>
            </div>

            <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50">
                <span className="font-label-caps text-label-caps text-secondary">Raw Markdown</span>
                <button onClick={copyToClipboard} className="text-outline hover:text-secondary transition-colors" title="Copy to clipboard">
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              </div>
              <div className="p-8 overflow-y-auto font-code-md text-code-md bg-background/80 flex-grow relative text-on-surface-variant whitespace-pre-wrap">
                {markdown}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
