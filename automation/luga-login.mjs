import puppeteer from 'puppeteer';

const EMAIL = process.env.LUGA_EMAIL;
const SENHA = process.env.LUGA_PASSWORD;

if (!EMAIL || !SENHA) {
  console.error('LUGA_EMAIL e LUGA_PASSWORD são obrigatórios.');
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

  console.log('Acessando site da Luga...');
  await page.goto('https://luga.vendria.com.br/auth/login', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Título da página:', await page.title());
  console.log('URL atual:', page.url());

  const campos = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
    }));
  });
  console.log('Campos <input> encontrados na página:');
  console.log(JSON.stringify(campos, null, 2));

  const botoes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(el => ({
      type: el.type,
      text: el.textContent.trim(),
    }));
  });
  console.log('Botões encontrados na página:');
  console.log(JSON.stringify(botoes, null, 2));

  console.log('DIAGNÓSTICO CONCLUÍDO — nenhuma tentativa de login foi feita ainda.');
  await browser.close();
}

login().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
