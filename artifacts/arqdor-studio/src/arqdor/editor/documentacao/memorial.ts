/**
 * Memorial descritivo — texto gerado a partir do modelo e dos quantitativos.
 * Puro e determinístico: `geradoEm` entra por parâmetro (nada de relógio aqui).
 *
 * Regra dura: sem placeholder. Se faltar dado, sai `aviso` — nunca "TODO".
 */

import type { ElementoBim } from '../bim/schema';
import type { GrupoQuantitativo, ResumoQuantitativo } from '../orcamento/quantitativos';

export type TipoMemorial = 'simplificado' | 'completo' | 'para_prefeitura';

export interface DadosProjeto {
  nome: string;
  cliente?: string;
  endereco?: string;
  tipo?: TipoMemorial;
}

export interface EntradaMemorial {
  projeto: DadosProjeto;
  elementos: readonly ElementoBim[];
  quantitativos?: ResumoQuantitativo;
  /** ISO 8601 — injetado para o teste ser determinístico. */
  geradoEm: string;
}

export interface TabelaMemorial {
  cabecalho: string[];
  linhas: string[][];
}

export interface SecaoMemorial {
  id: string;
  titulo: string;
  paragrafos: string[];
  tabela?: TabelaMemorial;
}

export interface Memorial {
  titulo: string;
  geradoEm: string;
  secoes: SecaoMemorial[];
  avisos: string[];
}

export const SECOES_OBRIGATORIAS = [
  'identificacao',
  'objetivo',
  'caracterizacao',
  'quantitativos',
  'limitacoes',
  'responsabilidade',
] as const;

const PLACEHOLDERS = ['TODO', 'TBD', 'XXX', '{{', '}}', '[inserir', 'lorem ipsum'];

export function formatarQuantidade(valor: number): string {
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado.toFixed(2).replace('.', ',');
}

function tabelaQuantitativos(grupos: readonly GrupoQuantitativo[]): TabelaMemorial {
  return {
    cabecalho: ['Categoria', 'Material', 'Unidade', 'Bruto', 'Perda', 'Com perda'],
    linhas: grupos.map((g) => [
      g.categoria,
      g.materialId !== null ? g.materialId : 'não especificado',
      g.unidade,
      formatarQuantidade(g.quantidadeBruta),
      formatarQuantidade(g.quantidadeComPerda - g.quantidadeBruta),
      formatarQuantidade(g.quantidadeComPerda),
    ]),
  };
}

