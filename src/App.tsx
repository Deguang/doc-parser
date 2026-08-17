import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Waterfall from './pages/Waterfall';
import Elegant from './pages/Elegant';

function App() {
  const location = useLocation();
  
  return (
    <div className="flex flex-col min-h-screen bg-[#090b10] text-[#f8fafc] antialiased">
      <div className="ambient-bg"></div>
      
      {/* Precision Navigation Header */}
      <header className="h-14 px-6 border-b border-white/[0.08] bg-[#090b10]/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 text-white font-semibold text-sm tracking-tight hover:opacity-90 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <span className="material-symbols-outlined text-base">description</span>
            </div>
            <span>LuminaConvert</span>
          </Link>
          
          <nav className="flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs font-medium">
            <Link 
              to="/" 
              className={`px-3 py-1 rounded-md transition-all ${
                location.pathname === '/' 
                  ? 'bg-white/[0.08] text-white shadow-sm font-semibold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Waterfall
            </Link>
            <Link 
              to="/elegant" 
              className={`px-3 py-1 rounded-md transition-all ${
                location.pathname === '/elegant' 
                  ? 'bg-white/[0.08] text-white shadow-sm font-semibold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Elegant
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Local WASM Engine
          </div>
          <a
            href="https://github.com/Deguang/doc-parser"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/[0.05] transition-colors"
            title="GitHub Repository"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
      </header>
      
      <Routes>
        <Route path="/" element={<Waterfall />} />
        <Route path="/elegant" element={<Elegant />} />
      </Routes>
    </div>
  );
}

export default App;
