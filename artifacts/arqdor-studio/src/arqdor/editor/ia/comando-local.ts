/**
 * Interpretador local de comandos (modo sem IA).
 *
 * Serve para testar o MOTOR (executor + ponte + aplicação no store) sem chave de API.
 * Não substitui o modelo: entende só padrões explícitos de medida e é chamado apenas quando a
 * rota responde `IA_NAO_CONFIGURADA` — e a UI avisa que foi local.
 */

import type { ToolCallIA } from './schema';

const NUM = '[0-9]+(?:[.,][0-9]+)?';

function numero(bruto: string): number {
  return Number(bruto.replace(',', '.'));
}

export interface InterpretacaoLocal {
  toolCalls: ToolCallIA[];
  resumo: string;
}

/**
 * "crie uma parede de 4x2,8"        → 4 × 2,8 × 0,15 (parede: 15 cm)
 * "parede de 4;2,8;0,2"            → 4 × 2,8 × 0,2
 * "caixa de 2x2x2"                 → 2 × 2 × 2
 * "laje de 5x4"                    → 5 × 0,15 (espessura) × 4
 */
export function interpretarComandoLocal(pergunta: string): InterpretacaoLocal | null {
  const texto = pergunta.toLowerCase().replace(/\s+/g, ' ').trim();
  const ehParede = /parede/.test(texto);
  const ehLaje = /laje/.test(texto);
  const ehCaixa = /caixa|volume|bloco/.test(texto);
  if (!ehParede && !ehLaje && !ehCaixa) return null;

  const trio = texto.match(new RegExp('(' + NUM + ')\\s*[x×;]\\s*(' + NUM + ')\\s*[x×;]\\s*(' + NUM + ')'));
  const par = trio === null ? texto.match(new RegExp('(' + NUM + ')\\s*[x×]\\s*(' + NUM + ')')) : null;

  let largura: number;
  let altura: number;
  let profundidade: number;

  if (trio !== null) {
    largura = numero(trio[1]);
    const segundo = numero(trio[2]);
    const terceiro = numero(trio[3]);
    if (ehParede || ehLaje) {
      // parede/laje informa comprimento × altura × espessura
      altura = segundo;
      profundidade = terceiro;
    } else {
      altura = segundo;
      profundidade = terceiro;
    }
  } else if (par !== null) {
    largura = numero(par[1]);
    const segundo = numero(par[2]);
    if (ehLaje) {
      altura = 0.15;
      profundidade = segundo;
    } else if (ehCaixa) {
      altura = segundo;
      profundidade = segundo;
    } else {
      // parede: comprimento × altura, 15 cm de espessura
      altura = segundo;
      profundidade = 0.15;
    }
  } else {
    return null;
  }

  if (!Number.isFinite(largura) || !Number.isFinite(altura) || !Number.isFinite(profundidade)) return null;
  if (largura <= 0 || altura <= 0 || profundidade <= 0) return null;

  const nome = ehParede ? 'Parede' : ehLaje ? 'Laje' : 'Caixa';
  return {
    toolCalls: [
      {
        nome: 'criar_caixa',
        argumentos: {
          nome: nome + ' (local)',
          posicao: [0, 0, 0],
          largura,
          altura,
          profundidade,
        },
      },
    ],
    resumo: nome + ' ' + String(largura) + ' × ' + String(altura) + ' × ' + String(profundidade) + ' m',
  };
}
