import puppeteer, { type Browser, type CookieData, type Page } from "puppeteer-core";
import {
  executeBrowserAction,
  planBrowserAction,
  snapshotBrowserPage,
  validateBrowserUrl,
  type BrowserAgentStep,
} from "./browser-agent.js";

type PersistSession = (cookies: CookieData[]) => Promise<void>;

export type LiveBrowserSessionStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "error"
  | "closed";

type LiveBrowserSession = {
  id: string;
  tenantId: string;
  connectionId: string | null;
  browser: Browser;
  page: Page;
  allowedHosts: string[];
  secrets?: { login?: string; passcode?: string };
  allowWrite: boolean;
  goal: string | null;
  answer: string | null;
  error: string | null;
  status: LiveBrowserSessionStatus;
  steps: BrowserAgentStep[];
  createdAt: Date;
  lastActivityAt: Date;
  paused: boolean;
  closed: boolean;
  onSessionPersist?: PersistSession;
};

const sessions = new Map<string, LiveBrowserSession>();
const MAX_SESSIONS_PER_TENANT = 3;
const SESSION_TTL_MS = 30 * 60 * 1000;

function publicSession(session: LiveBrowserSession) {
  return {
    id: session.id,
    connectionId: session.connectionId,
    status: session.status,
    goal: session.goal,
    answer: session.answer,
    error: session.error,
    url: session.page.url(),
    title: null as string | null,
    steps: session.steps,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
  };
}

async function cleanupExpiredSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const session of sessions.values()) {
    if (session.lastActivityAt.getTime() < cutoff) {
      await closeLiveBrowserSession(session.tenantId, session.id).catch(() => undefined);
    }
  }
}

export async function createLiveBrowserSession(input: {
  tenantId: string;
  connectionId?: string | null;
  startUrl: string;
  allowedHosts?: string[];
  secrets?: { login?: string; passcode?: string };
  sessionCookies?: CookieData[];
  allowWrite?: boolean;
  onSessionPersist?: PersistSession;
}) {
  await cleanupExpiredSessions();

  const tenantSessions = [...sessions.values()].filter(
    (session) => session.tenantId === input.tenantId && !session.closed,
  );
  if (tenantSessions.length >= MAX_SESSIONS_PER_TENANT) {
    throw new Error("Limite de sessões simultâneas atingido para este tenant");
  }

  const cdpUrl = process.env["BROWSER_CDP_URL"];
  if (!cdpUrl) throw new Error("BROWSER_CDP_URL não configurada");

  const browser = await puppeteer.connect({ browserWSEndpoint: cdpUrl });
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1 });

  if (input.sessionCookies?.length) {
    await page.setCookie(...input.sessionCookies).catch(() => undefined);
  }

  await page.goto(validateBrowserUrl(input.startUrl, input.allowedHosts ?? []), {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const id = crypto.randomUUID();
  const now = new Date();
  const session: LiveBrowserSession = {
    id,
    tenantId: input.tenantId,
    connectionId: input.connectionId ?? null,
    browser,
    page,
    allowedHosts: input.allowedHosts ?? [],
    secrets: input.secrets,
    allowWrite: Boolean(input.allowWrite),
    goal: null,
    answer: null,
    error: null,
    status: "idle",
    steps: [],
    createdAt: now,
    lastActivityAt: now,
    paused: false,
    closed: false,
    onSessionPersist: input.onSessionPersist,
  };
  sessions.set(id, session);

  return publicSession(session);
}

function requireSession(tenantId: string, sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.closed || session.tenantId !== tenantId) {
    throw new Error("Sessão do navegador não encontrada");
  }
  session.lastActivityAt = new Date();
  return session;
}

export async function getLiveBrowserSession(tenantId: string, sessionId: string) {
  const session = requireSession(tenantId, sessionId);
  const title = await session.page.title().catch(() => "");
  return { ...publicSession(session), title };
}

export async function captureLiveBrowserSession(tenantId: string, sessionId: string) {
  const session = requireSession(tenantId, sessionId);
  const buffer = await session.page.screenshot({ type: "jpeg", quality: 72, encoding: "base64" });
  return {
    ...publicSession(session),
    title: await session.page.title().catch(() => ""),
    screenshotDataUrl: "data:image/jpeg;base64," + buffer,
  };
}

