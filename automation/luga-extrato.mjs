import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pkg from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const { readFile, utils } = pkg;

const EMAIL = process.env.LUGA_EMAIL;
const SENHA = process.env.LUGA_PASSWORD;
const SUPABASE_URL = 'https://mbxbvprbpbnpigybbspd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OwxrJ0N_Ra_ts_GBoH_g3g_JirT3f2B';

if (!EMAIL || !SENHA) {
  console.error('LUGA_EMAIL e LUGA_PASSWORD são obrigatórios.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function baixarRelatorio() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const downloadPath = path.resolve('./downloads');
  fs.mkdirSync(downloadPath, { recursive: true });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });

  console.log('Login...');
  await page.goto('https://luga.vendria.com.br/auth/login', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('#login', { timeout: 15000 });
  await page.type('#login', EMAIL, { delay: 50 });
  await page.waitForSelector('#password', { timeout: 15000 });
  await page.type('#password', SENHA, { delay: 50 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await new Promise(r => setTimeout(r, 3000));

  if (page.url().includes('/auth/login')) {
    throw new Error('Login falhou — ainda na página de login.');
  }
  console.log('Login OK.');

  console.log('Indo para Faturamentos...');
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Faturamentos'
    );
    if (els.length === 0) throw new Error('Link Faturamentos não encontrado.');
    (els[0].closest('a') || els[0].closest('button') || els[0]).click();
  });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Marcando "Selecionar todos"...');
  await page.click('#select-all');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Rolando e clicando em "Exportar relatório"...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Exportar relatório'
    );
    if (els.length === 0) throw new Error('Botão Exportar relatório não encontrado.');
    (els[0].closest('button') || els[0]).click();
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicando em "Exportar" no modal...');
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('Modal não abriu.');
    const btn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === 'Exportar');
    if (!btn) throw new Error('Botão Exportar não encontrado no modal.');
    btn.click();
  });

  console.log('Aguardando download...');
  await new Promise(r => setTimeout(r, 8000));

  const arquivos = fs.readdirSync(downloadPath).filter(f => f.endsWith('.xlsx'));
  if (arquivos.length === 0) throw new Error('Nenhum arquivo .xlsx baixado.');
  console.log('Arquivo baixado:', arquivos[0]);

  await browser.close();
  return path.join(downloadPath, arquivos[0]);
}

async function gravarDados(caminhoArquivo) {
  // busca os ids reais das unidades geradoras da Luga
  const { data: unidades } = await supabase.from('unidades_geradoras').select('id, nome');
  const unidadeLuga = unidades?.find(u => u.nome.toUpperCase().includes('AQUIRAZ 3'));
  const unidadeFred = unidades?.find(u => u.nome.toUpperCase().includes('AQUIRAZ 4'));

  if (!unidadeLuga || !unidadeFred) {
    throw new Error('Não encontrei as unidades "USINA AQUIRAZ 3" e/ou "USINA AQUIRAZ 4" no banco.');
  }
  console.log('Unidade Luga (Aquiraz 3):', unidadeLuga.id);
  console.log('Unidade FRED (Aquiraz 4):', unidadeFred.id);

  const wb = readFile(caminhoArquivo, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  const headerRowIdx = raw.findIndex(r => r.includes('Competência'));
  if (headerRowIdx === -1) throw new Error('Não encontrei a linha de cabeçalho com "Competência" no arquivo.');
  const headers = raw[headerRowIdx];
  console.log('Cabeçalho encontrado na linha', headerRowIdx + 1, ':', JSON.stringify(headers));

  const rows = raw.slice(headerRowIdx + 1)
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== ''));

  console.log(`Linhas de dados no arquivo: ${rows.length}`);
  console.log('Primeira linha de dados:', rows.length > 0 ? JSON.stringify(rows[0]) : '(vazio)');

  const { data: clientesDB } = await supabase.from('clientes').select('id, numero_cliente_enel');
  const mapaUC = {};
  clientesDB?.forEach(c => { if (c.numero_cliente_enel) mapaUC[c.numero_cliente_enel] = c.id; });

  let gravadas = 0, erros = 0, ignoradas = 0;

  for (const row of rows) {
    const competencia = (row['Competência'] || '').toString().trim();
    const usina = (row['Usina'] || '').toString().toUpperCase();
    const uc = (row['UC'] || '').toString().trim();
    const cliente = (row['Cliente'] || '').toString().trim();

    if (!competencia || !uc || !cliente) { ignoradas++; continue; }

    let unidadeId;
    if (usina.includes('AQUIRAZ 3')) unidadeId = unidadeLuga.id;
    else if (usina.includes('AQUIRAZ 4')) unidadeId = unidadeFred.id;
    else { console.log(`Linha ignorada — usina não reconhecida: "${row['Usina']}"`); ignoradas++; continue; }

    // cria o cliente se ainda não existir, já vinculado à unidade certa
    let clienteId = mapaUC[uc];
    if (!clienteId) {
      const { data } = await supabase.from('clientes').insert({
        nome: cliente,
        numero_cliente_enel: uc,
        unidade_geradora_id: unidadeId,
        origem: 'Luga',
      }).select().single();
      if (data?.id) { clienteId = data.id; mapaUC[uc] = data.id; console.log('Cliente criado:', cliente); }
      else { erros++; continue; }
    }

    // formata "Valor a Pagar" como moeda em reais (R$ 0,00)
    const valorNum = Number(row['Valor a Pagar']);
    if (!isNaN(valorNum)) {
      row['Valor a Pagar'] = 'R$ ' + valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    await supabase.from('faturas').delete().eq('cliente_id', clienteId).eq('competencia', competencia);
    const { error } = await supabase.from('faturas').insert({
      cliente_id: clienteId,
      competencia,
      status: (row['Status'] || '').toString().trim() || null,
      dados_completos: row,
    });
    if (error) { erros++; console.error('Erro ao gravar fatura:', error.message); }
    else gravadas++;
  }

  console.log(`\n=== CONCLUÍDO: ${gravadas} fatura(s) gravada(s) | ${ignoradas} ignorada(s) | ${erros} erro(s) ===`);
}

async function run() {
  const arquivo = await baixarRelatorio();
  await gravarDados(arquivo);
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
