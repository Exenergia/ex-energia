import { Building2, Zap, Users, TrendingUp } from 'lucide-react';
import { useStore } from '../data/store.jsx';

export default function Painel() {
  const { state } = useStore();
  const { associacoes, unidades, clientes } = state;

  const porAssociacao = associacoes.map(a => {
    const ids = unidades.filter(u => u.associacaoId === a.id).map(u => u.id);
    return { nome: a.nome, total: clientes.filter(c => ids.includes(c.unidadeId)).length };
  });
  const max = Math.max(1, ...porAssociacao.map(p => p.total));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Painel geral</h1>
          <p>Visão consolidada da carteira de clientes de crédito de energia solar.</p>
        </div>
      </div>

      <div className="stat-grid stat-grid-4">
        {[
          { label: 'ASSOCIAÇÕES', value: associacoes.length, icon: Building2 },
          { label: 'UNIDADES GERADORAS', value: unidades.length, icon: Zap },
          { label: 'CLIENTES', value: clientes.length, icon: Users },
          { label: 'DESCONTO MÉDIO', value: '—', icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <div className="stat-card-head"><span>{label}</span><Icon size={15} /></div>
            <div className="stat-card-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="panel-card padded">
        <h2>Clientes por associação</h2>
        {associacoes.length === 0
          ? <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Nenhuma associação cadastrada ainda.</p>
          : <div className="bar-list">
              {porAssociacao.map(p => (
                <div className="bar-row" key={p.nome}>
                  <span className="bar-label">{p.nome}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(p.total / max) * 100}%` }} /></div>
                  <span className="bar-value">{p.total}</span>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
