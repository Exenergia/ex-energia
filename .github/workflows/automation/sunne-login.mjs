import puppeteer from 'puppeteer';

const EMAIL = process.env.SUNNE_EMAIL;
const SENHA = process.env.SUNNE_PASSWORD;

if (!EMAIL || !SENHA) {
  console.error('SUNNE_EMAIL e SUNNE_PASSWORD são obrigatórios.');
  process.exit(1);
}

async function login() {
  console.log('Iniciando navegador...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('Acessando site da Sunne...');
  await page.goto('https://ponttoexponencial.sunne.com.br/login', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  console.log('Preenchendo email...');
  await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 15000 });
  await page.type('input[type="email"], input[name="email"], input[placeholder*="mail"]', EMAIL, { delay: 50 });

  console.log('Preenchendo senha...');
  await page.type('input[type="password"]', SENHA, { delay: 50 });

  console.log('Clicando em entrar...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  const url = page.url();
  console.log('URL após login:', url);

  if (url.includes('login')) {
    console.error('FALHA: ainda na página de login. Verifique credenciais.');
    await browser.close();
    process.exit(1);
  }

  console.log('LOGIN OK — acesso confirmado.');
  await browser.close();
}

login().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
