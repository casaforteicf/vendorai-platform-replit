/**
 * D12 (decidido, 2026-11-02) — MATERIALIZAÇÃO: sólido do modelador → elemento BIM.
 *
 * Opção A aprovada pelo dono do produto: "semântica por face", mantendo a alma
 * SketchUp-like. A regra é GEOMÉTRICA e determinística — nada de heurística escondida.
 *
 * Regras, na ordem em que são aplicadas:
 *  1. PAREDE  — volume vertical: possui base e topo horizontais, `altura >= alturaMinimaParede`,
 *               e a menor dimensão da planta é `<= espessuraMaximaParede`.
 *               `comprimento` = maior dimensão da planta; `espessura` = menor.
 *  2. LAJE    — volume achatado (`altura <= alturaMaximaLaje`) ou uma face horizontal solta.
 *               `contorno` = polígono da base projetado em XZ; `espessura` = parâmetro
 *               (`espessuraLajeM`), caindo para a altura do próprio sólido quando ausente.
 *  3. TELHADO — sem plano horizontal dominante e com face inclinada (`5° .. 80°`).
 *               `contorno` = projeção da maior face inclinada; `inclinacaoGraus` da normal.
 *  4. MOBILIARIO — todo o resto. Dimensões do bounding box e posição em planta.
 *
 * Invariantes:
 *  - Puro: sem three, sem React, sem `Date`. Mesma entrada ⇒ mesma saída.
 *  - `id` do elemento é função do sólido (`el_<solidoId>`), então re-materializar
 *    ATUALIZA em vez de duplicar — a chave do orçamento não explode.
 *  - Coordenadas em metros, mundo (a `transformacao` do sólido é aplicada aqui).
 *
 * Limites conhecidos (documentados, não silenciosos):
 *  - 1 sólido ⇒ 1 elemento. Um sólido em "L" que deveria virar 2 paredes ainda não é fatiado.
 *  - Parede curva não existe no BIM (contrato `GeometriaParede` é reta A→B).
 */

import type { Solido, Vetor3 } from '../modelador/schema';
import type {
  ElementoBim,
  GeometriaLaje,
  GeometriaMobiliario,
  GeometriaParede,
  GeometriaTelhado,
  OperacaoBIM,
  TipoElemento,
} from './schema';

const EPS = 1e-9;

export interface OpcoesMaterializacao {
  projetoId: string;
  camadaId: string;
  nivel?: number;
  /** Espessura da laje em metros. Ausente ⇒ usa a altura do próprio sólido. */
  espessuraLajeM?: number;
  materialId?: string;
  alturaMinimaParedeM?: number;
  espessuraMaximaParedeM?: number;
  alturaMaximaLajeM?: number;
}

/** Limiares da regra A. Ficam aqui para serem auditáveis e testáveis. */
export const PADROES_MATERIALIZACAO = {
  nivel: 0,
  alturaMinimaParedeM: 1.0,
  espessuraMaximaParedeM: 0.6,
  alturaMaximaLajeM: 0.4,
  /** Espessura padrão quando a face é solta (sem volume) e o usuário não informou. */
  espessuraLajePadraoM: 0.12,
  inclinacaoMinimaTelhadoGraus: 5,
  inclinacaoMaximaTelhadoGraus: 80,
} as const;

export type ErroMaterializacao =
  | { codigo: 'SOLIDO_SEM_FACES'; solidoId: string }
  | { codigo: 'SOLIDO_DEGENERADO'; solidoId: string; detalhe: string };

export type ResultadoMaterializacao =
  | { ok: true; elemento: ElementoBim }
  | { ok: false; erro: ErroMaterializacao };

export interface ResultadoLote {
  operacoes: OperacaoBIM[];
  elementos: ElementoBim[];
  erros: ErroMaterializacao[];
}

/* ------------------------------------------------------------------ */
/* álgebra                                                             */
/* ------------------------------------------------------------------ */

/**
 * Matriz de rotação compatível com `Object3D.rotation` do three (Euler XYZ).
 * Reproduz a mesma composição do three, mas sem depender dele.
 */
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

