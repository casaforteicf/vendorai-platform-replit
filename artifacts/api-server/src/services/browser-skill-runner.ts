import type { BrowserAgentInput, PlannedAction } from "./browser-agent.js";
import {
  checkpointFromState,
  executeBrowserAction,
  planBrowserAction,
  snapshotBrowserPage,
  validateBrowserUrl,
} from "./browser-agent.js";
import { acquireBrowserLease } from "./browser-fleet.js";
import {
  captureBrowserProfile,
  restoreBrowserProfileAfterNavigation,
  restoreBrowserProfileBeforeNavigation,
} from "./browser-profile.js";
import { actionShouldChangePage, verifyCheckpointTransition } from "./browser-verifier.js";

type ReplayStep = {
  index: number;
  action: string;
  url: string;
  verified: boolean;
  repaired?: boolean;
  detail?: string;
};

async function verifyFieldAction(page: any, action: PlannedAction) {
  if (!("selector" in action)) return true;
  if (action.action === "type") {
    return page.$eval(action.selector, (el: any) => String(el.value ?? "")).then((value: string) => value === action.text).catch(() => false);
  }
  if (action.action === "select") {
    return page.$eval(action.selector, (el: any) => String(el.value ?? "")).then((value: string) => value === action.value).catch(() => false);
  }
  if (action.action === "secret") {
    return page.$eval(action.selector, (el: any) => String(el.value ?? "").length > 0).catch(() => false);
  }
  return true;
}

function repairSelector(original: PlannedAction, suggested: PlannedAction): PlannedAction | null {
  if (!("selector" in original) || !("selector" in suggested)) return null;
  if (original.action !== suggested.action) return null;
  if (original.action === "type" && suggested.action === "type") return { ...original, selector: suggested.selector };
  if (original.action === "select" && suggested.action === "select") return { ...original, selector: suggested.selector };
  if (original.action === "secret" && suggested.action === "secret") return { ...original, selector: suggested.selector };
  if (original.action === "click" && suggested.action === "click") return { ...original, selector: suggested.selector };
  if (original.action === "extract" && suggested.action === "extract") return { ...original, selector: suggested.selector };
  return null;
}

export async function runBrowserSkill(input: BrowserAgentInput & {
  actions: PlannedAction[];
  allowSelfHeal?: boolean;
}) {
  const lease = await acquireBrowserLease();
  const context = await lease.browser.createBrowserContext();
  const page = await context.newPage();
  let healthy = true;
  const steps: ReplayStep[] = [];
  const repairedActions = input.actions.map((action) => ({ ...action })) as PlannedAction[];
  let repairs = 0;

  try {
    if (input.sessionCookies?.length) {
      await page.setCookie(...input.sessionCookies).catch(() => undefined);
    }
    await restoreBrowserProfileBeforeNavigation(page, input.sessionProfile);
    await page.goto(validateBrowserUrl(input.startUrl, input.allowedHosts), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (await restoreBrowserProfileAfterNavigation(page, input.sessionProfile)) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    }

    for (let index = 0; index < repairedActions.length; index++) {
      let action = repairedActions[index]!;
      if (action.action === "finish") continue;
      let repaired = false;

      for (let attempt = 0; attempt < 2; attempt++) {
        const beforeState = await snapshotBrowserPage(page);
        const before = checkpointFromState(beforeState);
        try {
          const extracted = await executeBrowserAction(page, action, input);
          const afterState = await snapshotBrowserPage(page);
          const after = checkpointFromState(afterState);
          const transition = verifyCheckpointTransition(before, after);
          const visibleVerified = !actionShouldChangePage(action.action) || transition.changed;
          const fieldVerified = await verifyFieldAction(page, action);
          const verified = visibleVerified && fieldVerified;

          if (!verified) throw new Error("SKILL_ACTION_NO_EFFECT");

          steps.push({
            index: index + 1,
            action: action.action,
            url: after.url,
            verified: true,
            repaired,
            detail: action.action === "extract" ? extracted?.slice(0, 500) : undefined,
          });
          break;
        } catch (error: any) {
          if (!input.allowSelfHeal || attempt > 0 || !("selector" in action)) {
            throw new Error(`SKILL_VERIFICATION_FAILED:${index + 1}:${action.action}:${error?.message ?? "unknown"}`);
          }

          const current = await snapshotBrowserPage(page);
          const suggested = await planBrowserAction(
            input.tenantId,
            [
              "Repare somente o seletor de uma Web Skill quebrada.",
              "Mantenha exatamente a mesma intenção e o mesmo tipo de ação.",
              "Ação original: " + JSON.stringify(action),
              "Escolha um selector existente em page.interactive[].selector.",
            ].join("\n"),
            current,
            [],
            {
              login: Boolean(input.secrets?.login),
              passcode: Boolean(input.secrets?.passcode),
            },
          );

          const healed = repairSelector(action, suggested);
          if (!healed) {
            throw new Error(`SKILL_SELF_HEAL_FAILED:${index + 1}:${action.action}`);
          }
          action = healed;
          repairedActions[index] = healed;
          repaired = true;
          repairs++;
        }
      }
    }

    if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
    if (input.onProfilePersist) await input.onProfilePersist(await captureBrowserProfile(page));

    return {
      ok: true,
      finalUrl: page.url(),
      steps,
      repairs,
      repairedActions,
    };
  } catch (error) {
    healthy = false;
    throw error;
  } finally {
    await context.close().catch(() => undefined);
    lease.browser.disconnect();
    lease.release(healthy);
  }
}
