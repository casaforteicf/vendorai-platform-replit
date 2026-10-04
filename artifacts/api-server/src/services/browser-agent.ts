import { type Browser, type CookieData, type Page } from "puppeteer-core";
import { acquireBrowserLease } from "./browser-fleet.js";
import {
  captureBrowserProfile,
  restoreBrowserProfileAfterNavigation,
  restoreBrowserProfileBeforeNavigation,
  type BrowserProfileState,
} from "./browser-profile.js";
import { z } from "zod";
import { callOpenAI } from "../lib/ai-gateway.js";
import { actionShouldChangePage, verifyCheckpointTransition } from "./browser-verifier.js";

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

export interface BrowserAgentCheckpoint {
  url: string;
  title: string;
  textSignature: string;
  interactiveCount: number;
  capturedAt: string;
}

export interface BrowserAgentStep {
  index: number;
  action: string;
  url: string;
  detail?: string;
  checkpoint?: BrowserAgentCheckpoint;
}

export type BrowserFailureKind =
  | "selector_stale"
  | "navigation_timeout"
  | "transient_network"
  | "target_closed"
  | "detached_frame"
  | "blocked"
  | "approval_required"
  | "unknown";

export function classifyBrowserError(error: unknown): BrowserFailureKind {
  const message = String((error as any)?.message ?? error ?? "");
  if (message.startsWith("BROWSER_BLOCKED:")) return "blocked";
  if (message.startsWith("APPROVAL_REQUIRED:")) return "approval_required";
  if (/No element found for selector|failed to find element matching selector|No node found for selector|Node is detached from document/i.test(message)) return "selector_stale";
  if (/Navigation timeout|TimeoutError.*navigation|waiting for navigation/i.test(message)) return "navigation_timeout";
  if (/net::ERR_(?:TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_REFUSED|NETWORK_CHANGED|INTERNET_DISCONNECTED)|socket hang up|ECONNRESET|ETIMEDOUT|Runtime\.callFunctionOn timed out|protocolTimeout/i.test(message)) return "transient_network";
  if (/Target closed|Session closed|Protocol error.*Target|Connection closed/i.test(message)) return "target_closed";
  if (/detached Frame|Attempted to use detached Frame|Cannot find context with specified id|Execution context was destroyed/i.test(message)) return "detached_frame";
  return "unknown";
}

export function isRetryableBrowserError(error: unknown) {
  return ["navigation_timeout", "transient_network", "detached_frame"].includes(classifyBrowserError(error));
}

async function withBrowserRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableBrowserError(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }
  throw lastError;
}

async function navigateBrowserPage(page: Page, target: string, timeout = 12_000) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      lastError = error;
      const kind = classifyBrowserError(error);
      if (kind === "navigation_timeout") {
        const current = page.url().replace(/\/$/, "");
        const expected = target.replace(/\/$/, "");
        if (current === expected || current.startsWith(expected + "?") || current.startsWith(expected + "#")) {
          const state = await snapshotBrowserPage(page).catch(() => null);
          if (state && (state.title || state.text || state.interactive.length > 0)) return;
        }
      }
      if (!isRetryableBrowserError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

async function reloadBrowserPage(page: Page, timeout = 12_000) {
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout });
  } catch (error) {
    if (classifyBrowserError(error) !== "navigation_timeout") throw error;
    const state = await snapshotBrowserPage(page).catch(() => null);
    if (!state || (!state.title && !state.text && state.interactive.length === 0)) throw error;
  }
}


export function checkpointFromState(state: { url: string; title: string; text: string; interactive: unknown[] }): BrowserAgentCheckpoint {
  const normalized = state.text.replace(/\s+/g, " ").trim().slice(0, 600);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return {
    url: state.url,
    title: state.title,
    textSignature: (hash >>> 0).toString(16).padStart(8, "0"),
    interactiveCount: state.interactive.length,
    capturedAt: new Date().toISOString(),
  };
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
  sessionProfile?: BrowserProfileState;
  firstPartyAuthToken?: string;
  firstPartyAuthUserCache?: Record<string, unknown>;
  onSessionPersist?: (cookies: CookieData[]) => Promise<void>;
  onProfilePersist?: (profile: BrowserProfileState) => Promise<void>;
  onHumanVerification?: (browser: Browser, page: Page) => Promise<{ sessionId: string; controlUrl: string }>;
}