/** Mundo = R · (escala ⊙ v) + posição — mesma ordem do three (T·R·S). */
export function paraMundo(ponto: Vetor3, solido: Solido): Vetor3 {
  const t = solido.transformacao;
  const escalado: Vetor3 = [ponto[0] * t.escala[0], ponto[1] * t.escala[1], ponto[2] * t.escala[2]];
  const r = rotacaoXYZ(t.rotacao);
  return [
    r[0][0] * escalado[0] + r[0][1] * escalado[1] + r[0][2] * escalado[2] + t.posicao[0],
    r[1][0] * escalado[0] + r[1][1] * escalado[1] + r[1][2] * escalado[2] + t.posicao[1],
    r[2][0] * escalado[0] + r[2][1] * escalado[1] + r[2][2] * escalado[2] + t.posicao[2],
  ];
}

function normalNewell(pontos: readonly Vetor3[]): Vetor3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const norma = Math.hypot(nx, ny, nz);
  return norma < EPS ? [0, 0, 0] : [nx / norma, ny / norma, nz / norma];
}

function areaProjetada(pontos: readonly Vetor3[]): number {
  let soma = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a[0] * b[2] - b[0] * a[2];
  }
  return Math.abs(soma) / 2;
}

/** Remove pontos repetidos consecutivos e o fechamento implícito. */
function semRepetidos(contorno: readonly [number, number][]): [number, number][] {
  const saida: [number, number][] = [];
  for (const ponto of contorno) {
    const ultimo = saida[saida.length - 1];
    if (ultimo === undefined || Math.hypot(ultimo[0] - ponto[0], ultimo[1] - ponto[1]) > EPS) {
      saida.push([ponto[0], ponto[1]]);
    }
  }
  if (saida.length > 1) {
    const primeiro = saida[0];
    const ultimo = saida[saida.length - 1];
    if (Math.hypot(primeiro[0] - ultimo[0], primeiro[1] - ultimo[1]) <= EPS) saida.pop();
  }
  return saida;
}

function caixa(pontos: readonly Vetor3[]): { min: Vetor3; max: Vetor3 } {
  const min: Vetor3 = [Infinity, Infinity, Infinity];
  const max: Vetor3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pontos) {
    for (let i = 0; i < 3; i += 1) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
  return { min, max };
}

/* ------------------------------------------------------------------ */
/* classificação                                                       */
/* ------------------------------------------------------------------ */

interface FaceMundo {
  id: string;
  pontos: Vetor3[];
  normal: Vetor3;
  areaProjetadaXZ: number;
  alturaMedia: number;
}

export interface Classificacao {
  tipo: Extract<TipoElemento, 'parede' | 'laje' | 'telhado' | 'mobiliario'>;
  geometria: GeometriaParede | GeometriaLaje | GeometriaTelhado | GeometriaMobiliario;
  /** Números que justificam a decisão — úteis no painel e no teste. */
  metricas: {
    altura: number;
    larguraX: number;
    profundidadeZ: number;
    menorDimensaoPlanta: number;
    areaPlanta: number;
  };
}

