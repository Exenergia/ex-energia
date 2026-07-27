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

// acha, dentro do dados_completos de uma fatura, a coluna que representa valor / consumo / geração,
// não importa o nome exato que cada associação usa
function encontrarChave(dados, teste) {
  if (!dados) return null;
  return Object.keys(dados).find(k => teste(normalizar(k)));
}

const TESTE_VALOR = n => n === 'valor a pagar' || n === 'valor com plano' || n === 'valor assinatura';
const TESTE_CONSUMO = n => n.includes('consumid') || n.includes('consumo');
const TESTE_GERACAO = n => n.includes('injetada') || n.includes('gerada') || (n.includes('credito') && n.includes('recebido'));

function valorFatura(f) {
  const chave = encontrarChave(f.dados_completos, TESTE_VALOR);
  return chave ? (parseSmartNumber(f.dados_completos[chave]) || 0) : 0;
}
function consumoFatura(f) {
  const chave = encontrarChave(f.dados_completos, TESTE_CONSUMO);
  return chave ? (parseSmartNumber(f.dados_completos[chave]) || 0) : 0;
}
function geracaoFatura(f) {
  const chave = encontrarChave(f.dados_completos, TESTE_GERACAO);
  return chave ? (parseSmartNumber(f.dados_completos[chave]) || 0) : 0;
}

export default function GeracaoCreditos() {
  const { state } = useStore();
  const [modo, setModo] = useState('mensal');
  const [unidadeFiltro, setUnidadeFiltro] = useState('todas');
  const [competencia, setCompetencia] = useState('todas');

  // lista de competências realmente existentes nas faturas, mais recente primeiro
  const competencias = useMemo(() => {
    const set = new Set(state.faturas.map(f => f.competencia).filter(Boolean));
    return Array.from(set).sort((a, b) => {
      const [ma, aa] = a.split('/'); const [mb, ab] = b.split('/');
      return (ab + mb).localeCompare(aa + ma);
    });
  }, [state.faturas]);

  // mapa clienteId -> unidadeId
  const mapaClienteUnidade = useMemo(() => {
    const m = {};
    state.clientes.forEach(c => { m[c.id] = c.unidadeId; });
    return m;
  }, [state.clientes]);

  // faturas filtradas por competência (modo mensal) ou todas (modo acumulado)
  const faturasFiltradas = useMemo(() => {
    if (modo === 'mensal' && competencia !== 'todas') {
      return state.faturas.filter(f => f.competencia === competencia);
    }
    return state.faturas;
  }, [state.faturas, modo, competencia]);

  // agrupa por unidade geradora
  const linhasPorUnidade = useMemo(() => {
    return state.unidades
      .filter(u => unidadeFiltro === 'todas' || u.id === unidadeFiltro)
      .map(u => {
        const faturasDaUnidade = faturasFiltradas.filter(f => mapaClienteUnidade[f.cliente_id] === u.id);
        return {
          unidade: u,
          associacao: state.associacoes.find(a => a.id === u.associacaoId)?.nome || '—',
          nFaturas: faturasDaUnidade.length,
          consumo: faturasDaUnidade.reduce((acc, f) => acc + consumoFatura(f), 0),
          geracao: faturasDaUnidade.reduce((acc, f) => acc + geracaoFatura(f), 0),
          faturado: faturasDaUnidade.reduce((acc, f) => acc + valorFatura(f), 0),
        };
      });
  }, [state.unidades, state.associacoes, faturasFiltradas, mapaClienteUnidade, unidadeFiltro]);

  const totais = useMemo(() => linhasPorUnidade.reduce((acc, l) => ({
    nFaturas: acc.nFaturas + l.nFaturas,
    consumo: acc.consumo + l.consumo,
    geracao: acc.geracao + l.geracao,
    faturado: acc.faturado + l.faturado,
  }), { nFaturas: 0, consumo: 0, geracao: 0, faturado: 0 }), [linhasPorUnidade]);

  const fmtKwh = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtR$ = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
        <select className="sel" value={unidadeFiltro} onChange={e => setUnidadeFiltro(e.target.value)}>
          <option value="todas">Todas as unidades geradoras</option>
          {state.unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        {modo === 'mensal' && (
          <select className="sel" value={competencia} onChange={e => setCompetencia(e.target.value)}>
            <option value="todas">Todas as competências</option>
            {competencias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="stat-grid stat-grid-3">
        {[
          { label: 'CONSUMO TOTAL (KWH)', value: fmtKwh(totais.consumo), icon: Zap },
          { label: 'ENERGIA GERADA TOTAL (KWH)', value: fmtKwh(totais.geracao), icon: TrendingUp },
          { label: 'TOTAL FATURADO (R$)', value: fmtR$(totais.faturado), icon: Building2 },
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
                {linhasPorUnidade.map(l => (
                  <tr key={l.unidade.id}>
                    <td className="bold">{l.unidade.nome}</td>
                    <td>{l.associacao}</td>
                    <td>{l.nFaturas}</td>
                    <td>{fmtKwh(l.consumo)}</td>
                    <td>{fmtKwh(l.geracao)}</td>
                    <td>{fmtR$(l.faturado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td><strong>Total</strong></td><td></td><td>{totais.nFaturas}</td><td>{fmtKwh(totais.consumo)}</td><td>{fmtKwh(totais.geracao)}</td><td>{fmtR$(totais.faturado)}</td></tr></tfoot>
            </table>
        }
      </div>
    </div>
  );
}
