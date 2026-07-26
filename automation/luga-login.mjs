import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

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

  const downloadPath = path.resolve('./downloads');
  fs.mkdirSync(downloadPath, { recursive: true });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });

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

  await new Promise(r => setTimeout(r, 2000));

  console.log('Procurando checkbox "Selecionar todos"...');
  const existe = await page.evaluate(() => !!document.querySelector('#select-all'));
  if (!existe) {
    console.error('FALHA: #select-all não encontrado.');
    await browser.close();
    process.exit(1);
  }

  await page.click('#select-all');
  console.log('Cliquei em #select-all.');

  await new Promise(r => setTimeout(r, 2000));

  const contador = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(el =>
      el.children.length === 0 && el.textContent.includes('selecionado(s)')
    );
    return el ? el.textContent.trim() : null;
  });
  console.log('Contador após marcar:', contador);

  const estadoBotao = await page.evaluate(() => {
    const b = document.querySelector('#select-all');
    return b ? b.getAttribute('aria-checked') : null;
  });
  console.log('aria-checked do botão:', estadoBotao);

  console.log('Rolando até o fim da página...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1500));

  console.log('Procurando botão "Exportar relatório"...');
  const estruturaBotao = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Exportar relatório'
    );
    if (els.length === 0) return null;
    let el = els[0];
    let niveis = [];
    let atual = el;
    for (let i = 0; i < 3 && atual; i++) {
      niveis.push(atual.outerHTML.slice(0, 400));
      atual = atual.parentElement;
    }
    return niveis;
  });
  console.log('Estrutura HTML ao redor de "Exportar relatório":');
  console.log(JSON.stringify(estruturaBotao, null, 2));

  console.log('Clicando em "Exportar relatório"...');
  const cliquei = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Exportar relatório'
    );
    if (els.length === 0) return false;
    const alvo = els[0].closest('button') || els[0];
    alvo.click();
    return true;
  });
  if (!cliquei) {
    console.error('FALHA: botão "Exportar relatório" não encontrado.');
    await browser.close();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 2000));

  const modal = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog ? dialog.outerHTML.slice(0, 2000) : null;
  });
  console.log('Conteúdo do modal aberto:');
  console.log(modal || 'Nenhum [role="dialog"] encontrado.');

  console.log('Clicando em "Exportar" dentro do modal...');
  const cliquei2 = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const btns = Array.from(dialog.querySelectorAll('button'));
    const alvo = btns.find(b => b.textContent.trim() === 'Exportar');
    if (!alvo) return false;
    alvo.click();
    return true;
  });
  if (!cliquei2) {
    console.error('FALHA: botão "Exportar" não encontrado dentro do modal.');
    await browser.close();
    process.exit(1);
  }

  console.log('Aguardando download...');
  await new Promise(r => setTimeout(r, 8000));

  const arquivos = fs.readdirSync(downloadPath);
  console.log('Arquivos na pasta de downloads:', arquivos);

  if (arquivos.length === 0) {
    console.error('FALHA: nenhum arquivo foi baixado.');
    await browser.close();
    process.exit(1);
  }

  console.log('DOWNLOAD OK — arquivo(s) confirmado(s):', arquivos.join(', '));
  await browser.close();
}

login().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
