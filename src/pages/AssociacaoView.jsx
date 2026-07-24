import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../data/supabase.js';
import { useStore } from '../data/store.jsx';

// 69 colunas do extrato Sunne — ordem original
const COLUNAS_PADRAO = [
  'Número da UC','CPF/CNPJ','Titular da Conta','Endereço','Competência',
  'Competência - extenso','Mês de Competência','Vencimento Sunne','Emissão da Sunne',
  'Geração - UTC','Geração Sunne','Leitura Anterior','Leitura Anterior - extenso',
  'Leitura Atual','Leitura Atual - extenso','Leitura Futura','Leitura Futura - extenso',
  'Tipo de Instalação','Consumo Total no Mês (kWh)','Saldo de Crédito Solar',
  'Créditos Utilizados','Créditos Recebidos','Tarifa PIS/COFINS','Tarifa Cheia',
  'Tarifa Compensável Cheia','Percentual de Economia','Economia no Mês',
  'Economia Total Até Este Mês','Total a Pagar Boleto Sunne','Total Juros/Multa',
  'Total Pago','Valor Com Plano','Valor do Crédito Com Desconto',
  'Valor do Crédito Sem Desconto','Valor Sem Plano','Valor do Custo de Disponibilidade',
  'Status de Pagamento','Código de Pagamento do Boleto Sunne',
  'Data de Pagamento Boleto Sunne','Nosso Número - Boleto Sunne',
  'Linha Digitável do Boleto Sunne','Link Fatura Original Sunne',
  'Link Fatura Atualizada Sunne','Histórico de Comunicação (UTC)',
  'Status do Pagamento Automático','Valor do Pagamento Automático (R$)',
  'Data do Pagamento Automático','Identificador do Pagamento Automático',
  'Vencimento Concessionária','Emissão Concessionária',
  'Total a Pagar Boleto Concessionária','Linha Digitável do Boleto da Concessionária',
  'Link Fatura Concessionária','Pagamento Automático para Concessionária',
  'PIX copia e cola','PIX id','Créditos Contratados',
  'Tarifa Compensável Com Desconto','Data de compensação','Usina','Nome do cliente',
  'Lançamentos','Unificada','Lançamento ID','Tipo do Lançamento','Valor do Lançamento',
  'Descrição do Lançamento','Número do cliente','Cliente'
];

