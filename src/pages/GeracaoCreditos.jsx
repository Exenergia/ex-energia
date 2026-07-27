import { useState, useMemo } from 'react';
import { Printer, Zap, TrendingUp, Building2 } from 'lucide-react';
import { useStore } from '../data/store.jsx';

function normalizar(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function parseSmartNumber(rawVal) {
  if (typeof rawVal === 'number') return rawVal;
  if (!rawVal) return null;
  let s = rawVal.toString().replace(/[^\d,.-]/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}
// acha, no dados_completos da fatura, a coluna de Consumo (nome varia por associação:
// Sunne = "Consumo Total do Mês (kWh)", Luga/FRED = "Energia Consumida (kWh)", Economy = "Consumo (kWh)")
function consumoFatura(f) {
  const dados = f.dados_completos;
  if (!dados) return 0;
  const chave = Object.keys(dados).find(k => {
    const n = normalizar(k);
    return n.includes('consumid') || n.includes('consumo');
  });
  return chave ? (parseSmartNumber(dados[chave]) || 0) : 0;
}

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

  const dadosPorUnidade = useMemo(() => {
    const m = {};
    state.unidades.forEach(u => { m[u.id] = { nFaturas: 0, consumo: 0 }; });
    faturasFiltradas.forEach(f => {
      const uid = mapaClienteUnidade[f.cliente_id];
      if (uid !== undefined && m[uid] !== undefined) {
        m[uid].nFaturas++;
        m[uid].consumo += consumoFatura(f);
      }
    });
    return m;
  }, [state.unidades, faturasFiltradas, mapaClienteUnidade]);

  const totalFaturas = faturasFiltradas.length;
  const totalConsumo = Object.values(dadosPorUnidade).reduce((acc, d) => acc + d.consumo, 0);
  const fmtKwh = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
          { label: 'CONSUMO TOTAL (KWH)', value: fmtKwh(totalConsumo), icon: Zap },
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
                    <td>{dadosPorUnidade[u.id]?.nFaturas ?? 0}</td>
                    <td>{fmtKwh(dadosPorUnidade[u.id]?.consumo ?? 0)}</td>
                    <td>0</td><td>R$ 0,00</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td><strong>Total</strong></td><td></td><td>{totalFaturas}</td><td>{fmtKwh(totalConsumo)}</td><td>0</td><td>R$ 0,00</td></tr></tfoot>
            </table>
        }
      </div>
    </div>
  );
}
