import { describe, expect, it } from "vitest";
import { classifyBackendDrift, isBackendRelevantPath } from "./dev-agent-deploy-relevance";

describe("dev-agent deploy relevance", () => {
  it("ignora mudanças de Android, frontend, website e workflows", () => {
    expect(isBackendRelevantPath("Dockerfile.android-apk")).toBe(false);
    expect(isBackendRelevantPath(".github/workflows/vendorai-android-native-apk.yml")).toBe(false);
    expect(isBackendRelevantPath("artifacts/mobile/app.json")).toBe(false);
    expect(isBackendRelevantPath("artifacts/frontend/src/App.tsx")).toBe(false);
    expect(isBackendRelevantPath("artifacts/website/src/App.tsx")).toBe(false);
  });

  it("marca API, banco e dependências raiz como relevantes", () => {
    expect(isBackendRelevantPath("artifacts/api-server/src/index.ts")).toBe(true);
    expect(isBackendRelevantPath("lib/db/migrations/224_content_calendar_schedule_time.sql")).toBe(true);
    expect(isBackendRelevantPath("lib/db/src/schema/content_calendar_items.ts")).toBe(true);
    expect(isBackendRelevantPath("pnpm-lock.yaml")).toBe(true);
  });

  it("não gera falso stale quando só superfícies não backend avançaram", () => {
    expect(classifyBackendDrift([
      "Dockerfile.android-apk",
      ".github/workflows/vendorai-android-native-apk.yml",
    ])).toMatchObject({ backendRelevant: false, relevantFiles: [] });
  });

  it("detecta drift real quando ao menos um arquivo do backend mudou", () => {
    const result = classifyBackendDrift([
      "Dockerfile.android-apk",
      "artifacts/api-server/src/services/content-calendar.ts",
    ]);
    expect(result.backendRelevant).toBe(true);
    expect(result.relevantFiles).toContain("artifacts/api-server/src/services/content-calendar.ts");
  });
});