const ROUTINE_WRITE_TEXT = /(salvar|atualizar|editar|enviar|send|confirmar|approve|aprovar|submit|continuar|avançar|concluir)/i;
const HIGH_RISK_TEXT = /(pagar|pagamento|comprar|checkout|transferir|pix|excluir|delete|remover|cancelar assinatura|cancelar contrato|publicar anúncio|publicar campanha|assinar|contratar|alterar senha|redefinir senha|api key|chave api|token de acesso|finalizar compra)/i;

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
    const cssString = (value: string) => JSON.stringify(value);
    const buildStableSelector = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid=${cssString(testId)}]`;

      const aria = el.getAttribute("aria-label");
      if (aria) return `${tag}[aria-label=${cssString(aria)}]`;

      const name = (el as HTMLInputElement).name;
      if (name) return `${tag}[name=${cssString(name)}]`;

      const id = el.id;
      if (id && !/^radix-|^_?r_|radix/i.test(id)) return `#${CSS.escape(id)}`;

      const href = el.getAttribute("href");
      if (tag === "a" && href) return `a[href=${cssString(href)}]`;

      const parent = el.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(child => child.tagName === el.tagName);
        const position = sameTag.indexOf(el) + 1;
        if (position > 0) return `${tag}:nth-of-type(${position})`;
      }
      return tag;
    };

    const interactive = Array.from(document.querySelectorAll("a,button,input,textarea,select,[role='button']"))
      .slice(0, 120)
      .map((el, index) => {
        const h = el as HTMLElement;
        const i = el as HTMLInputElement;
        return {
          index,
          selector: buildStableSelector(el),
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
    "A página fornece page.interactive[].selector. Para click/type/secret/select, reutilize EXATAMENTE um selector presente nessa lista sempre que possível. Não invente IDs, especialmente IDs Radix/temporários. Nunca use seletores Playwright como :has-text().",
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

export function isRecoverableSelectorError(error: unknown) {
  const kind = classifyBrowserError(error);
  return kind === "selector_stale" || kind === "detached_frame";
}

async function sensitive(page: Page, selector: string) {
  const text = await page.$eval(selector, el => {
    const h = el as HTMLElement;
    const i = el as HTMLInputElement;
    return [h.innerText, i.value, i.name, i.type, el.getAttribute("aria-label"), el.getAttribute("title")]
      .filter(Boolean).join(" ");
  }).catch(() => "");
  return ROUTINE_WRITE_TEXT.test(text) || HIGH_RISK_TEXT.test(text);
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
  input: Pick<BrowserAgentInput, "mode" | "allowWrite" | "allowedHosts" | "secrets">,
): Promise<string | undefined> {
  if (action.action === "finish") return action.answer;

  if (action.action === "navigate") {
    await navigateBrowserPage(page, validateBrowserUrl(action.url, input.allowedHosts));
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
    const label = await page.$eval(action.selector, el => {
      const h = el as HTMLElement;
      const i = el as HTMLInputElement;
      return [h.innerText, i.value, i.name, i.type, el.getAttribute("aria-label"), el.getAttribute("title")]
        .filter(Boolean).join(" ");
    }).catch(() => "");

    if (HIGH_RISK_TEXT.test(label)) {
      throw new Error("APPROVAL_REQUIRED: ação de alto risco exige confirmação explícita");
    }

    if (!input.allowWrite && (ROUTINE_WRITE_TEXT.test(label) || await sensitive(page, action.selector))) {
      throw new Error("APPROVAL_REQUIRED: execução está em modo somente leitura");
    }

    await page.click(action.selector);
  }

  if (action.action === "type") await clearAndType(page, action.selector, action.text);
  if (action.action === "select") await page.select(action.selector, action.value);

  await page.waitForNetworkIdle({ idleTime: 400, timeout: 4000 }).catch(() => undefined);
}

export async function runBrowserAgent(input: BrowserAgentInput) {
  const steps: BrowserAgentStep[] = [];
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 12, 1), 30);
  const secretsAvailable = {
    login: Boolean(input.secrets?.login),
    passcode: Boolean(input.secrets?.passcode),
  };
  let browser: Browser | undefined;
  let page: Page | undefined;
  let transferred = false;
  let releaseBrowser: ((healthy?: boolean) => void) | undefined;

  try {
    const lease = await acquireBrowserLease();
    browser = lease.browser;
    releaseBrowser = lease.release;
    page = await (await browser.createBrowserContext()).newPage();

    if (input.sessionCookies?.length) {
      await page.setCookie(...input.sessionCookies).catch(() => undefined);
    }
    await restoreBrowserProfileBeforeNavigation(page, input.sessionProfile);

    if (input.firstPartyAuthToken) {
      const start = new URL(input.startUrl);
      const host = start.hostname.toLowerCase();
      const configuredHosts = (process.env["VENDI_FIRST_PARTY_HOSTS"] ?? "")
        .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      const trustedFirstParty =
        host === "app.appvendorai.com" ||
        host === "homolog.appvendorai.com" ||
        host.endsWith(".vendorai.pages.dev") ||
        configuredHosts.includes(host);
      if (!trustedFirstParty) throw new Error("VENDI_AUTH_ORIGIN_MISMATCH");

      // Instala a identidade técnica antes do primeiro carregamento. Assim o app
      // não chega a redirecionar a Vendi para /login por ausência momentânea de token.
      await page.evaluateOnNewDocument((payload) => {
        localStorage.setItem("vendorai_token", payload.token);
        if (payload.userCache) {
          localStorage.setItem("vendorai_user_cache", JSON.stringify(payload.userCache));
        }
        sessionStorage.removeItem("vendorai_demo_session");
      }, { token: input.firstPartyAuthToken, userCache: input.firstPartyAuthUserCache ?? null });
    }

    await navigateBrowserPage(page, validateBrowserUrl(input.startUrl, input.allowedHosts));
    if (await restoreBrowserProfileAfterNavigation(page, input.sessionProfile)) {
      await reloadBrowserPage(page);
    }

    if (input.firstPartyAuthToken) {
      // Garante compatibilidade com páginas já criadas/perfis restaurados.
      await withBrowserRetry(() => page.evaluate((payload) => {
        localStorage.setItem("vendorai_token", payload.token);
        if (payload.userCache) {
          localStorage.setItem("vendorai_user_cache", JSON.stringify(payload.userCache));
        }
        sessionStorage.removeItem("vendorai_demo_session");
      }, { token: input.firstPartyAuthToken, userCache: input.firstPartyAuthUserCache ?? null }));
      const target = validateBrowserUrl(input.startUrl, input.allowedHosts);
      if (page.url() !== target) {
        await navigateBrowserPage(page, target);
      }
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 5000 }).catch(() => undefined);
    }

    // Read-only short missions are commonly used as health/snapshot checks.
    // Avoid an unnecessary LLM planning round-trip after navigation: return the
    // current DOM deterministically so connector calls stay within their request budget.
    if (!input.allowWrite && maxSteps <= 3) {
      const state = await withBrowserRetry(() => snapshotBrowserPage(page), 2);
      assertBrowserPageAccessible(state);
      if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
      if (input.onProfilePersist) await input.onProfilePersist(await captureBrowserProfile(page));
      const visibleText = state.text.slice(0, 6000);
      return {
        ok: true,
        finalUrl: state.url,
        answer: JSON.stringify({
          title: state.title,
          text: visibleText,
          interactiveCount: state.interactive.length,
        }),
        steps: [{
          index: 1,
          action: "snapshot",
          url: state.url,
          detail: "readonly_fast_snapshot",
          checkpoint: checkpointFromState(state),
        }],
      };
    }

    let selectorRecoveryNote = "";
    let noChangeStreak = 0;
    for (let index = 1; index <= maxSteps; index++) {
      const state = await withBrowserRetry(() => snapshotBrowserPage(page));
      assertBrowserPageAccessible(state);
      const planningGoal = selectorRecoveryNote
        ? input.goal + "\nRECUPERAÇÃO DE NAVEGAÇÃO: " + selectorRecoveryNote
        : input.goal;
      selectorRecoveryNote = "";
      const action = await planBrowserAction(input.tenantId, planningGoal, state, steps, secretsAvailable);
      steps.push({
        index,
        action: action.action,
        url: state.url,
        detail: "reason" in action ? action.reason : undefined,
        checkpoint: checkpointFromState(state),
      });

      if (action.action === "finish") {
        if (action.outcome !== "completed") throw new Error(`BROWSER_${action.outcome.toUpperCase()}: ${action.answer}`);
        if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
        if (input.onProfilePersist) await input.onProfilePersist(await captureBrowserProfile(page));
        return { ok: true, finalUrl: state.url, answer: action.answer, steps };
      }

      let extracted: string | undefined;
      try {
        extracted = await executeBrowserAction(page, action, input);
        if (actionShouldChangePage(action.action)) {
          const afterState = await withBrowserRetry(() => snapshotBrowserPage(page));
          const verification = verifyCheckpointTransition(checkpointFromState(state), checkpointFromState(afterState));
          if (!verification.changed) {
            noChangeStreak += 1;
            const failedSelector = "selector" in action ? action.selector : "indisponível";
            selectorRecoveryNote =
              "A ação anterior foi executada sem produzir mudança observável na página. " +
              `Não repita a mesma ação/seletor (${failedSelector}). Escolha outra ação/elemento.`;

            if (noChangeStreak >= 2) {
              const goalUrl = input.goal.match(/https?:\/\/[^\s)]+/)?.[0];
              if (goalUrl) {
                try {
                  const target = validateBrowserUrl(goalUrl, input.allowedHosts);
                  if (page.url() !== target) {
                    await navigateBrowserPage(page, target);
                    await page.waitForNetworkIdle({ idleTime: 400, timeout: 5000 }).catch(() => undefined);
                    steps[steps.length - 1]!.detail = [steps[steps.length - 1]!.detail, "verified_no_change_direct_navigation"]
                      .filter(Boolean).join(" | ");
                    noChangeStreak = 0;
                    continue;
                  }
                } catch {
                  // If the goal URL is invalid or outside the allowlist, keep normal replanning.
                }
              }
              selectorRecoveryNote +=
                " Já houve duas tentativas consecutivas sem mudança. É proibido repetir o mesmo clique; " +
                "use navegação direta, extração do estado atual ou outro elemento do snapshot.";
            }

            steps[steps.length - 1]!.detail = [steps[steps.length - 1]!.detail, "verified_no_change_replan"]
              .filter(Boolean).join(" | ");
            continue;
          }
          noChangeStreak = 0;
        }
      } catch (error) {
        if (isRecoverableSelectorError(error)) {
          selectorRecoveryNote =
            "O seletor da ação anterior deixou de existir antes da execução. " +
            "Faça um novo plano usando SOMENTE um selector presente no snapshot atual de page.interactive[].selector. " +
            "Não reutilize o seletor que falhou: " + ("selector" in action ? action.selector : "indisponível");
          steps[steps.length - 1]!.detail = "selector_stale_replan";
          continue;
        }
        throw error;
      }
      if (action.action === "extract" && extracted) {
        const state2 = await withBrowserRetry(() => snapshotBrowserPage(page));
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
          if (input.onProfilePersist) await input.onProfilePersist(await captureBrowserProfile(page));
          return { ok: true, finalUrl: page.url(), answer: next.answer, steps };
        }
      }
    }

    if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
    if (input.onProfilePersist) await input.onProfilePersist(await captureBrowserProfile(page));
    return { ok: false, finalUrl: page.url(), answer: "Limite de passos atingido.", steps };
  } catch (error: any) {
    if (String(error?.message).startsWith("BROWSER_BLOCKED:") && input.onHumanVerification && browser && page) {
      const handoff = await input.onHumanVerification(browser, page);
      transferred = true;
      releaseBrowser?.(true);
      releaseBrowser = undefined;
      return { ok: false, status: "awaiting_human" as const, finalUrl: page.url(),
        answer: "Verificação humana necessária. Abra o controle ao vivo, faça a verificação e devolva para o Vendi.",
        steps, ...handoff };
    }
    throw error;
  } finally {
    if (!transferred && page) await page.browserContext().close().catch(() => undefined);
    if (!transferred && browser) browser.disconnect();
    if (!transferred) releaseBrowser?.(true);
  }
}
