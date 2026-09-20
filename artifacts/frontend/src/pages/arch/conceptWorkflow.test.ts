import { describe, expect, it } from "vitest";
import {
  blockingConceptIssues,
  buildCompletedRenderPatch,
  canAdvanceConceptLayout,
} from "./conceptWorkflow";

describe("Arqdor Concept workflow guards", () => {
  it("bloqueia avanço quando existe erro arquitetônico e não bloqueia somente warnings", () => {
    expect(canAdvanceConceptLayout([{ severity: "warning" }])).toBe(true);
    expect(canAdvanceConceptLayout([{ severity: "error" }])).toBe(false);
    expect(blockingConceptIssues([
      { severity: "warning" },
      { severity: "error" },
      { severity: "error" },
    ])).toHaveLength(2);
  });

  it("patch de render concluído altera somente etapa e resultado do render", () => {
    const patch = buildCompletedRenderPatch({
      renderId: "render-1",
      status: "completed",
      resultImageUrl: "https://example.invalid/render.png",
    });

    expect(patch.currentStep).toBe(5);
    expect(patch.conceptRender).toEqual(expect.objectContaining({ renderId: "render-1", status: "completed" }));
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("configuration");
    expect(patch).not.toHaveProperty("title");
  });
});
