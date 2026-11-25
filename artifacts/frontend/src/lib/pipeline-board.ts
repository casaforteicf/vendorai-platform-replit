/**
 * Separa os cards de uma etapa do board.
 *
 * A presença de `leadId` não pode esconder o card: o board carrega o contexto
 * de leads sob demanda (ao abrir um card), e a coluna precisa mostrar o que já
 * existe no banco assim que os cards são carregados.
 */
export function cardsForStage<T extends { etapa: string }>(cards: T[], stageKey: string): T[] {
  return cards.filter((card) => card.etapa === stageKey);
}
