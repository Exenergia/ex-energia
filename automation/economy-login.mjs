import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const USUARIO = process.env.ECONOMY_EMAIL;
const SENHA = process.env.ECONOMY_PASSWORD;

if (!USUARIO || !SENHA) {
  console.error('ECONOMY_EMAIL e ECONOMY_PASSWORD são obrigatórios.');
  process.exit(1);
}

async function testarMes(page, downloadPath, mes) {
  console.log(`\n=== Testando mês ${mes} ===`);

  console.log(`Marcando só o mês ${mes}/2026...`);
  await page.evaluate((m) => {
    window.$('.month-checkbox, .year-checkbox').prop('checked', false);
    window.$(`#month-${m}`).prop('checked', true);
    window.$('#year-2026').prop('checked', true);
    if (typeof updateAllSelectedCount === 'function') updateAllSelectedCount();
  }, mes);
  await new Promise(r => setTimeout(r, 500));

  console.log('Clicando em "Filtrar"...');
  const respostaFiltroPromise = page.waitForResponse(
    res => res.url().includes('/relatorios_json') && res.request().method() === 'POST',
    { timeout: 10000 }
  ).catch(() => null);

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Filtrar'
    );
    if (els.length > 0) (els[0].closest('button') || els[0]).click();
  });

  const respostaFiltro = await respostaFiltroPromise;
  await new Promise(r => setTimeout(r, 1000));

  if (!respostaFiltro) {
    console.log('  Não detectei a resposta do filtro a tempo.');
    return { sucesso: false, motivo: 'filtro não respondeu' };
  }

  let recordsTotal = null;
  try {
    const json = JSON.parse(await respostaFiltro.text());
    recordsTotal = json.recordsTotal;
  } catch (e) { /* ignora */ }

  console.log(`  recordsTotal para o mês ${mes}: ${recordsTotal}`);
  if (!recordsTotal || recordsTotal === 0) {
    console.log(`  Mês ${mes} sem dados — pulando.`);
    return { sucesso: false, motivo: 'sem dados nesse mês' };
  }

  console.log('  Tem dado! Clicando em "Gerar Relatório de Faturas"...');
  const infoClique = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Gerar Relatório de Faturas'
    );
    if (els.length === 0) return { ok: false };
    const btn = els[0].closest('button') || els[0];
    if (!btn.id) btn.id = 'botao-gerar-faturas-debug';
    btn.click();
    return { ok: true, idUsado: btn.id };
  });

  if (!infoClique.ok) {
    console.log('  Botão "Gerar Relatório de Faturas" não encontrado.');
    return { sucesso: false, motivo: 'botão gerar não encontrado' };
  }

  console.log('  Aguardando o botão virar "Baixar Relatório de Faturas"...');
  let virouBaixar = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const check = await page.evaluate((id) => {
      const btn = document.getElementById(id);
      const achouBaixar = Array.from(document.querySelectorAll('*')).some(el =>
        el.children.length === 0 && el.textContent.trim() === 'Baixar Relatório de Faturas'
      );
      const erros = Array.from(document.querySelectorAll('.toast, .alert, .swal2-popup, [role="alert"]'))
        .map(e => e.textContent.trim()).filter(Boolean);
      return { achouBaixar, erros };
    }, infoClique.idUsado);
    if (check.erros.length) console.log('  erro na tela:', JSON.stringify(check.erros));
    virouBaixar = check.achouBaixar;
    if (virouBaixar) break;
  }

  if (!virouBaixar) {
    console.log(`  Mês ${mes}: geração falhou (não virou "Baixar").`);
    return { sucesso: false, motivo: 'geração falhou' };
  }

  console.log('  Clicando em "Baixar Relatório de Faturas"...');
  const antesDownload = new Set(fs.readdirSync(downloadPath));
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Baixar Relatório de Faturas'
    );
    (els[0].closest('button') || els[0]).click();
  });

  console.log('  Aguardando download...');
  await new Promise(r => setTimeout(r, 6000));

  const depoisDownload = fs.readdirSync(downloadPath);
  const novos = depoisDownload.filter(f => !antesDownload.has(f));
  if (novos.length === 0) {
    console.log(`  Mês ${mes}: nenhum arquivo baixado.`);
    return { sucesso: false, motivo: 'download não aconteceu' };
  }

  // renomeia com o mês pra não sobrescrever entre meses (o site sempre baixa o mesmo nome)
  const renomeados = novos.map(f => {
    const novoNome = `mes-${String(mes).padStart(2, '0')}-2026-${f}`;
    fs.renameSync(path.join(downloadPath, f), path.join(downloadPath, novoNome));
    return novoNome;
  });

  console.log(`  Mês ${mes}: DOWNLOAD OK — ${renomeados.join(', ')}`);
  return { sucesso: true, arquivos: renomeados };
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

  if (page.url().includes('/login')) {
    console.error('FALHA: ainda na página de login. Verifique credenciais.');
    await browser.close();
    process.exit(1);
  }
  console.log('LOGIN OK — acesso confirmado.');

  let achouRelatorios = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).some(el =>
      el.children.length === 0 && el.textContent.trim() === 'Relatórios'
    )
  );
  if (!achouRelatorios) {
    await page.evaluate(() => {
      const candidatos = Array.from(document.querySelectorAll('button, svg, [role="button"]'));
      if (candidatos[0]) candidatos[0].click();
    });
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('Indo para "Relatórios"...');
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'Relatórios'
    );
    if (els.length > 0) (els[0].closest('a') || els[0].closest('button') || els[0]).click();
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('URL atual:', page.url());

  const resultados = {};
  for (const mes of [1, 2, 3, 4, 5, 6, 7]) {
    resultados[mes] = await testarMes(page, downloadPath, mes);
  }

  console.log('\n=== RESUMO FINAL ===');
  for (const mes of [1, 2, 3, 4, 5, 6, 7]) {
    const r = resultados[mes];
    if (r.sucesso) console.log(`Mês ${mes}: OK — ${r.arquivos.join(', ')}`);
    else console.log(`Mês ${mes}: sem arquivo (${r.motivo})`);
  }

  await browser.close();
}

login().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
