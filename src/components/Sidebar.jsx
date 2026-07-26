import { NavLink } from 'react-router-dom';
import { LayoutGrid, Building2, Zap, Users, TrendingUp, AlertTriangle, LogOut } from 'lucide-react';
import { useStore } from '../data/store.jsx';

function Item({ to, icon: Icon, label, count }) {
  return (
    <NavLink to={to} className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`} end={to === '/'}>
      <Icon size={16} strokeWidth={2} />
      <span className="sb-label">{label}</span>
      {typeof count === 'number' && <span className="sb-badge">{count}</span>}
    </NavLink>
  );
}

export default function Sidebar() {
  const { state } = useStore();
  return (
    <aside className="sidebar">
      <div className="sb-logo">
        <img src="/logo.png" alt="EX Energia" className="sb-logo-img" />
      </div>

      <nav className="sb-nav">
        <Item to="/" icon={LayoutGrid} label="Painel" />
        <Item to="/associacoes" icon={Building2} label="Associações" count={state.associacoes.length} />
        <Item to="/unidades" icon={Zap} label="Unidades geradoras" count={state.unidades.length} />

        <div className="sb-divider" />
        {state.associacoes.map(a => (
          <Item key={a.id} to={`/associacao/${a.id}`} icon={Zap} label={a.nome} />
        ))}

        <div className="sb-divider" />
        <Item to="/geracao" icon={TrendingUp} label="Geração & Créditos" />
        <Item to="/conflitos" icon={AlertTriangle} label="Conflitos" count={state.conflitos.length} />
      </nav>

      <div className="sb-footer">
        <div className="sb-email">exenergias@gmail.com</div>
        <div className="sb-logout"><LogOut size={13} /> Sair</div>
      </div>
    </aside>
  );
}
