import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../data/store.jsx';

export default function UnidadesGeradoras() {
  const { state, addUnidade, removeUnidade } = useStore();
  const [show, setShow] = useState(false);
  const [nome, setNome] = useState('');
  const [assocId, setAssocId] = useState('');
  const [kwp, setKwp] = useState('');
  const [loc, setLoc] = useState('');

  function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    addUnidade({ nome: nome.trim(), associacaoId: assocId, potenciaKwp: kwp, localizacao: loc });
    setNome(''); setAssocId(''); setKwp(''); setLoc(''); setShow(false);
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
                    <td className="bold">{u.nome}</td>
                    <td>{state.associacoes.find(a => a.id === u.associacaoId)?.nome || '—'}</td>
                    <td>{u.potenciaKwp || '—'}</td>
                    <td>{u.localizacao || '—'}</td>
                    <td>{state.clientes.filter(c => c.unidadeId === u.id).length}</td>
                    <td className="col-action"><div className="icon-row"><Pencil size={14} className="row-edit" /><Trash2 size={14} className="row-del" onClick={() => removeUnidade(u.id)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
