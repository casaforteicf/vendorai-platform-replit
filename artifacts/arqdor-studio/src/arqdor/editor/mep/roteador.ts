/**
 * Roteador de tubos — A* 2D por camada (E12), com custo de curva.
 *
 * O plano de corte é fixo (`alturaPlanoM`): o tubo sobe do ponto de origem até o plano, corre
 * no plano e desce até o destino. Isso evita o grid 3D de milhões de células.
 *
 * Estado do A* inclui a DIREÇÃO de chegada — sem isso o algoritmo não consegue cobrar a curva
 * e a rota sai em "escadinha" (o motivo do `custoCurva` existir no contrato).
 *
 * Puro: sem three, sem React. Devolve `null` quando não há rota ou quando estoura `maxCelulas`.
 */

import type { CamadaMEP, OpcoesRoteamento, ResultadoRoteamento } from './schema';
import type { Vetor3 } from '../modelador/schema';

export interface EntradaRoteamento {
  de: Vetor3;
  para: Vetor3;
  diametroMm: number;
  camada: CamadaMEP;
  opcoes: OpcoesRoteamento;
  /** Retângulos de obstáculo em planta (x0,z0)-(x1,z1); opcional, o contrato não exige. */
  obstaculos?: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>;
}

interface Estado {
  ix: number;
  iz: number;
  /** 0=+x, 1=-x, 2=+z, 3=-z, 4=início (sem direção). */
  dir: number;
}

const PASSOS: ReadonlyArray<{ dx: number; dz: number; dir: number }> = [
  { dx: 1, dz: 0, dir: 0 },
  { dx: -1, dz: 0, dir: 1 },
  { dx: 0, dz: 1, dir: 2 },
  { dx: 0, dz: -1, dir: 3 },
];

function chave(estado: Estado): string {
  return String(estado.ix) + ',' + String(estado.iz) + ',' + String(estado.dir);
}

/**
 * Rota num plano horizontal.
 * `null` = sem rota viável dentro do teto de células.
 */
export function rotearTubo(entrada: EntradaRoteamento): ResultadoRoteamento | null {
  const { opcoes } = entrada;
  const passo = opcoes.passoGradeM;
  if (!Number.isFinite(passo) || passo <= 0) return null;

  const planoY = opcoes.alturaPlanoM;
  const celula = (x: number): number => Math.round(x / passo);
  const mundo = (ix: number): number => ix * passo;

  const inicio: Estado = { ix: celula(entrada.de[0]), iz: celula(entrada.de[2]), dir: 4 };
  const fim = { ix: celula(entrada.para[0]), iz: celula(entrada.para[2]) };

  // caixa de busca: retângulo dos extremos + margem, e SEMPRE cobrindo os obstáculos —
  // sem isso o caminho de contorno cai fora da grade e o roteador devolve "sem rota".
  const margem = Math.max(2, Math.ceil((opcoes.folgaDiametro * entrada.diametroMm) / 1000 / passo) + 2);
  let ixMin = Math.min(inicio.ix, fim.ix) - margem;
  let ixMax = Math.max(inicio.ix, fim.ix) + margem;
  let izMin = Math.min(inicio.iz, fim.iz) - margem;
  let izMax = Math.max(inicio.iz, fim.iz) + margem;
  for (const obstaculo of entrada.obstaculos ?? []) {
    ixMin = Math.min(ixMin, celula(obstaculo.x0) - margem);
    ixMax = Math.max(ixMax, celula(obstaculo.x1) + margem);
    izMin = Math.min(izMin, celula(obstaculo.z0) - margem);
    izMax = Math.max(izMax, celula(obstaculo.z1) + margem);
  }

  const bloqueado = (ix: number, iz: number): boolean => {
    if (entrada.obstaculos === undefined) return false;
    const x = mundo(ix);
    const z = mundo(iz);
    return entrada.obstaculos.some(
      (o) => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1,
    );
  };

  const aberto: Array<{ estado: Estado; g: number; f: number }> = [{ estado: inicio, g: 0, f: 0 }];
  const anteriores = new Map<string, string>();
  const estados = new Map<string, Estado>();
  estados.set(chave(inicio), inicio);
  const custoG = new Map<string, number>([[chave(inicio), 0]]);
  let visitados = 0;

  const heuristica = (estado: Estado): number => {
    const dx = Math.abs(estado.ix - fim.ix);
    const dz = Math.abs(estado.iz - fim.iz);
    return (dx + dz) * passo;
  };

  while (aberto.length > 0) {
    let melhor = 0;
    for (let i = 1; i < aberto.length; i += 1) {
      if (aberto[i].f < aberto[melhor].f) melhor = i;
    }
    const atual = aberto.splice(melhor, 1)[0];
    visitados += 1;
    if (visitados > opcoes.maxCelulas) return null;

    if (atual.estado.ix === fim.ix && atual.estado.iz === fim.iz) {
      return reconstruir(atual.estado, anteriores, estados, mundo, entrada, planoY, visitados);
    }

    for (const passoDir of PASSOS) {
      const vizinho: Estado = {
        ix: atual.estado.ix + passoDir.dx,
        iz: atual.estado.iz + passoDir.dz,
        dir: passoDir.dir,
      };
      if (vizinho.ix < ixMin || vizinho.ix > ixMax || vizinho.iz < izMin || vizinho.iz > izMax) continue;
      if (bloqueado(vizinho.ix, vizinho.iz)) continue;

      const virou = atual.estado.dir !== 4 && atual.estado.dir !== vizinho.dir;
      const custo = passo + (virou ? opcoes.custoCurva * passo : 0);
      const g = atual.g + custo;
      const k = chave(vizinho);
      const anterior = custoG.get(k);
      if (anterior !== undefined && anterior <= g) continue;

      custoG.set(k, g);
      anteriores.set(k, chave(atual.estado));
      estados.set(k, vizinho);
      aberto.push({ estado: vizinho, g, f: g + heuristica(vizinho) });
    }
  }

  return null;
}

