/**
 * Seleção múltipla — puro.
 *
 * Separado do store para poder testar: alternar (Ctrl/Shift) é uma operação de conjunto,
 * não um detalhe de React.
 */

/** Adiciona ou remove `id`. O último incluído vira o principal. */
export function alternarSelecao(selecionados: readonly string[], id: string): string[] {
  return selecionados.includes(id)
    ? selecionados.filter((item) => item !== id)
    : [...selecionados, id];
}

/** Principal = último da lista (é o que o gizmo e o inspetor usam). */
export function principalDaSelecao(selecionados: readonly string[]): string | null {
  return selecionados.length === 0 ? null : selecionados[selecionados.length - 1];
}

/** Clique sem modificador: substitui a seleção. */
export function selecaoSimples(id: string | null): string[] {
  return id === null ? [] : [id];
}
