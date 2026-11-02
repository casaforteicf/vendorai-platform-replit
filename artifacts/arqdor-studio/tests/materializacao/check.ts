/**
 * Materialização (D12) — topologia, classificação e integração com a cadeia.
 *
 * Nada de sólido sintético "na mão": cada caso nasce do MESMO caminho que o usuário faz
 * (retângulo no plano → push/pull), para o teste cobrir a conversão de verdade.
 */

import {
  PLANO_CHAO,
  aplicarPasso,
  calcularPushPull,
  criarRetangulo,
  derivar2d,
  gerarMemorial,
  gerarOpMover,
  materializarSolido,
  materializarSolidos,
  quantitativos,
} from '../../src/arqdor/editor';
import type { EstadoModelador, Solido } from '../../src/arqdor/editor';

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
function perto(a: number, b: number, tolerancia = 1e-6): boolean {
  return Math.abs(a - b) <= tolerancia;
}

console.log('Materialização — sólido → BIM (D12)');

const VAZIO: Solido = {
  id: 'solido_1',
  nome: 'Sólido 1',
  vertices: [],
  arestas: [],
  faces: [],
  transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
};

/** Reproduz o fluxo do usuário: retângulo no chão + push/pull. */
function caixa(a: [number, number], b: [number, number], altura: number): Solido {
  const base: EstadoModelador = { solidos: [VAZIO], proximoSolidoN: 1 };
  const comFace = aplicarPasso(
    base,
    criarRetangulo({ solido: VAZIO, plano: PLANO_CHAO, a: [a[0], 0, a[1]], b: [b[0], 0, b[1]] }),
    'direta',
  );
  if (!comFace.ok) throw new Error('retângulo falhou no teste');
  const solidoComFace = comFace.estado.solidos[0];
  const faceId = solidoComFace.faces[0].id;
  const extr = calcularPushPull(solidoComFace, faceId, altura);
  if (!extr.ok) throw new Error('push/pull falhou no teste: ' + extr.erro.codigo);
  const final = aplicarPasso(comFace.estado, extr.operacoes, 'direta');
  if (!final.ok) throw new Error('aplicar push/pull falhou no teste');
  return final.estado.solidos[0];
}

const OPCOES = { projetoId: 'proj_1', camadaId: 'camada_estrutura' };

// ---------- 1. PAREDE ----------
const paredeSolido = caixa([0, 0], [4, 0.15], 2.8);
ok(paredeSolido.vertices.length === 8, 'parede: sólido tem 8 vértices');
ok(paredeSolido.faces.length === 6, 'parede: sólido tem 6 faces');

const parede = materializarSolido(paredeSolido, OPCOES);
ok(parede.ok && parede.elemento.tipo === 'parede', 'parede: classificada como parede');
if (parede.ok && parede.elemento.tipo === 'parede') {
  const g = parede.elemento.geometria;
  if (g !== undefined && 'espessura' in g && 'ponto_a' in g) {
    ok(perto(g.espessura, 0.15), 'parede: espessura 0,15 m calculada da face original');
    ok(perto(g.altura, 2.8), 'parede: altura 2,8 m do push/pull');
    ok(perto(Math.hypot(g.ponto_b[0] - g.ponto_a[0], g.ponto_b[1] - g.ponto_a[1]), 4), 'parede: comprimento 4 m');
  }
}

// ---------- 2. LAJE ----------
const lajeSolido = caixa([0, 0], [4, 3], 0.12);
const laje = materializarSolido(lajeSolido, OPCOES);
ok(laje.ok && laje.elemento.tipo === 'laje', 'laje: classificada como laje');

// parâmetro de espessura manda quando informado
const lajeParam = materializarSolido(lajeSolido, { ...OPCOES, espessuraLajeM: 0.2 });
ok(lajeParam.ok && lajeParam.elemento.tipo === 'laje' && 'espessura' in lajeParam.elemento.geometria
  ? perto(lajeParam.elemento.geometria.espessura, 0.2)
  : false, 'laje: espessura vem do parâmetro');

// face horizontal solta (sem push/pull) também vira laje
const soFace = aplicarPasso(
  { solidos: [VAZIO], proximoSolidoN: 1 },
  criarRetangulo({ solido: VAZIO, plano: PLANO_CHAO, a: [0, 0, 0], b: [2, 0, 2] }),
  'direta',
);
const faceSolta = soFace.ok ? materializarSolido(soFace.estado.solidos[0], { ...OPCOES, espessuraLajeM: 0.15 }) : null;
ok(faceSolta !== null && faceSolta.ok && faceSolta.elemento.tipo === 'laje', 'laje: face solta vira laje');

// ---------- 3. MOBILIARIO ----------
const movelSolido = caixa([0, 0], [1, 0.8], 0.75);
const movel = materializarSolido(movelSolido, OPCOES);
ok(movel.ok && movel.elemento.tipo === 'mobiliario', 'mobiliario: volume baixo e largo vira móvel');

const caixaGrande = caixa([0, 0], [4, 3], 2.8);
const grande = materializarSolido(caixaGrande, OPCOES);
ok(grande.ok && grande.elemento.tipo === 'mobiliario', 'mobiliario: caixa 4×3×2,8 não é parede nem laje');

