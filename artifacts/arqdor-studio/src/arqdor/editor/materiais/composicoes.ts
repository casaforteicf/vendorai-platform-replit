/**
 * Composições — insumos que formam um serviço (SINAPI-style).
 *
 * Ex.: 1 m² de alvenaria = 0,5 sc cimento + 0,1 m³ areia + 0,2 m² bloco + 1 h pedreiro.
 * O custo da composição é a soma dos insumos; material sem preço entra em `faltando`
 * (não vira R$ 0 silencioso — orçamento não pode mentir).
 */

import type { Catalogo } from './catalogo';
import { obterMaterial } from './catalogo';
import type { Unidade } from '../orcamento/quantitativos';

export interface InsumoComposicao {
  materialId: string;
  /** Quantidade do insumo por 1 unidade da composição. */
  quantidade: number;
}

export interface Composicao {
  id: string;
  nome: string;
  /** Unidade do SERVIÇO (m², m³, m, un). */
  unidade: Unidade;
  insumos: InsumoComposicao[];
}

export interface CustoComposicao {
  custo: number;
  /** Insumos sem material no catálogo ou sem preço — o custo está subestimado. */
  faltando: string[];
}

/** Soma `quantidade × preço` dos insumos. Material desconhecido/sem preço entra em `faltando`. */
export function custoComposicao(composicao: Composicao, catalogo: Catalogo): CustoComposicao {
  let custo = 0;
  const faltando: string[] = [];
  for (const insumo of composicao.insumos) {
    if (!Number.isFinite(insumo.quantidade) || insumo.quantidade <= 0) {
      faltando.push(insumo.materialId);
      continue;
    }
    const material = obterMaterial(catalogo, insumo.materialId);
    if (material.id === 'MAT-INDEFINIDO' || material.precoUnitario <= 0) {
      faltando.push(insumo.materialId);
      continue;
    }
    custo += insumo.quantidade * material.precoUnitario;
  }
  return { custo: Math.round(custo * 100) / 100, faltando };
}

export const COMPOSICOES_PADRAO: readonly Composicao[] = [
  {
    id: 'COMP-ALV-BLOCO',
    nome: 'Alvenaria de bloco cerâmico (1 m²)',
    unidade: 'm2',
    insumos: [
      { materialId: 'MAT-ALV-BLOCO', quantidade: 0.2 },
      { materialId: 'MAT-ACAB-ARGAMASSA', quantidade: 0.03 },
    ],
  },
];

// ---------- CSV SINAPI-like ----------

export const CABECALHO_COMPOSICOES = ['composicao_id', 'composicao_nome', 'unidade', 'insumo_id', 'quantidade'] as const;

function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i];
    if (caractere === '"') {
      dentroDeAspas = !dentroDeAspas;
      continue;
    }
    if (caractere === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
      continue;
    }
    atual += caractere;
  }
  campos.push(atual);
  return campos.map((campo) => campo.trim());
}

export interface ComposicaoIgnorada {
  linha: number;
  motivo: 'LINHA_INVALIDA' | 'QUANTIDADE_INVALIDA' | 'UNIDADE_INVALIDA';
}

export interface ResultadoImportacaoComposicoes {
  composicoes: Composicao[];
  ignorados: ComposicaoIgnorada[];
  erro?: 'CABECALHO_INVALIDO';
}

const UNIDADES: readonly string[] = ['m2', 'm3', 'm', 'un'];

/** Importa CSV agrupando linhas por composição. Separador `;` (Excel pt-BR). */
export function importarComposicoesCsv(texto: string): ResultadoImportacaoComposicoes {
  const linhas = texto.split(/\r?\n/).filter((linha) => linha.trim().length > 0);
  if (linhas.length === 0) return { composicoes: [], ignorados: [], erro: 'CABECALHO_INVALIDO' };

  const cabecalho = dividirLinha(linhas[0], ';');
  const indices = {
    id: cabecalho.indexOf('composicao_id'),
    nome: cabecalho.indexOf('composicao_nome'),
    unidade: cabecalho.indexOf('unidade'),
    insumo: cabecalho.indexOf('insumo_id'),
    quantidade: cabecalho.indexOf('quantidade'),
  };
  if (Object.values(indices).some((indice) => indice < 0)) {
    return { composicoes: [], ignorados: [], erro: 'CABECALHO_INVALIDO' };
  }

  const mapa = new Map<string, Composicao>();
  const ignorados: ComposicaoIgnorada[] = [];

  for (let i = 1; i < linhas.length; i += 1) {
    const campos = dividirLinha(linhas[i], ';');
    const id = campos[indices.id] ?? '';
    const nome = campos[indices.nome] ?? '';
    const unidade = (campos[indices.unidade] ?? '').toLowerCase();
    const insumoId = campos[indices.insumo] ?? '';
    const quantidade = Number((campos[indices.quantidade] ?? '').replace(',', '.'));

    if (id.length === 0 || nome.length === 0 || insumoId.length === 0) {
      ignorados.push({ linha: i + 1, motivo: 'LINHA_INVALIDA' });
      continue;
    }
    if (!UNIDADES.includes(unidade)) {
      ignorados.push({ linha: i + 1, motivo: 'UNIDADE_INVALIDA' });
      continue;
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      ignorados.push({ linha: i + 1, motivo: 'QUANTIDADE_INVALIDA' });
      continue;
    }

    const existente = mapa.get(id);
    if (existente === undefined) {
      mapa.set(id, {
        id,
        nome,
        unidade: unidade as Unidade,
        insumos: [{ materialId: insumoId, quantidade }],
      });
    } else {
      existente.insumos.push({ materialId: insumoId, quantidade });
    }
  }

  return { composicoes: [...mapa.values()], ignorados };
}

/** Exporta as composições no mesmo formato (ida e volta). */
export function exportarComposicoesCsv(composicoes: readonly Composicao[]): string {
  const linhas = [CABECALHO_COMPOSICOES.join(';')];
  for (const composicao of composicoes) {
    for (const insumo of composicao.insumos) {
      linhas.push(
        [composicao.id, composicao.nome, composicao.unidade, insumo.materialId, String(insumo.quantidade).replace('.', ',')].join(';'),
      );
    }
  }
  return linhas.join('\n');
}
