import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../data/supabase.js';
import { useStore } from '../data/store.jsx';
import { useModoEdicao } from '../components/AuthGuard.jsx';

export default function AssociacaoView() {
  const { id } = useParams();
  const { state, addCliente } = useStore();

  const assoc = state.associacoes.find(a => a.id === id);
  const unidades = state.unidades.filter(u => u.associacaoId === id);

  const [colunas, setColunas] = useState([]);
  const [linhas, setLinhas] = useState({}); // { competencia: { uc: { col: val } } }
  const [competencia, setCompetencia] = useState('');
  const [msg, setMsg] = useState('');
  const [importando, setImportando] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [editandoColuna, setEditandoColuna] = useState(null);
  const [nomeColuna, setNomeColuna] = useState('');
  const fileRef = useRef();

  const modoEdicao = useModoEdicao();

  const chaveConfig = `colunas_assoc_${id}`;
  const chaveDados = `dados_assoc_${id}`;

  // carregar colunas e dados do Supabase ao iniciar
  useEffect(() => {
    if (!id) return;
    async function carregar() {
      const { data: cfg } = await supabase.from('configuracoes').select('valor').eq('chave', chaveConfig).single();
      if (cfg?.valor) setColunas(cfg.valor);

      const { data: dad } = await supabase.from('configuracoes').select('valor').eq('chave', chaveDados).single();
      if (dad?.valor) {
        setLinhas(dad.valor);
        const comps = Object.keys(dad.valor).sort().reverse();
        if (comps[0]) setCompetencia(comps[0]);
      }
    }
    carregar();
  }, [id]);

  async function salvarColunas(novasColunas) {
    await supabase.from('configuracoes').upsert({ chave: chaveConfig, valor: novasColunas }, { onConflict: 'chave' });
    setColunas(novasColunas);
  }

  async function salvarDados(novosLinhas) {
    await supabase.from('configuracoes').upsert({ chave: chaveDados, valor: novosLinhas }, { onConflict: 'chave' });
    setLinhas(novosLinhas);
  }

  // importar xlsx
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

        // colunas vêm do cabeçalho do xlsx
        const colsXlsx = Object.keys(rows[0]);

        // salvar colunas (mantém as existentes + adiciona novas)
        const colsAtuais = colunas.length > 0 ? colunas : colsXlsx;
        const colsFinal = colsAtuais.length > 0 ? colsAtuais : colsXlsx;
        await salvarColunas(colsFinal);

        // montar dados por competência
        const novosLinhas = { ...linhas };
        let count = 0;

        for (const row of rows) {
          const uc = (row['Número da UC'] || '').toString().trim();
          const comp = (row['Competência'] || '').toString().trim();
          if (!uc || !comp) continue;

          if (!novosLinhas[comp]) novosLinhas[comp] = {};
          const rowData = {};
          colsFinal.forEach(col => {
            rowData[col] = row[col] !== undefined && row[col] !== null ? row[col].toString() : '';
          });
          novosLinhas[comp][uc] = rowData;
          count++;

          // criar cliente no banco se não existir
          const existe = state.clientes.find(c => c.numeroCliente === uc);
          if (!existe) {
            const nome = (row['Titular da Conta'] || '').toString().trim();
            if (nome) {
              await addCliente({
                nome,
                cpf: (row['CPF/CNPJ'] || '').toString().trim(),
                numeroCliente: uc,
                numeroEnel: uc,
                unidadeId: unidades[0]?.id || null,
                origem: assoc?.nome || '',
              });
            }
          }
        }

        await salvarDados(novosLinhas);
        const comps = Object.keys(novosLinhas).sort().reverse();
        if (comps[0]) setCompetencia(comps[0]);

        const nComps = new Set(rows.map(r => r['Competência']).filter(Boolean)).size;
        setMsg(`${count} linha(s) importada(s) em ${nComps} competência(s). Colunas: ${colsFinal.length}.`);
      } catch(err) {
        setMsg('Erro: ' + err.message);
      }
      setImportando(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  // editar célula
  function salvarCell() {
    if (!editCell || !competencia) return;
    const novos = { ...linhas, [competencia]: { ...linhas[competencia], [editCell.uc]: { ...linhas[competencia][editCell.uc], [editCell.col]: editVal } } };
    salvarDados(novos);
    setEditCell(null);
  }

  // renomear coluna
  function salvarNomeColuna(idx) {
    if (!nomeColuna.trim()) return;
    const novas = colunas.map((c, i) => i === idx ? nomeColuna.trim() : c);
    salvarColunas(novas);
    setEditandoColuna(null);
  }

  // excluir coluna
  function excluirColuna(idx) {
    if (!confirm(`Excluir coluna "${colunas[idx]}"?`)) return;
    const novas = colunas.filter((_, i) => i !== idx);
    salvarColunas(novas);
  }

  if (!assoc) return <div style={{padding:40,color:'#6b7280'}}>Associação não encontrada.</div>;

  const competencias = Object.keys(linhas).sort().reverse();
  const linhasComp = competencia ? Object.entries(linhas[competencia] || {}) : [];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* HEADER */}
      <div style={{ padding:'24px 32px 12px', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 4px' }}>{assoc.nome}</h1>
            <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>
              {unidades.map(u=>u.nome).join(', ') || '—'} · {state.clientes.filter(c=>unidades.map(u=>u.id).includes(c.unidadeId)).length} cliente(s)
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
          {competencia && <span style={{ fontSize:13, color:'#6b7280' }}>{linhasComp.length} linha(s)</span>}
          {colunas.length > 0 && <span style={{ fontSize:13, color:'#9ca3af' }}>· {colunas.length} coluna(s)</span>}
        </div>
      </div>

      {/* TABELA */}
      <div style={{ flex:1, overflow:'auto', padding:'0 32px 32px' }}>
        {colunas.length === 0
          ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:14 }}>
              Importe um arquivo .xlsx para criar a tabela automaticamente.
            </div>
          : !competencia
          ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:14 }}>
              Selecione uma competência acima.
            </div>
          : <table style={{ borderCollapse:'collapse', fontSize:12.5, whiteSpace:'nowrap', minWidth:'max-content' }}>
              <thead>
                <tr style={{ background:'#f7f6f2', position:'sticky', top:0, zIndex:10 }}>
                  {colunas.map((col, idx) => (
                    <th key={idx} style={{ padding:'10px 12px', border:'1px solid #e5e3dc', fontWeight:600, fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.04em', minWidth:140 }}>
                      {editandoColuna === idx
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
                {linhasComp.length === 0
                  ? <tr><td colSpan={colunas.length} style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Nenhum dado para esta competência.</td></tr>
                  : linhasComp.map(([uc, rowData]) => (
                      <tr key={uc}>
                        {colunas.map((col, idx) => {
                          const val = rowData[col] ?? '';
                          const isEditing = editCell?.uc === uc && editCell?.col === col;
                          return (
                            <td key={idx}
                              onClick={() => modoEdicao && !isEditing && (setEditCell({uc, col}), setEditVal(val))}
                              style={{ padding:'8px 12px', border:'1px solid #f0eeea', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer', background: isEditing ? '#fefce8' : 'transparent' }}>
                              {isEditing
                                ? <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                    onBlur={salvarCell}
                                    onKeyDown={e => { if(e.key==='Enter') salvarCell(); if(e.key==='Escape') setEditCell(null); }}
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
