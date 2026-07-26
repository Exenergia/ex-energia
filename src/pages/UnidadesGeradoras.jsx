import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useStore } from '../data/store.jsx';

export default function UnidadesGeradoras() {
  const { state, addUnidade, removeUnidade, updateUnidade } = useStore();
  const [show, setShow] = useState(false);
  const [nome, setNome] = useState('');
  const [assocId, setAssocId] = useState('');
  const [kwp, setKwp] = useState('');
  const [loc, setLoc] = useState('');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    addUnidade({ nome: nome.trim(), associacaoId: assocId, potenciaKwp: kwp, localizacao: loc });
    setNome(''); setAssocId(''); setKwp(''); setLoc(''); setShow(false);
  }

  function iniciarEdicao(u) {
    setEditId(u.id);
    setEditData({ nome: u.nome, associacaoId: u.associacaoId, potenciaKwp: u.potenciaKwp || '', localizacao: u.localizacao || '' });
  }

  async function salvarEdicao() {
    await updateUnidade(editId, editData);
    setEditId(null);
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Unidades geradoras</h1><p>Usinas vinculadas a cada associação.</p></div>
        <button className="btn-primary" onClick={() => setShow(s => !s)}>+ Nova unidade</button>
      </div>
      {show && (
        <form className="inline-form" onSubmit={salvar}>
          <input placeholder="Nome da unidade" value={nome} onChange={e => setNome(e.target.value)} />
          <select value={assocId} onChange={e => setAssocId(e.target.value)}>
            <option value="">Associação...</option>
            {state.associacoes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <input placeholder="Potência (kWp)" value={kwp} onChange={e => setKwp(e.target.value)} />
          <input placeholder="Localização" value={loc} onChange={e => setLoc(e.target.value)} />
          <button className="btn-primary" type="submit">Salvar</button>
        </form>
      )}
      <div className="panel-card table-wrap">
        {state.unidades.length === 0
          ? <div className="empty-cell">Nenhuma unidade geradora cadastrada ainda.</div>
          : <table>
              <thead><tr><th>UNIDADE GERADORA</th><th>ASSOCIAÇÃO</th><th>POTÊNCIA (KWP)</th><th>LOCALIZAÇÃO</th><th>CLIENTES</th><th></th></tr></thead>
              <tbody>
                {state.unidades.map(u => (
                  <tr key={u.id}>
                    {editId === u.id ? (
                      <>
                        <td><input value={editData.nome} onChange={e => setEditData(d => ({...d, nome: e.target.value}))} className="edit-input" /></td>
                        <td>
                          <select value={editData.associacaoId} onChange={e => setEditData(d => ({...d, associacaoId: e.target.value}))} className="edit-input">
                            {state.associacoes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                          </select>
                        </td>
                        <td><input value={editData.potenciaKwp} onChange={e => setEditData(d => ({...d, potenciaKwp: e.target.value}))} className="edit-input" /></td>
                        <td><input value={editData.localizacao} onChange={e => setEditData(d => ({...d, localizacao: e.target.value}))} className="edit-input" /></td>
                        <td>{state.clientes.filter(c => c.unidadeId === u.id).length}</td>
                        <td className="col-action">
                          <div className="icon-row">
                            <Check size={15} color="#16a34a" style={{cursor:'pointer'}} onClick={salvarEdicao} />
                            <X size={15} color="#e74c3c" style={{cursor:'pointer'}} onClick={() => setEditId(null)} />
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="bold">{u.nome}</td>
                        <td>{state.associacoes.find(a => a.id === u.associacaoId)?.nome || '—'}</td>
                        <td>{u.potenciaKwp || '—'}</td>
                        <td>{u.localizacao || '—'}</td>
                        <td>{state.clientes.filter(c => c.unidadeId === u.id).length}</td>
                        <td className="col-action">
                          <div className="icon-row">
                            <Pencil size={14} className="row-edit" onClick={() => iniciarEdicao(u)} />
                            <Trash2 size={14} className="row-del" onClick={() => removeUnidade(u.id)} />
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
