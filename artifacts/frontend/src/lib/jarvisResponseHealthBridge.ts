const JARVIS_RESPONSE_STATE_EVENT = "vendorai:jarvis-response-state";

type JarvisResponseState = "waiting" | "healthy" | "failed";

function emitState(state: JarvisResponseState, message?: string) {
  window.dispatchEvent(new CustomEvent(JARVIS_RESPONSE_STATE_EVENT, {
    detail: { state, message },
  }));
}

async function observeJarvisStream(response: Response) {
  if (!response.body) {
    emitState("failed", "O JARVIS não recebeu um fluxo de resposta válido. Tente novamente.");
    return;
  }

  let receivedContent = false;
  let buffer = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6)) as { content?: unknown; done?: boolean; error?: unknown };
          if (typeof payload.content === "string" && payload.content.trim()) {
            if (!receivedContent) emitState("healthy");
            receivedContent = true;
          }
          if (payload.error) {
            emitState("failed", "O JARVIS encontrou um erro ao responder. Envie a mensagem novamente.");
            return;
          }
          if (payload.done && !receivedContent) {
            emitState("failed", "A solicitação terminou sem uma resposta do JARVIS. Envie novamente.");
            return;
          }
        } catch {
          // O parser principal do chat continua responsável pelo SSE; esta camada apenas observa saúde.
        }
      }
    }

    if (!receivedContent) {
      emitState("failed", "A conexão terminou sem conteúdo de resposta. Tente novamente.");
    }
  } catch {
    emitState("failed", "A resposta do JARVIS foi interrompida. Verifique a conexão e tente novamente.");
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

    if (!isJarvisChat) return previousFetch(input, init);

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      emitState("waiting", "O JARVIS está demorando mais que o normal para responder…");
    }, 12000);

    try {
      const response = await previousFetch(input, init);
      if (!response.ok) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
        emitState("failed", `Não foi possível obter resposta do JARVIS (${response.status}).`);
        return response;
      }

      void observeJarvisStream(response.clone()).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
      });
      return response;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      emitState("failed", "Não foi possível conectar ao JARVIS. Verifique a conexão e tente novamente.");
      throw error;
    }
  };
}

export { JARVIS_RESPONSE_STATE_EVENT };
