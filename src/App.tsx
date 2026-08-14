import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Waterfall from './pages/Waterfall';
import Elegant from './pages/Elegant';

function App() {
  const location = useLocation();
  
  return (
    <>
      <div className="aurora-bg"></div>
      <div className="ambient-bg"></div>
      
      {/* Shared Navigation Header */}
      <header className="nav-header glass-panel sticky top-0 z-50">
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div className="nav-title" style={{ marginRight: '32px' }}>LuminaConvert</div>
          <nav style={{ display: 'flex', gap: '16px', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Link 
              to="/" 
              style={{ color: location.pathname === '/' ? 'var(--primary)' : 'var(--on-surface-variant)', textDecoration: 'none' }}
            >
              Waterfall
            </Link>
            <Link 
              to="/elegant" 
              style={{ color: location.pathname === '/elegant' ? 'var(--primary)' : 'var(--on-surface-variant)', textDecoration: 'none' }}
            >
              Elegant
            </Link>
          </nav>
        </div>
      </header>
      
      <Routes>
        <Route path="/" element={<Waterfall />} />
        <Route path="/elegant" element={<Elegant />} />
      </Routes>
    </>
  );
}

export default App;
