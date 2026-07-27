// Robô da Digital Grid (Economy Energy / Usina Aquiraz 2)
// Login → Relatórios → para cada mês com dado: Filtrar → Gerar Relatório de Faturas →
// Baixar → lê o xlsx → grava clientes/faturas no Supabase

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pkg from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const { readFile, utils } = pkg;

const USUARIO = process.env.ECONOMY_EMAIL;
const SENHA = process.env.ECONOMY_PASSWORD;
const SUPABASE_URL = 'https://mbxbvprbpbnpigybbspd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OwxrJ0N_Ra_ts_GBoH_g3g_JirT3f2B';

if (!USUARIO || !SENHA) {
  console.error('ECONOMY_EMAIL e ECONOMY_PASSWORD são obrigatórios.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MESES_REF = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' };

function converterReferencia(ref) {
  // "JUL/2026" -> "07/2026"
  const [mesTxt, ano] = (ref || '').split('/');
  const mesNum = MESES_REF[(mesTxt || '').toUpperCase()];
  return mesNum && ano ? `${mesNum}/${ano}` : ref;
}

async function testarMes(page, downloadPath, mes) {
  console.log(`\n=== Mês ${mes}/2026 ===`);

  await page.evaluate((m) => {
    window.$('.month-checkbox, .year-checkbox').prop('checked', false);
    window.$(`#month-${m}`).prop('checked', true);
    window.$('#year-2026').prop('checked', true);
    if (typeof updateAllSelectedCount === 'function') updateAllSelectedCount();
  }, mes);
  await new Promise(r => setTimeout(r, 500));

  const respostaFiltroPromise = page.waitForResponse(
    res => res.url().includes('/relatorios_json') && res.request().method() === 'POST',
    { timeout: 10000 }
  ).catch(() => null);

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Filtrar'
    );
    if (els.length > 0) (els[0].closest('button') || els[0]).click();
  });

  const respostaFiltro = await respostaFiltroPromise;
  await new Promise(r => setTimeout(r, 1000));

  if (!respostaFiltro) return { sucesso: false, motivo: 'filtro não respondeu' };

  let recordsTotal = null;
  try { recordsTotal = JSON.parse(await respostaFiltro.text()).recordsTotal; } catch (e) {}

  console.log(`  recordsTotal: ${recordsTotal}`);
  if (!recordsTotal || recordsTotal === 0) {
    console.log('  sem dados — pulando.');
    return { sucesso: false, motivo: 'sem dados' };
  }

  const infoClique = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Gerar Relatório de Faturas'
    );
    if (els.length === 0) return { ok: false };
    const btn = els[0].closest('button') || els[0];
    if (!btn.id) btn.id = 'botao-gerar-faturas-debug';
    btn.click();
    return { ok: true, idUsado: btn.id };
  });
  if (!infoClique.ok) return { sucesso: false, motivo: 'botão gerar não encontrado' };

  let virouBaixar = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 4000));
    virouBaixar = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*')).some(el =>
        el.children.length === 0 && el.textContent.trim() === 'Baixar Relatório de Faturas'
      )
    );
    if (virouBaixar) break;
  }
  if (!virouBaixar) return { sucesso: false, motivo: 'geração falhou' };

  const antesDownload = new Set(fs.readdirSync(downloadPath));
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Baixar Relatório de Faturas'
    );
    (els[0].closest('button') || els[0]).click();
  });
  await new Promise(r => setTimeout(r, 6000));

  const novos = fs.readdirSync(downloadPath).filter(f => !antesDownload.has(f));
  if (novos.length === 0) return { sucesso: false, motivo: 'download não aconteceu' };

  const caminho = path.join(downloadPath, `mes-${String(mes).padStart(2, '0')}-2026-${novos[0]}`);
  fs.renameSync(path.join(downloadPath, novos[0]), caminho);
  console.log(`  DOWNLOAD OK — ${path.basename(caminho)}`);
  return { sucesso: true, caminho };
}

