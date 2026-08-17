import { useState, useCallback, useEffect, useRef } from 'react';
import init, { formatFromExtension } from '@firecrawl/anydoc-wasm';
import MarkStream from 'markstream-react';
import { DocumentPreview } from '../components/DocumentPreview';
import { createZipExport, getBase64Markdown, revokeConversionAssets, type ConversionResult } from '../utils/documentConverter';
import { parseDocumentInWorker } from '../utils/workerManager';

function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceData, setSourceData] = useState<{name: string, content: Uint8Array} | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [outputMode, setOutputMode] = useState<'stream' | 'preview'>('stream');
  
  const [streamedContent, setStreamedContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const outputRef = useRef<HTMLDivElement>(null);
  const fullTextRef = useRef<string>('');
  const streamRafId = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const prevResultRef = useRef<ConversionResult | null>(null);

  useEffect(() => {
    init().catch(err => {
      console.error(err);
      setError('Failed to initialize WASM engine.');
    });

    // Magnetic Button Effect
    const handleMouseMove = (e: MouseEvent) => {
      const btn = e.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px) scale(1.05)`;
    };
    
    const handleMouseLeave = (e: MouseEvent) => {
      const btn = e.currentTarget as HTMLElement;
      btn.style.transform = '';
    };

    const btns = document.querySelectorAll('.magnetic-btn');
    btns.forEach(btn => {
      btn.addEventListener('mousemove', handleMouseMove as EventListener);
      btn.addEventListener('mouseleave', handleMouseLeave as EventListener);
    });

    return () => {
      btns.forEach(btn => {
        btn.removeEventListener('mousemove', handleMouseMove as EventListener);
        btn.removeEventListener('mouseleave', handleMouseLeave as EventListener);
      });
      if (streamRafId.current !== null) {
        cancelAnimationFrame(streamRafId.current);
      }
      revokeConversionAssets(prevResultRef.current);
    };
  }, []);

  const streamText = (text: string) => {
    if (streamRafId.current !== null) {
      cancelAnimationFrame(streamRafId.current);
      streamRafId.current = null;
    }
    isCancelledRef.current = false;
    setOutputMode('stream'); // Default to live waterfall stream
    setIsStreaming(true);
    setStreamedContent('');
    fullTextRef.current = text;

    let index = 0;
    // Step size for smooth visual flow (~1.2s - 1.8s total typing waterfall)
    const stepSize = Math.max(12, Math.min(100, Math.floor(text.length / 50)));
    
    const streamNext = () => {
      if (isCancelledRef.current) return;

      if (index < text.length) {
        const nextIndex = Math.min(index + stepSize, text.length);
        setStreamedContent(text.slice(0, nextIndex));
        
        // Auto-follow: scroll down to follow the active rendering line
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
        
        index = nextIndex;
        streamRafId.current = requestAnimationFrame(streamNext);
      } else {
        setIsStreaming(false);
        setIsProcessing(false);
        streamRafId.current = null;
      }
    };
    
    streamRafId.current = requestAnimationFrame(streamNext);
  };

  const skipStreaming = () => {
    isCancelledRef.current = true;
    if (streamRafId.current !== null) {
      cancelAnimationFrame(streamRafId.current);
      streamRafId.current = null;
    }
    setStreamedContent(fullTextRef.current);
    setIsStreaming(false);
    setIsProcessing(false);
    // Keep in Waterfall stream view and return to top
    setTimeout(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = 0;
      }
    }, 0);
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setError('');
    
    // Revoke previous assets
    revokeConversionAssets(prevResultRef.current);
    setConversionResult(null);
    prevResultRef.current = null;
    
    try {
      const buffer = await file.arrayBuffer();
      const bytesForWorker = new Uint8Array(buffer.slice(0));
      const bytesForPreview = new Uint8Array(buffer);
      
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const format = formatFromExtension(ext) || null;
      
      // Execute in Web Worker thread with automatic main thread fallback
      const { result } = await parseDocumentInWorker(bytesForWorker, format, file.name);
      
      prevResultRef.current = result;
      setSourceData({ name: file.name, content: bytesForPreview });
      setConversionResult(result);
      
      // Start adaptive streaming animation
      streamText(result.rawMarkdownWithRelativePaths || result.markdown);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error parsing document.');
      setSourceData(null);
      setConversionResult(null);
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

  const downloadMarkdownBase64 = () => {
    if (!conversionResult || !sourceData) return;
    const base64Text = getBase64Markdown(conversionResult);
    const blob = new Blob([base64Text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sourceData.name.replace(/\.[^/.]+$/, "")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadZip = async () => {
    if (!conversionResult || !sourceData) return;
    setIsDownloading(true);
    try {
      const baseName = sourceData.name.replace(/\.[^/.]+$/, "");
      const zipBlob = await createZipExport(baseName, conversionResult.rawMarkdownWithRelativePaths, conversionResult.assets);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_markdown.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate zip:', err);
      alert('Failed to generate ZIP export.');
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = () => {
    if (!conversionResult) return;
    const textToCopy = getBase64Markdown(conversionResult);
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert('Copied to clipboard!');
    });
  };

  const resetView = () => {
    isCancelledRef.current = true;
    if (streamRafId.current !== null) {
      cancelAnimationFrame(streamRafId.current);
      streamRafId.current = null;
    }
    revokeConversionAssets(prevResultRef.current);
    prevResultRef.current = null;
    setSourceData(null);
    setConversionResult(null);
    setError('');
    setStreamedContent('');
    setIsProcessing(false);
    setIsStreaming(false);
  };

  return (
    <div className="flex-1 flex flex-col w-full h-[calc(100vh-64px)] overflow-hidden antialiased">
      {/* Main Content */}
      <main className="flex-1 flex flex-col w-full h-full min-h-0 px-4 md:px-margin-page py-4 max-w-container-max mx-auto relative overflow-hidden">
        
        {!sourceData ? (
          <section className="w-full flex-1 flex flex-col items-center justify-center text-center gap-8 max-w-3xl mx-auto z-10 overflow-y-auto py-8" id="upload-section">
            <div className="space-y-4 reveal-item reveal-delay-1">
              <h1 className="font-display-lg text-display-lg text-on-surface bg-clip-text text-transparent bg-gradient-to-r from-on-surface to-primary-fixed">
                  Transform Documents into Clean Markdown
              </h1>
              <p className="font-body-rt text-body-rt text-on-surface-variant max-w-xl mx-auto">
                  Drag and drop your .docx, .pdf, or .txt files. Our local-first engine parses complex formatting into pristine, developer-ready markdown instantly.
              </p>
            </div>
            
            <div 
              className={`drop-zone relative w-full h-64 md:h-72 glass-panel ${isDragging ? 'border-primary' : 'glass-panel-hover border-outline-variant'} rounded-xl flex flex-col items-center justify-center border-dashed border-2 hover:border-primary transition-colors duration-300 cursor-pointer overflow-hidden group reveal-item reveal-delay-2`}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            >
              <div className="scan-beam"></div>
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></div>
              <div className="z-10 flex flex-col items-center gap-4 text-on-surface-variant group-hover:text-primary transition-colors duration-300">
                <span className={`material-symbols-outlined text-6xl font-light upload-icon ${isProcessing ? 'magic-pulse' : ''}`} style={{fontVariationSettings: "'FILL' 0"}}>
                  {isProcessing ? 'autorenew' : 'upload_file'}
                </span>
                <div className="font-headline-md text-headline-md">{isProcessing ? 'Processing...' : 'Drop file here or click to browse'}</div>
                <div className="font-label-caps text-label-caps text-outline group-hover:text-primary-fixed-dim transition-colors">Supports .DOCX, .PDF, .TXT</div>
              </div>
              <input accept=".docx,.pdf,.txt" className="hidden" id="file-input" type="file" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className="absolute inset-0 z-20" onClick={() => document.getElementById('file-input')?.click()}></div>
            </div>
            {error && <div className="text-error bg-error-container/20 px-4 py-2 rounded-lg border border-error/30">{error}</div>}
          </section>
        ) : (
          <section className="w-full flex-1 flex flex-col min-h-0 gap-3 z-10 transition-opacity duration-1000 opacity-100 overflow-hidden" id="workspace-section">
            <div className="flex items-center justify-between w-full shrink-0">
              <div className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">description</span>
                Document Parser
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {conversionResult && conversionResult.assets.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs font-label-caps">
                    <span className="material-symbols-outlined text-sm">photo_library</span>
                    {conversionResult.assets.length} Image{conversionResult.assets.length > 1 ? 's' : ''}
                  </div>
                )}
                <button className="glass-panel text-on-surface-variant hover:text-primary px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95 magnetic-btn" onClick={resetView}>
                  <span className="material-symbols-outlined text-sm">restart_alt</span> New
                </button>
                <button 
                  onClick={downloadMarkdownBase64} 
                  className="glass-panel text-on-surface hover:text-primary px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95 border-primary/30 magnetic-btn"
                  title="Download single Markdown file with Base64 embedded images"
                >
                  <span className="material-symbols-outlined text-sm text-primary">description</span> .md
                </button>
                <button 
                  onClick={downloadZip} 
                  disabled={isDownloading}
                  className="btn-primary-glow px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95 magnetic-btn"
                  title="Download ZIP with Markdown and separate images/ folder"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isDownloading ? 'progress_activity' : 'folder_zip'}
                  </span> 
                  {isDownloading ? 'Zipping...' : '.zip'}
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row w-full min-h-0 gap-4 overflow-hidden relative">
              {/* Input Pane */}
              <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden relative border border-white/10">
                <div className="px-4 py-2.5 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-label-caps text-xs text-primary font-bold">Source File</span>
                    <span className="text-on-surface-variant text-xs truncate max-w-[180px]" title={sourceData.name}>
                      {sourceData.name}
                    </span>
                  </div>
                  <span className="text-secondary font-label-caps text-[11px]">
                    {(sourceData.content.length / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="flex-grow overflow-hidden relative flex flex-col bg-white/5" id="input-viewer">
                  <DocumentPreview name={sourceData.name} content={sourceData.content} className="flex-grow" />
                  {isStreaming && <div className="doc-scanner" style={{opacity: 1}}></div>}
                </div>
              </div>
              
              {/* Output Pane */}
              <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden border border-white/10">
                <div className="px-4 py-2.5 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50 gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-label-caps text-xs text-secondary mr-1">Markdown Output</span>
                    <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5 text-[11px] font-label-caps">
                      <button
                        onClick={() => setOutputMode('stream')}
                        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                          outputMode === 'stream'
                            ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">waterfall_chart</span>
                        Waterfall
                      </button>
                      <button
                        onClick={() => setOutputMode('preview')}
                        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                          outputMode === 'preview'
                            ? 'bg-secondary/20 text-secondary border border-secondary/30 shadow-sm font-semibold'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">preview</span>
                        Rendered
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isStreaming && outputMode === 'stream' && (
                      <button
                        onClick={skipStreaming}
                        className="px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary text-[11px] font-label-caps flex items-center gap-1 transition-all active:scale-95"
                        title="Show full markdown instantly"
                      >
                        <span className="material-symbols-outlined text-xs">fast_forward</span>
                        Skip
                      </button>
                    )}
                    <button onClick={copyToClipboard} className="text-outline hover:text-secondary transition-colors p-1" title="Copy to clipboard">
                      <span className="material-symbols-outlined text-sm">content_copy</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-6 overflow-y-auto font-body-rt text-body-rt flex-grow relative bg-background/80" id="markdown-output" ref={outputRef}>
                  {outputMode === 'preview' ? (
                    <div className="streaming-text text-on-surface/90 markstream-container w-full">
                      <MarkStream 
                        content={conversionResult?.markdown || '*(No content)*'} 
                        isDark={true} 
                        final={true} 
                      />
                    </div>
                  ) : (
                    <div className="font-code-md text-code-md text-on-surface-variant">
                      {(isProcessing && !streamedContent) && (
                        <span className="text-outline animate-pulse inline-block mb-4">Initializing Lumina-v2 Engine...</span>
                      )}
                      <pre className="whitespace-pre-wrap font-mono select-text font-code-md leading-relaxed">
                        {streamedContent}
                        {isStreaming && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle shadow-[0_0_8px_var(--primary)] rounded-xs" />
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-lowest/90 border-t border-white/5 full-width py-2 shrink-0">
        <div className="flex flex-row justify-between items-center px-4 md:px-margin-page py-2 w-full max-w-container-max mx-auto">
          <div className="font-label-caps text-xs text-on-surface-variant">
            © 2024 Lumina Systems. All transformations local-only.
          </div>
          <div className="flex gap-6 font-label-caps text-xs">
            <span className="text-outline">Engine: Lumina-v2 (WASM)</span>
            <span className="text-outline">Privacy: 100% Local</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
