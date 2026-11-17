/**
 * D14 — Booleanas (Bloco 5) com manifold-3d.
 *
 * O contrato (`OperacaoBooleana`) já existia desde o Bloco 0; o que faltava era o motor.
 * Decisão E9 preservada: o sólido B é CONSUMIDO e o resultado HERDA o id de A — assim
 * referências externas (`el_<solidoId>`), seleção e camada continuam válidas.
 *
 * O WASM é carregado UMA vez (`inicializarBooleana`); depois as operações são síncronas, o que
 * mantém o redutor de undo simples. Antes do carregamento a operação devolve
 * `WASM_NAO_CARREGADO` — é o caminho de erro previsto no contrato, não uma exceção.
 *
 * A `transformacao` de cada sólido é BAKED no mesh antes da operação (o resultado sai em
 * coordenadas de mundo, com transformação identidade). Sem isso, mover um sólido com o gizmo
 * faria a booleana operar na posição antiga.
 */

import type { BooleanaResultado, Face, Aresta, Solido, TipoBooleana, Vetor3, Vertice } from './schema';

interface MalhaManifold {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

interface ObjetoManifold {
  getMesh(): MalhaManifold;
  volume(): number;
  numTri(): number;
}

interface ModuloManifold {
  setup(): void;
  Manifold: {
    /** `new Manifold(mesh)` constrói o sólido a partir da malha. */
    new (entrada: MalhaManifold): ObjetoManifold;
    union(a: ObjetoManifold, b: ObjetoManifold): ObjetoManifold;
    difference(a: ObjetoManifold, b: ObjetoManifold): ObjetoManifold;
    intersection(a: ObjetoManifold, b: ObjetoManifold): ObjetoManifold;
  };
}

let modulo: ModuloManifold | null = null;

export function booleanaDisponivel(): boolean {
  return modulo !== null;
}

/**
 * Injeta um módulo já carregado (usado nos testes, onde o pacote ESM é importado
 * nativamente e o bundle é CJS).
 */
export function injetarModuloBooleana(carregado: unknown): void {
  const instancia = carregado as ModuloManifold;
  instancia.setup();
  modulo = instancia;
}

/** Carrega o WASM. Idempotente; pode ser chamado antes de qualquer operação. */
export async function inicializarBooleana(): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (modulo !== null) return { ok: true };
  try {
    // O pacote é ESM gerado por Emscripten e referencia `node:module`; empacotá-lo quebra o
    // build do Next no cliente. Servimos o arquivo em /manifold/manifold.js (public/) e
    // carregamos por URL com `webpackIgnore`, então o bundler não analisa os ramos Node.
    const url = '/manifold/manifold.js';
    const pacote = (await import(/* webpackIgnore: true */ url)) as unknown as { default: () => Promise<unknown> };
    const instancia = (await pacote.default()) as unknown as ModuloManifold;
    instancia.setup();
    modulo = instancia;
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** Somente para testes: esquece o módulo carregado. */
export function reiniciarBooleana(): void {
  modulo = null;
}

function rotacaoXYZ(rotacao: Vetor3): number[][] {
  const [x, y, z] = rotacao;
  const c1 = Math.cos(x);
  const s1 = Math.sin(x);
  const c2 = Math.cos(y);
  const s2 = Math.sin(y);
  const c3 = Math.cos(z);
  const s3 = Math.sin(z);
  return [
    [c2 * c3, -c2 * s3, s2],
    [c1 * s3 + s1 * s2 * c3, c1 * c3 - s1 * s2 * s3, -s1 * c2],
    [s1 * s3 - c1 * s2 * c3, s1 * c3 + c1 * s2 * s3, c1 * c2],
  ];
}

function paraMundo(ponto: Vetor3, solido: Solido): Vetor3 {
  const t = solido.transformacao;
  const escalado: Vetor3 = [ponto[0] * t.escala[0], ponto[1] * t.escala[1], ponto[2] * t.escala[2]];
  const r = rotacaoXYZ(t.rotacao);
  return [
    r[0][0] * escalado[0] + r[0][1] * escalado[1] + r[0][2] * escalado[2] + t.posicao[0],
    r[1][0] * escalado[0] + r[1][1] * escalado[1] + r[1][2] * escalado[2] + t.posicao[1],
    r[2][0] * escalado[0] + r[2][1] * escalado[1] + r[2][2] * escalado[2] + t.posicao[2],
  ];
}

const EPS = 1e-9;

/** Sólido → malha triangulada em coordenadas de mundo (manifold exige triângulos). */
export function solidoParaMalha(solido: Solido): MalhaManifold | null {
  const posicoes: number[] = [];
  const indice = new Map<string, number>();
  const mundo = new Map<string, Vetor3>();
  for (const vertice of solido.vertices) mundo.set(vertice.id, paraMundo(vertice.posicao, solido));

  const triVerts: number[] = [];
  for (const face of solido.faces) {
    const pontos: Vetor3[] = [];
    for (const id of face.vertices) {
      const p = mundo.get(id);
      if (p !== undefined) pontos.push(p);
    }
    if (pontos.length < 3) continue;
    // leque de triângulos, mantendo a ordem dos vértices da face
    for (let i = 1; i < pontos.length - 1; i += 1) {
      for (const ponto of [pontos[0], pontos[i], pontos[i + 1]]) {
        const chave = ponto[0].toFixed(6) + '|' + ponto[1].toFixed(6) + '|' + ponto[2].toFixed(6);
        let idx = indice.get(chave);
        if (idx === undefined) {
          idx = posicoes.length / 3;
          indice.set(chave, idx);
          posicoes.push(ponto[0], ponto[1], ponto[2]);
        }
        triVerts.push(idx);
      }
    }
  }

  if (triVerts.length < 3) return null;
  return {
    numProp: 3,
    vertProperties: new Float32Array(posicoes),
    triVerts: new Uint32Array(triVerts),
  };
}

/** Malha do manifold → Solido (faces trianguladas, arestas únicas, transformação identidade). */
function malhaParaSolido(malha: MalhaManifold, id: string, nome: string): Solido {
  const total = malha.vertProperties.length / malha.numProp;
  const vertices: Vertice[] = [];
  for (let i = 0; i < total; i += 1) {
    const base = i * malha.numProp;
    vertices.push({
      id: id + '_v' + String(i + 1),
      posicao: [malha.vertProperties[base], malha.vertProperties[base + 1], malha.vertProperties[base + 2]],
    });
  }

  const faces: Face[] = [];
  const mapaArestas = new Map<string, Aresta>();
  for (let t = 0; t < malha.triVerts.length; t += 3) {
    const a = malha.triVerts[t];
    const b = malha.triVerts[t + 1];
    const c = malha.triVerts[t + 2];
    const ids = [vertices[a]?.id, vertices[b]?.id, vertices[c]?.id];
    if (ids[0] === undefined || ids[1] === undefined || ids[2] === undefined) continue;
    faces.push({ id: id + '_f' + String(t / 3 + 1), vertices: ids, triangulada: true });
    const pares: Array<[string, string, number]> = [
      [ids[0], ids[1], a * 1000 + b],
      [ids[1], ids[2], b * 1000 + c],
      [ids[2], ids[0], c * 1000 + a],
    ];
    for (const [x, y] of pares) {
      const chave = x < y ? x + '|' + y : y + '|' + x;
      if (!mapaArestas.has(chave)) {
        mapaArestas.set(chave, { id: id + '_a' + String(mapaArestas.size + 1), verticeA: x, verticeB: y });
      }
    }
  }

  return {
    id,
    nome,
    vertices,
    arestas: [...mapaArestas.values()],
    faces,
    transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
  };
}

export interface OpcoesBooleana {
  /** Limite de triângulos de saída; estourar devolve erro em vez de travar a aba. */
  limiteTriangulos?: number;
}

export const LIMITE_TRIANGULOS_PADRAO = 200_000;

export function aplicarBooleana(
  solidoA: Solido,
  solidoB: Solido,
  operacao: TipoBooleana,
  opcoes: OpcoesBooleana = {},
): BooleanaResultado {
  if (modulo === null) return { ok: false, erro: { codigo: 'WASM_NAO_CARREGADO' } };

  const malhaA = solidoParaMalha(solidoA);
  const malhaB = solidoParaMalha(solidoB);
  if (malhaA === null || malhaB === null) {
    return { ok: false, erro: { codigo: 'NAO_MANIFOLD', solidoId: malhaA === null ? solidoA.id : solidoB.id, detalhe: 'sólido sem faces trianguláveis' } };
  }

  const limite = opcoes.limiteTriangulos ?? LIMITE_TRIANGULOS_PADRAO;

  try {
    const a = new modulo.Manifold(malhaA);
    const b = new modulo.Manifold(malhaB);
    const resultado =
      operacao === 'uniao'
        ? modulo.Manifold.union(a, b)
        : operacao === 'diferenca'
          ? modulo.Manifold.difference(a, b)
          : modulo.Manifold.intersection(a, b);

    const triangulos = resultado.numTri();
    if (triangulos > limite) {
      return { ok: false, erro: { codigo: 'LIMITE_TRIANGULOS', total: triangulos, limite } };
    }

    const malha = resultado.getMesh();
    if (malha.triVerts.length === 0) {
      return { ok: false, erro: { codigo: 'OPERACAO_INVALIDA', detalhe: 'resultado vazio (sólidos sem interseção?)' } };
    }

    const solido = malhaParaSolido(malha, solidoA.id, solidoA.nome);
    return { ok: true, solido, operacao: { tipo: 'aplicar_booleana', operacao, solidoA: solidoA.id, solidoB: solidoB.id, antes: { solidoA, solidoB }, depois: { resultado: solido, removidos: [solidoB] } } };
  } catch (erro) {
    return { ok: false, erro: { codigo: 'OPERACAO_INVALIDA', detalhe: erro instanceof Error ? erro.message : String(erro) } };
  }
}

/** Volume do sólido (via manifold) — usado em teste e para diagnóstico na UI. */
export function volumeSolido(solido: Solido): number | null {
  if (modulo === null) return null;
  const malha = solidoParaMalha(solido);
  if (malha === null) return null;
  const m = new modulo.Manifold(malha);
  const v = m.volume();
  return Number.isFinite(v) ? Math.abs(v) : null;
}

export { EPS as EPS_BOOLEANA };
