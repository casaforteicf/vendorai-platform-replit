import puppeteer, { type Browser, type CookieData, type Page } from "puppeteer-core";
import { z } from "zod";
import { callOpenAI } from "../lib/ai-gateway.js";

export type BrowserAgentMode = "assistido" | "autonomo";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("navigate"), url: z.string().url(), reason: z.string().optional() }),
  z.object({ action: z.literal("click"), selector: z.string().min(1), reason: z.string().optional() }),
  z.object({ action: z.literal("type"), selector: z.string().min(1), text: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal("secret"), selector: z.string().min(1), secret: z.enum(["login", "passcode"]), reason: z.string().optional() }),
  z.object({ action: z.literal("select"), selector: z.string().min(1), value: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal("extract"), selector: z.string().min(1).optional(), reason: z.string().optional() }),
  z.object({ action: z.literal("finish"), answer: z.string().min(1), outcome: z.enum(["completed", "blocked", "failed"]), reason: z.string().optional() }),
]);

export function assertBrowserPageAccessible(state: { title: string; text: string; url?: string }) {
  const content = `${state.title} ${state.text}`;
  if (/(?:[?&])__cf_chl_(?:rt_tk|tk)=|\/cdn-cgi\/challenge-platform\//i.test(state.url ?? "")
      || /just a moment|um momento/i.test(state.title)
      || /verify you are human|verifying you are human|checking your browser|verificação de segurança|verifique que você é humano/i.test(content)
      || (/just a moment|um momento/i.test(state.title) && /cloudflare|verify|verifica/i.test(content))) {
    throw new Error("BROWSER_BLOCKED: o site exige verificação humana. A tarefa não foi concluída.");
  }
}

export type PlannedAction =
  | { action: "navigate"; url: string; reason?: string }
  | { action: "click"; selector: string; reason?: string }
  | { action: "type"; selector: string; text: string; reason?: string }
  | { action: "secret"; selector: string; secret: "login" | "passcode"; reason?: string }
  | { action: "select"; selector: string; value: string; reason?: string }
  | { action: "extract"; selector?: string; reason?: string }
  | { action: "finish"; answer: string; outcome: "completed" | "blocked" | "failed"; reason?: string };

export interface BrowserAgentStep {
  index: number;
  action: string;
  url: string;
  detail?: string;
}

export interface BrowserAgentInput {
  tenantId: string;
  goal: string;
  startUrl: string;
  mode?: BrowserAgentMode;
  allowWrite?: boolean;
  maxSteps?: number;
  allowedHosts?: string[];
  secrets?: { login?: string; passcode?: string };
  sessionCookies?: CookieData[];
  onSessionPersist?: (cookies: CookieData[]) => Promise<void>;
  onHumanVerification?: (browser: Browser, page: Page) => Promise<{ sessionId: string; controlUrl: string }>;
}

const SENSITIVE_TEXT = /(pagar|pagamento|comprar|checkout|transferir|pix|excluir|delete|remover|cancelar|publicar|enviar|send|confirmar|approve|aprovar|assinar|contratar|finalizar|submit)/i;

function hostAllowed(host: string, allowed: string[]) {
  return allowed.some((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized && (host === normalized || host.endsWith("." + normalized));
  });
}

export function validateBrowserUrl(raw: string, connectionAllowedHosts: string[] = []): string {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL não permitida");
  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" || host === "::1" || host.startsWith("127.") ||
    host.startsWith("10.") || host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("169.254.")
  ) throw new Error("Destino privado/local bloqueado");

  const globalAllow = (process.env["BROWSER_ALLOWED_HOSTS"] ?? "")
    .split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  const allowed = [...globalAllow, ...connectionAllowedHosts];

  if (allowed.length && !hostAllowed(host, allowed)) {
    throw new Error("Host não permitido: " + host);
  }

  return url.toString();
}

