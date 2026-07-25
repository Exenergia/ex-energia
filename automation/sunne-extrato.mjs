import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pkg from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const { readFile, utils } = pkg;

const EMAIL = process.env.SUNNE_EMAIL;
const SENHA = process.env.SUNNE_PASSWORD;
const SUPABASE_URL = 'https://mbxbvprbpbnpigybbspd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OwxrJ0N_Ra_ts_GBoH_g3g_JirT3f2B';

if (!EMAIL || !SENHA) {
  console.error('SUNNE_EMAIL e SUNNE_PASSWORD são obrigatórios.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_NUM = { 'janeiro':1,'fevereiro':2,'março':3,'marco':3,'abril':4,'maio':5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12 };

// gerar lista de competências: jan/2025 a jul/2026
function gerarCompetencias() {
  const lista = [];
  for (let m = 1; m <= 12; m++) lista.push({ label: `${MESES_PT[m-1]} 2025`, comp: `${String(m).padStart(2,'0')}/2025` });
  for (let m = 1; m <= 7; m++) lista.push({ label: `${MESES_PT[m-1]} 2026`, comp: `${String(m).padStart(2,'0')}/2026` });
  return lista;
}

async function selecionarCompetencia(page, x, y, texto) {
  await page.mouse.click(x + 150, y + 5);
  await new Promise(r => setTimeout(r, 1500));
  const clicou = await page.evaluate((alvo) => {
    const els = Array.from(document.querySelectorAll('mat-option'));
    for (const el of els) {
      if (el.textContent.trim().toLowerCase() === alvo.toLowerCase()) {
        el.click(); return true;
      }
    }
    return false;
  }, texto);
  await new Promise(r => setTimeout(r, 1000));
  return clicou;
}

async function importarMes(page, label, comp, downloadPath, mapaUC) {
  console.log(`\n=== Importando: ${label} (${comp}) ===`);

  // limpar downloads anteriores
  fs.readdirSync(downloadPath).forEach(f => fs.unlinkSync(path.join(downloadPath, f)));

  // navegar para relatórios
  await page.goto('https://ponttoexponencial.sunne.com.br/investidor/relatorios', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // expandir seção
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('mat-panel-title, div, span')) {
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // selecionar competência início e fim
  const ini = await selecionarCompetencia(page, 603, 216, label);
  const fim = await selecionarCompetencia(page, 935, 216, label);
  console.log(`Selecionou início: ${ini} | fim: ${fim}`);

  if (!ini || !fim) {
    console.log(`AVISO: competência "${label}" não encontrada — pulando.`);
    return 0;
  }

  // gerar excel
  await page.evaluate(() => {
    const botoes = Array.from(document.querySelectorAll('button'));
    const b = botoes.find(b => b.textContent.includes('Gerar Excel') && b.getBoundingClientRect().y > 450);
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 8000));

  const arquivos = fs.readdirSync(downloadPath);
  const xlsx = arquivos.find(f => f.endsWith('.xlsx'));
  if (!xlsx) { console.log('Arquivo não baixado — pulando.'); return 0; }

  const wb = readFile(path.join(downloadPath, xlsx));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { defval: '' });
  console.log(`Linhas no arquivo: ${rows.length}`);
  if (rows.length === 0) return 0;

  // criar clientes novos
  const porUC = new Map();
  rows.forEach(row => {
    const uc = (row['Número da UC'] || '').toString().trim();
    if (uc) porUC.set(uc, row);
  });

  for (const [uc, row] of porUC) {
    if (mapaUC[uc]) continue;
    const nome = (row['Titular da Conta'] || '').toString().trim();
    if (!nome) continue;
    const { data } = await supabase.from('clientes').insert({
      nome, cpf: (row['CPF/CNPJ'] || '').toString().trim() || null,
      numero_cliente_enel: uc, origem: 'Sunne',
    }).select().single();
    if (data?.id) { mapaUC[uc] = data.id; console.log('Cliente criado:', nome); }
  }

  // gravar faturas
  const n = v => (v === '' || v === null || v === undefined) ? null : (isFinite(Number(v)) ? Number(v) : null);
  let gravadas = 0, erros = 0;

  for (const row of rows) {
    const uc = (row['Número da UC'] || '').toString().trim();
    if (!uc) continue;
    const clienteId = mapaUC[uc];
    if (!clienteId) continue;

    await supabase.from('faturas').delete().eq('cliente_id', clienteId).eq('competencia', comp);
    const { error } = await supabase.from('faturas').insert({
      cliente_id: clienteId, competencia: comp,
      status: (row['Status de Pagamento'] || '').toString().trim() || null,
      valor_pontto: n(row['Total a Pagar Boleto Sunne']),
      valor_concessionaria: n(row['Total a Pagar Boleto Concessionária'] || row['Total a Pagar Boleto Concessionaria']),
      consumo_kwh: n(row['Consumo Total no Mês (kWh)'] || row['Consumo Total no Mes (kWh)']),
      desconto: n(row['Percentual de Economia']),
      vencimento_sunne: (row['Vencimento Sunne'] || '').toString() || null,
      economia_no_mes: n(row['Economia no Mês'] || row['Economia no Mes']),
      total_pago: n(row['Total Pago']),
      dados_completos: row,
    });
    if (error) { erros++; console.error('Erro:', error.message); }
    else gravadas++;
  }

  console.log(`Faturas gravadas: ${gravadas} | Erros: ${erros}`);
  return gravadas;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  const downloadPath = path.resolve('./downloads');
  fs.mkdirSync(downloadPath, { recursive: true });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });

  // login
  console.log('Login...');
  await page.goto('https://ponttoexponencial.sunne.com.br/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 15000 });
  await page.type('input[type="email"], input[name="email"]', EMAIL, { delay: 50 });
  await page.type('input[type="password"]', SENHA, { delay: 50 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log('Login OK.');

  // buscar clientes existentes
  const { data: clientesDB } = await supabase.from('clientes').select('id, numero_cliente_enel');
  const mapaUC = {};
  clientesDB?.forEach(c => { if (c.numero_cliente_enel) mapaUC[c.numero_cliente_enel] = c.id; });
  console.log('Clientes no banco:', Object.keys(mapaUC).length);

  // importar todos os meses
  const competencias = gerarCompetencias();
  let totalGravadas = 0;

  for (const { label, comp } of competencias) {
    const gravadas = await importarMes(page, label, comp, downloadPath, mapaUC);
    totalGravadas += gravadas;
  }

  console.log(`\n=== CONCLUÍDO: ${totalGravadas} faturas gravadas no total ===`);
  await browser.close();
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
