import { useState, useMemo } from 'react';
import { Printer, Zap, TrendingUp, Building2 } from 'lucide-react';
import { useStore } from '../data/store.jsx';

export default function GeracaoCreditos() {
  const { state } = useStore();
  const [modo, setModo] = useState('mensal');
  const [competencia, setCompetencia] = useState('todas');

  // competências realmente existentes nas faturas, mais recente primeiro
  const competencias = useMemo(() => {
    const set = new Set(state.faturas.map(f => f.competencia).filter(Boolean));
    return Array.from(set).sort((a, b) => {
      const [ma, aa] = a.split('/'); const [mb, ab] = b.split('/');
      return (ab + mb).localeCompare(aa + ma);
    });
  }, [state.faturas]);

  const mapaClienteUnidade = useMemo(() => {
    const m = {};
    state.clientes.forEach(c => { m[c.id] = c.unidadeId; });
    return m;
  }, [state.clientes]);

  const faturasFiltradas = useMemo(() => {
    if (competencia === 'todas') return state.faturas;
    return state.faturas.filter(f => f.competencia === competencia);
  }, [state.faturas, competencia]);

  const nFaturasPorUnidade = useMemo(() => {
    const m = {};
    state.unidades.forEach(u => { m[u.id] = 0; });
    faturasFiltradas.forEach(f => {
      const uid = mapaClienteUnidade[f.cliente_id];
      if (uid !== undefined && m[uid] !== undefined) m[uid]++;
    });
    return m;
  }, [state.unidades, faturasFiltradas, mapaClienteUnidade]);

  const totalFaturas = faturasFiltradas.length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Geração & Créditos</h1>
          <p>Consumo, energia gerada (créditos recebidos/injetados) e valor faturado por usina.</p>
        </div>
        <div className="header-actions">
          <div className="toggle-group">
            <button className={`toggle-btn${modo === 'mensal' ? ' active' : ''}`} onClick={() => setModo('mensal')}>Mensal</button>
            <button className={`toggle-btn${modo === 'acumulado' ? ' active' : ''}`} onClick={() => setModo('acumulado')}>Acumulado</button>
          </div>
          <button className="btn-icon"><Printer size={15} /></button>
        </div>
      </div>

      <div className="toolbar">
        <select className="sel"><option>Todas as unidades geradoras</option></select>
        <select className="sel" value={competencia} onChange={e => setCompetencia(e.target.value)}>
          <option value="todas">Todas as competências</option>
          {competencias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="stat-grid stat-grid-3">
        {[
          { label: 'CONSUMO TOTAL (KWH)', value: '0', icon: Zap },
          { label: 'ENERGIA GERADA TOTAL (KWH)', value: '0', icon: TrendingUp },
          { label: 'TOTAL FATURADO (R$)', value: 'R$ 0,00', icon: Building2 },
        ].map(({ label, value, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <div className="stat-card-head"><span>{label}</span><Icon size={15} /></div>
            <div className="stat-card-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="panel-card table-wrap">
        {state.unidades.length === 0
          ? <div className="empty-cell">Nenhuma unidade geradora cadastrada.</div>
          : <table>
              <thead><tr><th>USINA</th><th>ASSOCIAÇÃO</th><th>Nº FATURAS</th><th>CONSUMO (KWH)</th><th>ENERGIA GERADA (KWH)</th><th>TOTAL FATURADO (R$)</th></tr></thead>
              <tbody>
                {state.unidades.map(u => (
                  <tr key={u.id}>
                    <td className="bold">{u.nome}</td>
                    <td>{state.associacoes.find(a => a.id === u.associacaoId)?.nome || '—'}</td>
                    <td>{nFaturasPorUnidade[u.id] ?? 0}</td><td>0</td><td>0</td><td>R$ 0,00</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td><strong>Total</strong></td><td></td><td>{totalFaturas}</td><td>0</td><td>0</td><td>R$ 0,00</td></tr></tfoot>
            </table>
        }
      </div>
    </div>
  );
}
