import React from 'react';
import { useWasmLoader } from '../utils/wasmLoader';

export const WasmProgressBar: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { stage, progress, loadedBytes, totalBytes, error } = useWasmLoader();

  if (stage === 'ready') {
    return null;
  }

  if (stage === 'error') {
    return (
      <div className={`p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{error || 'Failed to initialize WASM engine.'}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const loadedMB = (loadedBytes / (1024 * 1024)).toFixed(1);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className={`w-full max-w-md mx-auto p-4 rounded-xl bg-[#121722]/90 border border-white/[0.08] shadow-2xl backdrop-blur-md flex flex-col gap-2.5 transition-all ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          <span>
            {stage === 'compiling' ? 'Compiling WASM Engine...' : 'Loading Local WASM Engine...'}
          </span>
        </div>
        <span className="font-mono text-blue-400 font-semibold">{progress}%</span>
      </div>

      {/* 3px Precision Progress Bar */}
      <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative">
        <div
          className="h-full bg-blue-500 transition-all duration-150 ease-out rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          style={{ width: `${Math.max(4, progress)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>{stage === 'compiling' ? 'Optimizing JIT binary' : '100% In-Browser Privacy'}</span>
        <span>
          {loadedBytes > 0 ? `${loadedMB} MB / ${totalMB} MB` : 'Initializing stream...'}
        </span>
      </div>
    </div>
  );
};
