/**
 * IA — registro de ferramentas (M4).
 *
 * Regra D9 do contrato: a IA **não executa nada**. Cada ferramenta devolve OPERAÇÕES de domínio
 * (ou um efeito de leitura); quem aplica é o `executor`, num único passo. Nenhuma ferramenta
 * escreve no store — isso é o que torna o rollback possível e o "desfazer em bloco" verdadeiro.
 */

import type { ElementoBim, OperacaoBIM } from '../bim/schema';
import type { OperacoesPorEscopo } from '../transacao';
import type { OperacaoModelador } from '../modelador/schema';
import type { EstadoModelador } from '../modelador/store-core';
import { novoSolidoId } from '../modelador/store-core';
import { criarCaixa } from '../modelador/caixa';
import { colocarFamilia } from '../biblioteca/colocar';
import type { FamiliaMovel } from '../biblioteca/familias';
import type { Catalogo } from '../materiais/catalogo';
import { atualizarPrecoUnitario, existeMaterial } from '../materiais/catalogo';
import { exportarParaCotacao, itensDeCotacao } from '../materiais/cotacao';
import { quantitativos } from '../orcamento/quantitativos';
import { criarPedidoRender } from '../render/pedido';
import type { CameraRender, PedidoRender, QualidadeRender } from '../render/pedido';
import type { IAErro } from './schema';

export interface EstadoIa {
  modelador: EstadoModelador;
  elementos: readonly ElementoBim[];
  catalogo: Catalogo;
  familias: readonly FamiliaMovel[];
  projetoId: string;
  camadaAtivaId: string;
}

export type Efeito =
  | { tipo: 'cotacao'; csv: string; json: string }
  | { tipo: 'render'; pedido: PedidoRender }
  | { tipo: 'catalogo'; catalogo: Catalogo };

export type ResultadoFerramenta =
  | { ok: true; escopos: OperacoesPorEscopo; efeito?: Efeito; resumo: string }
  | { ok: false; erro: IAErro };

export interface Ferramenta {
  nome: string;
  descricao: string;
  /** true quando as operações entram no histórico e podem ser desfeitas. */
  reversivel: boolean;
  /** Ação não reversível exige confirmação humana explícita. */
  requerConfirmacao?: boolean;
  executar(argumentos: Record<string, unknown>, estado: EstadoIa): ResultadoFerramenta;
}

function falha(tool: string, detalhe: string): ResultadoFerramenta {
  return { ok: false, erro: { codigo: 'TOOL_CALL_INVALIDA', tool, detalhe } };
}

function texto(argumentos: Record<string, unknown>, chave: string): string | null {
  const valor = argumentos[chave];
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null;
}

function numeroPositivo(argumentos: Record<string, unknown>, chave: string): number | null {
  const valor = argumentos[chave];
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null;
}

