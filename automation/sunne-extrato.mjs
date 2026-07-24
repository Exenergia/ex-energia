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
  console.log('Login OK. URL:', page.url());

  console.log('Navegando para relatórios...');
  await page.goto('https://ponttoexponencial.sunne.com.br/investidor/relatorios', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Expandindo seção Faturamento - Extrato Detalhado...');
  const expandido = await page.evaluate(() => {
    const divs = document.querySelectorAll('div, button, p, span, h2, h3');
    for (const el of divs) {
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') {
        el.click();
        return true;
      }
    }
    return false;
  });
  console.log('Seção expandida:', expandido);
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: './downloads/relatorios-expandido.png', fullPage: true });
  console.log('Screenshot após expandir salvo.');

  const html = await page.evaluate(() => {
    const section = Array.from(document.querySelectorAll('*')).find(el => 
      el.textContent.includes('Faturamento - Extrato Detalhado') && 
      el.textContent.includes('Competência')
    );
    return section ? section.innerHTML.substring(0, 3000) : 'Seção não encontrada';
  });
  console.log('HTML da seção:', html);

  await browser.close();
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
