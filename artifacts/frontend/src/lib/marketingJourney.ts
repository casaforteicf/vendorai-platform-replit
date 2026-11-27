export type JourneyCounts = {
  ready: number;
  pending: number;
  review: number;
  approved: number;
  published: number;
};

export type JourneyPhase = 0 | 1 | 2 | 3;

export type JourneyStep = {
  label: string;
  help: string;
  state: "done" | "active" | "pending";
};

/**
 * Fase atual do funil a partir dos contadores da fila.
 * 0 = produzir · 1 = revisar · 2 = publicar · 3 = resultados
 */
export function deriveJourneyPhase(counts: JourneyCounts): JourneyPhase {
  const toProduce = Math.max(0, counts.ready) + Math.max(0, counts.pending);
  if (toProduce > 0) return 0;
  if (counts.review > 0) return 1;
  if (counts.approved > 0) return 2;
  if (counts.published > 0) return 3;
  return 0;
}

export function buildJourneySteps(phase: JourneyPhase): JourneyStep[] {
  return [
    { label: "Planejamento", help: "Briefing e estratégia", state: "done" },
    { label: "Produção", help: "IA produz os conteúdos", state: phase > 0 ? "done" : "active" },
    { label: "Revisão", help: "Você revisa e aprova", state: phase === 1 ? "active" : phase > 1 ? "done" : "pending" },
    { label: "Publicação", help: "Publicação nos canais", state: phase === 2 ? "active" : phase > 2 ? "done" : "pending" },
    { label: "Resultados", help: "Acompanhe os resultados", state: phase === 3 ? "active" : "pending" },
  ];
}
