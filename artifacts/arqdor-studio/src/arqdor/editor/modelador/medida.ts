/**
 * Barra de medidas (padrão SketchUp) — interpretação do que o usuário digita.
 *
 * O campo aceita o que o arquiteto digita de verdade:
 *   2,8      → 2.8 (vírgula decimal)
 *   2.8m     → 2.8
 *   -1,5     → -1.5 (push/pull para dentro)
 *   3x4      → dimensões 3 × 4 (retângulo)
 *   3 x 4    → idem
 *   3;4      → idem
 *   4;2,8;2  → caixa 4 (X) × 2,8 (Z) × 2 (Y) — largura; profundidade; altura
 *
 * Puro e sem DOM: a UI só mostra o erro.
 */

export type MedidaLida =
  | { tipo: 'escalar'; valor: number }
  | { tipo: 'dimensoes'; largura: number; profundidade: number }
  | { tipo: 'dimensoes3'; largura: number; profundidade: number; altura: number }
  | { tipo: 'vazio' }
  | { tipo: 'invalido'; texto: string };

function numero(bruto: string): number | null {
  const limpo = bruto.trim().toLowerCase().replace(/m$/, '').replace(/\s+/g, '').replace(',', '.');
  if (limpo.length === 0) return null;
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

export function interpretarMedida(texto: string): MedidaLida {
  const bruto = texto.trim();
  if (bruto.length === 0) return { tipo: 'vazio' };

  // dimensões: 3x4, 3 x 4, 3;4, 3,5x4 (vírgula decimal + separador por x)
  const porX = bruto.split(/\s*[x×]\s*/i);
  if (porX.length === 2) {
    const largura = numero(porX[0]);
    const profundidade = numero(porX[1]);
    if (largura === null || profundidade === null) return { tipo: 'invalido', texto: bruto };
    return { tipo: 'dimensoes', largura, profundidade };
  }

  const porPontoEVirgula = bruto.split(/\s*;\s*/);
  if (porPontoEVirgula.length === 3) {
    const largura = numero(porPontoEVirgula[0]);
    const profundidade = numero(porPontoEVirgula[1]);
    const altura = numero(porPontoEVirgula[2]);
    if (largura === null || profundidade === null || altura === null) {
      return { tipo: 'invalido', texto: bruto };
    }
    return { tipo: 'dimensoes3', largura, profundidade, altura };
  }
  if (porPontoEVirgula.length === 2) {
    const largura = numero(porPontoEVirgula[0]);
    const profundidade = numero(porPontoEVirgula[1]);
    if (largura === null || profundidade === null) return { tipo: 'invalido', texto: bruto };
    return { tipo: 'dimensoes', largura, profundidade };
  }

  const escalar = numero(bruto);
  if (escalar === null) return { tipo: 'invalido', texto: bruto };
  return { tipo: 'escalar', valor: escalar };
}

/** Texto amigável para o readout flutuante (ex.: "2,80 m"). */
export function formatarMedida(valor: number): string {
  return valor.toFixed(2).replace('.', ',') + ' m';
}