function vetor(argumentos: Record<string, unknown>, chave: string, tamanho: number): number[] | null {
  const valor = argumentos[chave];
  if (!Array.isArray(valor) || valor.length !== tamanho) return null;
  if (!valor.every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  return valor as number[];
}

const VAZIO: OperacoesPorEscopo = {};

/** Cria uma caixa com medidas exatas (canto mínimo). */
const criarCaixaFerramenta: Ferramenta = {
  nome: 'criar_caixa',
  descricao: 'Cria um sólido em forma de caixa: posição [x,y,z] (canto mínimo) e largura/altura/profundidade em metros.',
  reversivel: true,
  executar(argumentos, estado) {
    const largura = numeroPositivo(argumentos, 'largura');
    const altura = numeroPositivo(argumentos, 'altura');
    const profundidade = numeroPositivo(argumentos, 'profundidade');
    if (largura === null || altura === null || profundidade === null) {
      return falha('criar_caixa', 'largura, altura e profundidade devem ser números maiores que zero');
    }
    const posicao = vetor(argumentos, 'posicao', 3) ?? [0, 0, 0];
    const { id } = novoSolidoId(estado.modelador);
    const caixa = criarCaixa({
      id,
      nome: texto(argumentos, 'nome') ?? 'Caixa (IA)',
      posicao: [posicao[0], posicao[1], posicao[2]],
      dimensoes: { largura, altura, profundidade },
    });
    if (!caixa.ok) return falha('criar_caixa', 'dimensão inválida: ' + caixa.erro.campo);
    const operacoes: OperacaoModelador[] = [{ tipo: 'criar_solido', solido: caixa.solido }];
    return {
      ok: true,
      escopos: { modelador: operacoes },
      resumo: 'Caixa ' + String(largura) + ' × ' + String(profundidade) + ' × ' + String(altura) + ' m criada',
    };
  },
};

/** Aplica material a um elemento BIM existente. */
const aplicarMaterialFerramenta: Ferramenta = {
  nome: 'aplicar_material',
  descricao: 'Define o material de um elemento BIM: elementoId e materialId do catálogo.',
  reversivel: true,
  executar(argumentos, estado) {
    const elementoId = texto(argumentos, 'elementoId');
    const materialId = texto(argumentos, 'materialId');
    if (elementoId === null || materialId === null) return falha('aplicar_material', 'informe elementoId e materialId');
    const elemento = estado.elementos.find((item) => item.id === elementoId);
    if (elemento === undefined) return falha('aplicar_material', 'elemento não encontrado: ' + elementoId);
    if (!existeMaterial(estado.catalogo, materialId)) {
      return falha('aplicar_material', 'material fora do catálogo: ' + materialId);
    }
    const depois: ElementoBim = { ...elemento, materialId };
    const operacoes: OperacaoBIM[] = [{ tipo: 'atualizar_elemento_bim', antes: elemento, depois }];
    return {
      ok: true,
      escopos: { bim: operacoes },
      resumo: 'Material ' + materialId + ' aplicado em ' + elementoId,
    };
  },
};

/** Coloca uma família da biblioteca: sólido (modelador) + elemento BIM (mobiliário). */
const colocarMovelFerramenta: Ferramenta = {
  nome: 'colocar_movel',
  descricao: 'Coloca um móvel da biblioteca: familiaId e posição em planta [x, z].',
  reversivel: true,
  executar(argumentos, estado) {
    const familiaId = texto(argumentos, 'familiaId');
    if (familiaId === null) return falha('colocar_movel', 'informe familiaId');
    const familia = estado.familias.find((item) => item.id === familiaId);
    if (familia === undefined) return falha('colocar_movel', 'família não encontrada: ' + familiaId);
    const posicao = vetor(argumentos, 'posicao', 2);
    if (posicao === null) return falha('colocar_movel', 'posicao deve ser [x, z]');
    const rotacao = argumentos['rotacaoGraus'];
    const { id } = novoSolidoId(estado.modelador);
    const colocacao = colocarFamilia({
      familia,
      posicao: [posicao[0], posicao[1]],
      rotacaoGraus: typeof rotacao === 'number' ? rotacao : 0,
      projetoId: estado.projetoId,
      camadaId: estado.camadaAtivaId,
      idSolido: id,
    });
    if (!colocacao.ok) return falha('colocar_movel', 'não foi possível colocar: ' + colocacao.erro);
    return {
      ok: true,
      escopos: {
        modelador: [{ tipo: 'criar_solido', solido: colocacao.solido }],
        bim: [{ tipo: 'criar_elemento_bim', elemento: colocacao.elemento }],
      },
      resumo: familia.nome + ' colocado em (' + String(posicao[0]) + ', ' + String(posicao[1]) + ')',
    };
  },
};

/** Leitura: gera a lista de cotação a partir do quantitativo atual. */
const exportarCotacaoFerramenta: Ferramenta = {
  nome: 'exportar_cotacao',
  descricao: 'Gera CSV/JSON de cotação com base no quantitativo do modelo. Não altera o documento.',
  reversivel: false,
  executar(_argumentos, estado) {
    const resumo = quantitativos(estado.elementos);
    const itens = itensDeCotacao(resumo.grupos, estado.catalogo);
    const exportado = exportarParaCotacao(itens);
    return {
      ok: true,
      escopos: VAZIO,
      efeito: { tipo: 'cotacao', csv: exportado.csv, json: exportado.json },
      resumo: itens.length + ' item(ns) de cotação gerados',
    };
  },
};

/** Leitura: monta o pedido de render (fingerprint do documento incluído). */
const pedirRenderFerramenta: Ferramenta = {
  nome: 'pedir_render',
  descricao: 'Monta um pedido de render (preview/final) com câmera e resolução. Não renderiza sozinho.',
  reversivel: false,
  executar(argumentos, estado) {
    const qualidade = argumentos['qualidade'];
    if (qualidade !== 'preview' && qualidade !== 'final') {
      return falha('pedir_render', 'qualidade deve ser "preview" ou "final"');
    }
    const resolucao = argumentos['resolucao'];
    if (typeof resolucao !== 'object' || resolucao === null) {
      return falha('pedir_render', 'resolucao deve ser { largura, altura }');
    }
    const par = resolucao as { largura?: unknown; altura?: unknown };
    const camera = argumentos['camera'];
    const cameraFinal: CameraRender =
      typeof camera === 'object' && camera !== null
        ? (camera as CameraRender)
        : { posicao: [8, 6, 10], alvo: [0, 1, 0], fov: 45 };

    const pedido = criarPedidoRender({
      projetoId: estado.projetoId,
      documento: { modelador: estado.modelador, elementos: estado.elementos },
      camera: cameraFinal,
      qualidade: qualidade as QualidadeRender,
      resolucao: { largura: Number(par.largura), altura: Number(par.altura) },
    });
    if (!pedido.ok) return { ok: false, erro: { codigo: 'TOOL_CALL_INVALIDA', tool: 'pedir_render', detalhe: pedido.erro.codigo } };
    return {
      ok: true,
      escopos: VAZIO,
      efeito: { tipo: 'render', pedido: pedido.pedido },
      resumo: 'Pedido de render ' + qualidade + ' montado (' + pedido.pedido.documentoHash + ')',
    };
  },
};

/**
 * Altera preço do catálogo. Não é documento: NÃO entra no histórico — por isso exige confirmação.
 */
const definirPrecoFerramenta: Ferramenta = {
  nome: 'definir_preco_material',
  descricao: 'Atualiza o preço unitário de um material do catálogo. Não é desfazível por Ctrl+Z.',
  reversivel: false,
  requerConfirmacao: true,
  executar(argumentos, estado) {
    const materialId = texto(argumentos, 'materialId');
    const preco = argumentos['precoUnitario'];
    if (materialId === null) return falha('definir_preco_material', 'informe materialId');
    if (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0) {
      return falha('definir_preco_material', 'precoUnitario deve ser número >= 0');
    }
    const resultado = atualizarPrecoUnitario(estado.catalogo, materialId, preco, 'PROPRIO');
    if (!resultado.ok) return falha('definir_preco_material', 'não foi possível atualizar: ' + resultado.erro);
    return {
      ok: true,
      escopos: VAZIO,
      efeito: { tipo: 'catalogo', catalogo: resultado.catalogo },
      resumo: 'Preço de ' + materialId + ' atualizado para ' + String(preco),
    };
  },
};

export const FERRAMENTAS: readonly Ferramenta[] = [
  criarCaixaFerramenta,
  aplicarMaterialFerramenta,
  colocarMovelFerramenta,
  exportarCotacaoFerramenta,
  pedirRenderFerramenta,
  definirPrecoFerramenta,
];

export function obterFerramenta(nome: string): Ferramenta | null {
  return FERRAMENTAS.find((ferramenta) => ferramenta.nome === nome) ?? null;
}

export function listarFerramentas(): Array<{ nome: string; descricao: string; reversivel: boolean }> {
  return FERRAMENTAS.map((ferramenta) => ({
    nome: ferramenta.nome,
    descricao: ferramenta.descricao,
    reversivel: ferramenta.reversivel,
  }));
}
