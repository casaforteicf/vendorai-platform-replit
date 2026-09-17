import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

function expectInOrder(text: string, markers: string[]) {
  let cursor = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    expect(index, `missing marker: ${marker}`).toBeGreaterThan(-1);
    expect(index, `out-of-order marker: ${marker}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

describe("JARVIS /support/chat interception contract", () => {
  it("keeps the top-level interceptors before the final support router", () => {
    const index = source("./index.ts");
    expectInOrder(index, [
      "router.use(jarvisEmailActionsRouter)",
      "router.use(jarvisExternalActionsRouter)",
      "router.use(agentTasksRouter)",
      "router.use(agentsRouter)",
      "router.use(jarvisNaturalActionsRouter)",
      "router.use(jarvisActionPlansRouter)",
      "router.use(jarvisMissionsRouter)",
      "router.use(supportRouter)",
    ]);
  });

  it("keeps fast-live and device actions ahead of email actions", () => {
    const email = source("./jarvis_email_actions.ts");
    expectInOrder(email, [
      "router.use(jarvisFastLiveCapabilitiesRouter)",
      "router.use(jarvisDeviceActionsRouter)",
      'router.post("/support/chat"',
    ]);
  });

  it("keeps presence inside missions before mission chat handling", () => {
    const missions = source("./jarvis_missions.ts");
    expectInOrder(missions, [
      "router.use(jarvisPresenceRouter)",
      'router.post("/support/chat"',
    ]);
  });
});
