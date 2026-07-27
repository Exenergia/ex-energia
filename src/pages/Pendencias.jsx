import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../data/supabase.js';

export default function Pendencias() {
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoTexto, setNovoTexto] = useState('');
  const [novoResolvido, setNovoResolvido] = useState(false);
  const [novoMarcado, setNovoMarcado] = useState(false);

  const [erro, setErro] = useState(null);

  async function carregar() {
    setErro(null);
    const { data, error } = await supabase.from('pendencias').select('*').order('created_at', { ascending: false });
    if (error) setErro(`Erro ao carregar: ${error.message}`);
    setLinhas(data || []);
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, []);

  async function adicionar() {
    if (!novoTexto.trim()) return;
    setErro(null);
    const dataMarcacao = novoMarcado ? new Date().toISOString() : null;
    const { data, error } = await supabase.from('pendencias').insert({
      texto: novoTexto.trim(),
      resolvido: novoResolvido,
      marcado_exclusao: novoMarcado,
      data_marcacao_exclusao: dataMarcacao,
    }).select().single();
    if (error) { setErro(`Erro ao salvar: ${error.message}`); return; }
    if (data) setLinhas(prev => [data, ...prev]);
    setNovoTexto('');
    setNovoResolvido(false);
    setNovoMarcado(false);
  }

  async function atualizarTexto(id, texto) {
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, texto } : l));
    await supabase.from('pendencias').update({ texto }).eq('id', id);
  }

  async function toggleResolvido(id, valor) {
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, resolvido: valor } : l));
    await supabase.from('pendencias').update({ resolvido: valor }).eq('id', id);
    // TODO: quando marcado, disparar e-mail de aviso (depende de serviço de e-mail a definir)
  }

  async function toggleMarcadoExclusao(id, valor) {
    const dataMarcacao = valor ? new Date().toISOString() : null;
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, marcado_exclusao: valor, data_marcacao_exclusao: dataMarcacao } : l));
    await supabase.from('pendencias').update({ marcado_exclusao: valor, data_marcacao_exclusao: dataMarcacao }).eq('id', id);
  }

  async function apagarAgora(id) {
    await supabase.from('pendencias').delete().eq('id', id);
    setLinhas(prev => prev.filter(l => l.id !== id));
  }

  if (carregando) return <div style={{ padding: 40, color: '#6b7280' }}>Carregando...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pendências</h1>
          <p>Uso interno — anotações e tarefas pendentes da equipe.</p>
        </div>
      </div>

      <div className="panel-card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={novoResolvido} onChange={e => setNovoResolvido(e.target.checked)} title="Feito" />
        <input
          className="sel"
          style={{ flex: 1 }}
          placeholder="Nova pendência..."
          value={novoTexto}
          onChange={e => setNovoTexto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && adicionar()}
        />
        <input type="checkbox" checked={novoMarcado} onChange={e => setNovoMarcado(e.target.checked)} title="Apagar em 15 dias" />
        <button className="btn-icon" onClick={adicionar}><Plus size={16} /></button>
      </div>

      {erro && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      <div className="panel-card table-wrap">
        {linhas.length === 0
          ? <div className="empty-cell">Nenhuma pendência cadastrada.</div>
          : <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Feito</th>
                  <th>Pendência</th>
                  <th style={{ width: 120 }}>Apagar em 15 dias</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id}>
                    <td>
                      <input type="checkbox" checked={!!l.resolvido} onChange={e => toggleResolvido(l.id, e.target.checked)} />
                    </td>
                    <td>
                      <input
                        className="sel"
                        style={{ width: '100%', border: 'none', background: 'transparent' }}
                        value={l.texto}
                        onChange={e => atualizarTexto(l.id, e.target.value)}
                      />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!l.marcado_exclusao} onChange={e => toggleMarcadoExclusao(l.id, e.target.checked)} />
                      {l.marcado_exclusao && l.data_marcacao_exclusao && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          marcado em {new Date(l.data_marcacao_exclusao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn-icon" onClick={() => apagarAgora(l.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
