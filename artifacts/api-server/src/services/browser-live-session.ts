import { type Browser, type CookieData, type Page } from "puppeteer-core";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { acquireBrowserLease } from "./browser-fleet.js";
import {
  captureBrowserProfile,
  restoreBrowserProfileAfterNavigation,
  restoreBrowserProfileBeforeNavigation,
  type BrowserProfileState,
} from "./browser-profile.js";
import {
  assertBrowserPageAccessible,
  executeBrowserAction,
  planBrowserAction,
  snapshotBrowserPage,
  validateBrowserUrl,
  checkpointFromState,
  classifyBrowserError,
  type BrowserAgentStep,
  type PlannedAction,
} from "./browser-agent.js";

type PersistSession = (cookies: CookieData[]) => Promise<void>;
type PersistProfile = (profile: BrowserProfileState) => Promise<void>;
type MissionResult = { ok: boolean; sessionId: string; finalUrl: string; answer: string; steps: BrowserAgentStep[] };
type PersistMissionResult = (result: MissionResult) => Promise<void>;

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
  recordedActions: PlannedAction[];
  createdAt: Date;
  lastActivityAt: Date;
  paused: boolean;
  closed: boolean;
  missionActive: boolean;
  revision: number;
  pauseReason: "manual" | "human_verification" | "approval_required" | null;
  handoffToken: string;
  actionInFlight?: Promise<unknown>;
  onMissionResult?: PersistMissionResult;
  onSessionPersist?: PersistSession;
  onProfilePersist?: PersistProfile;
  releaseBrowser?: (healthy?: boolean) => void;
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
    recordedActionCount: session.recordedActions.length,
    pauseReason: session.pauseReason,
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
  sessionProfile?: BrowserProfileState;
  allowWrite?: boolean;
  onMissionResult?: PersistMissionResult;
  onSessionPersist?: PersistSession;
  onProfilePersist?: PersistProfile;
  existing?: { browser: Browser; page: Page };
}) {
  await cleanupExpiredSessions();

  const tenantSessions = [...sessions.values()].filter(
    (session) => session.tenantId === input.tenantId && !session.closed,
  );
  if (tenantSessions.length >= MAX_SESSIONS_PER_TENANT) {
    throw new Error("Limite de sessões simultâneas atingido para este tenant");
  }

  const lease = input.existing ? undefined : await acquireBrowserLease();
  const browser = input.existing?.browser ?? lease!.browser;
  let page: Page | undefined;
  try {
    page = input.existing?.page ?? await (await browser.createBrowserContext()).newPage();
    await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1 });
    if (!input.existing) {
      if (input.sessionCookies?.length) await page.setCookie(...input.sessionCookies);
      await restoreBrowserProfileBeforeNavigation(page, input.sessionProfile);
      await page.goto(validateBrowserUrl(input.startUrl, input.allowedHosts ?? []), {
        waitUntil: "domcontentloaded", timeout: 30000,
      });
      if (await restoreBrowserProfileAfterNavigation(page, input.sessionProfile)) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }
  } catch (error) {
    if (!input.existing) {
      if (page) await page.browserContext().close().catch(() => undefined);
      browser.disconnect();
      lease?.release(false);
    }
    throw error;
  }

  if (!page) throw new Error("Não foi possível abrir a página do navegador");
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
    recordedActions: [],
    createdAt: now,
    lastActivityAt: now,
    paused: false,
    closed: false,
    missionActive: false,
    revision: 0,
    pauseReason: null,
    handoffToken: crypto.randomUUID() + crypto.randomUUID(),
    onSessionPersist: input.onSessionPersist,
    onProfilePersist: input.onProfilePersist,
    onMissionResult: input.onMissionResult,
    releaseBrowser: lease?.release,
  };
  sessions.set(id, session);

  return publicSession(session);
}