export async function setLiveBrowserPaused(tenantId: string, sessionId: string, paused: boolean) {
  const session = requireSession(tenantId, sessionId);
  session.paused = paused;
  if (session.status === "running" && paused) session.status = "paused";
  if (session.status === "paused" && !paused) session.status = "running";
  return publicSession(session);
}

export async function controlLiveBrowserSession(
  tenantId: string,
  sessionId: string,
  command:
    | { action: "click"; x: number; y: number }
    | { action: "type"; text: string }
    | { action: "key"; key: string }
    | { action: "navigate"; url: string }
    | { action: "back" }
    | { action: "reload" },
) {
  const session = requireSession(tenantId, sessionId);
  session.paused = true;
  if (session.status === "running") session.status = "paused";

  if (command.action === "click") {
    await session.page.mouse.click(command.x, command.y);
  } else if (command.action === "type") {
    await session.page.keyboard.type(command.text, { delay: 20 });
  } else if (command.action === "key") {
    await session.page.keyboard.press(command.key as any);
  } else if (command.action === "navigate") {
    await session.page.goto(validateBrowserUrl(command.url, session.allowedHosts), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  } else if (command.action === "back") {
    await session.page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
  } else if (command.action === "reload") {
    await session.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  }

  session.lastActivityAt = new Date();
  return captureLiveBrowserSession(tenantId, sessionId);
}

export function startLiveBrowserMission(
  tenantId: string,
  sessionId: string,
  goal: string,
  maxSteps = 20,
) {
  const session = requireSession(tenantId, sessionId);
  if (session.status === "running" || session.status === "paused") {
    throw new Error("Já existe uma missão em execução nesta sessão");
  }

  session.goal = goal;
  session.answer = null;
  session.error = null;
  session.steps = [];
  session.paused = false;
  session.status = "running";

  void (async () => {
    try {
      const secretsAvailable = {
        login: Boolean(session.secrets?.login),
        passcode: Boolean(session.secrets?.passcode),
      };

      for (let index = 1; index <= Math.min(Math.max(maxSteps, 1), 40); index++) {
        while (session.paused && !session.closed) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (session.closed) return;

        const state = await snapshotBrowserPage(session.page);
        const action = await planBrowserAction(
          session.tenantId,
          goal,
          state,
          session.steps,
          secretsAvailable,
        );

        session.steps.push({
          index,
          action: action.action,
          url: state.url,
          detail: "reason" in action ? action.reason : undefined,
        });
        session.lastActivityAt = new Date();

        // Se o usuário assumir o controle enquanto a IA está planejando,
        // não execute a ação recém-planejada até ele devolver o controle.
        while (session.paused && !session.closed) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (session.closed) return;

        if (action.action === "finish") {
          session.answer = action.answer;
          session.status = "completed";
          if (session.onSessionPersist) await session.onSessionPersist(await session.page.cookies());
          return;
        }

        const extracted = await executeBrowserAction(session.page, action, {
          allowWrite: session.allowWrite,
          allowedHosts: session.allowedHosts,
          secrets: session.secrets,
        });

        if (action.action === "extract" && extracted) {
          session.steps.push({
            index: session.steps.length + 1,
            action: "extract_result",
            url: session.page.url(),
            detail: extracted.slice(0, 500),
          });
        }
      }

      session.answer = "Limite de passos atingido antes de concluir a missão.";
      session.status = "completed";
      if (session.onSessionPersist) await session.onSessionPersist(await session.page.cookies());
    } catch (error: any) {
      session.error = error?.message ?? "Falha na missão do navegador";
      session.status = session.error.startsWith("APPROVAL_REQUIRED:") ? "paused" : "error";
      session.paused = session.status === "paused";
    }
  })();

  return publicSession(session);
}

export async function closeLiveBrowserSession(tenantId: string, sessionId: string) {
  const session = requireSession(tenantId, sessionId);
  session.closed = true;
  session.status = "closed";

  if (session.onSessionPersist) {
    await session.onSessionPersist(await session.page.cookies()).catch(() => undefined);
  }

  await session.page.close().catch(() => undefined);
  session.browser.disconnect();
  sessions.delete(sessionId);

  return { success: true, id: sessionId };
}
