import { useState, useCallback, useEffect } from 'react';
import init, { toMarkdownBytes, formatFromExtension } from '@firecrawl/anydoc-wasm';
import MarkStream from 'markstream-react';

function App() {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceData, setSourceData] = useState<{name: string, content: Uint8Array} | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    init().then(() => setIsReady(true)).catch(err => {
      console.error(err);
      setError('Failed to initialize WASM engine.');
    });
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setError('');
    
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setSourceData({ name: file.name, content: bytes });
      
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const format = formatFromExtension(ext) || null;
      const text = toMarkdownBytes(bytes, format);
      setMarkdown(text);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error parsing document.');
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

  const resetView = () => {
    setSourceData(null);
    setMarkdown('');
    setError('');
  };

  return (
    <>
      <div className="aurora-bg"></div>
      <div className="ambient-bg"></div>
      <div className="app-container" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <header className="nav-header glass-panel">
          <div className="nav-title">LuminaConvert</div>
          <button className="btn-primary-glow" disabled={!isReady}>
            {isReady ? 'Engine Ready' : 'Initializing...'}
          </button>
        </header>

        {!sourceData ? (
          <main className="hero">
            <h1 style={{fontSize: '48px', fontWeight: 'bold', margin: '48px 0 16px', textAlign: 'center'}}>
              Transform Documents into Clean Markdown
            </h1>
            <p style={{color: 'var(--on-surface-variant)', fontSize: '18px', textAlign: 'center', maxWidth: '600px', margin: '0 auto 48px'}}>
              Drag and drop your .docx, .pdf, or .txt files. Our local-first engine parses complex formatting into pristine, developer-ready markdown instantly.
            </p>

            <div className={`drop-zone glass-panel ${isDragging ? 'active' : 'glass-panel-hover'}`}>
              <span className="material-symbols-outlined" style={{fontSize: '64px', marginBottom: '16px'}}>
                {isProcessing ? 'autorenew' : 'upload_file'}
              </span>
              <div style={{fontSize: '24px', fontWeight: '600', marginBottom: '8px'}}>
                {isProcessing ? 'Processing Document...' : 'Drop file here or click to browse'}
              </div>
              <div style={{fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--outline)'}}>
                Supports .DOCX, .PDF, .TXT
              </div>
              <input type="file" style={{opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer'}} 
                     onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
            {error && <div style={{color: 'var(--error)', marginTop: '16px'}}>{error}</div>}
          </main>
        ) : (
          <section className="workspace">
            <div className="pane glass-panel">
              <div className="pane-header">
                <span>{sourceData.name}</span>
                <button onClick={resetView} style={{background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer'}}>
                   <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="pane-content" style={{fontFamily: 'Inter', color: 'var(--on-surface)'}}>
                {isProcessing && <div className="doc-scanner"></div>}
                <div style={{padding: '16px'}}>Document loaded. Bytes: {sourceData.content.length}</div>
                {/* Note: In a real app we might show a PDF viewer or text preview here */}
              </div>
            </div>
            
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px'}}>
              <span className={`material-symbols-outlined ${isProcessing ? 'magic-pulse' : ''}`} style={{color: 'var(--primary)', fontSize: '32px'}}>
                magic_button
              </span>
            </div>

            <div className="pane glass-panel">
              <div className="pane-header">
                <span style={{color: 'var(--secondary)'}}>Markdown Output</span>
              </div>
              <div className="pane-content streaming-text">
                <MarkStream content={markdown} />
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export default App;