function requireSession(tenantId: string, sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.closed || session.tenantId !== tenantId) {
    throw new Error("Sessão do navegador não encontrada");
  }
  if (Date.now() - session.lastActivityAt.getTime() > SESSION_TTL_MS) {
    void closeLiveBrowserSession(tenantId, sessionId, true);
    throw new Error("Sessão expirada. Abra uma nova sessão do navegador.");
  }
  return session;
}

export function getLiveBrowserHandoff(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.closed) throw new Error("Sessão do navegador não encontrada");
  return { sessionId: session.id, handoffToken: session.handoffToken };
}

function requireHandoffSession(sessionId: string, handoffToken: string) {
  const session = sessions.get(sessionId);
  if (!session || session.closed || !handoffToken || session.handoffToken !== handoffToken) {
    throw new Error("Sessão do navegador não encontrada");
  }
  if (Date.now() - session.lastActivityAt.getTime() > SESSION_TTL_MS) {
    void closeLiveBrowserSession(session.tenantId, sessionId, true);
    throw new Error("Sessão expirada. Abra uma nova sessão do navegador.");
  }
  return session;
}

export async function captureLiveBrowserHandoff(sessionId: string, handoffToken: string) {
  const session = requireHandoffSession(sessionId, handoffToken);
  session.lastActivityAt = new Date();
  const buffer = await session.page.screenshot({ type: "jpeg", quality: 72, encoding: "base64" });
  return {
    ...publicSession(session),
    title: await session.page.title().catch(() => ""),
    screenshotDataUrl: "data:image/jpeg;base64," + buffer,
  };
}

export async function setLiveBrowserHandoffPaused(sessionId: string, handoffToken: string, paused: boolean) {
  const session = requireHandoffSession(sessionId, handoffToken);
  return setLiveBrowserPaused(session.tenantId, session.id, paused);
}

export async function controlLiveBrowserHandoff(sessionId: string, handoffToken: string, command: Parameters<typeof controlLiveBrowserSession>[2]) {
  const session = requireHandoffSession(sessionId, handoffToken);
  return controlLiveBrowserSession(session.tenantId, session.id, command);
}

export async function closeLiveBrowserHandoff(sessionId: string, handoffToken: string) {
  const session = requireHandoffSession(sessionId, handoffToken);
  return closeLiveBrowserSession(session.tenantId, session.id);
}

export async function getLiveBrowserSession(tenantId: string, sessionId: string) {
  const session = requireSession(tenantId, sessionId);
  const title = await session.page.title().catch(() => "");
  return { ...publicSession(session), title };
}

