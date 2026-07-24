import { HashRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider, useStore } from './data/store.jsx';
import Sidebar from './components/Sidebar.jsx';
import Painel from './pages/Painel.jsx';
import Associacoes from './pages/Associacoes.jsx';
import UnidadesGeradoras from './pages/UnidadesGeradoras.jsx';
import AssociacaoView from './pages/AssociacaoView.jsx';
import Clientes from './pages/Clientes.jsx';
import GeracaoCreditos from './pages/GeracaoCreditos.jsx';
import Conflitos from './pages/Conflitos.jsx';

function Shell() {
  const { state } = useStore();
  if (state.loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16, color:'#6b7280' }}>
        <div style={{ width:36, height:36, border:'3px solid #e5e3dc', borderTopColor:'#d4a017', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <span style={{ fontSize:14 }}>Carregando dados...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/associacoes" element={<Associacoes />} />
          <Route path="/unidades" element={<UnidadesGeradoras />} />
          <Route path="/associacao/:id" element={<AssociacaoView />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/geracao" element={<GeracaoCreditos />} />
          <Route path="/conflitos" element={<Conflitos />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
