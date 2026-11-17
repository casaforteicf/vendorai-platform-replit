/**
 * Frente C — Render: pedido e cliente de fila. Puro (transporte e relógio injetados).
 */

import { criarPedidoRender, fingerprintDocumento } from '../../src/arqdor/editor/render/pedido';
import { criarClienteRender } from '../../src/arqdor/editor/render/cliente';
import type { RespostaEstado, TransporteRender } from '../../src/arqdor/editor/render/cliente';

let passou = 0;
let falhou = 0;
function ok(condicao: boolean, nome: string): void {
  if (condicao) {
    passou += 1;
    console.log('  ok   ' + nome);
  } else {
    falhou += 1;
    console.log('  FALHA ' + nome);
  }
}

console.log('Frente C — Render: pedido e cliente de fila');

const documento = {
  versao: 1,
  projeto: { id: 'p1', nome: 'Casa' },
  camadas: { camadas: [], modos: [] },
  bim: { elementos: [{ id: 'el_1', tipo: 'parede' }] },
};
const camera = { posicao: [5, 3, 8] as [number, number, number], alvo: [0, 1, 0] as [number, number, number], fov: 45 };

// ---------- 1. fingerprint ----------
const hash1 = fingerprintDocumento(documento);
const hash2 = fingerprintDocumento({ ...documento });
ok(hash1 === hash2, 'fingerprint: mesmo documento → mesmo hash');
const hashMudado = fingerprintDocumento({ ...documento, versao: 2 });
ok(hash1 !== hashMudado, 'fingerprint: documento alterado → hash diferente');
const hashOrdem = fingerprintDocumento({ b: 1, a: 2 });
const hashOrdem2 = fingerprintDocumento({ a: 2, b: 1 });
ok(hashOrdem === hashOrdem2, 'fingerprint: ordem das chaves não muda o hash');

// ---------- 2. pedido ----------
const criado = criarPedidoRender({
  projetoId: 'p1',
  documento,
  camera,
  qualidade: 'preview',
  resolucao: { largura: 1280, altura: 720 },
  criadoEm: '2026-11-03T12:00:00.000Z',
});
ok(criado.ok, 'pedido: criado');
if (criado.ok) {
  ok(criado.pedido.documentoHash === hash1, 'pedido: carrega o fingerprint do documento');
  ok(criado.pedido.criadoEm === '2026-11-03T12:00:00.000Z', 'pedido: data injetada é respeitada');
}

ok(!criarPedidoRender({ projetoId: '', documento, camera, qualidade: 'preview', resolucao: { largura: 100, altura: 100 } }).ok, 'pedido: projeto vazio recusado');
ok(!criarPedidoRender({ projetoId: 'p1', documento: null, camera, qualidade: 'preview', resolucao: { largura: 100, altura: 100 } }).ok, 'pedido: documento nulo recusado');
ok(!criarPedidoRender({ projetoId: 'p1', documento, camera: { ...camera, fov: 200 }, qualidade: 'preview', resolucao: { largura: 100, altura: 100 } }).ok, 'pedido: fov fora da faixa recusado');
ok(!criarPedidoRender({ projetoId: 'p1', documento, camera: { posicao: [0, 1, 0], alvo: [0, 1, 0], fov: 45 }, qualidade: 'preview', resolucao: { largura: 100, altura: 100 } }).ok, 'pedido: câmera sobre o alvo recusada');
ok(!criarPedidoRender({ projetoId: 'p1', documento, camera, qualidade: 'preview', resolucao: { largura: 4000, altura: 100 } }).ok, 'pedido: preview acima de 2560 recusado');
ok(criarPedidoRender({ projetoId: 'p1', documento, camera, qualidade: 'final', resolucao: { largura: 4000, altura: 3000 } }).ok, 'pedido: final até 8192 aceito');

// ---------- 3. cliente de fila ----------
if (!criado.ok) throw new Error('pedido base não criado');
// `criado.ok` não estreita dentro de função aninhada — captura o pedido aqui.
const pedido = criado.pedido;

let consultas = 0;
const transporte: TransporteRender = {
  async enviar() {
    return { jobId: 'job-1' };
  },
  async consultar(): Promise<RespostaEstado> {
    consultas += 1;
    if (consultas < 2) return { estado: 'processando' };
    return { estado: 'pronto', url: 'https://r2.example/render.jpg?assinado' };
  },
};

const dormidas: number[] = [];
const cliente = criarClienteRender(transporte, {
  dormir: async (ms) => {
    dormidas.push(ms);
  },
  agora: () => 0,
});

// O runner carrega os testes como CJS: `await` de topo não é permitido — vai dentro de executar().
export async function executar(): Promise<void> {
const envio = await cliente.enfileirar(pedido);
ok(envio.ok && envio.jobId === 'job-1', 'cliente: enfileira e devolve jobId');

const espera = await cliente.aguardar('job-1', { intervaloMs: 500, timeoutMs: 60_000 });
ok(espera.ok && espera.url.startsWith('https://'), 'cliente: espera termina em pronto com URL');
ok(consultas === 2, 'cliente: consultou duas vezes (processando → pronto)');
ok(dormidas.length === 1 && dormidas[0] === 500, 'cliente: respeita o intervalo entre consultas');

const falhaTransporte = criarClienteRender({
  async enviar() {
    throw new Error('sem rede');
  },
  async consultar() {
    return { estado: 'na_fila' };
  },
});
const envioFalho = await falhaTransporte.enfileirar(pedido);
ok(!envioFalho.ok && envioFalho.erro === 'FALHA_ENVIO', 'cliente: falha de transporte vira FALHA_ENVIO');

const jobFalhou = criarClienteRender({
  async enviar() {
    return { jobId: 'j2' };
  },
  async consultar() {
    return { estado: 'falhou', erro: 'puppeteer caiu' };
  },
});
const esperaFalha = await jobFalhou.aguardar('j2', { intervaloMs: 10, timeoutMs: 1000 });
ok(!esperaFalha.ok && esperaFalha.erro === 'FALHOU', 'cliente: job falho encerra com FALHOU');

let relogio = 0;
const clienteTimeout = criarClienteRender(
  {
    async enviar() {
      return { jobId: 'j3' };
    },
    async consultar() {
      relogio += 1000;
      return { estado: 'processando' };
    },
  },
  { dormir: async () => undefined, agora: () => relogio },
);
const esperaTimeout = await clienteTimeout.aguardar('j3', { intervaloMs: 10, timeoutMs: 2500 });
ok(!esperaTimeout.ok && esperaTimeout.erro === 'TIMEOUT', 'cliente: estouro de tempo vira TIMEOUT');

const prontoSemUrl = criarClienteRender({
  async enviar() {
    return { jobId: 'j4' };
  },
  async consultar() {
    return { estado: 'pronto' };
  },
});
const esperaSemUrl = await prontoSemUrl.aguardar('j4', { intervaloMs: 10, timeoutMs: 1000 });
ok(!esperaSemUrl.ok && esperaSemUrl.erro === 'SEM_URL', 'cliente: pronto sem URL é erro, não sucesso');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
}