export default function AssociacaoView() {
  const { id } = useParams();
  const { state, addCliente } = useStore();

  const assoc = state.associacoes.find(a => a.id === id);
  const unidades = state.unidades.filter(u => u.associacaoId === id);

  // dados locais da tabela: { competencia: { uc: { coluna: valor } } }
  const [dados, setDados] = useState({});
  const [competencia, setCompetencia] = useState('');
  const [colunas, setColunas] = useState(COLUNAS_PADRAO);
  const [editandoColuna, setEditandoColuna] = useState(null);
  const [nomeColuna, setNomeColuna] = useState('');
  const [editCell, setEditCell] = useState(null); // {uc, col}
  const [editVal, setEditVal] = useState('');
  const [msg, setMsg] = useState('');
  const [importando, setImportando] = useState(false);
  const fileRef = useRef();

  // competências disponíveis
  const competencias = Object.keys(dados).sort().reverse();

  // linhas da competência selecionada
  const linhas = competencia ? Object.entries(dados[competencia] || {}) : [];

  // ── importar xlsx ──
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

        // descobrir competências no arquivo
        const novosDados = { ...dados };
        let linhasImportadas = 0;

        for (const row of rows) {
          const uc = (row['Número da UC'] || '').toString().trim();
          const comp = (row['Competência'] || '').toString().trim();
          if (!uc || !comp) continue;

          if (!novosDados[comp]) novosDados[comp] = {};
          novosDados[comp][uc] = {};
          colunas.forEach(col => {
            const v = row[col];
            novosDados[comp][uc][col] = v !== undefined && v !== null ? v.toString() : '';
          });

          // salvar no banco
          const clienteExiste = state.clientes.find(c => c.numeroCliente === uc);
          let clienteId = clienteExiste?.id;
          if (!clienteExiste) {
            const nome = (row['Titular da Conta'] || '').toString().trim();
            if (nome) {
              const { data } = await addCliente({
                nome,
                cpf: (row['CPF/CNPJ'] || '').toString().trim(),
                numeroCliente: uc,
                numeroEnel: uc,
                unidadeId: unidades[0]?.id || null,
                origem: assoc?.nome || 'Sunne',
              });
              clienteId = data?.id;
            }
          }

          if (clienteId) {
            // buscar id real se veio do state
            const { data: cliDB } = await supabase.from('clientes').select('id').eq('numero_cliente_enel', uc).single();
            const cid = cliDB?.id || clienteId;

            await supabase.from('faturas').delete().eq('cliente_id', cid).eq('competencia', comp);
            await supabase.from('faturas').insert({
              cliente_id: cid,
              competencia: comp,
              dados_completos: novosDados[comp][uc],
              status: (row['Status de Pagamento'] || '').toString().trim(),
              fatura_ex_energia: parseFloat(row['Total a Pagar Boleto Sunne']) || null,
              fatura_concessionaria: parseFloat(row['Total a Pagar Boleto Concessionária']) || null,
              consumo_kwh: parseFloat(row['Consumo Total no Mês (kWh)']) || null,
            });
          }
          linhasImportadas++;
        }

        setDados(novosDados);
        // selecionar a competência mais recente
        const comps = Object.keys(novosDados).sort().reverse();
        if (comps[0]) setCompetencia(comps[0]);
        setMsg(`${linhasImportadas} linha(s) importada(s) em ${[...new Set(rows.map(r => r['Competência']).filter(Boolean))].length} competência(s).`);
      } catch(err) {
        setMsg('Erro: ' + err.message);
      }
      setImportando(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  // ── editar célula ──
  function iniciarEdit(uc, col, val) {
    setEditCell({ uc, col });
    setEditVal(val);
  }
  function salvarCell() {
    if (!editCell || !competencia) return;
    setDados(prev => ({
      ...prev,
      [competencia]: {
        ...prev[competencia],
        [editCell.uc]: { ...prev[competencia][editCell.uc], [editCell.col]: editVal }
      }
    }));
    setEditCell(null);
  }

  // ── editar nome de coluna ──
  function salvarNomeColuna(idx) {
    if (!nomeColuna.trim()) return;
    setColunas(prev => prev.map((c, i) => i === idx ? nomeColuna.trim() : c));
    setEditandoColuna(null);
  }
  function excluirColuna(idx) {
    if (!confirm(`Excluir coluna "${colunas[idx]}"?`)) return;
    setColunas(prev => prev.filter((_, i) => i !== idx));
  }

  if (!assoc) return <div style={{padding:40,color:'#6b7280'}}>Associação não encontrada.</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* HEADER */}
      <div style={{ padding:'24px 32px 0', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 4px' }}>{assoc.nome}</h1>
            <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>
              {unidades.map(u=>u.nome).join(', ') || '—'} · {state.clientes.filter(c=>unidades.map(u=>u.id).includes(c.unidadeId)).length} cliente(s)
            </p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => fileRef.current.click()} disabled={importando}
              style={{ padding:'9px 16px', border:'1px solid #e5e3dc', borderRadius:8, fontSize:13, fontWeight:500, background:'#fff', cursor:'pointer' }}>
              ⬆ Importar extrato
            </button>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={lerXlsx} />
          </div>
        </div>

        {msg && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', color:'#166534', borderRadius:8, padding:'10px 16px', marginBottom:12, fontSize:13 }}>{msg}</div>}

        {/* SELETOR COMPETÊNCIA */}
        <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
          <span style={{ fontSize:13, color:'#6b7280' }}>Competência:</span>
          <select value={competencia} onChange={e => setCompetencia(e.target.value)}
            style={{ padding:'8px 12px', border:'1px solid #e5e3dc', borderRadius:8, fontSize:13, background:'#fff' }}>
            <option value="">Selecione...</option>
            {competencias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {competencia && <span style={{ fontSize:13, color:'#6b7280' }}>{linhas.length} linha(s)</span>}
        </div>
      </div>

      {/* TABELA COM SCROLL */}
      <div style={{ flex:1, overflow:'auto', padding:'0 32px 32px', marginTop:8 }}>
        {!competencia
          ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:14 }}>
              Importe um extrato ou selecione uma competência acima.
            </div>
          : <table style={{ borderCollapse:'collapse', fontSize:12.5, whiteSpace:'nowrap', minWidth:'max-content' }}>
              <thead>
                <tr style={{ background:'#f7f6f2', position:'sticky', top:0, zIndex:10 }}>
                  {colunas.map((col, idx) => (
                    <th key={idx} style={{ padding:'10px 12px', border:'1px solid #e5e3dc', fontWeight:600, fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.04em', minWidth:140, position:'relative' }}>
                      {editandoColuna === idx
                        ? <div style={{ display:'flex', gap:4 }}>
                            <input value={nomeColuna} onChange={e=>setNomeColuna(e.target.value)}
                              onKeyDown={e => e.key==='Enter' && salvarNomeColuna(idx)}
                              style={{ width:120, padding:'2px 6px', fontSize:11, border:'1px solid #d4a017', borderRadius:4 }} autoFocus />
                            <button onClick={() => salvarNomeColuna(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:'#16a34a', fontSize:14 }}>✓</button>
                            <button onClick={() => setEditandoColuna(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#e74c3c', fontSize:14 }}>✕</button>
                          </div>
                        : <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ flex:1 }}>{col}</span>
                            <button onClick={() => { setEditandoColuna(idx); setNomeColuna(col); }}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:11, padding:'0 2px' }} title="Renomear">✏️</button>
                            <button onClick={() => excluirColuna(idx)}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:11, padding:'0 2px' }} title="Excluir coluna">🗑</button>
                          </div>
                      }
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0
                  ? <tr><td colSpan={colunas.length} style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Nenhum dado para esta competência.</td></tr>
                  : linhas.map(([uc, rowData]) => (
                      <tr key={uc} style={{ borderBottom:'1px solid #e5e3dc' }}>
                        {colunas.map((col, idx) => {
                          const val = rowData[col] ?? '';
                          const isEditing = editCell?.uc === uc && editCell?.col === col;
                          return (
                            <td key={idx} style={{ padding:'8px 12px', border:'1px solid #f0eeea', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer', background: isEditing ? '#fefce8' : 'transparent' }}
                              onClick={() => !isEditing && iniciarEdit(uc, col, val)}>
                              {isEditing
                                ? <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                    onBlur={salvarCell}
                                    onKeyDown={e => { if(e.key==='Enter') salvarCell(); if(e.key==='Escape') setEditCell(null); }}
                                    style={{ width:'100%', border:'1px solid #d4a017', borderRadius:4, padding:'2px 6px', fontSize:12.5, outline:'none' }}
                                    autoFocus />
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
