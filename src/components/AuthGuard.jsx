import { useState } from 'react';

const SENHA = 'Exenergia321##';

let modoEdicaoGlobal = false;
const listeners = new Set();

export function getModoEdicao() { return modoEdicaoGlobal; }
export function setModoEdicaoGlobal(v) {
  modoEdicaoGlobal = v;
  listeners.forEach(fn => fn(v));
}

export function useModoEdicao() {
  const [ativo, setAtivo] = useState(modoEdicaoGlobal);
  useState(() => {
    listeners.add(setAtivo);
    return () => listeners.delete(setAtivo);
  });
  return ativo;
}

export function BotaoEdicao() {
  const ativo = useModoEdicao();
  const [showModal, setShowModal] = useState(false);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  function ativar() {
    if (senha === SENHA) {
      setModoEdicaoGlobal(true);
      setShowModal(false);
      setSenha(''); setErro('');
    } else {
      setErro('Senha incorreta.');
    }
  }

  function desativar() {
    setModoEdicaoGlobal(false);
  }

  return (
    <>
      {ativo
        ? <button onClick={desativar}
            style={{ padding:'8px 16px', background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:8, fontSize:13, fontWeight:600, color:'#92400e', cursor:'pointer' }}>
            🔓 Modo edição ativo — clique para bloquear
          </button>
        : <button onClick={() => setShowModal(true)}
            style={{ padding:'8px 16px', background:'#fff', border:'1px solid #e5e3dc', borderRadius:8, fontSize:13, fontWeight:500, color:'#6b7280', cursor:'pointer' }}>
            🔒 Modo edição
          </button>
      }

      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:12, padding:32, width:320, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin:'0 0 8px', fontSize:18, fontWeight:700 }}>🔒 Modo edição</h2>
            <p style={{ margin:'0 0 20px', fontSize:13, color:'#6b7280' }}>Digite a senha para habilitar edição de dados e estrutura.</p>
            <input
              type="password"
              placeholder="Senha"
              value={senha}
              onChange={e => { setSenha(e.target.value); setErro(''); }}
              onKeyDown={e => e.key === 'Enter' && ativar()}
              autoFocus
              style={{ width:'100%', padding:'10px 12px', border:`1px solid ${erro ? '#e74c3c' : '#e5e3dc'}`, borderRadius:8, fontSize:14, marginBottom:8, boxSizing:'border-box' }}
            />
            {erro && <p style={{ color:'#e74c3c', fontSize:12, margin:'0 0 8px' }}>{erro}</p>}
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={() => { setShowModal(false); setSenha(''); setErro(''); }}
                style={{ flex:1, padding:'10px', border:'1px solid #e5e3dc', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={ativar}
                style={{ flex:1, padding:'10px', border:'none', borderRadius:8, fontSize:13, fontWeight:600, background:'#d4a017', color:'#111', cursor:'pointer' }}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
