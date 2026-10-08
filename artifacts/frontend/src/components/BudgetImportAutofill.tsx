import { useEffect } from "react";

type QuoteExtractionResponse = {
  titulo?: string | null;
  valorTotal?: number | null;
  cliente?: string | null;
  clienteDocumento?: string | null;
  clienteTelefone?: string | null;
  clienteEmail?: string | null;
  clienteCidade?: string | null;
  clienteEstado?: string | null;
  clienteCep?: string | null;
  clienteEndereco?: string | null;
  fornecedor?: string | null;
  validade?: string | null;
  itens?: Array<{
    descricao?: string | null;
    quantidade?: number | null;
    valorUnitario?: number | null;
    valorTotal?: number | null;
  }> | null;
  observacoes?: string | null;
  confianca?: number | null;
};

type SupportedControl = HTMLInputElement | HTMLTextAreaElement;

const BUDGET_IMPORT_MAX_SIZE = 10 * 1024 * 1024;
const BUDGET_IMPORT_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx"]);

function validateBudgetFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!BUDGET_IMPORT_EXTENSIONS.has(extension)) return "Use PDF, imagem, DOC ou DOCX.";
  if (file.size <= 0) return "O arquivo selecionado está vazio.";
  if (file.size > BUDGET_IMPORT_MAX_SIZE) return "O limite para leitura automática é 10 MB.";
  return null;
}