export function classificarSolido(
  solido: Solido,
  opcoes: OpcoesMaterializacao,
): { ok: true; classificacao: Classificacao } | { ok: false; erro: ErroMaterializacao } {
  const mapa = new Map(solido.vertices.map((v) => [v.id, v.posicao]));
  const faces: FaceMundo[] = [];

  for (const face of solido.faces) {
    const pontos: Vetor3[] = [];
    for (const id of face.vertices) {
      const posicao = mapa.get(id);
      if (posicao !== undefined) pontos.push(paraMundo(posicao, solido));
    }
    if (pontos.length < 3) continue;
    const normal = normalNewell(pontos);
    let somaAltura = 0;
    for (const p of pontos) somaAltura += p[1];
    faces.push({
      id: face.id,
      pontos,
      normal,
      areaProjetadaXZ: areaProjetada(pontos),
      alturaMedia: somaAltura / pontos.length,
    });
  }

  if (faces.length === 0) return { ok: false, erro: { codigo: 'SOLIDO_SEM_FACES', solidoId: solido.id } };

  const todosPontos: Vetor3[] = [];
  for (const face of faces) todosPontos.push(...face.pontos);
  const { min, max } = caixa(todosPontos);
  const alturaTotal = max[1] - min[1];
  const larguraX = max[0] - min[0];
  const profundidadeZ = max[2] - min[2];

  const horizontais = faces.filter((f) => Math.abs(f.normal[1]) >= 0.98);
  const inclinadas = faces.filter((f) => {
    const abs = Math.abs(f.normal[1]);
    return abs > 0.02 && abs < 0.98;
  });

  const alturaMinParede = opcoes.alturaMinimaParedeM ?? PADROES_MATERIALIZACAO.alturaMinimaParedeM;
  const espessuraMaxParede = opcoes.espessuraMaximaParedeM ?? PADROES_MATERIALIZACAO.espessuraMaximaParedeM;
  const alturaMaxLaje = opcoes.alturaMaximaLajeM ?? PADROES_MATERIALIZACAO.alturaMaximaLajeM;

  const menorDimensaoPlanta = Math.min(larguraX, profundidadeZ);

  const base = horizontais.reduce<FaceMundo | null>((melhor, f) => (melhor === null || f.alturaMedia < melhor.alturaMedia ? f : melhor), null);
  const baseContorno =
    base !== null
      ? semRepetidos(base.pontos.map((p) => [p[0], p[2]] as [number, number]))
      : [];
  const areaPlanta = base !== null ? areaProjetada(base.pontos) : 0;
  const metricas = {
    altura: alturaTotal,
    larguraX,
    profundidadeZ,
    menorDimensaoPlanta,
    areaPlanta,
  };

  // 2. LAJE — volume achatado (base + topo) ou face horizontal solta.
  const temTopo = horizontais.length >= 2 || alturaTotal <= alturaMaxLaje;
  if (temTopo && alturaTotal <= alturaMaxLaje + EPS) {
    if (baseContorno.length < 3 || areaPlanta <= EPS) {
      return { ok: false, erro: { codigo: 'SOLIDO_DEGENERADO', solidoId: solido.id, detalhe: 'contorno de laje inválido' } };
    }
    // Face solta (sem volume) não pode virar laje de espessura zero: volume zero
    // contaminaria o orçamento. Cai no padrão construtivo.
    const espessura = opcoes.espessuraLajeM ?? (alturaTotal > EPS ? alturaTotal : PADROES_MATERIALIZACAO.espessuraLajePadraoM);
    const geometria: GeometriaLaje = { contorno: baseContorno, espessura };
    return { ok: true, classificacao: { tipo: 'laje', geometria, metricas } };
  }

  // 1. PAREDE — volume vertical esbelto.
  if (alturaTotal >= alturaMinParede && menorDimensaoPlanta <= espessuraMaxParede) {
    const aoLongoDeX = larguraX >= profundidadeZ;
    const centroZ = (min[2] + max[2]) / 2;
    const centroX = (min[0] + max[0]) / 2;
    const pontoA: [number, number] = aoLongoDeX ? [min[0], centroZ] : [centroX, min[2]];
    const pontoB: [number, number] = aoLongoDeX ? [max[0], centroZ] : [centroX, max[2]];
    const espessura = aoLongoDeX ? profundidadeZ : larguraX;
    if (Math.hypot(pontoB[0] - pontoA[0], pontoB[1] - pontoA[1]) <= EPS || espessura <= EPS) {
      return { ok: false, erro: { codigo: 'SOLIDO_DEGENERADO', solidoId: solido.id, detalhe: 'parede sem comprimento ou espessura' } };
    }
    const geometria: GeometriaParede = { ponto_a: pontoA, ponto_b: pontoB, altura: alturaTotal, espessura };
    return { ok: true, classificacao: { tipo: 'parede', geometria, metricas } };
  }

  // 3. TELHADO — superfície inclinada.
  const inclinada = inclinadas.reduce<FaceMundo | null>((melhor, f) => (melhor === null || f.areaProjetadaXZ > melhor.areaProjetadaXZ ? f : melhor), null);
  if (inclinada !== null) {
    const absNy = Math.abs(inclinada.normal[1]);
    const graus = (Math.acos(Math.min(1, absNy)) * 180) / Math.PI;
    if (graus >= PADROES_MATERIALIZACAO.inclinacaoMinimaTelhadoGraus && graus <= PADROES_MATERIALIZACAO.inclinacaoMaximaTelhadoGraus) {
      const contorno = semRepetidos(inclinada.pontos.map((p) => [p[0], p[2]] as [number, number]));
      if (contorno.length >= 3) {
        const geometria: GeometriaTelhado = { contorno, inclinacaoGraus: graus };
        return { ok: true, classificacao: { tipo: 'telhado', geometria, metricas } };
      }
    }
  }

  // 4. MOBILIARIO — tudo o mais.
  const geometria: GeometriaMobiliario = {
    modeladorSolidoId: solido.id,
    dimensoes: {
      largura: larguraX,
      altura: Math.max(alturaTotal, EPS),
      profundidade: profundidadeZ,
    },
    posicao: [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2],
    rotacaoGraus: (solido.transformacao.rotacao[1] * 180) / Math.PI,
  };
  return { ok: true, classificacao: { tipo: 'mobiliario', geometria, metricas } };
}

