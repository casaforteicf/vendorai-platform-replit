export type JarvisMissionNaturalIntent =
  | { type: "create_mission"; objective: string }
  | { type: "list_missions" }
  | { type: "pause_mission"; reference: string }
  | { type: "resume_mission"; reference: string }
  | { type: "complete_mission"; reference: string }
  | { type: "update_mission"; reference: string; note: string }
  | { type: "record_decision"; decision: string }
  | null;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim();
}

export function normalizeJarvisMissionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveJarvisMissionNaturalIntent(text: string): JarvisMissionNaturalIntent {
  const raw = clean(text);
  const normalized = normalizeJarvisMissionText(raw);
  if (!raw) return null;

  const createPatterns = [
    /^(?:jarvis[, ]+)?(?:nossa|minha) miss[aã]o (?:é|e|será|sera|vai ser)\s+(.+)$/i,
    /^(?:jarvis[, ]+)?(?:crie|criar|registre|registrar|defina|definir) (?:uma |a )?miss[aã]o(?:[: ]+)\s*(.+)$/i,
  ];
  for (const pattern of createPatterns) {
    const match = raw.match(pattern);
    const objective = clean(match?.[1] ?? "");
    if (objective.length >= 3) return { type: "create_mission", objective };
  }

  if (/^(?:jarvis[, ]+)?(?:quais|liste|listar|mostre|mostrar|como est[aã]o) (?:s[aã]o )?(?:as |minhas |nossas )?miss[oõ]es\b/i.test(raw)
      || /^(?:jarvis[, ]+)?(?:minhas|nossas) miss[oõ]es\??$/i.test(raw)) {
    return { type: "list_missions" };
  }

  const statusPatterns: Array<{ type: Exclude<JarvisMissionNaturalIntent, null>["type"]; regex: RegExp }> = [
    { type: "pause_mission", regex: /^(?:jarvis[, ]+)?(?:pause|pausar) (?:a )?miss[aã]o\s+(.+)$/i },
    { type: "resume_mission", regex: /^(?:jarvis[, ]+)?(?:retome|retomar|continue|continuar|reative|reativar) (?:a )?miss[aã]o\s+(.+)$/i },
    { type: "complete_mission", regex: /^(?:jarvis[, ]+)?(?:conclua|concluir|finalize|finalizar|encerre|encerrar) (?:a )?miss[aã]o\s+(.+)$/i },
  ];
  for (const candidate of statusPatterns) {
    const match = raw.match(candidate.regex);
    const reference = clean(match?.[1] ?? "");
    if (reference.length >= 2) return { type: candidate.type as "pause_mission" | "resume_mission" | "complete_mission", reference };
  }

  const updateMatch = raw.match(/^(?:jarvis[, ]+)?(?:atualize|atualizar|registre progresso (?:na|da)|registrar progresso (?:na|da)) (?:a )?miss[aã]o\s+(.+?)\s*:\s*(.+)$/i);
  if (updateMatch) {
    const reference = clean(updateMatch[1] ?? "");
    const note = clean(updateMatch[2] ?? "");
    if (reference.length >= 2 && note.length >= 2) return { type: "update_mission", reference, note };
  }

  const decisionPatterns = [
    /^(?:jarvis[, ]+)?(?:registre|registrar) (?:a )?decis[aã]o(?:[: ]+)\s*(.+)$/i,
    /^(?:jarvis[, ]+)?(?:nossa|minha) decis[aã]o (?:é|e|foi)\s+(.+)$/i,
  ];
  for (const pattern of decisionPatterns) {
    const match = raw.match(pattern);
    const decision = clean(match?.[1] ?? "");
    if (decision.length >= 3) return { type: "record_decision", decision };
  }

  // Não intercepta conversa comum que apenas menciona missão/decisão.
  if (!normalized.includes("missao") && !normalized.includes("decisao")) return null;
  return null;
}

export function missionTitleFromObjective(objective: string) {
  const compact = clean(objective);
  if (compact.length <= 96) return compact;
  return `${compact.slice(0, 93).trimEnd()}…`;
}