export async function snapshotBrowserPage(page: Page) {
  return page.evaluate(() => {
    const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
    const interactive = Array.from(document.querySelectorAll("a,button,input,textarea,select,[role='button']"))
      .slice(0, 120)
      .map((el, index) => {
        const h = el as HTMLElement;
        const i = el as HTMLInputElement;
        return {
          index,
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          name: i.name || null,
          type: i.type || null,
          text: clean(h.innerText || (i.type === "password" ? "" : i.value) || el.getAttribute("aria-label")),
          placeholder: i.placeholder || null,
          href: el instanceof HTMLAnchorElement ? el.href : null,
        };
      });

    return {
      url: location.href,
      title: document.title,
      text: clean(document.body?.innerText).slice(0, 14000),
      interactive,
    };
  });
}

export async function planBrowserAction(
  tenantId: string,
  goal: string,
  state: unknown,
  steps: BrowserAgentStep[],
  secretsAvailable: { login: boolean; passcode: boolean },
): Promise<PlannedAction> {
  const system = [
    "Você é o Browser Agent do Vendor.ai.",
    "Atinja o objetivo navegando pela interface web e responda SOMENTE JSON válido.",
    "Ações: navigate(url), click(selector), type(selector,text), secret(selector,secret), select(selector,value), extract(selector opcional), finish(answer).",
    "Para campos de autenticação use secret com secret=login ou passcode quando disponível.",
    "Nunca peça, invente ou repita segredos. Eles são injetados pelo backend e não ficam visíveis para você.",
    "Use seletores CSS estáveis. Não invente dados, credenciais ou elementos.",
    'Responda um objeto com campo action e seus parâmetros no primeiro nível, por exemplo {"action":"click","selector":"#button"}. Nunca retorne uma lista de ações.',
    'Ao finalizar use {"action":"finish","answer":"resultado","outcome":"completed|blocked|failed"}. Use completed somente se o objetivo foi atingido e verificado; bloqueios e falhas não são sucesso.',
    "Não tente contornar CAPTCHA ou verificações de segurança; finalize com outcome blocked.",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
  const result = await callOpenAI(
    tenantId,
    "agent_runtime" as any,
    [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ goal, page: state, recentSteps: steps.slice(-6), secretsAvailable, ...(attempt ? { correction: "A resposta anterior era inválida. Retorne uma única ação no formato indicado, com todos os campos obrigatórios." } : {}) }) },
    ],
    {
      temperature: 0,
      maxTokens: 600,
      responseFormat: { type: "json_object" },
      billingScope: "platform_runtime",
    },
  );

  try {
    const parsed = actionSchema.safeParse(JSON.parse(result.content));
    if (parsed.success) return parsed.data as PlannedAction;
  } catch { /* Retry malformed JSON once, without executing it. */ }
  }
  throw new Error("BROWSER_PLAN_INVALID: a IA não retornou uma ação válida após duas tentativas.");
}

async function sensitive(page: Page, selector: string) {
  const text = await page.$eval(selector, el => {
    const h = el as HTMLElement;
    const i = el as HTMLInputElement;
    return [h.innerText, i.value, i.name, i.type, el.getAttribute("aria-label"), el.getAttribute("title")]
      .filter(Boolean).join(" ");
  }).catch(() => "");
  return SENSITIVE_TEXT.test(text);
}

async function clearAndType(page: Page, selector: string, value: string) {
  await page.focus(selector);
  await page.$eval(selector, el => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = "";
  });
  await page.type(selector, value, { delay: 20 });
}

