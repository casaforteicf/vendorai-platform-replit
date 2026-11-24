/**
 * E2E do GIZMO — arrasto real com mouse, via Playwright usando o navegador do sistema.
 *
 * Por que existe: o commit do gizmo (`gerarOpMover` etc.) já era testado no motor, mas o
 * GESTO de arrastar nunca havia sido exercitado. Este script fecha essa pendência de verdade:
 * pressiona o botão do mouse sobre o eixo X do gizmo, arrasta e lê a posição no painel.
 *
 * Pré-requisitos:
 *   1. app rodando em ARQ_URL (default http://127.0.0.1:5180)
 *   2. `playwright-core` instalado em algum lugar; passe o caminho em PLAYWRIGHT_CORE
 *      (não baixamos navegador: usamos o Edge/Chrome do sistema via `channel`)
 *
 * Uso:
 *   PLAYWRIGHT_CORE="C:/.../.e2e/node_modules/playwright-core/index.js" node tests/gizmo/e2e-drag.mjs
 */

import { pathToFileURL } from 'node:url';

const especificador = process.env.PLAYWRIGHT_CORE;
const modulo = especificador === undefined
  ? 'playwright-core'
  : pathToFileURL(especificador).href;

const carregado = await import(modulo);
// playwright-core é CommonJS: em import() dinâmico os nomes podem vir em `default`.
const chromium = carregado.chromium ?? carregado.default?.chromium;
if (chromium === undefined) {
  console.error('playwright-core carregado, mas sem chromium — verifique PLAYWRIGHT_CORE');
  process.exit(2);
}

const BASE = process.env.ARQ_URL ?? 'http://127.0.0.1:5180';
const NAVEGADOR = process.env.ARQ_BROWSER ?? 'msedge';

let passou = 0;
let falhou = 0;
function ok(condicao, nome) {
  if (condicao) {
    passou += 1;
    console.log('  ok   ' + nome);
  } else {
    falhou += 1;
    console.log('  FALHA ' + nome);
  }
}

console.log('Gizmo — arrasto real (E2E)');

// Dois modos: `ARQ_CDP` conecta a um navegador já aberto por fora (necessário quando o
// sandbox bloqueia o pipe do Playwright); sem ele, lança o navegador do sistema.
const cdp = process.env.ARQ_CDP;
const navegador = cdp === undefined || cdp.length === 0
  ? await chromium.launch({ channel: NAVEGADOR, headless: true })
  : await chromium.connectOverCDP(cdp);
const contexto = navegador.contexts()[0] ?? (await navegador.newContext());
const pagina = await contexto.newPage();
await pagina.setViewportSize({ width: 1280, height: 800 });

try {
  await pagina.goto(BASE + '/modelagem', { waitUntil: 'load' });
  await pagina.waitForSelector('button[title="Cria um sólido vazio"]', { timeout: 45000 });

  const temSeam = await pagina.evaluate(() => typeof window.__arqTeste?.pontaEixo === 'function');
  ok(temSeam, 'seam de teste disponível (dev)');

  await pagina.click('button[title="Cria um sólido vazio"]');
  await pagina.waitForTimeout(400);

  const lerPosicao = async () => {
    const texto = await pagina.evaluate(() => document.body.innerText);
    const achado = texto.match(/pos \(([^)]*)\)/);
    return achado === null ? null : achado[1];
  };

  const antes = await lerPosicao();
  ok(antes !== null, 'painel de propriedades mostra a posição');

  await pagina.click('button[title="Mover (M)"]');
  await pagina.waitForTimeout(500);

  let moveu = false;
  let fracaoUsada = null;
  let depois = antes;

  // O orbe do gizmo é sólido na cena, mas o alvo é fino: testamos algumas frações do eixo.
  // Como o seam recalcula com a câmera viva, um erro de mira não invalida o próximo passo.
  for (const fracao of [0.55, 0.7, 0.85, 1.0]) {
    const ponto = await pagina.evaluate((f) => window.__arqTeste.pontaEixo('x', f), fracao);
    if (ponto === null) break;

    await pagina.mouse.move(ponto.x, ponto.y);
    await pagina.mouse.down();
    await pagina.mouse.move(ponto.x + 48, ponto.y, { steps: 10 });
    await pagina.mouse.up();
    await pagina.waitForTimeout(450);

    depois = await lerPosicao();
    if (depois !== null && depois !== antes) {
      moveu = true;
      fracaoUsada = fracao;
      break;
    }
  }

  ok(moveu, 'arrasto no eixo X altera a posição do sólido' + (fracaoUsada === null ? '' : ' (fração ' + String(fracaoUsada) + ')'));
  if (moveu) console.log('        antes: ' + String(antes) + ' → depois: ' + String(depois));

  // O arrasto tem que virar UMA operação de undo.
  await pagina.keyboard.press('Control+z');
  await pagina.waitForTimeout(450);
  const desfeito = await lerPosicao();
  ok(desfeito === antes, 'Ctrl+Z desfaz o arrasto inteiro (um passo só)');
  if (desfeito !== antes) console.log('        esperado: ' + String(antes) + ' · obtido: ' + String(desfeito));
} finally {
  await navegador.close();
}

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) process.exitCode = 1;
