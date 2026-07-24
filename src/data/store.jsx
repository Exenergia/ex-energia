import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [associacoes, setAssociacoes] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [faturas, setFaturas] = useState([]);
  const [conflitos, setConflitos] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── carregar tudo ao iniciar ──
  useEffect(() => {
    async function carregar() {
      const [a, u, c, f] = await Promise.all([
        supabase.from('associacoes').select('*').order('nome'),
        supabase.from('unidades_geradoras').select('*').order('nome'),
        supabase.from('clientes').select('*').order('nome'),
        supabase.from('faturas').select('*'),
      ]);
      setAssociacoes(a.data || []);
      setUnidades(u.data || []);
      setClientes(c.data || []);
      setFaturas(f.data || []);
      setLoading(false);
    }
    carregar();
  }, []);

  // normaliza campos snake_case do banco para camelCase usado no app
  function normAssoc(a) {
    return { id: a.id, nome: a.nome, empresaParceira: a.empresa_parceira };
  }
  function normUnidade(u) {
    return {
      id: u.id,
      nome: u.nome,
      associacaoId: u.associacao_id,
      potenciaKwp: u.potencia_kwp,
      localizacao: u.localizacao,
    };
  }
  function normCliente(c) {
    return {
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      endereco: c.endereco,
      numeroCliente: c.numero_cliente_enel,
      numeroEnel: c.numero_cliente_enel,
      desconto: c.desconto_aplicado,
      unidadeId: c.unidade_geradora_id,
      origem: c.origem,
    };
  }

  // ── associações ──
  async function addAssociacao(a) {
    const { data, error } = await supabase.from('associacoes')
      .insert({ nome: a.nome, empresa_parceira: a.empresaParceira })
      .select().single();
    if (!error) setAssociacoes(prev => [...prev, data]);
  }
  async function removeAssociacao(id) {
    await supabase.from('associacoes').delete().eq('id', id);
    setAssociacoes(prev => prev.filter(a => a.id !== id));
  }
  async function updateAssociacao(id, patch) {
    const { data } = await supabase.from('associacoes')
      .update({ nome: patch.nome, empresa_parceira: patch.empresaParceira })
      .eq('id', id).select().single();
    if (data) setAssociacoes(prev => prev.map(a => a.id === id ? data : a));
  }

  // ── unidades ──
  async function addUnidade(u) {
    const { data, error } = await supabase.from('unidades_geradoras')
      .insert({ nome: u.nome, associacao_id: u.associacaoId, potencia_kwp: u.potenciaKwp, localizacao: u.localizacao })
      .select().single();
    if (!error) setUnidades(prev => [...prev, data]);
  }
  async function removeUnidade(id) {
    await supabase.from('unidades_geradoras').delete().eq('id', id);
    setUnidades(prev => prev.filter(u => u.id !== id));
  }

  async function recarregarClientes() {
    const { data } = await supabase.from('clientes').select('*').order('nome');
    setClientes(data || []);
  }

  async function recarregarFaturas() {
    const { data } = await supabase.from('faturas').select('*');
    setFaturas(data || []);
  }

  // ── clientes ──
  async function addCliente(c) {
    const { data, error } = await supabase.from('clientes').insert({
      nome: c.nome,
      cpf: c.cpf || null,
      endereco: c.endereco || null,
      numero_cliente_enel: c.numeroCliente || null,
      desconto_aplicado: c.desconto || null,
      unidade_geradora_id: c.unidadeId || null,
      origem: c.origem || null,
    }).select().single();
    if (!error && data) setClientes(prev => [...prev, data]);
    return { data, error };
  }
  async function removeCliente(id) {
    await supabase.from('clientes').delete().eq('id', id);
    setClientes(prev => prev.filter(c => c.id !== id));
  }
  async function updateCliente(id, patch) {
    const { data } = await supabase.from('clientes').update({
      nome: patch.nome,
      cpf: patch.cpf,
      endereco: patch.endereco,
      numero_cliente_enel: patch.numeroCliente,
      desconto_aplicado: patch.desconto,
      unidade_geradora_id: patch.unidadeId,
      origem: patch.origem,
    }).eq('id', id).select().single();
    if (data) setClientes(prev => prev.map(c => c.id === id ? data : c));
  }

  // state normalizado para o app
  const state = {
    associacoes: associacoes.map(normAssoc),
    unidades: unidades.map(normUnidade),
    clientes: clientes.map(normCliente),
    faturas,
    conflitos,
    loading,
  };

  async function addFatura(f) {
    const n = v => (v === null || v === undefined || v === '') ? null : Number(v);
    // apaga fatura existente para o mesmo cliente+competencia antes de inserir
    await supabase.from('faturas')
      .delete()
      .eq('cliente_id', f.clienteId)
      .eq('competencia', f.competencia);
    const { data, error } = await supabase.from('faturas').insert({
      cliente_id: f.clienteId,
      competencia: f.competencia,
      status: f.status || null,
      fatura_ex_energia: n(f.faturaExEnergia),
      fatura_concessionaria: n(f.faturaConcessionaria),
      consumo_kwh: n(f.consumoKwh),
      desconto: n(f.desconto),
      vencimento_sunne: f.vencimentoSunne || null,
      vencimento_concessionaria: f.vencimentoConcessionaria || null,
      economia_no_mes: n(f.economiaNoMes),
      economia_total: n(f.economiaTotalAteEstesMes),
      saldo_credito_solar: n(f.saldoCreditoSolar),
      creditos_utilizados: n(f.creditosUtilizados),
      creditos_recebidos: n(f.creditosRecebidos),
      total_pago: n(f.totalPago),
      link_fatura_sunne: f.linkFaturaSunne || null,
      link_fatura_concessionaria: f.linkFaturaConcessionaria || null,
      leitura_anterior: f.leituraAnterior || null,
      leitura_atual: f.leituraAtual || null,
    }).select().single();
    if (!error && data) setFaturas(prev => [...prev, data]);
    return { data, error };
  }

  return (
    <StoreContext.Provider value={{ state, addAssociacao, removeAssociacao, updateAssociacao, addUnidade, removeUnidade, addCliente, removeCliente, updateCliente, recarregarClientes, recarregarFaturas, addFatura }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fora do StoreProvider');
  return ctx;
}