export function getRecordedBrowserActions(tenantId: string, sessionId: string) {
  const session = requireSession(tenantId, sessionId);
  return session.recordedActions.map((action) => ({ ...action }));
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
  if (!paused && session.missionActive) {
    // A human may resume only after the challenge is actually gone.
    assertBrowserPageAccessible(await snapshotBrowserPage(session.page));
  }
  session.paused = paused;
  session.pauseReason = paused ? (session.pauseReason ?? "manual") : null;
  session.revision++;
  if (paused) await session.actionInFlight;
  if (session.closed) throw new Error("Sessão encerrada");
  if (session.missionActive) session.status = paused ? "paused" : "running";
  if (!paused) {
    session.error = null;
    if (session.onSessionPersist) {
      await session.onSessionPersist(await session.page.cookies());
    }
    if (session.onProfilePersist) {
      await session.onProfilePersist(await captureBrowserProfile(session.page));
    }
  }
  session.lastActivityAt = new Date();
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
    | { action: "reload" }
    | { action: "open_tab"; url?: string }
    | { action: "switch_tab"; index: number }
    | { action: "close_tab"; index: number }
    | { action: "upload"; selector: string; fileName: string }
    | { action: "download"; selector: string },
) {
  const session = requireSession(tenantId, sessionId);
  await setLiveBrowserPaused(tenantId, sessionId, true);

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
  } else if (command.action === "open_tab") {
    const page = await session.page.browserContext().newPage();
    if (command.url) {
      await page.goto(validateBrowserUrl(command.url, session.allowedHosts), {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }
    session.page = page;
  } else if (command.action === "switch_tab") {
    const pages = await session.page.browserContext().pages();
    const page = pages[command.index];
    if (!page) throw new Error("Aba não encontrada");
    session.page = page;
    await page.bringToFront();
  } else if (command.action === "close_tab") {
    const pages = await session.page.browserContext().pages();
    const page = pages[command.index];
    if (!page) throw new Error("Aba não encontrada");
    if (pages.length <= 1) throw new Error("Não é possível fechar a única aba da sessão");
    const wasActive = page === session.page;
    await page.close();
    if (wasActive) {
      const remaining = await session.page.browserContext().pages();
      session.page = remaining[Math.max(0, command.index - 1)] ?? remaining[0]!;
      await session.page.bringToFront();
    }
  } else if (command.action === "upload") {
    const uploadRoot = path.resolve(process.env["BROWSER_UPLOAD_DIR"] ?? path.join(os.tmpdir(), "vendorai-uploads"));
    const requested = path.resolve(uploadRoot, command.fileName);
    if (!requested.startsWith(uploadRoot + path.sep)) throw new Error("Arquivo de upload fora do diretório permitido");
    const handle = await session.page.$(command.selector);
    if (!handle) throw new Error("Campo de upload não encontrado");
    await handle.uploadFile(requested);
  } else if (command.action === "download") {
    const downloadDir = path.join(os.tmpdir(), "vendorai-downloads", tenantId, sessionId);
    await mkdir(downloadDir, { recursive: true });
    const client = await session.page.createCDPSession();
    await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
    const before = new Set(await readdir(downloadDir).catch(() => []));
    await session.page.click(command.selector);
    const deadline = Date.now() + 15000;
    let downloaded: string | undefined;
    while (Date.now() < deadline && !downloaded) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const files = await readdir(downloadDir).catch(() => []);
      downloaded = files.find((file) => !before.has(file) && !file.endsWith(".crdownload"));
    }
    await client.detach().catch(() => undefined);
    if (!downloaded) throw new Error("Download não concluído dentro do tempo limite");
    session.steps.push({
      index: session.steps.length + 1,
      action: "download_result",
      url: session.page.url(),
      detail: downloaded,
    });
  }

  session.lastActivityAt = new Date();
  return captureLiveBrowserSession(tenantId, sessionId);
}

