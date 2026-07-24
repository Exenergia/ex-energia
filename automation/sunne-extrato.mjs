import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const EMAIL = process.env.SUNNE_EMAIL;
const SENHA = process.env.SUNNE_PASSWORD;
const COMPETENCIA = process.env.COMPETENCIA || 'março 2025';

if (!EMAIL || !SENHA) {
  console.error('SUNNE_EMAIL e SUNNE_PASSWORD são obrigatórios.');
  process.exit(1);
}

async function run() {
  console.log('Iniciando navegador...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  const downloadPath = path.resolve('./downloads');
  fs.mkdirSync(downloadPath, { recursive: true });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
  });

  console.log('Fazendo login...');
  await page.goto('https://ponttoexponencial.sunne.com.br/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 15000 });
  await page.type('input[type="email"], input[name="email"]', EMAIL, { delay: 50 });
  await page.type('input[type="password"]', SENHA, { delay: 50 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log('Login OK.');

  console.log('Navegando para relatórios...');
  await page.goto('https://ponttoexponencial.sunne.com.br/investidor/relatorios', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Expandindo seção...');
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div, button, p, span, h2, h3')) {
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') {
        el.click(); return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // clicar no dropdown "Competência - Início"
  console.log('Clicando em Competência - Início...');
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const el = els.find(e => e.textContent.includes('Competência - Início') && e.children.length < 5);
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: './downloads/dropdown-inicio.png', fullPage: true });

  // inspecionar opções do dropdown aberto
  const opcoes = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('mat-option, .mat-option, li, [role="option"]'));
    return items.map(el => el.textContent.trim()).filter(Boolean).slice(0, 30);
  });
  console.log('Opções encontradas:', opcoes);

  await browser.close();
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
