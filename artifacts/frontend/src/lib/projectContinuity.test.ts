import { describe, expect, it } from "vitest";
import { availableProjectCapabilities, evaluateOfflineUpload, type ProjectContinuity } from "./projectContinuity";

const project: ProjectContinuity = {
  projectId: "p1", revision: "rev-3", contextId: "project:p1",
  capabilities: ["preproject", "studio_2d", "studio_3d", "local_render_preview", "ai_render", "marketplace", "messages", "execution"],
};

describe("UI-01.8 project continuity", () => {
  it("keeps mobile limited to lighter experiences", () => {
    expect(availableProjectCapabilities(project, "mobile", "online"))
      .toEqual(["preproject", "marketplace", "messages", "execution"]);
  });
  it("does not offer cloud services offline", () => {
    expect(availableProjectCapabilities(project, "desktop", "offline"))
      .toEqual(["preproject", "studio_2d", "studio_3d", "local_render_preview"]);
    expect(availableProjectCapabilities(project, "mobile", "offline"))
      .toEqual(["preproject"]);
  });
  it("preserves server revision authority for offline changes", () => {
    expect(evaluateOfflineUpload({
      operationId: "op1", projectId: "p1", baseRevision: "rev-3", kind: "geometry",
    }, project)).toBe("eligible");
    expect(evaluateOfflineUpload({
      operationId: "op2", projectId: "p1", baseRevision: "rev-2", kind: "material",
    }, project)).toBe("conflict");
    expect(evaluateOfflineUpload({
      operationId: "op3", projectId: "p2", baseRevision: "rev-3", kind: "annotation",
    }, project)).toBe("denied");
  });
});
