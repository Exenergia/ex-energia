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

  console.log('Preenchendo email...');
  await page.waitForSelector('#login', { timeout: 15000 });
  await page.type('#login', EMAIL, { delay: 50 });

  console.log('Preenchendo senha...');
  await page.waitForSelector('#password', { timeout: 15000 });
  await page.type('#password', SENHA, { delay: 50 });

  console.log('Clicando em Entrar...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  console.log('URL após login:', url);

  if (url.includes('/auth/login')) {
    console.error('FALHA: ainda na página de login. Verifique credenciais.');
    await browser.close();
    process.exit(1);
  }

  console.log('LOGIN OK — acesso confirmado.');

  console.log('Procurando link "Faturamentos"...');
  const candidatos = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Faturamentos'
    );
    return els.map(el => {
      const link = el.closest('a');
      return {
        tag: el.tagName,
        temAncestralLink: !!link,
        hrefAncestral: link ? link.href : null,
      };
    });
  });
  console.log('Candidatos encontrados:');
  console.log(JSON.stringify(candidatos, null, 2));

  const clicou = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Faturamentos'
    );
    if (els.length === 0) return false;
    const alvo = els[0].closest('a') || els[0].closest('button') || els[0];
    alvo.click();
    return true;
  });

  if (!clicou) {
    console.error('FALHA: não encontrei nenhum elemento com o texto exato "Faturamentos".');
    await browser.close();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 4000));
  console.log('Cliquei em "Faturamentos".');
  console.log('URL atual:', page.url());
  console.log('Título da página:', await page.title());

  await browser.close();
}

login().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
