import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useStore } from '../data/store.jsx';

export default function Associacoes() {
  const { state, addAssociacao, removeAssociacao, updateAssociacao } = useStore();
  const [show, setShow] = useState(false);
  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editEmpresa, setEditEmpresa] = useState('');

  function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    addAssociacao({ nome: nome.trim(), empresaParceira: empresa.trim() });
    setNome(''); setEmpresa(''); setShow(false);
  }

  function iniciarEdicao(a) {
    setEditId(a.id);
    setEditNome(a.nome);
    setEditEmpresa(a.empresaParceira || '');
  }

  function salvarEdicao(id) {
    updateAssociacao(id, { nome: editNome, empresaParceira: editEmpresa });
    setEditId(null);
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Associações</h1><p>Empresas parceiras que administram a gestão do rateio de energia.</p></div>
        <button className="btn-primary" onClick={() => setShow(s => !s)}>+ Nova associação</button>
      </div>
      {show && (
        <form className="inline-form" onSubmit={salvar}>
          <input placeholder="Nome da associação" value={nome} onChange={e => setNome(e.target.value)} />
          <input placeholder="Empresa parceira" value={empresa} onChange={e => setEmpresa(e.target.value)} />
          <button className="btn-primary" type="submit">Salvar</button>
        </form>
      )}
      <div className="panel-card table-wrap">
        {state.associacoes.length === 0
          ? <div className="empty-cell">Nenhuma associação cadastrada ainda.</div>
          : <table>
              <thead><tr><th>ASSOCIAÇÃO</th><th>EMPRESA PARCEIRA</th><th>UNIDADES VINCULADAS</th><th></th></tr></thead>
              <tbody>
                {state.associacoes.map(a => (
                  <tr key={a.id}>
                    {editId === a.id ? (
                      <>
                        <td><input value={editNome} onChange={e => setEditNome(e.target.value)} style={{padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13,width:'100%'}} /></td>
                        <td><input value={editEmpresa} onChange={e => setEditEmpresa(e.target.value)} style={{padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13,width:'100%'}} /></td>
                        <td>{state.unidades.filter(u => u.associacaoId === a.id).length}</td>
                        <td className="col-action">
                          <div className="icon-row">
                            <Check size={15} className="row-edit" onClick={() => salvarEdicao(a.id)} />
                            <X size={15} className="row-del" onClick={() => setEditId(null)} />
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="bold">{a.nome}</td>
                        <td>{a.empresaParceira || '—'}</td>
                        <td>{state.unidades.filter(u => u.associacaoId === a.id).length}</td>
                        <td className="col-action">
                          <div className="icon-row">
                            <Pencil size={14} className="row-edit" onClick={() => iniciarEdicao(a)} />
                            <Trash2 size={14} className="row-del" onClick={() => removeAssociacao(a.id)} />
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
