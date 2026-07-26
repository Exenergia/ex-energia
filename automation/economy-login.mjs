import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

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

  const downloadPath = path.resolve('./downloads');
  fs.mkdirSync(downloadPath, { recursive: true });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });

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

  console.log('Ano já vem selecionado por padrão (só existe 2026). Fechando dropdown de ano...');
  await page.click('#dropdownYearButton');
  await new Promise(r => setTimeout(r, 800));

  console.log('Clicando em #dropdownMonthButton...');
  await page.click('#dropdownMonthButton');
  await new Promise(r => setTimeout(r, 1000));

  const opcoesMes = await page.evaluate(() => {
    const btn = document.querySelector('#dropdownMonthButton');
    const container = btn.closest('.dropdown');
    const menu = container.querySelector('.dropdown-menu');
    if (!menu) return 'Nenhum .dropdown-menu encontrado dentro do container.';
    return menu.outerHTML.slice(0, 3000);
  });
  console.log('Opções do dropdown de Mês:');
  console.log(opcoesMes);

  console.log('Usando jQuery direto (mesma função do site) pra marcar só Janeiro/2026...');
  await page.evaluate(() => {
    window.$('.month-checkbox, .year-checkbox').prop('checked', false);
    window.$('#month-1').prop('checked', true);
    window.$('#year-2026').prop('checked', true);
    if (typeof updateAllSelectedCount === 'function') updateAllSelectedCount();
  });
  await new Promise(r => setTimeout(r, 500));

  const estadoFinal = await page.evaluate(() => ({
    meses: Array.from(document.querySelectorAll('.month-checkbox')).map(el => ({ id: el.id, checked: el.checked })),
    anos: Array.from(document.querySelectorAll('.year-checkbox')).map(el => ({ id: el.id, checked: el.checked })),
  }));
  console.log('Estado final da seleção:');
  console.log(JSON.stringify(estadoFinal, null, 2));

  console.log('Clicando em "Gerar Relatório de Faturas"...');
  const infoClique = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Gerar Relatório de Faturas'
    );
    if (els.length === 0) return { ok: false };
    const btn = els[0].closest('button') || els[0];
    if (!btn.id) btn.id = 'botao-gerar-faturas-debug';
    btn.click();
    return { ok: true, htmlAntes: btn.outerHTML.slice(0, 400), idUsado: btn.id };
  });
  console.log('Resultado do clique:', JSON.stringify(infoClique));
  if (!infoClique.ok) {
    console.error('FALHA: botão "Gerar Relatório de Faturas" não encontrado.');
    await browser.close();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 1500));
  const estadoLogoApos = await page.evaluate((id) => {
    const btn = document.getElementById(id);
    const toasts = Array.from(document.querySelectorAll('.toast, .alert, .swal2-popup')).map(t => t.textContent.trim());
    return { htmlDepois: btn ? btn.outerHTML.slice(0, 400) : '(botão sumiu)', toasts };
  }, infoClique.idUsado);
  console.log('Estado do botão 1.5s após o clique:', JSON.stringify(estadoLogoApos, null, 2));

  console.log('Aguardando o botão virar "Baixar Relatório de Faturas"...');
  let virouBaixar = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const check = await page.evaluate((id) => {
      const btn = document.getElementById(id);
      const achouBaixar = Array.from(document.querySelectorAll('*')).some(el =>
        el.children.length === 0 && el.textContent.trim() === 'Baixar Relatório de Faturas'
      );
      return { achouBaixar, htmlAtual: btn ? btn.outerHTML.slice(0, 300) : '(sumiu)' };
    }, infoClique.idUsado);
    virouBaixar = check.achouBaixar;
    if (virouBaixar) break;
    console.log(`  tentativa ${i + 1}/15 — html atual do botão: ${check.htmlAtual}`);
  }

  if (!virouBaixar) {
    console.error('FALHA: o botão não virou "Baixar Relatório de Faturas" a tempo.');
    await browser.close();
    process.exit(1);
  }

  console.log('Clicando em "Baixar Relatório de Faturas"...');
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Baixar Relatório de Faturas'
    );
    (els[0].closest('button') || els[0]).click();
  });

  console.log('Aguardando download...');
  await new Promise(r => setTimeout(r, 6000));

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
