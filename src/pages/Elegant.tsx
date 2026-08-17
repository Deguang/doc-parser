import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import init, { formatFromExtension } from '@firecrawl/anydoc-wasm';
import MarkStream from 'markstream-react';
import { DocumentPreview } from '../components/DocumentPreview';
import { createZipExport, getBase64Markdown, revokeConversionAssets, type ConversionResult } from '../utils/documentConverter';
import { parseDocumentInWorker } from '../utils/workerManager';

export default function Elegant() {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceData, setSourceData] = useState<{name: string, content: Uint8Array} | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parseStats, setParseStats] = useState<{ timeMs: number, sizeBytes: number } | null>(null);
  const [leftTab, setLeftTab] = useState<'preview' | 'rendered'>('preview');
  const [rawMarkdownMode, setRawMarkdownMode] = useState<'base64' | 'relative'>('relative');
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevResultRef = useRef<ConversionResult | null>(null);

  useEffect(() => {
    init().then(() => setIsReady(true)).catch(err => {
      console.error(err);
      setError('Failed to initialize WASM parsing engine.');
    });

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
      const bytesForWorker = new Uint8Array(buffer.slice(0));
      const bytesForPreview = new Uint8Array(buffer);
      setSourceData({ name: file.name, content: bytesForPreview });
      
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const format = formatFromExtension(ext) || null;
      
      // Parse in background Web Worker off the main UI thread
      const { result, stats } = await parseDocumentInWorker(bytesForWorker, format, file.name);
      
      prevResultRef.current = result;
      setConversionResult(result);
      setParseStats(stats);
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

  // Compute Base64 only on-demand
  const rawBase64Markdown = useMemo(() => {
    if (!conversionResult || rawMarkdownMode !== 'base64') return '';
    return getBase64Markdown(conversionResult);
  }, [conversionResult, rawMarkdownMode]);

  const copyToClipboard = () => {
    if (!conversionResult) return;
    const textToCopy = rawMarkdownMode === 'base64' 
      ? (rawBase64Markdown || getBase64Markdown(conversionResult))
      : conversionResult.rawMarkdownWithRelativePaths;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert('Copied to clipboard!');
    });
  };

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

  const resetView = () => {
    revokeConversionAssets(prevResultRef.current);
    prevResultRef.current = null;
    setSourceData(null);
    setConversionResult(null);
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
            <div className="flex flex-wrap gap-3 items-center">
              {conversionResult && conversionResult.assets.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs font-label-caps">
                  <span className="material-symbols-outlined text-sm">photo_library</span>
                  {conversionResult.assets.length} Image{conversionResult.assets.length > 1 ? 's' : ''} Extracted
                </div>
              )}
              <button 
                onClick={resetView}
                className="glass-panel text-on-surface-variant hover:text-primary px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span> New
              </button>
              
              <button 
                onClick={downloadMarkdownBase64}
                className="glass-panel text-on-surface hover:text-primary px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95 border-primary/30"
                title="Download single self-contained Markdown with Base64 embedded images"
              >
                <span className="material-symbols-outlined text-sm text-primary">description</span> 
                Download .md (Base64)
              </button>

              <button 
                onClick={downloadZip}
                disabled={isDownloading}
                className="btn-primary-glow px-4 py-2 rounded-lg font-label-caps text-label-caps flex items-center gap-2 transition-all duration-200 active:scale-95"
                title="Download ZIP package with Markdown and separate images/ folder"
              >
                <span className="material-symbols-outlined text-sm">
                  {isDownloading ? 'progress_activity' : 'folder_zip'}
                </span> 
                {isDownloading ? 'Zipping...' : 'Download .zip (Packaged)'}
              </button>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row w-full h-[600px] gap-editor-gap">
            <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50 gap-2">
                <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-white/5">
                  <button
                    onClick={() => setLeftTab('preview')}
                    className={`px-3 py-1 rounded text-xs font-label-caps transition-all ${
                      leftTab === 'preview'
                        ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Original Source
                  </button>
                  <button
                    onClick={() => setLeftTab('rendered')}
                    className={`px-3 py-1 rounded text-xs font-label-caps transition-all ${
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
                    Parsed {(parseStats.sizeBytes / 1024).toFixed(1)} KB in {parseStats.timeMs}ms
                  </span>
                )}
              </div>
              <div className="overflow-hidden flex-grow relative flex flex-col bg-white/5">
                {leftTab === 'preview' ? (
                  <DocumentPreview name={sourceData.name} content={sourceData.content} className="flex-grow" />
                ) : (
                  <div className="p-8 overflow-y-auto font-body-rt text-body-rt text-on-surface/80 flex-grow streaming-text">
                    <MarkStream content={conversionResult?.markdown || ''} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-surface-container-low/50">
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
              <div className="p-8 overflow-y-auto font-code-md text-code-md bg-background/80 flex-grow relative text-on-surface-variant whitespace-pre-wrap">
                {rawMarkdownMode === 'base64' ? rawBase64Markdown : conversionResult?.rawMarkdownWithRelativePaths}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
