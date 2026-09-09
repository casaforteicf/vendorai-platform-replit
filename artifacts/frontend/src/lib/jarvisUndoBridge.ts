import { speakJarvis } from "./jarvisVoiceResponseBridge";

type AuthMe = {
  id?: string;
  tenantId?: string;
};

type AgentTask = {
  id: string;
  leadId?: string | null;
  actionType?: string;
  status?: string;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  executedAt?: string | null;
  updatedAt?: string | null;
};

type Deal = {
  id: string;
  valor?: string | number | null;
  updatedAt?: string | null;
};

const HANDS_FREE_SESSION_KEY = "jarvis_web_hands_free_session";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wantsUndoLastDiscount(text: string) {
  const value = normalize(text);
  const undo = /\b(desfazer|desfaz|desfaca|reverter|reverta|restaurar|voltar)\b/.test(value);
  const target = /\bdesconto\b/.test(value);
  const latest = /\b(ultimo|anterior|mais recente)\b/.test(value);
  return undo && target && latest;
}

function getLastUserText(body: string) {
  try {
    const payload = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
    if (!Array.isArray(payload.messages)) return "";
    for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
      const message = payload.messages[index];
      if (message?.role === "user") return String(message.content ?? "").trim();
    }
  } catch {
    return "";
  }
  return "";
}

function sseResponse(content: string) {
  const body = [
    `data: ${JSON.stringify({ content })}`,
    "",
    `data: ${JSON.stringify({ done: true })}`,
    "",
  ].join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

function authHeaders(token: string, json = false) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameMoney(a: number | null, b: number | null) {
  return a !== null && b !== null && Math.abs(a - b) < 0.005;
}

function sortLatest(tasks: AgentTask[]) {
  return [...tasks].sort((a, b) => {
    const ta = new Date(a.executedAt ?? a.updatedAt ?? 0).getTime();
    const tb = new Date(b.executedAt ?? b.updatedAt ?? 0).getTime();
    return tb - ta;
  });
}

function restartHandsFreeMic() {
  try {
    if (sessionStorage.getItem(HANDS_FREE_SESSION_KEY) !== "1") return;
  } catch {
    return;
  }
  window.setTimeout(() => {
    const panel = document.querySelector<HTMLElement>('div[aria-label="JARVIS"]');
    const mic = panel
      ? Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => button.getAttribute("title") === "Falar com JARVIS")
      : null;
    if (!mic || mic.disabled) return;
    try {
      mic.click();
    } catch {
      // Alguns navegadores exigem um novo gesto do usuário.
    }
  }, 420);
}

function announce(content: string) {
  window.dispatchEvent(new CustomEvent("vendorai:jarvis-voice-ready", {
    detail: { content, supported: "speechSynthesis" in window, autoEnabled: true },
  }));
  speakJarvis(content, restartHandsFreeMic);
}

async function resolveTenant(previousFetch: typeof window.fetch, token: string) {
  const response = await previousFetch("/api/auth/me", { headers: authHeaders(token) });
  if (!response.ok) return null;
  const me = await response.json() as AuthMe;
  return me.tenantId ? { tenantId: me.tenantId, userId: me.id ?? null } : null;
}

async function loadLatestDiscountTask(
  previousFetch: typeof window.fetch,
  token: string,
  tenantId: string,
) {
  const response = await previousFetch(`/api/tenants/${encodeURIComponent(tenantId)}/agent-tasks`, {
    headers: authHeaders(token),
  });
  if (!response.ok) return null;
  const tasks = await response.json() as AgentTask[];
  return sortLatest(Array.isArray(tasks) ? tasks : []).find((task) => {
    if (task.actionType !== "aprovacao_desconto" || task.status !== "concluido") return false;
    const undo = task.result && typeof task.result === "object" ? task.result.undo : null;
    return !undo;
  }) ?? null;
}

async function loadDeal(
  previousFetch: typeof window.fetch,
  token: string,
  tenantId: string,
  leadId: string,
  dealId: string,
) {
  const response = await previousFetch(
    `/api/tenants/${encodeURIComponent(tenantId)}/deals?leadId=${encodeURIComponent(leadId)}`,
    { headers: authHeaders(token) },
  );
  if (!response.ok) return null;
  const deals = await response.json() as Deal[];
  return (Array.isArray(deals) ? deals : []).find((deal) => deal.id === dealId) ?? null;
}

