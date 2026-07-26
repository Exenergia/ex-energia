import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../data/supabase.js';
import { useStore } from '../data/store.jsx';
import { useModoEdicao } from '../components/AuthGuard.jsx';

export default function AssociacaoView() {
  const { id } = useParams();
  const { state, addCliente } = useStore();
  const modoEdicao = useModoEdicao();

  const assoc = state.associacoes.find(a => a.id === id);
  const unidades = state.unidades.filter(u => u.associacaoId === id);
  const clientesAssoc = state.clientes.filter(c => unidades.map(u => u.id).includes(c.unidadeId));

  const [colunas, setColunas] = useState([]);
  const [faturas, setFaturas] = useState([]); // array de objetos do banco
  const [competencia, setCompetencia] = useState('');
  const [msg, setMsg] = useState('');
  const [importando, setImportando] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [editandoColuna, setEditandoColuna] = useState(null);
  const [nomeColuna, setNomeColuna] = useState('');
  const fileRef = useRef();

  const chaveConfig = `colunas_assoc_${id}`;

  // carregar colunas salvas e faturas do banco
  useEffect(() => {
    if (!id) return;
    async function carregar() {
      // colunas salvas
      const { data: cfg } = await supabase.from('configuracoes').select('valor').eq('chave', chaveConfig).single();
      if (cfg?.valor) setColunas(cfg.valor);

      // faturas do banco para clientes desta associação
      await carregarFaturas();
    }
    carregar();
  }, [id]);

  async function carregarFaturas() {
    const { data: cliDB } = await supabase.from('clientes').select('id, numero_cliente_enel, nome, cpf');
    const idsAssoc = clientesAssoc.map(c => c.id);

    // buscar todas as faturas dos clientes desta associação
    const { data: fat } = await supabase
      .from('faturas')
      .select('*')
      .in('cliente_id', idsAssoc.length > 0 ? idsAssoc : ['00000000-0000-0000-0000-000000000000']);

    setFaturas(fat || []);

    // definir competência mais recente
    if (fat && fat.length > 0) {
      const comps = [...new Set(fat.map(f => f.competencia))]
        .sort((a, b) => {
          const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
          return (Number(ya)*100 + Number(ma)) - (Number(yb)*100 + Number(mb));
        })
        .reverse();
      setCompetencia(prev => prev || comps[0]);
    }
  }

  async function salvarColunas(novasColunas) {
    await supabase.from('configuracoes').upsert({ chave: chaveConfig, valor: novasColunas }, { onConflict: 'chave' });
    setColunas(novasColunas);
  }

  // competências disponíveis
  const competencias = [...new Set(faturas.map(f => f.competencia))]
    .sort((a, b) => {
      const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
      return (Number(ya)*100 + Number(ma)) - (Number(yb)*100 + Number(mb));
    })
    .reverse();

  // faturas da competência selecionada
  const faturasFiltradas = faturas.filter(f => f.competencia === competencia);

  function parseSmartNumber(rawVal) {
    if (typeof rawVal === 'number') return rawVal;
    if (!rawVal) return null;
    let s = rawVal.toString().replace(/[^\d,.-]/g, '');
    if (s === '') return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // estilo BR: 1.234,56
      else s = s.replace(/,/g, ''); // estilo US: 1,234.56
    } else if (lastComma > -1) {
      s = s.replace(',', '.'); // só vírgula → decimal BR
    }
    const num = parseFloat(s);
    return isNaN(num) ? null : num;
  }

  function somarColuna(col) {
    if (!col) return null;
    return faturasFiltradas.reduce((acc, fatura) => acc + (parseSmartNumber(getCellValue(fatura, col)) || 0), 0);
  }

  const COLUNAS_VALOR = ['Valor a Pagar', 'Valor com Plano'];
  const colunaValor = colunas.find(c => COLUNAS_VALOR.some(alvo => alvo.toLowerCase() === c.toLowerCase()));
  const totalValor = somarColuna(colunaValor);

  const ehLugaOuFred = colunas.some(c => c.toLowerCase() === 'valor a pagar');

  const colunaInjetada = ehLugaOuFred ? colunas.find(c => c.toLowerCase().includes('injetada')) : null;
  const totalInjetada = somarColuna(colunaInjetada);

  const colunaConsumida = ehLugaOuFred ? colunas.find(c => c.toLowerCase().includes('consumid') || c.toLowerCase().includes('consumo')) : null;
  const totalConsumida = somarColuna(colunaConsumida);

  function normalizar(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function encontrarColuna(...termos) {
    return colunas.find(c => {
      const n = normalizar(c);
      return termos.every(t => n.includes(normalizar(t)));
    });
  }

  const colunaConsumoMes = encontrarColuna('consumo', 'mes');
  const totalConsumoMes = somarColuna(colunaConsumoMes);

  const colunaSaldoCredito = encontrarColuna('saldo', 'credito');
  const totalSaldoCredito = somarColuna(colunaSaldoCredito);

  const colunaCreditosUtilizados = encontrarColuna('credito', 'utilizado');
  const totalCreditosUtilizados = somarColuna(colunaCreditosUtilizados);

  const colunaCreditosRecebidos = encontrarColuna('credito', 'recebido');
  const totalCreditosRecebidos = somarColuna(colunaCreditosRecebidos);

  // mapa clienteId → dados do cliente
  const mapaCliente = {};
  state.clientes.forEach(c => { mapaCliente[c.id] = c; });

  // importar xlsx — cria colunas e grava no banco
  function lerXlsx(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true); setMsg('');
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) { setMsg('Arquivo vazio.'); setImportando(false); return; }

        const colsXlsx = Object.keys(rows[0]);
        const colsFinal = colunas.length > 0 ? colunas : colsXlsx;
        await salvarColunas(colsFinal);

        // buscar clientes do banco
        const { data: cliDB } = await supabase.from('clientes').select('id, numero_cliente_enel');
        const mapaUC = {};
        cliDB?.forEach(c => { if (c.numero_cliente_enel) mapaUC[c.numero_cliente_enel] = c.id; });

        // criar clientes novos
        const porUC = new Map();
        rows.forEach(row => {
          const uc = (row['Número da UC'] || '').toString().trim();
          if (uc) porUC.set(uc, row);
        });

        let criados = 0;
        for (const [uc, row] of porUC) {
          if (mapaUC[uc]) continue;
          const nome = (row['Titular da Conta'] || '').toString().trim();
          if (!nome) continue;
          const { data } = await addCliente({
            nome, cpf: (row['CPF/CNPJ'] || '').toString().trim(),
            numeroCliente: uc, numeroEnel: uc,
            unidadeId: unidades[0]?.id || null, origem: assoc?.nome || '',
          });
          if (data?.id) { mapaUC[uc] = data.id; criados++; }
        }

        // gravar faturas
        const meses = { 'janeiro':1,'fevereiro':2,'março':3,'marco':3,'abril':4,'maio':5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12 };
        let gravadas = 0;
        for (const row of rows) {
          const uc = (row['Número da UC'] || '').toString().trim();
          const compRaw = (row['Competência'] || row['Competencia'] || '').toString().trim();
          if (!uc || !compRaw) continue;
          const clienteId = mapaUC[uc];
          if (!clienteId) continue;

          const partes = compRaw.toLowerCase().split(' ');
          const mes = meses[partes[0]];
          const ano = partes[1];
          const comp = mes && ano ? String(mes).padStart(2,'0') + '/' + ano : compRaw;

          const n = v => (v === '' || v === null || v === undefined) ? null : (isFinite(Number(v)) ? Number(v) : null);

          await supabase.from('faturas').delete().eq('cliente_id', clienteId).eq('competencia', comp);
          const { error } = await supabase.from('faturas').insert({
            cliente_id: clienteId, competencia: comp,
            status: (row['Status de Pagamento'] || '').toString().trim() || null,
            valor_pontto: n(row['Total a Pagar Boleto Sunne']),
            valor_concessionaria: n(row['Total a Pagar Boleto Concessionária'] || row['Total a Pagar Boleto Concessionaria']),
            consumo_kwh: n(row['Consumo Total no Mês (kWh)'] || row['Consumo Total no Mes (kWh)']),
            desconto: n(row['Percentual de Economia']),
            vencimento_sunne: (row['Vencimento Sunne'] || '').toString() || null,
            economia_no_mes: n(row['Economia no Mês'] || row['Economia no Mes']),
            total_pago: n(row['Total Pago']),
            dados_completos: row,
          });
          if (!error) gravadas++;
        }

        await carregarFaturas();
        setMsg(`${criados} cliente(s) novo(s) · ${gravadas} fatura(s) gravada(s).`);
      } catch(err) {
        setMsg('Erro: ' + err.message);
      }
      setImportando(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  function salvarNomeColuna(idx) {
    if (!nomeColuna.trim()) return;
    salvarColunas(colunas.map((c, i) => i === idx ? nomeColuna.trim() : c));
    setEditandoColuna(null);
  }
  function excluirColuna(idx) {
    if (!confirm(`Excluir coluna "${colunas[idx]}"?`)) return;
    salvarColunas(colunas.filter((_, i) => i !== idx));
  }

  function getCellValue(fatura, col) {
    // tenta no dados_completos primeiro, depois no campo direto
    if (fatura.dados_completos && fatura.dados_completos[col] !== undefined) {
      const raw = fatura.dados_completos[col];
      const colLower = col.toLowerCase();
      const ehValor = colLower.includes('valor');
      const ehEnergia = colLower.includes('injetada') || colLower.includes('consumid') || colLower.includes('consumo');

      if (ehValor || ehEnergia) {
        const num = parseSmartNumber(raw);
        if (num !== null) {
          if (ehValor) return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
      return raw?.toString() || '';
    }
    return '';
  }

  if (!assoc) return <div style={{padding:40,color:'#6b7280'}}>Associação não encontrada.</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div style={{ padding:'24px 32px 12px', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 4px' }}>{assoc.nome}</h1>
            <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>
              {unidades.map(u=>u.nome).join(', ') || '—'} · {clientesAssoc.length} cliente(s)
            </p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {modoEdicao && (
              <>
                <button onClick={() => fileRef.current.click()} disabled={importando}
                  style={{ padding:'9px 16px', border:'1px solid #e5e3dc', borderRadius:8, fontSize:13, fontWeight:500, background:'#fff', cursor:'pointer' }}>
                  ⬆ Importar extrato
                </button>
                <input ref={fileRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={lerXlsx} />
              </>
            )}
          </div>
        </div>

        {msg && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', color:'#166534', borderRadius:8, padding:'10px 16px', marginBottom:12, fontSize:13 }}>{msg}</div>}

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:13, color:'#6b7280' }}>Competência:</span>
          <select value={competencia} onChange={e => setCompetencia(e.target.value)}
            style={{ padding:'8px 12px', border:'1px solid #e5e3dc', borderRadius:8, fontSize:13, background:'#fff' }}>
            <option value="">Selecione...</option>
            {competencias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {competencia && <span style={{ fontSize:13, color:'#9ca3af' }}>· {faturasFiltradas.length} linha(s)</span>}
          {colunas.length > 0 && <span style={{ fontSize:13, color:'#9ca3af' }}>· {colunas.length} coluna(s)</span>}
          {totalValor !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Total: {totalValor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}</span>}
          {totalInjetada !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Energia Injetada: {totalInjetada.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })} kWh</span>}
          {totalConsumida !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Energia Consumida: {totalConsumida.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })} kWh</span>}
          {totalConsumoMes !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Consumo Total do Mês: {totalConsumoMes.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })} kWh</span>}
          {totalSaldoCredito !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Saldo de Crédito Solar: {totalSaldoCredito.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })} kWh</span>}
          {totalCreditosUtilizados !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Créditos Utilizados: {totalCreditosUtilizados.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })} kWh</span>}
          {totalCreditosRecebidos !== null && <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>· Créditos Recebidos: {totalCreditosRecebidos.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })} kWh</span>}
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'0 32px 32px' }}>
        {colunas.length === 0
          ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:14 }}>
              {modoEdicao ? 'Importe um arquivo .xlsx para criar a tabela.' : 'Nenhum dado importado ainda.'}
            </div>
          : !competencia
          ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:14 }}>Selecione uma competência acima.</div>
          : <table style={{ borderCollapse:'collapse', fontSize:12.5, whiteSpace:'nowrap', minWidth:'max-content' }}>
              <thead>
                <tr style={{ background:'#f7f6f2', position:'sticky', top:0, zIndex:10 }}>
                  {colunas.map((col, idx) => (
                    <th key={idx} style={{ padding:'10px 12px', border:'1px solid #e5e3dc', fontWeight:600, fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.04em', minWidth:140 }}>
                      {modoEdicao && editandoColuna === idx
                        ? <div style={{ display:'flex', gap:4 }}>
                            <input value={nomeColuna} onChange={e=>setNomeColuna(e.target.value)}
                              onKeyDown={e => { if(e.key==='Enter') salvarNomeColuna(idx); if(e.key==='Escape') setEditandoColuna(null); }}
                              style={{ width:120, padding:'2px 6px', fontSize:11, border:'1px solid #d4a017', borderRadius:4 }} autoFocus />
                            <button onClick={() => salvarNomeColuna(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:'#16a34a' }}>✓</button>
                            <button onClick={() => setEditandoColuna(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#e74c3c' }}>✕</button>
                          </div>
                        : <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ flex:1 }}>{col}</span>
                            {modoEdicao && <>
                              <button onClick={() => { setEditandoColuna(idx); setNomeColuna(col); }}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:11 }}>✏️</button>
                              <button onClick={() => excluirColuna(idx)}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:11 }}>🗑</button>
                            </>}
                          </div>
                      }
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {faturasFiltradas.length === 0
                  ? <tr><td colSpan={colunas.length} style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Nenhum dado para esta competência.</td></tr>
                  : faturasFiltradas.map(fatura => (
                      <tr key={fatura.id}>
                        {colunas.map((col, idx) => {
                          const val = getCellValue(fatura, col);
                          const isEditing = editCell?.id === fatura.id && editCell?.col === col;
                          return (
                            <td key={idx}
                              onClick={() => modoEdicao && !isEditing && (setEditCell({id: fatura.id, col}), setEditVal(val))}
                              style={{ padding:'8px 12px', border:'1px solid #f0eeea', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', cursor: modoEdicao ? 'pointer' : 'default', background: isEditing ? '#fefce8' : 'transparent' }}>
                              {isEditing
                                ? <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                    onBlur={() => setEditCell(null)}
                                    onKeyDown={e => { if(e.key==='Escape') setEditCell(null); }}
                                    style={{ width:'100%', border:'1px solid #d4a017', borderRadius:4, padding:'2px 6px', fontSize:12.5, outline:'none' }} autoFocus />
                                : <span title={val}>{val || <span style={{color:'#d1d5db'}}>—</span>}</span>
                              }
                            </td>
                          );
                        })}
                      </tr>
                    ))
                }
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
