/**
 * Cotação — exportar lista para fornecedor e importar a resposta.
 *
 * O ponto delicado é o IMPORT: planilha de fornecedor é o formato mais hostil que existe
 * (BOM do Excel, `;` ou `,`, cabeçalho com acento, linha vazia, preço com vírgula). O parser
 * aceita tudo isso e registra o que ignorou — nunca falha em silêncio.
 */

import type { Categoria, GrupoQuantitativo, Unidade } from '../orcamento/quantitativos';
import { atualizarPrecoUnitario, obterMaterial } from './catalogo';
import type { Catalogo } from './catalogo';
import type { Material } from './schema';

export interface ItemCotacao {
  materialId: string;
  nome: string;
  categoria: Categoria;
  unidade: Unidade;
  quantidade: number;
  precoReferencia: number;
}

/** Converte os grupos do quantitativo em linhas de cotação (material + unidade). */
export function itensDeCotacao(
  grupos: readonly GrupoQuantitativo[],
  catalogo: Catalogo,
): ItemCotacao[] {
  const mapa = new Map<string, ItemCotacao>();
  for (const grupo of grupos) {
    const materialId = grupo.materialId ?? 'MAT-INDEFINIDO';
    const chave = materialId + '|' + grupo.unidade;
    const material = obterMaterial(catalogo, grupo.materialId);
    const existente = mapa.get(chave);
    if (existente === undefined) {
      mapa.set(chave, {
        materialId,
        nome: material.nome,
        categoria: grupo.categoria,
        unidade: grupo.unidade,
        quantidade: grupo.quantidadeComPerda,
        precoReferencia: material.precoReferencia ?? material.precoUnitario,
      });
    } else {
      existente.quantidade += grupo.quantidadeComPerda;
    }
  }
  return [...mapa.values()].sort((a, b) => (a.materialId < b.materialId ? -1 : a.materialId > b.materialId ? 1 : 0));
}

function escaparCampo(valor: string, separador: string): string {
  if (valor.includes(separador) || valor.includes('"') || valor.includes('\n')) {
    return '"' + valor.replace(/"/g, '""') + '"';
  }
  return valor;
}

export interface ResultadoExportacao {
  csv: string;
  json: string;
}

/**
 * Gera CSV (abre no Excel pt-BR) e JSON (mesma informação para integração).
 * Separador `;` de propósito: vírgula é decimal no Brasil.
 */
export function exportarParaCotacao(
  itens: readonly ItemCotacao[],
  opcoes: { moeda?: string } = {},
): ResultadoExportacao {
  const separador = ';';
  const moeda = opcoes.moeda ?? 'BRL';
  const cabecalho = ['material_id', 'nome', 'categoria', 'unidade', 'quantidade', 'preco_referencia', 'moeda'];
  const linhas = itens.map((item) =>
    [
      escaparCampo(item.materialId, separador),
      escaparCampo(item.nome, separador),
      escaparCampo(item.categoria, separador),
      escaparCampo(item.unidade, separador),
      String(item.quantidade).replace('.', ','),
      String(item.precoReferencia).replace('.', ','),
      escaparCampo(moeda, separador),
    ].join(separador),
  );
  const csv = [cabecalho.join(separador), ...linhas].join('\r\n') + '\r\n';
  return { csv, json: JSON.stringify({ moeda, itens }, null, 2) };
}

export type MotivoIgnorado = 'DESCONHECIDO' | 'PRECO_INVALIDO' | 'LINHA_INVALIDA';

export interface ResultadoImportacao {
  catalogo: Material[];
  atualizados: number;
  ignorados: Array<{ materialId: string; motivo: MotivoIgnorado }>;
  /** Preenchido quando o cabeçalho não tem as colunas obrigatórias. */
  erro?: 'CABECALHO_INVALIDO';
}

/** Divide uma linha CSV respeitando aspas duplas. */
function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i];
    if (caractere === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
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

function numeroDaPlanilha(texto: string): number {
  if (!/\d/.test(texto)) return NaN;
  const limpo = texto.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '');
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const valor = Number(normalizado.replace(/[^\d.-]/g, ''));
  return Number.isFinite(valor) ? valor : NaN;
}

/**
 * Importa a resposta do fornecedor. Colunas obrigatórias: `material_id` e `preco_unitario`
 * (aceita aliases `material`/`id` e `preco`/`preço`). Cabeçalho com BOM e CRLF do Excel é normal.
 */
export function importarCotacao(
  conteudo: string,
  catalogo: Catalogo,
  opcoes: { atualizadoEm?: string } = {},
): ResultadoImportacao {
  const ignorados: ResultadoImportacao['ignorados'] = [];
  const linhas = conteudo.replace(/^\uFEFF/, '').split(/\r?\n/).filter((linha) => linha.trim().length > 0);
  if (linhas.length === 0) return { catalogo: [...catalogo], atualizados: 0, ignorados, erro: 'CABECALHO_INVALIDO' };

  const separador = (linhas[0].match(/;/g) ?? []).length >= (linhas[0].match(/,/g) ?? []).length ? ';' : ',';
  const cabecalho = dividirLinha(linhas[0], separador).map((campo) =>
    campo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'),
  );

  const indiceMaterial = cabecalho.findIndex((campo) => campo === 'material_id' || campo === 'material' || campo === 'id');
  const indicePreco = cabecalho.findIndex((campo) => campo === 'preco_unitario' || campo === 'preco');
  if (indiceMaterial < 0 || indicePreco < 0) {
    return { catalogo: [...catalogo], atualizados: 0, ignorados, erro: 'CABECALHO_INVALIDO' };
  }

  let atual = catalogo;
  let atualizados = 0;

  for (let i = 1; i < linhas.length; i += 1) {
    const campos = dividirLinha(linhas[i], separador);
    const materialId = (campos[indiceMaterial] ?? '').trim();
    if (materialId.length === 0) {
      ignorados.push({ materialId: '', motivo: 'LINHA_INVALIDA' });
      continue;
    }
    const preco = numeroDaPlanilha(campos[indicePreco] ?? '');
    if (!Number.isFinite(preco) || preco < 0) {
      ignorados.push({ materialId, motivo: 'PRECO_INVALIDO' });
      continue;
    }
    const resultado = atualizarPrecoUnitario(atual, materialId, preco, 'COTACAO', opcoes.atualizadoEm);
    if (!resultado.ok) {
      ignorados.push({ materialId, motivo: 'DESCONHECIDO' });
      continue;
    }
    atual = resultado.catalogo;
    atualizados += 1;
  }

  return { catalogo: [...atual], atualizados, ignorados };
}
