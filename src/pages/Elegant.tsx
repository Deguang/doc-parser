import { useState, useCallback, useEffect, useRef } from 'react';
import { formatFromExtension } from '@firecrawl/anydoc-wasm';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { VirtualCodeViewer } from '../components/VirtualCodeViewer';
import { DocumentPreview } from '../components/DocumentPreview';
import { WasmProgressBar } from '../components/WasmProgressBar';
import { createZipExport, getBase64Markdown, revokeConversionAssets, type ConversionResult } from '../utils/documentConverter';
import { parseDocumentInWorker } from '../utils/workerManager';

export default function Elegant() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceData, setSourceData] = useState<{name: string, file?: File, content?: Uint8Array} | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parseStats, setParseStats] = useState<{ timeMs: number, sizeBytes: number } | null>(null);
  const [leftTab, setLeftTab] = useState<'preview' | 'rendered'>('preview');
  const [rawMarkdownMode, setRawMarkdownMode] = useState<'base64' | 'relative'>('relative');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncScroll, setIsSyncScroll] = useState<boolean>(true);

  const rightOutputRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevResultRef = useRef<ConversionResult | null>(null);

  useEffect(() => {
    return () => {
      revokeConversionAssets(prevResultRef.current);
    };
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setError('');
    setParseStats(null);
    setSourceData(null);
    
    // Revoke previous assets from memory
    revokeConversionAssets(prevResultRef.current);
    setConversionResult(null);
    prevResultRef.current = null;
    
    try {
      const buffer = await file.arrayBuffer();
      // Zero-copy transferable array buffer
      const bytesForWorker = new Uint8Array(buffer);
      
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const format = formatFromExtension(ext) || null;
      
      // Parse in background Web Worker off the main UI thread with zero-copy buffer transfer
      const { result, stats } = await parseDocumentInWorker(bytesForWorker, format, file.name);
      
      prevResultRef.current = result;
      setSourceData({ name: file.name, file });
      setConversionResult(result);
      setParseStats(stats);
    } catch (err: any) {
      console.error(err);
      setSourceData(null);
      setConversionResult(null);
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

  const copyToClipboard = async () => {
    if (!conversionResult) return;
    const textToCopy = rawMarkdownMode === 'base64' 
      ? await getBase64Markdown(conversionResult)
      : conversionResult.rawMarkdownWithRelativePaths;
    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    alert('Copied to clipboard!');
  };

  const downloadRAGChunks = async () => {
    if (!conversionResult || !sourceData) return;
    try {
      const { chunkMarkdown } = await import('../utils/chunker');
      const chunks = chunkMarkdown(conversionResult.rawMarkdownWithRelativePaths);
      
      const payload = JSON.stringify({
        source: sourceData.name,
        total_chunks: chunks.length,
        chunks: chunks
      }, null, 2);
      
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sourceData.name.replace(/\.[^/.]+$/, "")}_rag_chunks.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to generate RAG chunks.');
    }
  };

  const [embeddingProgress, setEmbeddingProgress] = useState<any>(null);

  const downloadVectorEmbeddings = async () => {
    if (!conversionResult || !sourceData) return;
    try {
      const { chunkMarkdown } = await import('../utils/chunker');
      const { generateEmbeddings } = await import('../utils/embeddingManager');
      
      const chunks = chunkMarkdown(conversionResult.rawMarkdownWithRelativePaths);
      if (chunks.length === 0) return;

      setEmbeddingProgress({ status: 'init', progress: 0 });

      const embedInput = chunks.map(c => ({ id: c.id, text: c.content }));
      
      const embeddings = await generateEmbeddings(embedInput, (prog) => {
        setEmbeddingProgress(prog);
      });

      // Merge embeddings back into chunks
      const embedMap = new Map(embeddings.map(e => [e.id, e.embedding]));
      const finalChunks = chunks.map(c => ({
        ...c,
        embedding: embedMap.get(c.id) || []
      }));

      const payload = JSON.stringify({
        source: sourceData.name,
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        total_chunks: finalChunks.length,
        chunks: finalChunks
      }, null, 2);
      
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sourceData.name.replace(/\.[^/.]+$/, "")}_vector_db.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setEmbeddingProgress(null);
    } catch (e: any) {
      console.error(e);
      alert('Failed to generate Vector Embeddings: ' + e.message);
      setEmbeddingProgress(null);
    }
  };

  const downloadMarkdownBase64 = async () => {
    if (!conversionResult || !sourceData) return;
    const base64Text = await getBase64Markdown(conversionResult);
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

  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // High-performance direct DOM scroll sync without React re-renders and infinite loops
  useEffect(() => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightOutputRef.current;
    let syncTimeoutId: number | null = null;

    const handleLeftScroll = () => {
      if (!isSyncScroll || isSyncingRef.current || !rightEl || !leftEl) return;
      const leftMax = leftEl.scrollHeight - leftEl.clientHeight;
      const rightMax = rightEl.scrollHeight - rightEl.clientHeight;
      if (leftMax > 0 && rightMax > 0) {
        const targetScroll = (leftEl.scrollTop / leftMax) * rightMax;
        if (Math.abs(rightEl.scrollTop - targetScroll) > 2) {
          isSyncingRef.current = true;
          rightEl.scrollTop = targetScroll;
          if (syncTimeoutId) clearTimeout(syncTimeoutId);
          syncTimeoutId = window.setTimeout(() => {
            isSyncingRef.current = false;
          }, 50);
        }
      }
    };

    const handleRightScroll = () => {
      if (!isSyncScroll || isSyncingRef.current || !leftEl || !rightEl) return;
      const leftMax = leftEl.scrollHeight - leftEl.clientHeight;
      const rightMax = rightEl.scrollHeight - rightEl.clientHeight;
      if (leftMax > 0 && rightMax > 0) {
        const targetScroll = (rightEl.scrollTop / rightMax) * leftMax;
        if (Math.abs(leftEl.scrollTop - targetScroll) > 2) {
          isSyncingRef.current = true;
          leftEl.scrollTop = targetScroll;
          if (syncTimeoutId) clearTimeout(syncTimeoutId);
          syncTimeoutId = window.setTimeout(() => {
            isSyncingRef.current = false;
          }, 50);
        }
      }
    };

    leftEl?.addEventListener('scroll', handleLeftScroll, { passive: true });
    rightEl?.addEventListener('scroll', handleRightScroll, { passive: true });

    return () => {
      leftEl?.removeEventListener('scroll', handleLeftScroll);
      rightEl?.removeEventListener('scroll', handleRightScroll);
      if (syncTimeoutId) clearTimeout(syncTimeoutId);
    };
  }, [isSyncScroll, sourceData, leftTab]);

  const resetView = () => {
    revokeConversionAssets(prevResultRef.current);
    prevResultRef.current = null;
    setSourceData(null);
    setConversionResult(null);
    setError('');
    setParseStats(null);
  };

  return (
    <div className="flex-1 flex flex-col w-full h-[calc(100vh-64px)] overflow-hidden antialiased">
      <main className="flex-1 flex flex-col w-full h-full min-h-0 px-4 md:px-margin-page py-4 max-w-container-max mx-auto relative overflow-hidden">
        
        {!sourceData ? (
          <section className="w-full flex-1 flex flex-col items-center justify-center text-center gap-6 max-w-2xl mx-auto z-10 overflow-y-auto py-6" id="upload-section">
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Document to Clean Markdown
              </h1>
              <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                Precision dual-pane comparison workspace. Parse complex documents to Markdown with 100% local privacy.
              </p>
            </div>

            <div 
              className={`drop-zone relative w-full h-64 md:h-72 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                isDragging || isProcessing
                  ? 'border-blue-500 bg-blue-500/[0.06]' 
                  : 'border-white/[0.12] hover:border-white/[0.24] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcessing ? (
                <div className="z-10 flex flex-col items-center gap-3 text-blue-400">
                  <span className="material-symbols-outlined text-4xl animate-spin">autorenew</span>
                  <div className="text-sm font-semibold text-slate-200">Processing Document...</div>
                </div>
              ) : (
                <div className="z-10 flex flex-col items-center gap-4 text-slate-400 group-hover:text-slate-200 transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300">
                    <span className="material-symbols-outlined text-3xl font-light">upload_file</span>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-200">Drop file here or click to browse</div>
                    <div className="flex items-center justify-center gap-1.5 mt-2.5">
                      {['DOCX', 'PDF', 'PPTX', 'TXT', 'XLSX'].map(type => (
                        <span key={type} className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-slate-400">
                          .{type}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <input 
                accept=".docx,.pdf,.pptx,.txt,.xlsx" 
                className="hidden" 
                type="file" 
                ref={fileInputRef}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            
            <WasmProgressBar />
            {error && <div className="text-xs text-rose-400 bg-rose-500/10 px-4 py-2.5 rounded-lg border border-rose-500/20">{error}</div>}
          </section>
        ) : (
          <section className="w-full flex-1 flex flex-col min-h-0 gap-3 z-10 overflow-hidden" id="workspace-section">
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
                <button
                  onClick={() => setIsSyncScroll(!isSyncScroll)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-label-caps flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    isSyncScroll
                      ? 'bg-secondary/20 text-secondary border border-secondary/40 shadow-[0_0_10px_rgba(76,215,246,0.2)] font-semibold'
                      : 'glass-panel text-on-surface-variant hover:text-on-surface border border-white/10'
                  }`}
                  title="Synchronize scrolling between source document and markdown output"
                >
                  <span className="material-symbols-outlined text-sm">{isSyncScroll ? 'sync' : 'sync_disabled'}</span>
                  Sync Scroll
                </button>
                <button className="glass-panel text-on-surface-variant hover:text-primary px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95" onClick={resetView}>
                  <span className="material-symbols-outlined text-sm">restart_alt</span> New
                </button>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <button 
                  onClick={downloadRAGChunks} 
                  className="glass-panel text-tertiary hover:text-tertiary px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95 border-tertiary/30"
                  title="Export Semantic Chunks for RAG and Vector Databases"
                >
                  <span className="material-symbols-outlined text-sm">data_object</span> RAG Chunks
                </button>
                <button 
                  onClick={downloadVectorEmbeddings} 
                  disabled={embeddingProgress !== null}
                  className="glass-panel text-fuchsia-400 hover:text-fuchsia-300 px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95 border-fuchsia-400/30"
                  title="Generate Local Vector Embeddings using transformers.js"
                >
                  <span className="material-symbols-outlined text-sm">
                    {embeddingProgress ? 'progress_activity' : 'memory'}
                  </span> 
                  {embeddingProgress ? `Embedding... ${embeddingProgress.progress ? Math.round(embeddingProgress.progress) + '%' : (embeddingProgress.current ? `${embeddingProgress.current}/${embeddingProgress.total}` : '')}` : 'Vector DB'}
                </button>
                <button 
                  onClick={downloadMarkdownBase64} 
                  className="glass-panel text-on-surface hover:text-primary px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95 border-primary/30"
                  title="Download Markdown with Base64 embedded images"
                >
                  <span className="material-symbols-outlined text-sm text-primary">description</span> .md
                </button>
                <button 
                  onClick={downloadZip} 
                  disabled={isDownloading}
                  className="btn-primary-glow px-3 py-1.5 rounded-lg font-label-caps text-xs flex items-center gap-1 transition-all duration-200 active:scale-95"
                  title="Download ZIP with Markdown and images folder"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isDownloading ? 'progress_activity' : 'folder_zip'}
                  </span> 
                  {isDownloading ? 'Zipping...' : '.zip'}
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row w-full min-h-0 gap-4 overflow-hidden">
              <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden border border-white/10">
                <div className="px-4 py-2.5 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50 gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5">
                    <button
                      onClick={() => setLeftTab('preview')}
                      className={`px-2.5 py-1 rounded text-xs font-label-caps transition-all ${
                        leftTab === 'preview'
                          ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Original Source
                    </button>
                    <button
                      onClick={() => setLeftTab('rendered')}
                      className={`px-2.5 py-1 rounded text-xs font-label-caps transition-all ${
                        leftTab === 'rendered'
                          ? 'bg-secondary/20 text-secondary border border-secondary/30 shadow-sm font-semibold'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Rendered Markdown
                    </button>
                  </div>
                  {parseStats && (
                    <span className="text-secondary font-label-caps text-xs">
                      {(parseStats.sizeBytes / 1024).toFixed(1)} KB • {parseStats.timeMs}ms
                    </span>
                  )}
                </div>
                <div className="overflow-hidden flex-grow relative flex flex-col bg-white/5">
                  {leftTab === 'preview' ? (
                    <DocumentPreview 
                      name={sourceData.name} 
                      file={sourceData.file}
                      content={sourceData.content} 
                      className="flex-grow" 
                      scrollRef={leftScrollRef}
                    />
                  ) : (
                    <div 
                      ref={leftScrollRef}
                      className="p-6 overflow-y-auto font-body-rt text-body-rt flex-grow"
                    >
                      <MarkdownRenderer content={conversionResult?.markdown || '*(No content)*'} />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden border border-white/10">
                <div className="px-4 py-2.5 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50">
                  <div className="flex items-center gap-2">
                    <span className="font-label-caps text-label-caps text-secondary">Raw Markdown</span>
                    {conversionResult && conversionResult.assets.length > 0 && (
                      <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded text-[11px] font-label-caps">
                        <button
                          onClick={() => setRawMarkdownMode('base64')}
                          className={`px-2 py-0.5 rounded transition-all ${rawMarkdownMode === 'base64' ? 'bg-primary/20 text-primary font-bold' : 'text-outline hover:text-on-surface'}`}
                        >
                          Base64
                        </button>
                        <button
                          onClick={() => setRawMarkdownMode('relative')}
                          className={`px-2 py-0.5 rounded transition-all ${rawMarkdownMode === 'relative' ? 'bg-secondary/20 text-secondary font-bold' : 'text-outline hover:text-on-surface'}`}
                        >
                          ./images
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={copyToClipboard} className="text-outline hover:text-secondary transition-colors p-1" title="Copy to clipboard">
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                  </button>
                </div>
                <div 
                  ref={rightOutputRef}
                  className="p-6 overflow-y-auto bg-background/80 flex-grow relative"
                >
                  <VirtualCodeViewer 
                    content={conversionResult?.rawMarkdownWithRelativePaths || ''} 
                  />
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