export function startLiveBrowserMission(
  tenantId: string,
  sessionId: string,
  goal: string,
  maxSteps = 20,
  startPaused = false,
) {
  const session = requireSession(tenantId, sessionId);
  if (session.missionActive) throw new Error("Já existe uma missão em execução nesta sessão");
  session.goal = goal;
  session.answer = null;
  session.error = startPaused ? "Verificação humana necessária. Resolva a verificação e devolva o controle para o Vendi." : null;
  session.steps = [];
  session.recordedActions = [];
  session.paused = startPaused;
  session.pauseReason = startPaused ? "human_verification" : null;
  session.status = startPaused ? "paused" : "running";
  session.missionActive = true;

  void (async () => {
    try {
      const secretsAvailable = {
        login: Boolean(session.secrets?.login), passcode: Boolean(session.secrets?.passcode),
      };
      let executed = 0;
      let recoveryNote = "";
      while (executed < Math.min(Math.max(maxSteps, 1), 40)) {
        while (session.paused && !session.closed) {
          if (Date.now() - session.lastActivityAt.getTime() > SESSION_TTL_MS) {
            await closeLiveBrowserSession(tenantId, sessionId, true);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (session.closed) return;
        const revision = session.revision;
        const state = await snapshotBrowserPage(session.page);
        try { assertBrowserPageAccessible(state); }
        catch (error: any) {
          session.error = error.message;
          session.paused = true;
          session.pauseReason = "human_verification";
          session.status = "paused";
          continue;
        }
        const planningGoal = recoveryNote
          ? goal + "\nRECUPERAÇÃO DE NAVEGAÇÃO: " + recoveryNote
          : goal;
        recoveryNote = "";
        const action = await planBrowserAction(session.tenantId, planningGoal, state, session.steps, secretsAvailable);
        if (session.closed) return;
        // Discard plans based on the page before the human took control.
        if (session.paused || revision !== session.revision) continue;
        if (action.action === "finish") {
          if (action.outcome === "blocked") {
            session.error = action.answer;
            session.paused = false;
            session.pauseReason = null;
            session.status = "error";
            return;
          }
          if (action.outcome !== "completed") throw new Error(action.answer);
          if (session.onSessionPersist) await session.onSessionPersist(await session.page.cookies());
          if (session.onProfilePersist) await session.onProfilePersist(await captureBrowserProfile(session.page));
          if (session.closed) return;
          session.answer = action.answer;
          session.status = "completed";
          return;
        }
        session.actionInFlight = executeBrowserAction(session.page, action, {
          allowWrite: session.allowWrite, allowedHosts: session.allowedHosts, secrets: session.secrets,
        });
        let extracted: string | undefined;
        try {
          extracted = await session.actionInFlight as string | undefined;
          session.recordedActions.push(action);
        }
        catch (error: any) {
          const kind = classifyBrowserError(error);
          if (kind === "selector_stale" || kind === "detached_frame") {
            recoveryNote =
              "A interface mudou antes da execução. Releia o snapshot atual e escolha um novo seletor estável; não reutilize o seletor anterior.";
            session.steps.push({
              index: executed + 1,
              action: "recover_replan",
              url: state.url,
              detail: kind,
              checkpoint: checkpointFromState(state),
            });
            continue;
          }
          if (kind !== "approval_required") throw error;
          session.error = error.message;
          session.paused = true;
          session.pauseReason = "approval_required";
          session.status = "paused";
          continue;
        } finally { session.actionInFlight = undefined; }
        if (session.closed) return;
        executed++;
        session.steps.push({
          index: executed,
          action: action.action,
          url: state.url,
          detail: action.reason,
          checkpoint: checkpointFromState(state),
        });
        session.lastActivityAt = new Date();
        if (action.action === "extract" && extracted) {
          session.steps.push({ index: executed, action: "extract_result", url: session.page.url(), detail: extracted.slice(0, 500) });
        }
      }
      session.error = "Limite de passos atingido antes de concluir a missão.";
      session.status = "error";
      if (session.onSessionPersist) await session.onSessionPersist(await session.page.cookies());
    } catch (error: any) {
      if (!session.closed) {
        session.error = error?.message ?? "Falha na missão do navegador";
        session.status = "error";
      }
    } finally {
      session.missionActive = false;
      if (!session.closed && session.onMissionResult && (session.status === "completed" || session.status === "error")) {
        await session.onMissionResult({ ok: session.status === "completed", sessionId: session.id,
          finalUrl: session.page.url(), answer: session.answer || session.error || "Missão não concluída", steps: session.steps }).catch(() => undefined);
      }
    }
  })();
  return publicSession(session);
}

export async function closeLiveBrowserSession(tenantId: string, sessionId: string, expired = false) {
  const session = sessions.get(sessionId);
  if (!session || session.tenantId !== tenantId || session.closed) throw new Error("Sessão não encontrada");
  session.closed = true;
  session.status = "closed";

  if (session.onSessionPersist && !expired) {
    await session.onSessionPersist(await session.page.cookies()).catch(() => undefined);
  }
  if (session.onProfilePersist && !expired) {
    await session.onProfilePersist(await captureBrowserProfile(session.page)).catch(() => undefined);
  }

  await session.page.browserContext().close().catch(() => undefined);
  session.browser.disconnect();
  session.releaseBrowser?.(!expired);
  sessions.delete(sessionId);

  return { success: true, id: sessionId };
}


const cleanupTimer = setInterval(() => { void cleanupExpiredSessions(); }, 60_000);
cleanupTimer.unref();
