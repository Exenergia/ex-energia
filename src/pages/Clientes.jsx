import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../data/store.jsx';

export default function Clientes() {
  const { state, addCliente, removeCliente } = useStore();
  const [selecionados, setSelecionados] = useState(new Set());
  const [importando, setImportando] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRefPlanilha = useRef();
  const fileRefSunne = useRef();

  // ── seleção ──
  function toggleLinha(id) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleTodos() {
    if (selecionados.size === state.clientes.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(state.clientes.map(c => c.id)));
    }
  }
  function apagarMarcados() {
    if (selecionados.size === 0) return;
    if (!confirm(`Apagar ${selecionados.size} cliente(s) selecionado(s)?`)) return;
    selecionados.forEach(id => removeCliente(id));
    setSelecionados(new Set());
  }

  // ── importar planilha genérica ──
  function lerPlanilha(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true);
    setMsg('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        let count = 0;
        rows.forEach(row => {
          const nome = row['Nome'] || row['NOME'] || row['nome'] || '';
          if (!nome.trim()) return;
          addCliente({
            nome: nome.trim(),
            cpf: (row['CPF'] || row['CPF/CNPJ'] || row['cpf'] || '').toString().trim(),
            numeroCliente: (row['Número do Cliente'] || row['Numero do Cliente'] || row['numeroCliente'] || row['Nº Cliente'] || '').toString().trim(),
            numeroEnel: (row['Nº Enel'] || row['Numero Enel'] || row['numeroEnel'] || row['Número Enel'] || '').toString().trim(),
            origem: 'Planilha',
          });
          count++;
        });
        setMsg(`${count} cliente(s) importado(s).`);
      } catch(err) {
        setMsg('Erro ao ler o arquivo. Verifique se é um .xlsx válido.');
      }
      setImportando(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  // ── importar extrato Sunne ──
  function lerSunne(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true);
    setMsg('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // agrupa por UC — pega a última linha de cada UC para dados cadastrais
        const porUC = new Map();
        rows.forEach(row => {
          const uc = (row['Número da UC'] || '').toString().trim();
          if (uc) porUC.set(uc, row);
        });

        let clientesCriados = 0;
        let clientesIgnorados = 0;

        porUC.forEach((row, uc) => {
          const nome = (row['Titular da Conta'] || '').toString().trim();
          if (!nome) return;
          // não duplica se UC já existir
          const jaExiste = state.clientes.find(c =>
            c.numeroEnel === uc || c.numeroCliente === uc
          );
          if (jaExiste) { clientesIgnorados++; return; }

          addCliente({
            nome,
            cpf: (row['CPF/CNPJ'] || '').toString().trim(),
            endereco: (row['Endereço'] || '').toString().trim(),
            numeroCliente: uc,
            numeroEnel: uc,
            desconto: (row['Percentual de Economia'] || '').toString().trim(),
            usina: (row['Usina'] || '').toString().trim(),
            origem: 'Sunne',
          });
          clientesCriados++;
        });

        const partes = [];
        if (clientesCriados > 0) partes.push(`${clientesCriados} cliente(s) importado(s)`);
        if (clientesIgnorados > 0) partes.push(`${clientesIgnorados} já existia(m) — ignorado(s)`);
        setMsg(partes.join(' · ') || 'Nenhum cliente novo encontrado.');
      } catch(err) {
        setMsg('Erro ao ler o extrato Sunne. Verifique se é o arquivo correto.');
      }
      setImportando(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  const todosM = state.clientes.length > 0 && selecionados.size === state.clientes.length;

  return (
    <div>
      <div className="page-header">
        <div><h1>Clientes</h1><p>Carteira de clientes de crédito de energia solar.</p></div>
        <div className="header-actions">
          <button
            className="btn-ghost"
            onClick={apagarMarcados}
            disabled={selecionados.size === 0}
            style={selecionados.size > 0 ? { borderColor: '#e74c3c', color: '#e74c3c' } : {}}
          >
            🗑 Apagar marcados {selecionados.size > 0 ? `(${selecionados.size})` : ''}
          </button>

          <button className="btn-ghost" onClick={() => fileRefSunne.current.click()} disabled={importando}>
            ⬆ Importar extrato Sunne
          </button>
          <input ref={fileRefSunne} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={lerSunne} />

          <button className="btn-ghost" onClick={() => fileRefPlanilha.current.click()} disabled={importando}>
            ⬆ Importar planilha
          </button>
          <input ref={fileRefPlanilha} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={lerPlanilha} />

          <button className="btn-primary">+ Novo cliente</button>
        </div>
      </div>

      {msg && <div className="import-msg">{msg}</div>}

      <div className="toolbar">
        <input className="search-input" placeholder="Buscar por nome, CPF ou nº Enel" />
        <select className="sel"><option>Todas as associações</option></select>
        <select className="sel"><option>Todas as unidades</option></select>
        <select className="sel"><option>Competência: última fatura de cada cliente</option></select>
      </div>

      <p className="helper-text">
        Associação filtra pela unidade geradora vinculada ao cliente. "Origem" indica de onde o cadastro veio.
        Marque as linhas com o checkbox à esquerda e clique em "Apagar marcados" para remover.
        Arraste a borda direita de uma coluna para redimensionar.
      </p>

      <div className="panel-card table-wrap">
        {state.clientes.length === 0
          ? <div className="empty-cell">Nenhum cliente cadastrado ainda.</div>
          : <table>
              <thead>
                <tr>
                  <th className="col-check">
                    <input type="checkbox" checked={todosM} onChange={toggleTodos} title="Marcar todos" />
                  </th>
                  <th>CLIENTE</th><th>CPF</th><th>UNIDADE GERADORA</th>
                  <th>NÚMERO DO CLIENTE</th><th>Nº ENEL</th><th>ORIGEM</th>
                  <th>CONSUMO MÉDIO</th><th>DESCONTO</th>
                  <th>FATURA EX ENERGIA</th><th>FATURA CONCESSIONÁRIA</th>
                </tr>
              </thead>
              <tbody>
                {state.clientes.map(c => (
                  <tr key={c.id} className={selecionados.has(c.id) ? 'row-selected' : ''}>
                    <td><input type="checkbox" checked={selecionados.has(c.id)} onChange={() => toggleLinha(c.id)} /></td>
                    <td className="bold">{c.nome}</td>
                    <td>{c.cpf || '—'}</td>
                    <td>{state.unidades.find(u => u.id === c.unidadeId)?.nome || '—'}</td>
                    <td>{c.numeroCliente || '—'}</td>
                    <td>{c.numeroEnel || '—'}</td>
                    <td>{c.origem}</td>
                    <td>—</td><td>—</td><td>—</td><td>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
