import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pkg from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const { readFile, utils } = pkg;

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
        el.click();
        return true;
      }
    }
    return false;
  }, texto);
  console.log('Selecionou "' + texto + '":', clicou);
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
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') {
        el.click();
        return;
      }
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
  if (!xlsx) {
    console.error('Arquivo xlsx nao encontrado.');
    process.exit(1);
  }
  console.log('Arquivo baixado:', xlsx);

  const wb = readFile(path.join(downloadPath, xlsx));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { defval: '' });
  console.log('Total linhas:', rows.length);

  const { data: clientesDB } = await supabase.from('clientes').select('id, numero_cliente_enel');
  const mapaUC = {};
  if (clientesDB) {
    clientesDB.forEach(c => {
      if (c.numero_cliente_enel) mapaUC[c.numero_cliente_enel] = c.id;
    });
  }
  console.log('Clientes no banco:', Object.keys(mapaUC).length);

  const porUC = new Map();
  rows.forEach(row => {
    const uc = (row['Numero da UC'] || row['Número da UC'] || '').toString().trim();
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
    if (data && data.id) {
      mapaUC[uc] = data.id;
      console.log('Cliente criado:', nome);
    }
  }

  let gravadas = 0;
  let erros = 0;

  for (const row of rows) {
    const uc = (row['Numero da UC'] || row['Número da UC'] || '').toString().trim();
    const compRaw = (row['Competencia'] || row['Competência'] || '').toString().trim();
const meses = { 'janeiro':1,'fevereiro':2,'março':3,'marco':3,'abril':4,'maio':5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12 };
const partes = compRaw.toLowerCase().split(' ');
const mes = meses[partes[0]];
const ano = partes[1];
const comp = mes && ano ? String(mes).padStart(2,'0') + '/' + ano : compRaw;
    if (!uc || !comp) continue;
    const clienteId = mapaUC[uc];
    if (!clienteId) continue;

    const n = v => {
      if (v === '' || v === null || v === undefined) return null;
      const num = Number(v);
      return isFinite(num) ? num : null;
    };

    await supabase.from('faturas').delete().eq('cliente_id', clienteId).eq('competencia', comp);

    const { error } = await supabase.from('faturas').insert({
      cliente_id: clienteId,
      competencia: comp,
      status: (row['Status de Pagamento'] || '').toString().trim() || null,
      valor_pontto: n(row['Total a Pagar Boleto Sunne']),
      valor_concessionaria: n(row['Total a Pagar Boleto Concessionaria'] || row['Total a Pagar Boleto Concessionária']),
      consumo_kwh: n(row['Consumo Total no Mes (kWh)'] || row['Consumo Total no Mês (kWh)']),
      desconto: n(row['Percentual de Economia']),
      vencimento_sunne: (row['Vencimento Sunne'] || '').toString().trim() || null,
      vencimento_concessionaria: (row['Vencimento Concessionaria'] || row['Vencimento Concessionária'] || '').toString().trim() || null,
      economia_no_mes: n(row['Economia no Mes'] || row['Economia no Mês']),
      economia_total: n(row['Economia Total Ate Este Mes'] || row['Economia Total Até Este Mês']),
      saldo_credito_solar: n(row['Saldo de Credito Solar'] || row['Saldo de Crédito Solar']),
      creditos_utilizados: n(row['Creditos Utilizados'] || row['Créditos Utilizados']),
      creditos_recebidos: n(row['Creditos Recebidos'] || row['Créditos Recebidos']),
      total_pago: n(row['Total Pago']),
      link_fatura_sunne: (row['Link Fatura Atualizada Sunne'] || '').toString().trim() || null,
      link_fatura_concessionaria: (row['Link Fatura Concessionaria'] || row['Link Fatura Concessionária'] || '').toString().trim() || null,
      leitura_anterior: (row['Leitura Anterior'] || '').toString().trim() || null,
      leitura_atual: (row['Leitura Atual'] || '').toString().trim() || null,
      dados_completos: row,
    });

    if (error) {
      erros++;
      console.error('Erro fatura:', error.message);
    } else {
      gravadas++;
    }
  }

  console.log('Faturas gravadas:', gravadas, '| Erros:', erros);
  await browser.close();
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