// ---------- 4. TOPOLOGIA / INTEGRIDADE ----------
const qtd = quantitativos(parede.ok && laje.ok ? [parede.elemento, laje.elemento] : []);
const grupoAlvenariaM2 = qtd.grupos.find((g) => g.categoria === 'alvenaria' && g.unidade === 'm2');
ok(grupoAlvenariaM2 !== undefined, 'orçamento: grupo alvenaria/m2 existe');
if (grupoAlvenariaM2 !== undefined) {
  ok(perto(grupoAlvenariaM2.quantidadeBruta, 4 * 2.8), 'orçamento: área de parede = 4 × 2,8 = 11,2 m²');
  ok(perto(grupoAlvenariaM2.quantidadeComPerda, 4 * 2.8 * 1.05), 'orçamento: perda de alvenaria 5%');
}
const grupoAlvenariaM3 = qtd.grupos.find((g) => g.categoria === 'alvenaria' && g.unidade === 'm3');
if (grupoAlvenariaM3 !== undefined) {
  ok(perto(grupoAlvenariaM3.quantidadeBruta, 4 * 2.8 * 0.15), 'orçamento: volume de parede = área × espessura');
}
const grupoEstruturaM2 = qtd.grupos.find((g) => g.categoria === 'estrutura' && g.unidade === 'm2');
if (grupoEstruturaM2 !== undefined) {
  ok(perto(grupoEstruturaM2.quantidadeBruta, 12), 'orçamento: área de laje = 4 × 3 = 12 m²');
}

const linhas = derivar2d(parede.ok && laje.ok ? [parede.elemento, laje.elemento] : []);
ok(linhas.filter((l) => l.tipo === 'parede').length === 4, 'planta 2D: parede gera 4 linhas (duas faces + dois topos)');
ok(linhas.filter((l) => l.tipo === 'laje').length === 4, 'planta 2D: laje gera 4 linhas de contorno');

const memorial = gerarMemorial({
  projeto: { nome: 'Casa Teste' },
  elementos: parede.ok && laje.ok ? [parede.elemento, laje.elemento] : [],
  quantitativos: qtd,
  geradoEm: '2026-11-02T12:00:00.000Z',
});
ok(memorial.secoes.length >= 4, 'memorial: gera as secoes obrigatorias a partir dos elementos');
ok(memorial.geradoEm === '2026-11-02T12:00:00.000Z', 'memorial: determinístico com data injetada');

// ---------- 5. TRANSFORMAÇÃO ----------
const movido = gerarOpMover(paredeSolido, [10, 0, 5]);
const estadoMovido = aplicarPasso({ solidos: [paredeSolido], proximoSolidoN: 1 }, [movido], 'direta');
const paredeMovida = estadoMovido.ok ? materializarSolido(estadoMovido.estado.solidos[0], OPCOES) : null;
ok(
  paredeMovida !== null && paredeMovida.ok && 'ponto_a' in paredeMovida.elemento.geometria
    ? perto(paredeMovida.elemento.geometria.ponto_a[0], 10) && perto(paredeMovida.elemento.geometria.ponto_a[1], 5.075)
    : false,
  'transformação: mover o sólido move a parede no BIM (eixo no centro da espessura)',
);

const girado: Solido = { ...paredeSolido, transformacao: { posicao: [0, 0, 0], rotacao: [0, Math.PI / 2, 0], escala: [1, 1, 1] } };
const paredeGirada = materializarSolido(girado, OPCOES);
if (paredeGirada.ok && 'ponto_a' in paredeGirada.elemento.geometria) {
  const g = paredeGirada.elemento.geometria;
  ok(perto(Math.abs(g.ponto_b[1] - g.ponto_a[1]), 4), 'transformação: rotação de 90° leva a parede para o eixo Z');
}

const escalado: Solido = { ...paredeSolido, transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [2, 1, 1] } };
const paredeEscalada = materializarSolido(escalado, OPCOES);
if (paredeEscalada.ok && 'ponto_a' in paredeEscalada.elemento.geometria) {
  const g = paredeEscalada.elemento.geometria;
  ok(perto(Math.hypot(g.ponto_b[0] - g.ponto_a[0], g.ponto_b[1] - g.ponto_a[1]), 8), 'transformação: escala 2× dobra o comprimento');
}

// ---------- 6. ERROS E IDEMPOTÊNCIA ----------
const semFaces = materializarSolido(VAZIO, OPCOES);
ok(!semFaces.ok && semFaces.erro.codigo === 'SOLIDO_SEM_FACES', 'erro: sólido sem faces é recusado');

const primeiroLote = materializarSolidos([paredeSolido], OPCOES, []);
ok(primeiroLote.operacoes.length === 1 && primeiroLote.operacoes[0].tipo === 'criar_elemento_bim', 'lote: primeira materialização cria');

const segundoLote = materializarSolidos([paredeSolido], OPCOES, primeiroLote.elementos);
ok(segundoLote.operacoes.length === 0, 'lote: re-materializar sem mudança não duplica nem atualiza');

const alterado: Solido = { ...paredeSolido, transformacao: { posicao: [3, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] } };
const terceiroLote = materializarSolidos([alterado], OPCOES, primeiroLote.elementos);
ok(terceiroLote.operacoes.length === 1 && terceiroLote.operacoes[0].tipo === 'atualizar_elemento_bim', 'lote: sólido movido atualiza o elemento');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
