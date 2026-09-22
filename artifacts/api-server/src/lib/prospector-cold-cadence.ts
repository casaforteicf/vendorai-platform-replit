export type ProspectorCadenceStepKey = "followup_48h" | "followup_120h" | "followup_216h";

export type ProspectorCadenceStep = {
  key: ProspectorCadenceStepKey;
  label: string;
  instruction: string;
};

export type ScheduledProspectorCadenceStep = ProspectorCadenceStep & { dueHours: number };

export const PROSPECTOR_COLD_CADENCE: ScheduledProspectorCadenceStep[] = [
  {
    key: "followup_48h",
    label: "48h",
    dueHours: 48,
    instruction:
      "Retome pelo contexto/sinal original sem repetir a primeira mensagem. " +
      "Faça uma pergunta curta e fácil de responder.",
  },
  {
    key: "followup_120h",
    label: "5 dias",
    dueHours: 120,
    instruction:
      "Use um ângulo novo baseado nas evidências já verificadas. " +
      "Não use 'só passando para lembrar' e não repita a pergunta anterior.",
  },
  {
    key: "followup_216h",
    label: "9 dias",
    dueHours: 216,
    instruction:
      "Faça a última tentativa ativa de forma elegante e permission-based. " +
      "Deixe claro que pode encerrar o contato se não for prioridade agora.",
  },
];

export function nextProspectorCadenceStep(
  hoursSinceFirst: number,
  sentKeys: Iterable<ProspectorCadenceStepKey>,
): ScheduledProspectorCadenceStep | null {
  const sent = new Set(sentKeys);
  const sentIndexes = PROSPECTOR_COLD_CADENCE
    .map((step, index) => sent.has(step.key) ? index : -1)
    .filter((index) => index >= 0);
  const lastSentIndex = sentIndexes.length > 0 ? Math.max(...sentIndexes) : -1;

  // Nunca envia uma rajada de etapas vencidas após downtime. Se várias etapas
  // já estão devidas, escolhe somente a mais recente após a última enviada.
  const due = PROSPECTOR_COLD_CADENCE.filter(
    (step, index) => index > lastSentIndex && !sent.has(step.key) && hoursSinceFirst >= step.dueHours,
  );
  return due.length > 0 ? due[due.length - 1]! : null;
}