export async function executeBrowserAction(
  page: Page,
  action: PlannedAction,
  input: Pick<BrowserAgentInput, "allowWrite" | "allowedHosts" | "secrets">,
): Promise<string | undefined> {
  if (action.action === "finish") return action.answer;

  if (action.action === "navigate") {
    await page.goto(validateBrowserUrl(action.url, input.allowedHosts), { waitUntil: "domcontentloaded", timeout: 30000 });
    return;
  }

  if (action.action === "extract") {
    if (!action.selector) return (await page.evaluate(() => document.body?.innerText ?? "")).slice(0, 20000);
    return page.$eval(action.selector, el => (el as HTMLElement).innerText ?? el.textContent ?? "");
  }

  if (action.action === "secret") {
    const value = input.secrets?.[action.secret];
    if (!value) throw new Error("Segredo solicitado não está configurado");
    await clearAndType(page, action.selector, value);
  }

  if (action.action === "click") {
    if (!input.allowWrite && await sensitive(page, action.selector)) {
      throw new Error("APPROVAL_REQUIRED: ação sensível bloqueada");
    }
    await page.click(action.selector);
  }

  if (action.action === "type") await clearAndType(page, action.selector, action.text);
  if (action.action === "select") await page.select(action.selector, action.value);

  await page.waitForNetworkIdle({ idleTime: 400, timeout: 4000 }).catch(() => undefined);
}

export async function runBrowserAgent(input: BrowserAgentInput) {
  const cdpUrl = process.env["BROWSER_CDP_URL"];
  if (!cdpUrl) throw new Error("BROWSER_CDP_URL não configurada");

  const steps: BrowserAgentStep[] = [];
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 12, 1), 30);
  const secretsAvailable = {
    login: Boolean(input.secrets?.login),
    passcode: Boolean(input.secrets?.passcode),
  };
  let browser: Browser | undefined;
  let page: Page | undefined;
  let transferred = false;

  try {
    browser = await puppeteer.connect({ browserWSEndpoint: cdpUrl });
    page = await (await browser.createBrowserContext()).newPage();

    if (input.sessionCookies?.length) {
      await page.setCookie(...input.sessionCookies).catch(() => undefined);
    }

    await page.goto(validateBrowserUrl(input.startUrl, input.allowedHosts), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    for (let index = 1; index <= maxSteps; index++) {
      const state = await snapshotBrowserPage(page);
      assertBrowserPageAccessible(state);
      const action = await planBrowserAction(input.tenantId, input.goal, state, steps, secretsAvailable);
      steps.push({ index, action: action.action, url: state.url, detail: "reason" in action ? action.reason : undefined });

      if (action.action === "finish") {
        if (action.outcome !== "completed") throw new Error(`BROWSER_${action.outcome.toUpperCase()}: ${action.answer}`);
        if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
        return { ok: true, finalUrl: state.url, answer: action.answer, steps };
      }

      const extracted = await executeBrowserAction(page, action, input);
      if (action.action === "extract" && extracted) {
        const state2 = await snapshotBrowserPage(page);
        assertBrowserPageAccessible(state2);
        const next = await planBrowserAction(
          input.tenantId,
          input.goal + "\nDados extraídos:\n" + extracted.slice(0, 12000),
          state2,
          steps,
          secretsAvailable,
        );
        if (next.action === "finish") {
          if (next.outcome !== "completed") throw new Error(`BROWSER_${next.outcome.toUpperCase()}: ${next.answer}`);
          if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
          return { ok: true, finalUrl: page.url(), answer: next.answer, steps };
        }
      }
    }

    if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
    return { ok: false, finalUrl: page.url(), answer: "Limite de passos atingido.", steps };
  } catch (error: any) {
    if (String(error?.message).startsWith("BROWSER_BLOCKED:") && input.onHumanVerification && browser && page) {
      const handoff = await input.onHumanVerification(browser, page);
      transferred = true;
      return { ok: false, status: "awaiting_human" as const, finalUrl: page.url(),
        answer: "Verificação humana necessária. Abra o controle ao vivo, faça a verificação e devolva para o Vendi.",
        steps, ...handoff };
    }
    throw error;
  } finally {
    if (!transferred && page) await page.browserContext().close().catch(() => undefined);
    if (!transferred && browser) browser.disconnect();
  }
}
