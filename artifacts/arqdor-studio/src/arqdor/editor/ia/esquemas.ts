/**
 * IA — esquemas das ferramentas para tool calling.
 *
 * O modelo só chama bem o que entende: descrição em português + JSON Schema dos parâmetros.
 * Ficam separados das implementações para não poluir `ferramentas.ts` com JSON.
 */

import { FERRAMENTAS } from './ferramentas';

const SEM_PARAMETROS = { type: 'object', properties: {}, additionalProperties: false } as const;

export const ESQUEMAS: Record<string, Record<string, unknown>> = {
  criar_caixa: {
    type: 'object',
    properties: {
      nome: { type: 'string', description: 'Nome do sólido' },
      posicao: {
        type: 'array',
        items: { type: 'number' },
        minItems: 3,
        maxItems: 3,
        description: 'Canto mínimo [x, y, z] em metros (default [0,0,0])',
      },
      largura: { type: 'number', description: 'Largura em X (m), > 0' },
      altura: { type: 'number', description: 'Altura em Y (m), > 0' },
      profundidade: { type: 'number', description: 'Profundidade em Z (m), > 0' },
    },
    required: ['largura', 'altura', 'profundidade'],
    additionalProperties: false,
  },
  aplicar_material: {
    type: 'object',
    properties: {
      elementoId: { type: 'string', description: 'Id do elemento BIM (ex.: el_...)' },
      materialId: { type: 'string', description: 'Id do material no catálogo' },
    },
    required: ['elementoId', 'materialId'],
    additionalProperties: false,
  },
  colocar_movel: {
    type: 'object',
    properties: {
      familiaId: { type: 'string', description: 'Id da família da biblioteca (ex.: FAM-CADEIRA)' },
      posicao: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: 'Posição em planta [x, z] em metros',
      },
      rotacaoGraus: { type: 'number', description: 'Rotação em planta (graus, anti-horário)' },
    },
    required: ['familiaId', 'posicao'],
    additionalProperties: false,
  },
  exportar_cotacao: SEM_PARAMETROS,
  pedir_render: {
    type: 'object',
    properties: {
      qualidade: { type: 'string', enum: ['preview', 'final'] },
      resolucao: {
        type: 'object',
        properties: {
          largura: { type: 'integer', minimum: 1 },
          altura: { type: 'integer', minimum: 1 },
        },
        required: ['largura', 'altura'],
        additionalProperties: false,
      },
      camera: {
        type: 'object',
        description: 'Câmera opcional; default é uma vista isométrica',
        properties: {
          posicao: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
          alvo: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
          fov: { type: 'number', minimum: 10, maximum: 120 },
        },
        required: ['posicao', 'alvo', 'fov'],
        additionalProperties: false,
      },
    },
    required: ['qualidade', 'resolucao'],
    additionalProperties: false,
  },
  definir_preco_material: {
    type: 'object',
    properties: {
      materialId: { type: 'string' },
      precoUnitario: { type: 'number', minimum: 0 },
    },
    required: ['materialId', 'precoUnitario'],
    additionalProperties: false,
  },
};

export interface DefinicaoToolModelo {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Lista no formato aceito por DeepSeek/OpenRouter (OpenAI-compatible). */
export function definicoesFerramentas(): DefinicaoToolModelo[] {
  return FERRAMENTAS.map((ferramenta) => ({
    type: 'function' as const,
    function: {
      name: ferramenta.nome,
      description: ferramenta.descricao,
      parameters: ESQUEMAS[ferramenta.nome] ?? SEM_PARAMETROS,
    },
  }));
}
