import type { BrowserAgentInput, PlannedAction } from "./browser-agent.js";
import {
  checkpointFromState,
  executeBrowserAction,
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

export async function runBrowserSkill(input: BrowserAgentInput & {
  actions: PlannedAction[];
}) {
  const lease = await acquireBrowserLease();
  const context = await lease.browser.createBrowserContext();
  const page = await context.newPage();
  let healthy = true;
  const steps: Array<{
    index: number;
    action: string;
    url: string;
    verified: boolean;
    detail?: string;
  }> = [];

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

    for (let index = 0; index < input.actions.length; index++) {
      const action = input.actions[index]!;
      if (action.action === "finish") continue;
      const before = checkpointFromState(await snapshotBrowserPage(page));
      const extracted = await executeBrowserAction(page, action, input);
      const after = checkpointFromState(await snapshotBrowserPage(page));
      const verification = verifyCheckpointTransition(before, after);
      const requiresChange = actionShouldChangePage(action.action);
      const verified = !requiresChange || verification.changed;
      steps.push({
        index: index + 1,
        action: action.action,
        url: after.url,
        verified,
        detail: action.action === "extract" ? extracted?.slice(0, 500) : undefined,
      });
      if (!verified) {
        throw new Error(`SKILL_VERIFICATION_FAILED:${index + 1}:${action.action}`);
      }
    }

    if (input.onSessionPersist) await input.onSessionPersist(await page.cookies());
    if (input.onProfilePersist) await input.onProfilePersist(await captureBrowserProfile(page));

    return {
      ok: true,
      finalUrl: page.url(),
      steps,
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
