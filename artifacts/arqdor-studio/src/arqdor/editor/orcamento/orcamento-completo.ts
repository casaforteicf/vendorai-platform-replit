/**
 * Orçamento completo — material + serviço, sem dupla contagem.
 *
 * Regra: elemento com `servicoId` **sai** do quantitativo de material (senão seria cobrado
 * duas vezes) e entra no custo de serviço com a sua metragem real.
 * Elemento sem `servicoId` continua exatamente como antes — é a garantia de não mudar
 * orçamento de quem não usa composição.
 */

import type { ElementoBim } from '../bim/schema';
import type { Catalogo } from '../materiais/catalogo';
import type { Composicao } from '../materiais/composicoes';
import { custoDoQuantitativo } from '../materiais/custos';
import type { Custos } from '../materiais/custos';
import { custoDeServicos, obterQuantidadesPorElemento } from './servicos';
import type { CustosServico } from './servicos';
import { quantitativos } from './quantitativos';

export interface OrcamentoCompleto {
  /** Custo dos elementos SEM serviço (material + perda, como sempre foi). */
  materiais: Custos;
  /** Custo dos elementos COM serviço (insumos da composição). */
  servicos: CustosServico;
  total: number;
  /** Ids que saíram do quantitativo de material (têm composição). */
  excluidosDoMaterial: string[];
}

export function orcamentoCompleto(
  elementos: readonly ElementoBim[],
  catalogo: Catalogo,
  composicoes: readonly Composicao[],
): OrcamentoCompleto {
  const semServico: ElementoBim[] = [];
  const excluidosDoMaterial: string[] = [];

  for (const elemento of elementos) {
    if (elemento.servicoId !== undefined && elemento.servicoId.length > 0) {
      excluidosDoMaterial.push(elemento.id);
    } else {
      semServico.push(elemento);
    }
  }

  const resumoSemServico = quantitativos(semServico);
  const materiais = custoDoQuantitativo(resumoSemServico.grupos, catalogo);
  const quantidades = obterQuantidadesPorElemento(elementos, composicoes);
  const servicos = custoDeServicos(elementos, catalogo, composicoes, quantidades);

  return {
    materiais,
    servicos,
    total: Math.round((materiais.total + servicos.total) * 100) / 100,
    excluidosDoMaterial,
  };
}