function reconstruir(
  final: Estado,
  anteriores: Map<string, string>,
  estados: Map<string, Estado>,
  mundo: (indice: number) => number,
  entrada: EntradaRoteamento,
  planoY: number,
  visitados: number,
): ResultadoRoteamento {
  const celulas: Array<{ ix: number; iz: number }> = [];
  let atual: Estado | undefined = final;
  while (atual !== undefined) {
    celulas.push({ ix: atual.ix, iz: atual.iz });
    const anterior = anteriores.get(chave(atual));
    atual = anterior === undefined ? undefined : estados.get(anterior);
  }
  celulas.reverse();

  const caminho: Vetor3[] = [];
  const adicionar = (p: Vetor3): void => {
    const ultimo = caminho[caminho.length - 1];
    if (ultimo !== undefined && Math.abs(ultimo[0] - p[0]) < 1e-9 && Math.abs(ultimo[1] - p[1]) < 1e-9 && Math.abs(ultimo[2] - p[2]) < 1e-9) {
      return;
    }
    caminho.push(p);
  };

  // sobe da origem até o plano, corre no plano, desce até o destino
  adicionar(entrada.de);
  const inicioNoPlano: Vetor3 = [entrada.de[0], planoY, entrada.de[2]];
  adicionar(inicioNoPlano);
  for (const c of celulas) {
    adicionar([mundo(c.ix), planoY, mundo(c.iz)]);
  }
  adicionar([entrada.para[0], planoY, entrada.para[2]]);
  adicionar(entrada.para);

  return {
    caminho: simplificar(caminho),
    celulasVisitadas: visitados,
    obstaculosConsiderados: entrada.obstaculos === undefined ? 0 : entrada.obstaculos.length,
  };
}

/** Remove pontos intermediários colineares (a rota vira waypoints de verdade). */
export function simplificar(caminho: readonly Vetor3[]): Vetor3[] {
  if (caminho.length <= 2) return [...caminho];
  const saida: Vetor3[] = [caminho[0]];
  for (let i = 1; i < caminho.length - 1; i += 1) {
    const a = saida[saida.length - 1];
    const b = caminho[i];
    const c = caminho[i + 1];
    const ab: Vetor3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const bc: Vetor3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const cruz: Vetor3 = [
      ab[1] * bc[2] - ab[2] * bc[1],
      ab[2] * bc[0] - ab[0] * bc[2],
      ab[0] * bc[1] - ab[1] * bc[0],
    ];
    const area = Math.hypot(cruz[0], cruz[1], cruz[2]);
    const mesmaDirecao = ab[0] * bc[0] + ab[1] * bc[1] + ab[2] * bc[2] > 0;
    if (area < 1e-9 && mesmaDirecao) {
      continue;
    }
    saida.push(b);
  }
  saida.push(caminho[caminho.length - 1]);
  return saida;
}

/** Comprimento real do caminho, em metros. */
export function comprimentoCaminho(caminho: readonly Vetor3[]): number {
  let total = 0;
  for (let i = 1; i < caminho.length; i += 1) {
    total += Math.hypot(
      caminho[i][0] - caminho[i - 1][0],
      caminho[i][1] - caminho[i - 1][1],
      caminho[i][2] - caminho[i - 1][2],
    );
  }
  return total;
}