async function undoLatestDiscount(previousFetch: typeof window.fetch) {
  const token = localStorage.getItem("vendorai_token") ?? "";
  if (!token) return "Não consegui desfazer porque sua sessão não está autenticada.";

  const identity = await resolveTenant(previousFetch, token);
  if (!identity) return "Não consegui identificar o tenant atual para desfazer o desconto.";

  const task = await loadLatestDiscountTask(previousFetch, token, identity.tenantId);
  if (!task) return "Não encontrei nenhum desconto concluído e reversível para desfazer.";

  const payload = task.payload && typeof task.payload === "object" ? task.payload : {};
  const dealId = typeof payload.dealId === "string" ? payload.dealId : "";
  const originalValue = toNumber(payload.originalValue);
  const discountedValue = toNumber(payload.discountedValue);
  if (!dealId || !task.leadId || originalValue === null || discountedValue === null) {
    return "Encontrei o desconto, mas ele não possui os dados mínimos necessários para uma reversão segura.";
  }

  const firstRead = await loadDeal(previousFetch, token, identity.tenantId, task.leadId, dealId);
  if (!firstRead) return "Não encontrei o negócio vinculado ao último desconto.";
  if (!sameMoney(toNumber(firstRead.valor), discountedValue)) {
    return "Não desfiz o desconto porque o valor do negócio já foi alterado depois da aplicação. Isso evita sobrescrever uma mudança posterior.";
  }

  const secondRead = await loadDeal(previousFetch, token, identity.tenantId, task.leadId, dealId);
  if (!secondRead) return "Não consegui confirmar o estado atual do negócio antes da reversão.";
  if (
    !sameMoney(toNumber(secondRead.valor), discountedValue)
    || String(secondRead.updatedAt ?? "") !== String(firstRead.updatedAt ?? "")
  ) {
    return "Não desfiz o desconto porque o negócio mudou durante a validação. Revise o negócio antes de tentar novamente.";
  }

  const restore = await previousFetch(`/api/deals/${encodeURIComponent(dealId)}`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({ valor: originalValue.toFixed(2) }),
  });
  if (!restore.ok) {
    const error = await restore.json().catch(() => ({})) as { error?: string; message?: string };
    return `Não consegui desfazer o desconto: ${error.message ?? error.error ?? "a alteração foi recusada pelo sistema"}.`;
  }

  const currentResult = task.result && typeof task.result === "object" ? task.result : {};
  const undoneAt = new Date().toISOString();
  const audit = await previousFetch(`/api/agent-tasks/${encodeURIComponent(task.id)}`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      result: {
        ...currentResult,
        undo: {
          undoneAt,
          undoneBy: identity.userId,
          restoredValue: originalValue,
          previousValue: discountedValue,
          reason: "user_requested_via_jarvis",
        },
      },
    }),
  });

  const discountPercent = toNumber(payload.discountPercent);
  const label = discountPercent !== null ? ` de ${discountPercent}%` : "";
  if (!audit.ok) {
    return `Desconto${label} desfeito e valor restaurado para R$ ${originalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. A reversão ocorreu, mas o registro de auditoria da tarefa não foi atualizado; recomendo revisar o histórico.`;
  }

  return `Desfeito. O último desconto${label} foi revertido e o valor voltou para R$ ${originalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. A reversão ficou registrada na tarefa do JARVIS.`;
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
    if (!isJarvisChat || typeof init?.body !== "string") return previousFetch(input, init);

    const lastText = getLastUserText(init.body);
    if (!wantsUndoLastDiscount(lastText)) return previousFetch(input, init);

    let content: string;
    try {
      content = await undoLatestDiscount(previousFetch);
    } catch {
      content = "Não consegui concluir o desfazer com segurança. Nenhuma nova tentativa automática foi feita.";
    }
    queueMicrotask(() => announce(content));
    return sseResponse(content);
  };
}

export {};
