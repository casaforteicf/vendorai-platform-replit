export function renderAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function renderApiPost(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...renderAuthHeader() } as Record<string, string>,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any).error ?? `Erro ${response.status}`);
  return data;
}

export async function renderApiGet(path: string) {
  const response = await fetch(path, { headers: renderAuthHeader() as HeadersInit });
  if (!response.ok) throw new Error(`Erro ${response.status}`);
  return response.json().catch(() => { throw new Error("Resposta inválida do servidor"); });
}

export async function renderApiPatch(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...renderAuthHeader() } as Record<string, string>,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any).error ?? `Erro ${response.status}`);
  return data;
}

export function normalizeRenderMediaUrl(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^(data:|blob:)/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    const pathname = parsed.pathname;
    if (pathname.startsWith("/api/storage/objects/")) return `${pathname}${parsed.search}`;
    if (pathname.startsWith("/objects/")) return `/api/storage${pathname}${parsed.search}`;
  } catch {
    // formatos relativos legados
  }

  if (raw.startsWith("/api/storage/objects/")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  if (raw.startsWith("objects/")) return `/api/storage/${raw}`;
  if (!raw.startsWith("/") && !/^https?:\/\//i.test(raw)) {
    return `/api/storage/objects/${raw.replace(/^\/+/, "")}`;
  }
  return raw;
}

export function renderFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function waitForRenderVideoCompletion(jobId: string, timeoutAttempts = 120) {
  let attempts = 0;
  while (attempts < timeoutAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const data = await renderApiGet(`/api/arch/ai-render-video/${jobId}`);
    if (data.status === "done" && data.video_url) return data;
    if (data.status === "error") throw new Error(data.error ?? "Erro ao gerar vídeo do render");
    attempts++;
  }
  throw new Error("TIMEOUT");
}

export async function waitForRenderCompletion(renderId: string, timeoutAttempts = 90) {
  let attempts = 0;
  while (attempts < timeoutAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const data = await renderApiGet(`/api/arch/ai-render/${renderId}`);
    if (data.status === "concluido" && data.file_available !== false && (data.display_url || data.result_image_url)) {
      return { ...data, result_image_url: data.display_url || data.result_image_url };
    }
    if (data.status === "concluido" && data.file_available === false) {
      throw new Error("O arquivo do render não está disponível no Storage. Gere uma nova versão.");
    }
    if (data.status === "erro") throw new Error(data.erro_msg ?? "Erro no processamento do render");
    attempts++;
  }
  throw new Error("TIMEOUT");
}

export function categorizeRenderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "TIMEOUT") return "O render demorou mais de 3 min. Clique em 'Tentar novamente' — a imagem e parâmetros são reutilizados.";
  if (message.includes("402") || message.includes("429")) return "Limite de uso atingido. Aguarde alguns minutos e tente novamente.";
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) return "Sem conexão. Verifique sua internet e tente novamente.";
  if (message.includes("413")) return "Imagem muito grande. Reduza o tamanho e tente novamente.";
  if (message.includes("processamento")) return "O motor de IA encontrou um erro. Tente novamente com a mesma imagem.";
  if (
    message.toLowerCase().includes("failed query") ||
    message.toLowerCase().includes("value too long for type character varying") ||
    message.toLowerCase().includes("params:")
  ) {
    return "O render foi processado, mas ocorreu uma falha interna ao finalizar a versão. Tente novamente.";
  }
  return message;
}

export const RENDER_STAGES = [
  { label: "Preparando imagem e parâmetros…", afterMs: 0 },
  { label: "Enviando para o motor de IA…", afterMs: 3000 },
  { label: "Gerando render…", afterMs: 8000 },
] as const;