export function gerarMemorial(entrada: EntradaMemorial): Memorial {
  const { projeto, elementos, quantitativos, geradoEm } = entrada;
  const avisos: string[] = [];
  const tipo = projeto.tipo ?? 'simplificado';

  if (projeto.nome.trim().length === 0) avisos.push('Projeto sem nome — identificação incompleta.');
  if (elementos.length === 0) avisos.push('Modelo sem elementos — memorial gerado apenas com identificação.');

  const niveis = [...new Set(elementos.map((e) => e.nivel))].sort((a, b) => a - b);
  const porTipo = new Map<string, number>();
  for (const el of elementos) porTipo.set(el.tipo, (porTipo.get(el.tipo) ?? 0) + 1);

  const identificacao: SecaoMemorial = {
    id: 'identificacao',
    titulo: '1. Identificação',
    paragrafos: [
      'Projeto: ' + (projeto.nome.trim().length > 0 ? projeto.nome : 'não informado') + '.',
      'Cliente: ' + (projeto.cliente ?? 'não informado') + '.',
      'Endereço da obra: ' + (projeto.endereco ?? 'não informado') + '.',
      'Documento gerado em ' + geradoEm + ' (tipo: ' + tipo + ').',
    ],
  };

  const objetivo: SecaoMemorial = {
    id: 'objetivo',
    titulo: '2. Objetivo',
    paragrafos: [
      'Este memorial descreve as soluções adotadas no projeto e os quantitativos que as sustentam.',
      'As quantidades foram calculadas a partir da geometria do modelo, descontando vãos de portas, janelas e furos de instalações.',
    ],
  };

  const caracterizacao: SecaoMemorial = {
    id: 'caracterizacao',
    titulo: '3. Caracterização do modelo',
    paragrafos:
      elementos.length === 0
        ? ['Não há elementos no modelo; este documento registra apenas a identificação do projeto.']
        : [
            'O modelo contém ' + String(elementos.length) + ' elemento(s) distribuído(s) em ' + String(niveis.length) + ' nível(is).',
            'Níveis considerados: ' + (niveis.length > 0 ? niveis.map((n) => 'N' + String(n)).join(', ') : 'nenhum') + '.',
            'Composição: ' + (porTipo.size > 0 ? [...porTipo.entries()].map(([t, q]) => t + ' (' + String(q) + ')').join(', ') : 'sem elementos') + '.',
          ],
  };

  const quantitativosSecao: SecaoMemorial = {
    id: 'quantitativos',
    titulo: '4. Quantitativos',
    paragrafos:
      quantitativos === undefined || quantitativos.grupos.length === 0
        ? ['Não há quantitativos calculados para este modelo.']
        : [
            'Os quantitativos abaixo já incluem o coeficiente de perda por material e categoria.',
            'A unidade faz parte da chave de agrupamento: quantidades em m², m³ e unidade nunca se somam.',
          ],
    tabela: quantitativos !== undefined && quantitativos.grupos.length > 0 ? tabelaQuantitativos(quantitativos.grupos) : undefined,
  };

  const limitacoes: SecaoMemorial = {
    id: 'limitacoes',
    titulo: '5. Limitações',
    paragrafos: [
      'Os quantitativos derivam da geometria digital e não substituem medição em obra.',
      'A compatibilização de instalações usa caixas envolventes (AABB) e pode gerar falso positivo; a análise fina é feita em revisão técnica.',
    ],
  };

  if (tipo === 'para_prefeitura') {
    limitacoes.paragrafos.push(
      'Este documento foi preparado para instrução municipal e deve ser conferido por profissional habilitado antes da protocolização.',
    );
  }

  const responsabilidade: SecaoMemorial = {
    id: 'responsabilidade',
    titulo: '6. Responsabilidade técnica',
    paragrafos: [
      'O conteúdo é de responsabilidade do profissional habilitado responsável pelo projeto.',
      'Este documento é gerado automaticamente e não substitui a assinatura, o registro de ART/RRT nem a aprovação do cliente.',
    ],
  };

  return {
    titulo: 'Memorial descritivo — ' + (projeto.nome.trim().length > 0 ? projeto.nome : 'projeto sem nome'),
    geradoEm,
    secoes: [identificacao, objetivo, caracterizacao, quantitativosSecao, limitacoes, responsabilidade],
    avisos,
  };
}

export function memorialMarkdown(memorial: Memorial): string {
  const partes: string[] = ['# ' + memorial.titulo, ''];
  for (const secao of memorial.secoes) {
    partes.push('## ' + secao.titulo, '');
    for (const paragrafo of secao.paragrafos) partes.push(paragrafo, '');
    if (secao.tabela !== undefined) {
      partes.push('| ' + secao.tabela.cabecalho.join(' | ') + ' |');
      partes.push('| ' + secao.tabela.cabecalho.map(() => '---').join(' | ') + ' |');
      for (const linha of secao.tabela.linhas) partes.push('| ' + linha.join(' | ') + ' |');
      partes.push('');
    }
  }
  if (memorial.avisos.length > 0) {
    partes.push('## Avisos', '');
    for (const aviso of memorial.avisos) partes.push('- ' + aviso);
    partes.push('');
  }
  return partes.join('\n');
}

export interface ValidacaoMemorial {
  ok: boolean;
  problemas: string[];
}

export function validarMemorial(memorial: Memorial): ValidacaoMemorial {
  const problemas: string[] = [];

  for (const id of SECOES_OBRIGATORIAS) {
    if (!memorial.secoes.some((s) => s.id === id)) problemas.push('seção obrigatória ausente: ' + id);
  }

  for (const secao of memorial.secoes) {
    if (secao.paragrafos.length === 0) problemas.push('seção vazia: ' + secao.id);
    for (const paragrafo of secao.paragrafos) {
      const minusculo = paragrafo.toLowerCase();
      for (const marcador of PLACEHOLDERS) {
        if (minusculo.includes(marcador.toLowerCase())) {
          problemas.push('placeholder "' + marcador + '" na seção ' + secao.id);
        }
      }
    }
  }

  return { ok: problemas.length === 0, problemas };
}