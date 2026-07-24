import { Check } from 'lucide-react';
import { useStore } from '../data/store.jsx';

export default function Conflitos() {
  const { state } = useStore();
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Conflitos de sincronização</h1>
          <p>O robô encontrou dados diferentes dos que já estavam cadastrados. Escolha qual valor manter em cada caso.</p>
        </div>
      </div>
      <div className="panel-card">
        <div className="conflict-box">
          {state.conflitos.length === 0
            ? <><Check size={26} color="var(--accent)" /><span>Nenhum conflito pendente no momento.</span></>
            : state.conflitos.map(c => <div key={c.id}>{c.descricao}</div>)
          }
        </div>
      </div>
    </div>
  );
}
