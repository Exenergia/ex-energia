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

async function selecionarCompetencia(page, x, y, texto) {
  // clicar no dropdown (à direita do label)
  await page.mouse.click(x + 150, y + 5);
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: `./downloads/dropdown-aberto-${x}.png`, fullPage: true });

  // listar opções visíveis
  const opcoes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('mat-option, .mat-option, [role="option"], li'))
      .map(el => ({ text: el.textContent.trim(), tag: el.tagName }))
      .filter(o => o.text.length > 0)
      .slice(0, 40);
  });
  console.log(`Opções para ${texto}:`, JSON.stringify(opcoes));

  // clicar na opção desejada
  const clicou = await page.evaluate((alvo) => {
    const els = Array.from(document.querySelectorAll('mat-option, .mat-option, [role="option"], li'));
    for (const el of els) {
      if (el.textContent.trim().toLowerCase().includes(alvo.toLowerCase())) {
        el.click();
        return true;
      }
    }
    return false;
  }, texto);
  console.log(`Clicou em "${texto}":`, clicou);
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

  // expandir seção
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('mat-panel-title, div, span')) {
      if (el.textContent.trim() === 'Faturamento - Extrato Detalhado') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // selecionar Competência - Início
  await selecionarCompetencia(page, 603, 216, COMPETENCIA);

  // selecionar Competência - Fim
  await selecionarCompetencia(page, 935, 216, COMPETENCIA);

  await page.screenshot({ path: './downloads/antes-gerar.png', fullPage: true });

  // clicar em Gerar Excel (segundo botão — do Extrato Detalhado)
  console.log('Clicando em Gerar Excel...');
  const gerou = await page.evaluate(() => {
    const botoes = Array.from(document.querySelectorAll('button'));
    const b = botoes.find(b => b.textContent.includes('Gerar Excel') && b.getBoundingClientRect().y > 450);
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('Gerar Excel clicado:', gerou);

  // aguardar download
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: './downloads/pos-gerar.png', fullPage: true });

  const arquivos = fs.readdirSync(downloadPath);
  console.log('Arquivos baixados:', arquivos);

  await browser.close();
}

run().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
