type JarvisMessage = { role?: string; content?: string };

type CachedUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  tenantId?: string | null;
  platformRole?: string | null;
  userFunction?: string | null;
};

const USER_CACHE_KEY = "vendorai_user_cache";
const MAX_TITLE_CONTEXT = 490;

function safeCachedUser(): CachedUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUser;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function compact(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 1))}…` : normalized;
}

function firstName(name?: string | null) {
  const value = name?.trim();
  return value ? value.split(/\s+/)[0] : "";
}

function localDaypart(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "madrugada";
  if (hour < 12) return "manhã";
  if (hour < 18) return "tarde";
  return "noite";
}

function recentObjective(messages: JarvisMessage[]) {
  const userMessages = messages
    .filter((message) => message.role === "user" && typeof message.content === "string")
    .map((message) => String(message.content).replace(/\[Anexo:[^\]]+\]/g, "").trim())
    .filter(Boolean);

  if (userMessages.length < 2) return "";
  return compact(userMessages[userMessages.length - 2] ?? "", 120);
}

function buildExecutiveTitle(payload: {
  messages?: JarvisMessage[];
  context?: { route?: string; title?: string };
}) {
  const user = safeCachedUser();
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const locale = navigator.language || "pt-BR";
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const objective = recentObjective(messages);
  const displayName = compact(user?.name ?? "", 80);
  const givenName = firstName(user?.name);
  const baseTitle = compact(payload.context?.title || document.title || "VendorAI", 90);
  const userTurns = messages.filter((message) => message.role === "user").length;

  const executiveParts = [
    baseTitle,
    displayName ? `usuário=${displayName}` : null,
    givenName ? `primeiro_nome=${givenName}` : null,
    user?.platformRole ? `papel=${user.platformRole}` : null,
    user?.userFunction ? `função=${compact(user.userFunction, 40)}` : null,
    `momento=${localDaypart(now)}`,
    `hora_local=${now.toLocaleString("pt-BR")}`,
    `fuso=${timezone}`,
    `locale=${locale}`,
    `turnos=${userTurns}`,
    objective ? `assunto_anterior=${objective}` : null,
    "regra=use o primeiro nome apenas quando soar natural; preserve continuidade; para perguntas amplas priorize o estado operacional real, riscos, oportunidades, pontos cegos e próxima ação; não responda como suporte genérico",
  ].filter(Boolean);

  return compact(executiveParts.join(" | "), MAX_TITLE_CONTEXT);
}

function enrichJarvisRequest(init?: RequestInit): RequestInit | undefined {
  if (typeof init?.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body) as {
      messages?: JarvisMessage[];
      context?: { route?: string; title?: string };
    };
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) return init;

    const context = {
      ...(payload.context ?? {}),
      route: payload.context?.route || window.location.pathname,
      title: buildExecutiveTitle(payload),
    };

    return { ...init, body: JSON.stringify({ ...payload, context }) };
  } catch {
    return init;
  }
}

if (typeof window !== "undefined") {
  const previousFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isJarvisChat = method === "POST" && /(?:^|\/)api\/support\/chat(?:\?|$)/.test(url);

    return previousFetch(input, isJarvisChat ? enrichJarvisRequest(init) : init);
  };
}

export {};