/* ------------------------------------------------------------------ */
/* elemento e lote                                                     */
/* ------------------------------------------------------------------ */

/** Id determinístico: o mesmo sólido sempre gera o mesmo elemento. */
export function idElementoDe(solidoId: string): string {
  return 'el_' + solidoId;
}

export function materializarSolido(solido: Solido, opcoes: OpcoesMaterializacao): ResultadoMaterializacao {
  const resultado = classificarSolido(solido, opcoes);
  if (!resultado.ok) return resultado;
  const { tipo, geometria } = resultado.classificacao;

  const elemento: ElementoBim = {
    id: idElementoDe(solido.id),
    projetoId: opcoes.projetoId,
    tipo,
    nivel: opcoes.nivel ?? PADROES_MATERIALIZACAO.nivel,
    geometria,
    propriedades: {
      nome: solido.nome,
      solidoId: solido.id,
      origem: 'materializacao',
      classificacao: tipo,
      altura: resultado.classificacao.metricas.altura,
      areaPlanta: resultado.classificacao.metricas.areaPlanta,
      menorDimensaoPlanta: resultado.classificacao.metricas.menorDimensaoPlanta,
    },
    camadaId: opcoes.camadaId,
  };
  if (opcoes.materialId !== undefined) elemento.materialId = opcoes.materialId;

  return { ok: true, elemento };
}

/**
 * Materializa uma lista de sólidos, respeitando o que já existe:
 * mesmo id ⇒ `atualizar_elemento_bim`; id novo ⇒ `criar_elemento_bim`.
 * Sólidos que falham entram em `erros` sem derrubar o lote.
 */
export function materializarSolidos(
  solidos: readonly Solido[],
  opcoes: OpcoesMaterializacao,
  existentes: readonly ElementoBim[] = [],
): ResultadoLote {
  const operacoes: OperacaoBIM[] = [];
  const elementos: ElementoBim[] = [];
  const erros: ErroMaterializacao[] = [];
  const porId = new Map(existentes.map((e) => [e.id, e]));

  for (const solido of solidos) {
    const resultado = materializarSolido(solido, opcoes);
    if (!resultado.ok) {
      erros.push(resultado.erro);
      continue;
    }
    const anterior = porId.get(resultado.elemento.id);
    if (anterior === undefined) {
      operacoes.push({ tipo: 'criar_elemento_bim', elemento: resultado.elemento });
    } else if (anterior.tipo !== resultado.elemento.tipo || JSON.stringify(anterior.geometria) !== JSON.stringify(resultado.elemento.geometria)) {
      operacoes.push({ tipo: 'atualizar_elemento_bim', antes: anterior, depois: resultado.elemento });
    }
    elementos.push(resultado.elemento);
  }

  return { operacoes, elementos, erros };
}
