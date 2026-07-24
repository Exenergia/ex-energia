import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { readFile, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const EMAIL = process.env.SUNNE_EMAIL;
const SENHA = process.env.SUNNE_PASSWORD;
const COMPETENCIA = process.env.COMPETENCIA || 'março 2025';
const SUPABASE_URL = 'https://mbxbvprbpbnpigybbspd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OwxrJ0N_Ra_ts_GBoH_g3g_JirT3f2B';

if (!EMAIL || !SENHA) {
  console.error('SUNNE_EMAIL e SUNNE_PASSWORD são obrigatórios.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  console.log(`Selecionou "${texto}":`, clicou);
  await new Promise(r => setTimeout(r, 1000));
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

  await page.goto('https://ponttoexponencial.sunne.com.br/investidor/relatorios', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    for (const el of document.querySelectorAll('mat-panel-title, div, span')) {
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  await selecionarCompetencia(page, 603, 216, COMPETENCIA);
  await selecionarCompetencia(page, 935, 216, COMPETENCIA);

  console.log('Clicando em Gerar Excel...');
  await page.evaluate(() => {
    const botoes = Array.from(document.querySelectorAll('button'));
    const b = botoes.find(b => b.textContent.includes('Gerar Excel') && b.getBoundingClientRect().y > 450);
    if (b) b.click();
  });

  await new Promise(r => setTimeout(r, 8000));

  const arquivos = fs.readdirSync(downloadPath);
  const xlsx = arquivos.find(f => f.endsWith('.xlsx'));
  if (!xlsx) { console.error('Arquivo xlsx não encontrado.'); process.exit(1); }
  console.log('Arquivo baixado:', xlsx);

  // ler xlsx
  const wb = readFile(path.join(downloadPath, xlsx));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { defval: '' });
  console.log('Total linhas:', rows.length);

  // buscar clientes existentes no banco
  const { data: clientesDB } = await supabase.from('clientes').select('id, numero_cliente_enel');
  const mapaUC = {};
  clientesDB?.forEach(c => { if (c.numero_cliente_enel) mapaUC[c.numero_cliente_enel] = c.id; });
  console.log('Clientes no banco:', Object.keys(mapaUC).length);

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
      nome,
      cpf: (row['CPF/CNPJ'] || '').toString().trim() || null,
      numero_cliente_enel: uc,
      origem: 'Sunne',
    }).select().single();
    if (data?.id) { mapaUC[uc] = data.id; console.log('Cliente criado:', nome); }
  }

  // gravar faturas
  let gravadas = 0, erros = 0;
  for (const row of rows) {
    const uc = (row['Número da UC'] || '').toString().trim();
    const comp = (row['Competência'] || '').toString().trim();
    if (!uc || !comp) continue;
    const clienteId = mapaUC[uc];
    if (!clienteId) continue;

    const n = v => (v === '' || v === null || v === undefined) ? null : Number(v);

    await supabase.from('faturas').delete().eq('cliente_id', clienteId).eq('competencia', comp);
    const { error } = await supabase.from('faturas').insert({
      cliente_id: clienteId,
      competencia: comp,
      status: (row['Status de Pagamento'] || '').toString().trim() || null,
      fatura_ex_energia: n(row['Total a Pagar Boleto Sunne']),
      fatura_concessionaria: n(row['Total a Pagar Boleto Concessionária']),
      consumo_kwh: n(row['Consumo Total no Mês (kWh)']),
      desconto: n(row['Percentual de Economia']),
      vencimento_sunne: (row['Vencimento Sunne'] || '').toString().trim() || null,
      economia_no_mes: n(row['Economia no Mês']),
      total_pago: n(row['Total Pago']),
      dados_completos: row,
    });
    if (error) { erros++; console.error('Erro fatura:', error.message); }
    else gravadas++;
  }

  console.log(`Faturas gravadas: ${gravadas} | Erros: ${erros}`);
  await browser.close();
}

run().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