async function extractBudgetWithRetry(tenantId: string, file: File): Promise<QuoteExtractionResponse> {
  const transient = new Set([408, 425, 429, 502, 503, 504]);
  const token = localStorage.getItem("vendorai_token");
  let lastError = "Não foi possível ler o orçamento.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/deals/extract-quote`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload as QuoteExtractionResponse;
      lastError = payload?.error || payload?.message || `Falha ao ler orçamento (HTTP ${response.status})`;
      if (!transient.has(response.status) || attempt === 1) throw new Error(lastError);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = "A leitura demorou demais e foi interrompida.";
      } else if (error instanceof Error && error.message) {
        lastError = error.message;
      }
      if (attempt === 1) throw new Error(lastError);
    } finally {
      window.clearTimeout(timeout);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 700));
  }

  throw new Error(lastError);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readJsonStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function resolveTenantId(): Promise<string | null> {
  const tenantOverride = readJsonStorage<{ id?: string }>("vendorai_sa_tenant_override");
  if (tenantOverride?.id) return tenantOverride.id;

  const cachedUser = readJsonStorage<{ tenantId?: string | null }>("vendorai_user_cache");
  if (cachedUser?.tenantId) return cachedUser.tenantId;

  const dealId = new URLSearchParams(window.location.search).get("dealId");
  if (!dealId) return null;

  try {
    const token = localStorage.getItem("vendorai_token");
    const response = await fetch(`/api/deals/${encodeURIComponent(dealId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) return null;
    const deal = (await response.json()) as { tenantId?: string | null };
    return deal.tenantId ?? null;
  } catch {
    return null;
  }
}

function findControlByLabel(dialog: Element, labelText: string): SupportedControl | null {
  const target = normalizeText(labelText);
  const labels = Array.from(dialog.querySelectorAll("label"));
  const label = labels.find((candidate) => normalizeText(candidate.textContent).startsWith(target));
  if (!label) return null;

  if (label.htmlFor) {
    const byId = document.getElementById(label.htmlFor);
    if (byId instanceof HTMLInputElement || byId instanceof HTMLTextAreaElement) return byId;
  }

  const parentControl = label.parentElement?.querySelector("input, textarea");
  return parentControl instanceof HTMLInputElement || parentControl instanceof HTMLTextAreaElement
    ? parentControl
    : null;
}

function setReactControlValue(control: SupportedControl, value: string): boolean {
  if (control.disabled || control.readOnly) return false;
  if (control.value === value) return false;

  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;

  setter.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function findCommercialValue(text: string, kind: "payment" | "delivery"): string | null {
  if (!text.trim()) return null;

  const patterns = kind === "payment"
    ? [
        /condi(?:ç|c)[aã]o(?:\s+de)?\s+pagamento\s*[:\-]?\s*([^.;\n]+)/i,
        /pagamento\s*[:\-]\s*([^.;\n]+)/i,
      ]
    : [
        /prazo\s+(?:de\s+)?entrega\s*[:\-]?\s*([^.;\n]+)/i,
        /entrega\s*[:\-]\s*([^.;\n]+)/i,
      ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length <= 140) return candidate;
  }
  return null;
}

function findStatusHost(fileInput: HTMLInputElement): HTMLElement | null {
  let node = fileInput.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    if (normalizeText(node.textContent).includes("arquivo do orcamento")) return node;
  }
  return fileInput.parentElement;
}

function setStatus(host: HTMLElement | null, message: string, tone: "loading" | "success" | "warning") {
  if (!host) return;
  let status = host.querySelector<HTMLElement>("[data-budget-import-ai-status]");
  if (!status) {
    status = document.createElement("div");
    status.dataset.budgetImportAiStatus = "true";
    status.className = "mt-2 rounded-md border px-3 py-2 text-xs";
    host.appendChild(status);
  }

  status.className = tone === "success"
    ? "mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
    : tone === "warning"
      ? "mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      : "mt-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800";
  status.textContent = message;
}

function isBudgetImportInput(input: HTMLInputElement): { dialog: Element; statusHost: HTMLElement | null } | null {
  if (input.type !== "file") return null;
  const dialog = input.closest('[role="dialog"]');
  if (!dialog) return null;

  const dialogText = normalizeText(dialog.textContent);
  if (!dialogText.includes("novo orcamento") || !dialogText.includes("importar de outro sistema")) return null;

  const statusHost = findStatusHost(input);
  if (!statusHost || !normalizeText(statusHost.textContent).includes("arquivo do orcamento")) return null;
  return { dialog, statusHost };
}

function populateBudgetFields(dialog: Element, result: QuoteExtractionResponse): string[] {
  const populated: string[] = [];

  const totalControl = findControlByLabel(dialog, "Valor total");
  if (totalControl && typeof result.valorTotal === "number" && Number.isFinite(result.valorTotal) && result.valorTotal > 0) {
    const current = Number(totalControl.value || 0);
    if (!(current > 0) && setReactControlValue(totalControl, String(result.valorTotal))) populated.push("valor total");
  }

  const validityControl = findControlByLabel(dialog, "Validade");
  if (validityControl && result.validade && /^\d{4}-\d{2}-\d{2}$/.test(result.validade) && !validityControl.value) {
    if (setReactControlValue(validityControl, result.validade)) populated.push("validade");
  }

  const titleControl = findControlByLabel(dialog, "Título");
  if (titleControl && result.titulo?.trim()) {
    const currentTitle = titleControl.value.trim();
    const isDefaultTitle = !currentTitle || /^or[cç]amento\s*-\s*/i.test(currentTitle);
    if (isDefaultTitle && setReactControlValue(titleControl, result.titulo.trim())) populated.push("título");
  }

  const observations = result.observacoes?.trim() ?? "";
  const observationsControl = findControlByLabel(dialog, "Observações");
  if (observationsControl && observations) {
    const current = observationsControl.value.trim();
    const next = current && !current.includes(observations)
      ? `${current}\n\nDados do anexo: ${observations}`
      : current || observations;
    if (setReactControlValue(observationsControl, next)) populated.push("observações");
  }

  const paymentCondition = findCommercialValue(observations, "payment");
  const paymentControl = findControlByLabel(dialog, "Condição de Pagamento");
  if (paymentControl && paymentCondition && !paymentControl.value) {
    if (setReactControlValue(paymentControl, paymentCondition)) populated.push("condição de pagamento");
  }

  const deliveryTerm = findCommercialValue(observations, "delivery");
  const deliveryControl = findControlByLabel(dialog, "Prazo de Entrega");
  if (deliveryControl && deliveryTerm && !deliveryControl.value) {
    if (setReactControlValue(deliveryControl, deliveryTerm)) populated.push("prazo de entrega");
  }

  return populated;
}

/**
 * Complementa o fluxo real de "Importar de outro sistema" em Novo Orçamento.
 * O arquivo continua sendo salvo pelo fluxo existente de Propostas.tsx; esta
 * camada apenas reutiliza a inteligência documental já existente no backend
 * (/deals/extract-quote) para preencher automaticamente os campos disponíveis.
 */
export function BudgetImportAutofill() {
  useEffect(() => {
    const processingKeys = new Set<string>();
    const completedKeys = new Set<string>();

    const onFileChange = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const context = isBudgetImportInput(input);
      if (!context) return;

      const file = input.files?.[0];
      if (!file) return;

      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (processingKeys.has(key) || completedKeys.has(key)) return;

      const validationError = validateBudgetFile(file);
      if (validationError) {
        setStatus(context.statusHost, `Arquivo anexado, mas não foi enviado para leitura automática: ${validationError} Você ainda pode preencher os campos manualmente.`, "warning");
        return;
      }

      processingKeys.add(key);
      setStatus(context.statusHost, "Lendo o anexo e identificando valor, validade, título e condições comerciais…", "loading");

      void (async () => {
        try {
          const tenantId = await resolveTenantId();
          if (!tenantId) throw new Error("tenant_not_found");

          const result = await extractBudgetWithRetry(tenantId, file);
          const populated = populateBudgetFields(context.dialog, result);
          const itemCount = result.itens?.length ?? 0;
          const confidence = typeof result.confianca === "number" ? result.confianca : null;

          if (populated.length === 0) {
            setStatus(
              context.statusHost,
              itemCount > 0
                ? `Anexo lido: ${itemCount} item(ns) identificado(s), mas nenhum campo vazio pôde ser preenchido automaticamente. Revise antes de criar.`
                : "Anexo lido, mas não encontrei dados suficientes para preencher os campos automaticamente. Revise antes de criar.",
              "warning",
            );
          } else {
            const confidenceText = confidence !== null ? ` · confiança ${Math.round(confidence * 100)}%` : "";
            const itemsText = itemCount > 0 ? ` · ${itemCount} item(ns) identificado(s)` : "";
            const customerText = result.cliente
              ? ` · cliente: ${result.cliente}${result.clienteCidade ? ` / ${result.clienteCidade}${result.clienteEstado ? `-${result.clienteEstado}` : ""}` : ""}`
              : "";
            setStatus(
              context.statusHost,
              `Dados puxados do anexo: ${populated.join(", ")}${itemsText}${customerText}${confidenceText}. Revise antes de criar o orçamento.`,
              "success",
            );
          }
          completedKeys.add(key);
        } catch (error) {
          setStatus(
            context.statusHost,
            `O arquivo foi anexado normalmente, mas a leitura automática falhou: ${error instanceof Error ? error.message : "erro desconhecido"}. Você ainda pode preencher os campos manualmente.`,
            "warning",
          );
        } finally {
          processingKeys.delete(key);
        }
      })();
    };

    document.addEventListener("change", onFileChange, true);
    return () => document.removeEventListener("change", onFileChange, true);
  }, []);

  return null;
}