async function gravarDados(caminhoArquivo, unidadeId, mapaUC) {
  const wb = readFile(caminhoArquivo, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { defval: '', raw: false });

  let gravadas = 0, erros = 0, ignoradas = 0;

  for (const row of rows) {
    const competencia = converterReferencia(row['Referência']);
    const uc = (row['Número de Instalação'] || '').toString().trim();
    const nome = (row['Nome do Consumidor'] || '').toString().trim();

    if (!competencia || !uc || !nome) { ignoradas++; continue; }

    let clienteId = mapaUC[uc];
    if (!clienteId) {
      const { data } = await supabase.from('clientes').insert({
        nome,
        cpf: (row['Documento'] || '').toString().trim() || null,
        numero_cliente_enel: uc,
        unidade_geradora_id: unidadeId,
        origem: 'Economy',
      }).select().single();
      if (data?.id) { clienteId = data.id; mapaUC[uc] = data.id; console.log('Cliente criado:', nome); }
      else { erros++; continue; }
    }

    await supabase.from('faturas').delete().eq('cliente_id', clienteId).eq('competencia', competencia);
    const { error } = await supabase.from('faturas').insert({
      cliente_id: clienteId,
      competencia,
      status: (row['Status de Pagamento'] || '').toString().trim() || null,
      dados_completos: row,
    });
    if (error) { erros++; console.error('Erro ao gravar fatura:', error.message); }
    else gravadas++;
  }

  console.log(`  Gravadas: ${gravadas} | Ignoradas: ${ignoradas} | Erros: ${erros}`);
  return { gravadas, ignoradas, erros };
}

async function run() {
  console.log('Iniciando navegador...');
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
  await page.goto('https://gestao.dg.energy/login/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.type('#email', USUARIO, { delay: 50 });
  await page.waitForSelector('#password-field', { timeout: 15000 });
  await page.type('#password-field', SENHA, { delay: 50 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await new Promise(r => setTimeout(r, 3000));
  if (page.url().includes('/login')) { console.error('Login falhou.'); process.exit(1); }
  console.log('Login OK.');

  let achouRelatorios = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).some(el =>
      el.children.length === 0 && el.textContent.trim() === 'Relatórios'
    )
  );
  if (!achouRelatorios) {
    await page.evaluate(() => {
      const candidatos = Array.from(document.querySelectorAll('button, svg, [role="button"]'));
      if (candidatos[0]) candidatos[0].click();
    });
    await new Promise(r => setTimeout(r, 1500));
  }
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Relatórios'
    );
    if (els.length > 0) (els[0].closest('a') || els[0].closest('button') || els[0]).click();
  });
  await new Promise(r => setTimeout(r, 3000));

  // busca id real da unidade Aquiraz 2
  const { data: unidades } = await supabase.from('unidades_geradoras').select('id, nome');
  const unidadeAquiraz2 = unidades?.find(u => u.nome.toUpperCase().includes('AQUIRAZ 2'));
  if (!unidadeAquiraz2) { console.error('Não encontrei a unidade "USINA AQUIRAZ 2" no banco.'); process.exit(1); }
  console.log('Unidade Aquiraz 2:', unidadeAquiraz2.id);

  const { data: clientesDB } = await supabase.from('clientes').select('id, numero_cliente_enel');
  const mapaUC = {};
  clientesDB?.forEach(c => { if (c.numero_cliente_enel) mapaUC[c.numero_cliente_enel] = c.id; });

  let totalGravadas = 0;
  for (const mes of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const resultado = await testarMes(page, downloadPath, mes);
    if (resultado.sucesso) {
      const r = await gravarDados(resultado.caminho, unidadeAquiraz2.id, mapaUC);
      totalGravadas += r.gravadas;
    } else {
      console.log(`  ${resultado.motivo}`);
    }
  }

  console.log(`\n=== CONCLUÍDO: ${totalGravadas} fatura(s) gravada(s) no total ===`);
  await browser.close();
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
