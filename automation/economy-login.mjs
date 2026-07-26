import puppeteer from 'puppeteer';

const USUARIO = process.env.ECONOMY_EMAIL;
const SENHA = process.env.ECONOMY_PASSWORD;

if (!USUARIO || !SENHA) {
  console.error('ECONOMY_EMAIL e ECONOMY_PASSWORD são obrigatórios.');
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

  console.log('Acessando site da Digital Grid...');
  await page.goto('https://gestao.dg.energy/login/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Preenchendo usuário...');
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.type('#email', USUARIO, { delay: 50 });

  console.log('Preenchendo senha...');
  await page.waitForSelector('#password-field', { timeout: 15000 });
  await page.type('#password-field', SENHA, { delay: 50 });

  console.log('Clicando em "Conecte-se agora"...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  console.log('URL após login:', url);

  if (url.includes('/login')) {
    console.error('FALHA: ainda na página de login. Verifique credenciais.');
    await browser.close();
    process.exit(1);
  }

  console.log('LOGIN OK — acesso confirmado.');

  console.log('Abrindo o menu...');
  // tenta achar "Relatórios" direto (pode já estar visível sem precisar abrir menu)
  let achouRelatorios = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Relatórios'
    );
    return els.length > 0;
  });

  if (!achouRelatorios) {
    // clica no botão de menu (geralmente primeiro botão/svg no topo) para abrir a barra lateral
    await page.evaluate(() => {
      const candidatos = Array.from(document.querySelectorAll('button, svg, [role="button"]'));
      if (candidatos[0]) candidatos[0].click();
    });
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('Procurando "Relatórios"...');
  const clicouRelatorios = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Relatórios'
    );
    if (els.length === 0) return false;
    (els[0].closest('a') || els[0].closest('button') || els[0]).click();
    return true;
  });

  if (!clicouRelatorios) {
    console.error('FALHA: não encontrei "Relatórios" na página.');
    await browser.close();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 3000));
  console.log('Cliquei em "Relatórios".');
  console.log('URL atual:', page.url());
  console.log('Título da página:', await page.title());

  await new Promise(r => setTimeout(r, 2000));

  console.log('Inspecionando estrutura ao redor do label "Ano"...');
  const estrutura = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Ano'
    );
    if (labels.length === 0) return null;
    let niveis = [];
    let atual = labels[0];
    for (let i = 0; i < 5 && atual; i++) {
      niveis.push(atual.outerHTML.slice(0, 500));
      atual = atual.parentElement;
    }
    return niveis;
  });
  console.log('Estrutura HTML (do label "Ano" até 5 níveis acima):');
  console.log(JSON.stringify(estrutura, null, 2));

  console.log('Clicando em #dropdownYearButton...');
  await page.click('#dropdownYearButton');
  await new Promise(r => setTimeout(r, 1000));

  const opcoesAno = await page.evaluate(() => {
    const btn = document.querySelector('#dropdownYearButton');
    const container = btn.closest('.dropdown');
    const menu = container.querySelector('.dropdown-menu');
    if (!menu) return 'Nenhum .dropdown-menu encontrado dentro do container.';
    return menu.outerHTML.slice(0, 3000);
  });
  console.log('Opções do dropdown de Ano:');
  console.log(opcoesAno);

  console.log('DIAGNÓSTICO CONCLUÍDO — nenhuma seleção foi feita ainda.');
  await browser.close();
}

login().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
