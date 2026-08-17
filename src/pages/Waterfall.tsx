import { useState, useCallback, useEffect, useRef } from 'react';
import init, { formatFromExtension } from '@firecrawl/anydoc-wasm';
import MarkStream from 'markstream-react';
import { DocumentPreview } from '../components/DocumentPreview';
import { createZipExport, getBase64Markdown, revokeConversionAssets, type ConversionResult } from '../utils/documentConverter';
import { parseDocumentInWorker } from '../utils/workerManager';

function App() {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceData, setSourceData] = useState<{name: string, content: Uint8Array} | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [outputMode, setOutputMode] = useState<'stream' | 'preview'>('preview');
  
  const [streamedContent, setStreamedContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const outputRef = useRef<HTMLDivElement>(null);
  const fullTextRef = useRef<string>('');
  const streamRafId = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const prevResultRef = useRef<ConversionResult | null>(null);

  useEffect(() => {
    init().then(() => setIsReady(true)).catch(err => {
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
    setIsStreaming(true);
    setStreamedContent('');
    fullTextRef.current = text;

    let index = 0;
    // Adapt step size to complete fluidly in 0.5s - 0.8s
    const stepSize = Math.max(20, Math.min(200, Math.floor(text.length / 35)));
    
    const streamNext = () => {
      if (isCancelledRef.current) return;

      if (index < text.length) {
        const nextIndex = Math.min(index + stepSize, text.length);
        setStreamedContent(text.slice(0, nextIndex));
        
        index = nextIndex;
        streamRafId.current = requestAnimationFrame(streamNext);
      } else {
        setIsStreaming(false);
        setIsProcessing(false);
        streamRafId.current = null;
        if (outputRef.current) {
          outputRef.current.scrollTop = 0;
        }
      }
    };
    
    streamRafId.current = requestAnimationFrame(streamNext);
  };

  // Reset scroll to top whenever mode changes or new document is loaded
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = 0;
    }
  }, [outputMode, conversionResult]);

  const skipStreaming = () => {
    isCancelledRef.current = true;
    if (streamRafId.current !== null) {
      cancelAnimationFrame(streamRafId.current);
      streamRafId.current = null;
    }
    setStreamedContent(fullTextRef.current);
    setIsStreaming(false);
    setIsProcessing(false);
    setOutputMode('preview'); // Instant switch to rich rendered preview
    if (outputRef.current) {
      outputRef.current.scrollTop = 0;
    }
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
    <div className="antialiased min-h-screen flex flex-col relative w-full overflow-hidden">
      <div className="aurora-bg"></div>
      <div className="ambient-bg"></div>
      
      {/* TopNavBar */}
      <header className="bg-surface/50 backdrop-blur-xl border-b border-white/10 shadow-sm docked full-width top-0 sticky z-50">
        <div className="flex justify-between items-center w-full px-4 md:px-margin-page py-4 max-w-container-max mx-auto">
          <div className="flex items-center gap-2">
            <span className="font-display-lg text-headline-md text-primary tracking-tighter cursor-pointer">LuminaConvert</span>
          </div>
          <nav className="hidden md:flex gap-8 items-center font-label-caps text-label-caps">
            <a className="text-primary font-bold border-b-2 border-primary pb-1 transition-all duration-200 active:scale-95" href="#">How it works</a>
            <a className="text-on-surface-variant font-medium hover:text-secondary transition-colors duration-300 transition-all duration-200 active:scale-95" href="#">Pricing</a>
            <a className="text-on-surface-variant font-medium hover:text-secondary transition-colors duration-300 transition-all duration-200 active:scale-95" href="#">API</a>
          </nav>
          <button className="btn-primary-glow font-label-caps text-label-caps px-4 py-2 rounded-lg transition-all duration-200 active:scale-95 hidden md:block magnetic-btn" disabled={!isReady}>
            {isReady ? 'Quick Start' : 'Initializing...'}
          </button>
          <button className="md:hidden text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center px-4 md:px-margin-page py-12 md:py-24 max-w-container-max mx-auto w-full gap-16 relative">
        
        {!sourceData ? (
          <section className="w-full flex flex-col items-center text-center gap-8 max-w-3xl z-10" id="upload-section">
            <div className="space-y-4 reveal-item reveal-delay-1">
              <h1 className="font-display-lg text-display-lg text-on-surface bg-clip-text text-transparent bg-gradient-to-r from-on-surface to-primary-fixed">
                  Transform Documents into Clean Markdown
              </h1>
              <p className="font-body-rt text-body-rt text-on-surface-variant max-w-xl mx-auto">
                  Drag and drop your .docx, .pdf, or .txt files. Our local-first engine parses complex formatting into pristine, developer-ready markdown instantly.
              </p>
            </div>
            
            <div 
              className={`drop-zone relative w-full h-64 md:h-80 glass-panel ${isDragging ? 'border-primary' : 'glass-panel-hover border-outline-variant'} rounded-xl flex flex-col items-center justify-center border-dashed border-2 hover:border-primary transition-colors duration-300 cursor-pointer overflow-hidden group reveal-item reveal-delay-2`}
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
            {error && <div className="text-error">{error}</div>}
          </section>
        ) : (
          <section className="w-full flex-col gap-editor-gap z-10 transition-opacity duration-1000 opacity-100 flex" id="workspace-section">
            <div className="flex items-center justify-between w-full mb-2">
              <div className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">description</span>
                Document Parser
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                {conversionResult && conversionResult.assets.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs font-label-caps">
                    <span className="material-symbols-outlined text-sm">photo_library</span>
                    {conversionResult.assets.length} Image{conversionResult.assets.length > 1 ? 's' : ''}
                  </div>
                )}
                <button className="glass-panel text-on-surface-variant hover:text-primary px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95 magnetic-btn" onClick={resetView}>
                  <span className="material-symbols-outlined text-sm">restart_alt</span> New
                </button>
                <button 
                  onClick={downloadMarkdownBase64} 
                  className="glass-panel text-on-surface hover:text-primary px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95 border-primary/30 magnetic-btn"
                  title="Download single Markdown file with Base64 embedded images"
                >
                  <span className="material-symbols-outlined text-sm text-primary">description</span> Download .md
                </button>
                <button 
                  onClick={downloadZip} 
                  disabled={isDownloading}
                  className="btn-primary-glow px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95 magnetic-btn"
                  title="Download ZIP with Markdown and separate images/ folder"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isDownloading ? 'progress_activity' : 'folder_zip'}
                  </span> 
                  {isDownloading ? 'Zipping...' : 'Download .zip'}
                </button>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row w-full h-[600px] gap-8 relative">
              {/* Source Pane */}
              <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden relative">
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50 z-30">
                  <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-secondary">file_present</span>
                    {sourceData.name}
                  </span>
                  <span className="material-symbols-outlined text-outline text-sm">visibility</span>
                </div>
                <div className="overflow-hidden flex-grow relative flex flex-col bg-white/5" id="source-pane-content">
                  {isProcessing && <div className="doc-scanner" id="doc-scanner"></div>}
                  <DocumentPreview name={sourceData.name} content={sourceData.content} className="flex-grow" />
                </div>
              </div>
              
              {/* Transformation Indicator */}
              <div className="hidden md:flex flex-col justify-center items-center px-2 z-20">
                <div className="w-12 h-12 rounded-full glass-panel flex items-center justify-center border border-primary/30 relative">
                  <div className={`absolute inset-0 rounded-full border border-secondary/50 opacity-20 ${isProcessing ? 'animate-ping' : ''}`}></div>
                  <span className={`material-symbols-outlined ${(isProcessing || isStreaming) ? 'animate-spin text-primary' : 'text-secondary'}`} id="magic-icon">
                    magic_button
                  </span>
                </div>
              </div>
              
              {/* Output Pane */}
              <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-label-caps text-label-caps text-secondary mr-1">Markdown Output</span>
                    <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5 text-xs font-label-caps">
                      <button
                        onClick={() => setOutputMode('preview')}
                        className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                          outputMode === 'preview'
                            ? 'bg-secondary/20 text-secondary border border-secondary/30 shadow-sm font-semibold'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">preview</span>
                        Rendered View
                      </button>
                      <button
                        onClick={() => setOutputMode('stream')}
                        className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                          outputMode === 'stream'
                            ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">waterfall_chart</span>
                        Waterfall Code
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
                
                <div className="p-8 overflow-y-auto font-body-rt text-body-rt flex-grow relative bg-background/80" id="markdown-output" ref={outputRef}>
                  {outputMode === 'preview' ? (
                    <div className="streaming-text text-on-surface/90">
                      <MarkStream content={conversionResult?.markdown || ''} />
                    </div>
                  ) : (
                    <div className="font-code-md text-code-md text-on-surface-variant">
                      {(isProcessing && !streamedContent) && (
                        <span className="text-outline animate-pulse inline-block mb-4">Initializing Lumina-v2 Engine...</span>
                      )}
                      <pre className="whitespace-pre-wrap font-mono select-text font-code-md">
                        {streamedContent}
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
      <footer className="bg-surface-container-lowest border-t border-white/5 full-width py-2 mt-auto">
        <div className="flex flex-row justify-between items-center px-4 md:px-margin-page py-8 w-full max-w-container-max mx-auto">
          <div className="font-label-caps text-label-caps text-on-surface-variant">
            © 2024 Lumina Systems. All transformations local-only.
          </div>
          <div className="flex gap-6 font-label-caps text-label-caps">
            <a className="text-outline hover:text-primary transition-colors" href="#">Engine: Lumina-v2</a>
            <a className="text-outline hover:text-primary transition-colors" href="#">Privacy: Local Only</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
