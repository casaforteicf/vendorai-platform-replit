/**
 * IA — contexto do documento (M4).
 *
 * O modelo precisa saber o que já existe (para não criar duplicado nem falar de parede que não
 * existe), mas o prompt tem orçamento. Aqui o documento vira um resumo curto e determinístico:
 * contagens, unidades medidas e os materiais realmente usados.
 */

import type { ElementoBim } from '../bim/schema';
import type { EstadoModelador } from '../modelador/store-core';
import type { Catalogo } from '../materiais/catalogo';
import { obterMaterial } from '../materiais/catalogo';
import type { FamiliaMovel } from '../biblioteca/familias';
import { quantitativoMoveis } from '../biblioteca/quantitativo';
import { quantitativos } from '../orcamento/quantitativos';

export interface ResumoDocumento {
  solidos: number;
  totalElementos: number;
  elementosPorTipo: Record<string, number>;
  unidades: Array<{ unidade: string; quantidade: number }>;
  moveisPorFamilia: Array<{ familiaId: string; quantidade: number }>;
  materiais: Array<{ id: string; nome: string; unidade: string; precoUnitario: number }>;
  /** Texto curto para o prompt. */
  texto: string;
}

export interface EntradaContexto {
  modelador: EstadoModelador;
  elementos: readonly ElementoBim[];
  catalogo: Catalogo;
  familias: readonly FamiliaMovel[];
}

const MAX_MATERIAIS_PADRAO = 8;
const MAX_CARACTERES_PADRAO = 600;

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function resumirDocumento(
  entrada: EntradaContexto,
  opcoes: { maxMateriais?: number; maxCaracteres?: number } = {},
): ResumoDocumento {
  const maxMateriais = opcoes.maxMateriais ?? MAX_MATERIAIS_PADRAO;
  const maxCaracteres = opcoes.maxCaracteres ?? MAX_CARACTERES_PADRAO;

  const elementosPorTipo: Record<string, number> = {};
  for (const elemento of entrada.elementos) {
    elementosPorTipo[elemento.tipo] = (elementosPorTipo[elemento.tipo] ?? 0) + 1;
  }

  const quantitativo = quantitativos(entrada.elementos);
  const unidades = quantitativo.totalPorUnidade
    .map((item) => ({ unidade: item.unidade, quantidade: arredondar(item.quantidadeComPerda) }))
    .sort((a, b) => (a.unidade < b.unidade ? -1 : 1));

  const moveis = quantitativoMoveis(entrada.elementos, entrada.familias)
    .map((grupo) => ({ familiaId: grupo.familiaId, quantidade: grupo.quantidade }))
    .sort((a, b) => (a.familiaId < b.familiaId ? -1 : 1));

  // Materiais realmente usados primeiro; completa com o catálogo se sobrar espaço.
  const usados = new Set<string>();
  for (const elemento of entrada.elementos) {
    if (elemento.materialId !== undefined) usados.add(elemento.materialId);
  }
  const ids = [...usados].sort();
  for (const material of entrada.catalogo) {
    if (ids.length >= maxMateriais) break;
    if (!ids.includes(material.id)) ids.push(material.id);
  }
  const materiais = ids.slice(0, maxMateriais).map((id) => {
    const material = obterMaterial(entrada.catalogo, id);
    return {
      id: material.id,
      nome: material.nome,
      unidade: material.unidade,
      precoUnitario: material.precoUnitario,
    };
  });

  const tipos = Object.entries(elementosPorTipo)
    .map(([tipo, quantidade]) => tipo + '=' + String(quantidade))
    .join(' ');
  const linhas = [
    'Sólidos: ' + String(entrada.modelador.solidos.length) + ' | Elementos: ' + String(entrada.elementos.length) + (tipos.length > 0 ? ' (' + tipos + ')' : ''),
    unidades.length > 0
      ? 'Medido: ' + unidades.map((item) => String(item.quantidade) + ' ' + item.unidade).join(', ')
      : 'Medido: nada ainda',
    moveis.length > 0
      ? 'Móveis: ' + moveis.map((item) => String(item.quantidade) + '× ' + item.familiaId).join(', ')
      : 'Móveis: nenhum',
  ];
  let texto = linhas.join('\n');
  if (texto.length > maxCaracteres) {
    texto = texto.slice(0, Math.max(0, maxCaracteres - 1)).trimEnd() + '…';
  }

  return {
    solidos: entrada.modelador.solidos.length,
    totalElementos: entrada.elementos.length,
    elementosPorTipo,
    unidades,
    moveisPorFamilia: moveis,
    materiais,
    texto,
  };
}
