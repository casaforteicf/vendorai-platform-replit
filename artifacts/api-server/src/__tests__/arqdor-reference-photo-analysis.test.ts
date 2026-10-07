  it("preserves a terrain classification and scene editing hints", () => {
    const result = normalizeReferencePhotoAnalysis({
      kind: "terrain",
      confidence: 0.91,
      summary: "Terreno frontal com vegetação.",
      perspective: "frontal",
      needsScaleAnchor: true,
      suggestedAnchor: "largura do portão",
      detectedElements: ["vegetação", "muro", "acesso"],
      preserveElements: ["muro lateral"],
      removableElements: ["vegetação"],
      projectHints: ["preservar acesso existente"],
    }, "test-model");
    expect(result.kind).toBe("terrain");
    expect(result.confidence).toBe(0.91);
    expect(result.needsScaleAnchor).toBe(true);
    expect(result.removableElements).toContain("vegetação");
    expect(result.sourceModel).toBe("test-model");
  });
  it("falls back safely for malformed classifications", () => {
    const result = normalizeReferencePhotoAnalysis({
      kind: "something_else",
      confidence: 5,
      perspective: "sideways",
      detectedElements: "not-an-array",
    }, "test-model");
    expect(result.kind).toBe("unknown");
    expect(result.confidence).toBe(1);
    expect(result.perspective).toBe("unknown");
    expect(result.detectedElements).toEqual([]);
  });
});
import { describe, expect, it } from "vitest";
import { normalizeReferencePhotoAnalysis } from "../lib/arqdor-reference-photo-analysis.js";

describe("normalizeReferencePhotoAnalysis", () => {
  it("preserves a terrain classification and scene editing hints", () => {
    const result = normalizeReferencePhotoAnalysis({
      kind: "terrain",
      confidence: 0.91,
      summary: "Terreno frontal com vegetação.",
      perspective: "frontal",
      needsScaleAnchor: true,
      suggestedAnchor: "largura do portão",
      detectedElements: ["vegetação", "muro", "acesso"],
      preserveElements: ["muro lateral"],
      removableElements: ["vegetação"],
      projectHints: ["preservar acesso existente"],
    }, "test-model");

    expect(result.kind).toBe("terrain");
    expect(result.confidence).toBe(0.91);
    expect(result.needsScaleAnchor).toBe(true);
    expect(result.removableElements).toContain("vegetação");
    expect(result.sourceModel).toBe("test-model");
  });

  it("falls back safely for malformed classifications", () => {
    const result = normalizeReferencePhotoAnalysis({
      kind: "something_else",
      confidence: 5,
      perspective: "sideways",
      detectedElements: "not-an-array",
    }, "test-model");

    expect(result.kind).toBe("unknown");
    expect(result.confidence).toBe(1);
    expect(result.perspective).toBe("unknown");
    expect(result.detectedElements).toEqual([]);
  });
});
