/**
 * Lote 1 — infraestrutura: persistência Postgres (com fallback local) e transporte HTTP do render.
 */

import {
  adaptadorDeAmbiente,
  criarAdaptadorPostgres,
  criarAdaptadorResiliente,
} from '../../src/arqdor/editor/persistencia/postgres';
import type { AdaptadorProjeto, PoolLike } from '../../src/arqdor/editor/persistencia/postgres';
import { criarTransporteHttp, transporteDeAmbiente } from '../../src/arqdor/editor/render/transporte-http';
import type { PedidoRender } from '../../src/arqdor/editor/render/pedido';

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

console.log('Lote 1 — persistência Postgres e transporte do render');

// O runner carrega os testes como CJS: `await` de topo não é permitido.
export async function executar(): Promise<void> {
// ---------- 1. adaptador Postgres ----------
interface Chamada {
  sql: string;
  valores?: readonly unknown[];
}
const chamadas: Chamada[] = [];
const pool: PoolLike = {
  async query(sql, valores) {
    chamadas.push({ sql, valores });
    if (sql.startsWith('insert')) return { rows: [] };
    if (sql.includes('select dados')) return { rows: [{ dados: { id: 'p1', versao: 2 } }] };
    return { rows: [{ id: 'p1', atualizado_em: '2026-11-03T12:00:00Z' }] };
  },
};

const postgres = criarAdaptadorPostgres(pool);
const documento = { id: 'p1', versao: 2 };
await postgres.salvarProjeto(documento);
ok(chamadas[0].sql.includes('insert into arqdor_projetos'), 'postgres: INSERT na tabela');
ok(chamadas[0].sql.includes('on conflict (id) do update'), 'postgres: upsert por id');
ok(chamadas[0].valores?.[0] === 'p1' && chamadas[0].valores?.[1] === documento, 'postgres: id e documento como parâmetros');

const carregado = await postgres.obterProjeto('p1');
ok(carregado !== null && (carregado as { versao: number }).versao === 2, 'postgres: leitura devolve o documento');

const lista = await postgres.listarProjetos();
ok(lista.length === 1 && lista[0].id === 'p1' && lista[0].atualizadoEm.startsWith('2026-11-03'), 'postgres: lista mapeada');

const naoExiste = await criarAdaptadorPostgres({ async query() { return { rows: [] }; } }).obterProjeto('x');
ok(naoExiste === null, 'postgres: projeto inexistente → null');

// ---------- 2. fallback local ----------
const eventos: string[] = [];
const local: AdaptadorProjeto = {
  async salvarProjeto(d) {
    eventos.push('local:salvar:' + d.id);
  },
  async obterProjeto() {
    eventos.push('local:obter');
    return { id: 'local' };
  },
  async listarProjetos() {
    eventos.push('local:listar');
    return [];
  },
};

const bancoFora: AdaptadorProjeto = {
  async salvarProjeto() {
    throw new Error('sem conexão');
  },
  async obterProjeto() {
    throw new Error('sem conexão');
  },
  async listarProjetos() {
    throw new Error('sem conexão');
  },
};

const resiliente = criarAdaptadorResiliente({ primario: bancoFora, reserva: local, aoFalhar: () => eventos.push('aviso') });
await resiliente.salvarProjeto({ id: 'p9' });
ok(eventos.includes('aviso') && eventos.includes('local:salvar:p9'), 'fallback: Postgres falhou e usou o local');
const lido = await resiliente.obterProjeto('p9');
ok(lido !== null && (lido as { id: string }).id === 'local', 'fallback: leitura caiu para o local');

// ---------- 3. escolha por ambiente ----------
ok(adaptadorDeAmbiente({}, local, null) === local, 'ambiente: sem DATABASE_URL usa local');
const comUrl = adaptadorDeAmbiente({ DATABASE_URL: 'postgres://x' }, local, null);
ok(comUrl === local, 'ambiente: DATABASE_URL sem pool (browser/dev) mantém local');
const comPool = adaptadorDeAmbiente({ DATABASE_URL: 'postgres://x' }, local, pool);
ok(comPool !== local, 'ambiente: com URL e pool usa Postgres com reserva');

// ---------- 4. transporte HTTP do render ----------
const pedido: PedidoRender = {
  projetoId: 'p1',
  documentoHash: 'abc123',
  camera: { posicao: [8, 6, 10], alvo: [0, 1, 0], fov: 45 },
  qualidade: 'preview',
  resolucao: { largura: 1280, altura: 720 },
  criadoEm: '2026-11-03T12:00:00Z',
};

const requisicoes: Array<{ url: string; init: RequestInit }> = [];
const fetchFalso = (async (url: string, init: RequestInit) => {
  requisicoes.push({ url: String(url), init: init ?? {} });
  if (String(url).endsWith('/render/job-1')) {
    return new Response(JSON.stringify({ estado: 'pronto', url: 'https://r2.example/x.jpg?sig' }), { status: 200 });
  }
  return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 });
}) as unknown as typeof fetch;

const transporte = criarTransporteHttp({ baseUrl: 'https://worker.example/', token: 'tk', fetch: fetchFalso });
const envio = await transporte.enviar(pedido);
ok(envio.jobId === 'job-1', 'render: enviar devolve jobId');
ok(requisicoes[0].url === 'https://worker.example/render', 'render: URL sem barra dupla');
const cabecalhos = requisicoes[0].init.headers as Record<string, string>;
ok(cabecalhos.Authorization === 'Bearer tk', 'render: token no cabeçalho');
const estado = await transporte.consultar('job-1');
ok(estado.estado === 'pronto' && estado.url?.includes('r2') === true, 'render: estado e URL presignada');

const fetchErro = (async () => new Response('falhou', { status: 500 })) as unknown as typeof fetch;
let lancou = false;
try {
  await criarTransporteHttp({ baseUrl: 'https://w', fetch: fetchErro }).enviar(pedido);
} catch {
  lancou = true;
}
ok(lancou, 'render: HTTP 500 lança (o cliente de fila converte em FALHA_ENVIO)');

const fetchEstadoInvalido = (async () => new Response(JSON.stringify({ estado: 'voando' }), { status: 200 })) as unknown as typeof fetch;
let lancouEstado = false;
try {
  await criarTransporteHttp({ baseUrl: 'https://w', fetch: fetchEstadoInvalido }).consultar('j');
} catch {
  lancouEstado = true;
}
ok(lancouEstado, 'render: estado desconhecido é recusado');

// ---------- 5. ambiente do render ----------
ok(transporteDeAmbiente({}, fetchFalso) === null, 'ambiente: sem RENDER_WORKER_URL → null');
const resolvido = transporteDeAmbiente({ RENDER_WORKER_URL: 'https://worker.example', R2_BUCKET: 'arqdor-render' }, fetchFalso);
ok(resolvido !== null && resolvido.bucketR2 === 'arqdor-render', 'ambiente: bucket R2 resolvido');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
}
