/**
 * Importação — leitura de DXF (ASCII) dos entes que geram superfície.
 *
 * `3DFACE` (tri/quad) e `LWPOLYLINE` fechada (por elevação). `LINE`/`ARC` isolados não formam
 * face e são ignorados — não inventamos espessura.
 *
 * LWPOLYLINE repete os códigos 10/20 por vértice, então cada entidade é guardada como LISTA DE
 * PARES (um map por código perderia os vértices).
 */

import type { MalhaImportada } from './glb';

export type ResultadoDxf =
  | { ok: true; malha: MalhaImportada }
  | { ok: false; erro: 'ARQUIVO_INVALIDO' | 'SEM_GEOMETRIA' };

interface Par {
  codigo: number;
  valor: string;
}

function paraPares(texto: string): Par[] | null {
  const linhas = texto.split(/\r?\n/);
  const lista: Par[] = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const codigo = Number(linhas[i].trim());
    if (!Number.isFinite(codigo)) return null;
    lista.push({ codigo, valor: linhas[i + 1] });
  }
  return lista;
}

function numero(valor: string | undefined): number | null {
  if (valor === undefined) return null;
  const n = Number(valor.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function valorDe(pares: readonly Par[], codigo: number): string | undefined {
  return pares.find((par) => par.codigo === codigo)?.valor;
}

export function lerDxf(texto: string): ResultadoDxf {
  const lista = paraPares(texto);
  if (lista === null) return { ok: false, erro: 'ARQUIVO_INVALIDO' };

  const posicoes: number[] = [];
  const indices: number[] = [];
  let emEntidades = false;
  let nomeEntidade: string | null = null;
  let brutos: Par[] = [];
  let faces = 0;

  const ponto = (x: number | null, y: number | null, z: number | null): number | null => {
    if (x === null || y === null) return null;
    const indice = posicoes.length / 3;
    posicoes.push(x, y, z ?? 0);
    return indice;
  };

  const triangular = (ids: ReadonlyArray<number | null>): void => {
    const validos = ids.filter((id): id is number => id !== null);
    if (validos.length < 3) return;
    for (let i = 1; i + 1 < validos.length; i += 1) {
      indices.push(validos[0], validos[i], validos[i + 1]);
    }
    faces += 1;
  };

  const fechar = (): void => {
    if (nomeEntidade === '3DFACE') {
      const p1 = ponto(numero(valorDe(brutos, 10)), numero(valorDe(brutos, 20)), numero(valorDe(brutos, 30)));
      const p2 = ponto(numero(valorDe(brutos, 11)), numero(valorDe(brutos, 21)), numero(valorDe(brutos, 31)));
      const p3 = ponto(numero(valorDe(brutos, 12)), numero(valorDe(brutos, 22)), numero(valorDe(brutos, 32)));
      const p4 = ponto(numero(valorDe(brutos, 13)), numero(valorDe(brutos, 23)), numero(valorDe(brutos, 33)));
      const quartoIgual =
        p3 !== null && p4 !== null &&
        posicoes[p3 * 3] === posicoes[p4 * 3] &&
        posicoes[p3 * 3 + 1] === posicoes[p4 * 3 + 1] &&
        posicoes[p3 * 3 + 2] === posicoes[p4 * 3 + 2];
      triangular(quartoIgual ? [p1, p2, p3] : [p1, p2, p3, p4]);
    } else if (nomeEntidade === 'LWPOLYLINE') {
      const elevacao = numero(valorDe(brutos, 38)) ?? 0;
      const ids: Array<number | null> = [];
      let xPendente: number | null = null;
      for (const par of brutos) {
        if (par.codigo === 10) {
          xPendente = numero(par.valor);
        } else if (par.codigo === 20) {
          const y = numero(par.valor);
          if (xPendente !== null && y !== null) ids.push(ponto(xPendente, y, elevacao));
          xPendente = null;
        }
      }
      const fechada = (numero(valorDe(brutos, 70)) ?? 0) % 2 === 1;
      if (!fechada && ids.length > 2) {
        // Polilinha aberta não delimita área; só triangularia se fechada.
        return;
      }
      triangular(ids);
    }
    nomeEntidade = null;
    brutos = [];
  };

  for (const par of lista) {
    if (par.codigo === 0) {
      if (emEntidades) fechar();
      const nome = par.valor.trim();
      if (nome === 'ENDSEC') {
        emEntidades = false;
      } else if (nome === '3DFACE' || nome === 'LWPOLYLINE') {
        nomeEntidade = nome;
      }
      continue;
    }
    if (par.codigo === 2 && par.valor.trim() === 'ENTITIES') {
      emEntidades = true;
      continue;
    }
    if (emEntidades && nomeEntidade !== null) brutos.push(par);
  }
  if (emEntidades) fechar();

  if (faces === 0 || indices.length < 3) return { ok: false, erro: 'SEM_GEOMETRIA' };
  return { ok: true, malha: { posicoes, indices } };
}
