import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfVirtualViewerProps {
  src: string;
  className?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

interface PageDimensions {
  width: number;
  height: number;
}

export const PdfVirtualViewer: React.FC<PdfVirtualViewerProps> = ({ src, className = '', scrollRef }) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [baseDimensions, setBaseDimensions] = useState<PageDimensions>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number>(0.85);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasks = useRef<Map<number, any>>(new Map());
  const pageProxies = useRef<Map<number, pdfjsLib.PDFPageProxy>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Forward ref to the scroll container
  useEffect(() => {
    if (scrollRef && containerRef.current) {
      if (typeof scrollRef === 'function') {
        (scrollRef as (instance: HTMLDivElement | null) => void)(containerRef.current);
      } else {
        (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = containerRef.current;
      }
    }
  }, [scrollRef, containerRef.current]);

  useEffect(() => {
    let active = true;
    let docProxy: pdfjsLib.PDFDocumentProxy | null = null;
    let loadingTask: any = null;

    const loadDoc = async () => {
      try {
        loadingTask = pdfjsLib.getDocument({ url: src });
        docProxy = await loadingTask.promise;
        if (!active) {
          try { docProxy?.cleanup(); } catch (e) {}
          try { loadingTask.destroy(); } catch (e) {}
          return;
        }
        
        setPdfDoc(docProxy);
        setNumPages(docProxy!.numPages);
        
        if (docProxy!.numPages > 0) {
          const firstPage = await docProxy!.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1.0 });
          setBaseDimensions({ width: viewport.width, height: viewport.height });
        }
        
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException' && active) {
          console.error('Failed to load PDF:', err);
        }
      }
    };

    if (src) {
      loadDoc();
    }

    return () => {
      active = false;
      if (loadingTask) {
        try { loadingTask.destroy(); } catch (e) {}
      }
      if (docProxy) {
        try { docProxy.cleanup(); } catch (e) {}
      }
      
      // Cleanup all cached pages on unmount
      pageProxies.current.forEach(page => {
        try { page.cleanup(); } catch (e) {}
      });
      pageProxies.current.clear();
    };
  }, [src]);

  const intendedVisibility = useRef<Map<number, boolean>>(new Map());

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;
    intendedVisibility.current.set(pageNum, true);
    
    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas) return;

    // Cancel any existing render task for this page
    if (renderTasks.current.has(pageNum)) {
      try {
        renderTasks.current.get(pageNum).cancel();
      } catch (e) {}
      renderTasks.current.delete(pageNum);
    }

    try {
      const page = await pdfDoc.getPage(pageNum);
      pageProxies.current.set(pageNum, page);
      
      // Check if the user scrolled past this page while we were fetching it
      if (intendedVisibility.current.get(pageNum) === false) {
        try { page.cleanup(); } catch (e) {}
        return; // Abort rendering
      }

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom * dpr });
      
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Keep logical size in CSS
      const cssViewport = page.getViewport({ scale: zoom });
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;

      const renderContext: any = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas
      };

      const renderTask = page.render(renderContext);
      renderTasks.current.set(pageNum, renderTask);
      
      await renderTask.promise;
      renderTasks.current.delete(pageNum);
      
      // Final check in case it became invisible during rendering
      if (intendedVisibility.current.get(pageNum) === false) {
        canvas.width = 0;
        canvas.height = 0;
        try { page.cleanup(); } catch (e) {}
        return;
      }

    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, err);
      }
    }
  }, [pdfDoc, zoom]);

  const clearPage = useCallback((pageNum: number) => {
    intendedVisibility.current.set(pageNum, false);
    
    if (renderTasks.current.has(pageNum)) {
      try {
        renderTasks.current.get(pageNum).cancel();
      } catch (e) {}
      renderTasks.current.delete(pageNum);
    }
    const canvas = canvasRefs.current.get(pageNum);
    if (canvas) {
      // Clear GPU texture memory by setting dimension to 0
      canvas.width = 0;
      canvas.height = 0;
    }
    const page = pageProxies.current.get(pageNum);
    if (page) {
      try { page.cleanup(); } catch (e) {}
      pageProxies.current.delete(pageNum);
    }
  }, []);

  // Set up IntersectionObserver
  useEffect(() => {
    if (!containerRef.current || !pdfDoc) return;

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const pageNumAttr = entry.target.getAttribute('data-page-number');
        if (!pageNumAttr) return;
        
        const pageNum = Number(pageNumAttr);
        if (entry.isIntersecting) {
          renderPage(pageNum);
        } else {
          clearPage(pageNum);
        }
      });
    }, {
      root: containerRef.current,
      rootMargin: '150% 0px', // Reduced buffer to save memory
      threshold: 0
    });

    const pages = Array.from(pageRefs.current.values());
    pages.forEach(page => observerRef.current?.observe(page));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [pdfDoc, renderPage, clearPage]);

  // Handle zoom changes for already visible pages
  useEffect(() => {
    if (pdfDoc) {
      Array.from(intendedVisibility.current.entries()).forEach(([pageNum, isVisible]) => {
        if (isVisible) renderPage(pageNum);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]); 

  const zoomIn = () => setZoom(z => Math.min(2.0, z + 0.1));
  const zoomOut = () => setZoom(z => Math.max(0.3, z - 0.1));

  const pageHeight = baseDimensions.height * zoom;
  const pageWidth = baseDimensions.width * zoom;

  return (
    <div 
      className={`relative w-full h-full overflow-y-auto bg-[#1a1a2e] ${className}`}
      ref={containerRef}
      style={{ willChange: 'transform' }}
    >
      <div className="flex flex-col items-center py-4 space-y-[12px]">
        {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
          return (
            <div 
              key={pageNum}
              ref={el => {
                if (el) {
                  pageRefs.current.set(pageNum, el);
                  observerRef.current?.observe(el);
                } else {
                  const oldEl = pageRefs.current.get(pageNum);
                  if (oldEl) observerRef.current?.unobserve(oldEl);
                  pageRefs.current.delete(pageNum);
                }
              }}
              data-page-number={pageNum}
              className="relative shadow-md bg-white rounded-sm flex items-center justify-center"
              style={{ width: pageWidth || 300, height: pageHeight || 400 }}
            >
              <canvas 
                ref={el => {
                  if (el) canvasRefs.current.set(pageNum, el);
                  else canvasRefs.current.delete(pageNum);
                }}
                className="block"
              />
              <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-white/80 px-1.5 py-0.5 rounded shadow-sm">
                {pageNum}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-surface-container-high/90 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 shadow-lg z-20">
        <button 
          onClick={zoomOut}
          disabled={zoom <= 0.3}
          className="text-outline hover:text-on-surface hover:bg-white/5 p-1 rounded transition-colors disabled:opacity-40"
          aria-label="Zoom out"
        >
          <span className="material-symbols-outlined text-xs">remove</span>
        </button>
        <span className="text-[11px] font-mono w-10 text-center text-on-surface-variant select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button 
          onClick={zoomIn}
          disabled={zoom >= 2.0}
          className="text-outline hover:text-on-surface hover:bg-white/5 p-1 rounded transition-colors disabled:opacity-40"
          aria-label="Zoom in"
        >
          <span className="material-symbols-outlined text-xs">add</span>
        </button>
        <div className="w-px h-3 bg-white/10 mx-0.5" />
        <button
          onClick={() => setZoom(1.0)}
          className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${Math.abs(zoom - 1.0) < 0.01 ? 'bg-primary/20 text-primary' : 'text-outline hover:text-on-surface hover:bg-white/5'}`}
        >
          100%
        </button>
        <button
          onClick={() => setZoom(0.75)}
          className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${Math.abs(zoom - 0.75) < 0.01 ? 'bg-secondary/20 text-secondary' : 'text-outline hover:text-on-surface hover:bg-white/5'}`}
        >
          Fit
        </button>
      </div>
    </div>
  );
};
