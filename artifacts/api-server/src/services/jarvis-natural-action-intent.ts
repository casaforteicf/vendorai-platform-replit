export type JarvisNaturalAction = "approve" | "reject" | "execute";

export interface JarvisActionCandidate {
  id: string;
  actionType: string;
  status: string;
  createdAt?: string | Date | null;
}

export interface JarvisNaturalActionResolution {
  action: JarvisNaturalAction | null;
  targetId: string | null;
  ambiguous: boolean;
  matchedBy: "single" | "ordinal" | "keyword" | null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detectAction(text: string): JarvisNaturalAction | null {
  const normalized = normalize(text);

  const approve = /^(aprova|aprove|aprovar|pode aprovar|pode aprovar isso|confirmo|confirmar)(\b|[,.!?])/;
  const reject = /^(rejeita|rejeite|rejeitar|recusa|recuse|recusar|reprova|reprove|nao aprova|nao aprove)(\b|[,.!?])/;
  const execute = /^(executa|execute|executar|pode executar|pode rodar|rodar agora)(\b|[,.!?])/;

  if (approve.test(normalized)) return "approve";
  if (reject.test(normalized)) return "reject";
  if (execute.test(normalized)) return "execute";
  return null;
}

function candidateStatusFor(action: JarvisNaturalAction) {
  return action === "execute" ? "aprovado" : "pendente_aprovacao";
}

function ordinalIndex(text: string): number | null {
  const normalized = normalize(text);
  if (/\b(primeir[ao]|1a|1o|numero 1|n 1)\b/.test(normalized)) return 0;
  if (/\b(segund[ao]|2a|2o|numero 2|n 2)\b/.test(normalized)) return 1;
  if (/\b(terceir[ao]|3a|3o|numero 3|n 3)\b/.test(normalized)) return 2;
  if (/\b(quart[ao]|4a|4o|numero 4|n 4)\b/.test(normalized)) return 3;
  return null;
}

function keywordActionType(text: string): string | null {
  const normalized = normalize(text);
  if (/\bdesconto\b/.test(normalized)) return "aprovacao_desconto";
  if (/\b(fechamento|fechar negocio|fechar venda)\b/.test(normalized)) return "aprovacao_fechamento";
  if (/\b(estoque|conferencia)\b/.test(normalized)) return "conferencia_estoque";
  if (/\b(whatsapp|mensagem)\b/.test(normalized)) return "enviar_whatsapp";
  return null;
}

export function resolveJarvisNaturalAction(
  text: string,
  candidates: JarvisActionCandidate[],
): JarvisNaturalActionResolution {
  const action = detectAction(text);
  if (!action) {
    return { action: null, targetId: null, ambiguous: false, matchedBy: null };
  }

  const eligible = candidates.filter((candidate) => candidate.status === candidateStatusFor(action));
  if (eligible.length === 0) {
    return { action, targetId: null, ambiguous: false, matchedBy: null };
  }

  const keyword = keywordActionType(text);
  if (keyword) {
    const keywordMatches = eligible.filter((candidate) => candidate.actionType === keyword);
    if (keywordMatches.length === 1) {
      return { action, targetId: keywordMatches[0]!.id, ambiguous: false, matchedBy: "keyword" };
    }
  }

  const ordinal = ordinalIndex(text);
  if (ordinal !== null && eligible[ordinal]) {
    return { action, targetId: eligible[ordinal]!.id, ambiguous: false, matchedBy: "ordinal" };
  }

  if (eligible.length === 1) {
    return { action, targetId: eligible[0]!.id, ambiguous: false, matchedBy: "single" };
  }

  return { action, targetId: null, ambiguous: true, matchedBy: null };
}
