import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const EMAIL = process.env.SUNNE_EMAIL;
const SENHA = process.env.SUNNE_PASSWORD;

if (!EMAIL || !SENHA) {
  console.error('SUNNE_EMAIL e SUNNE_PASSWORD são obrigatórios.');
  process.exit(1);
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
    for (const el of document.querySelectorAll('div, button, p, span, h2, h3')) {
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // listar todos os textos de elementos folha para achar o dropdown
  const textos = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.childElementCount === 0) {
        const t = el.textContent.trim();
        if (t.length > 3 && t.length < 60) {
          const r = el.getBoundingClientRect();
          if (r.width > 50 && r.height > 10) {
            results.push({ tag: el.tagName, text: t, x: Math.round(r.x), y: Math.round(r.y) });
          }
        }
      }
    });
    return results.slice(0, 60);
  });
  console.log('Textos visíveis:', JSON.stringify(textos, null, 2));

  await browser.close();
}

run().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
