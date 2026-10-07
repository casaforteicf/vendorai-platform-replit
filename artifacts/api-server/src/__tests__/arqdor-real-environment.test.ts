import { describe, expect, it } from "vitest";
import { interventionPromptContext, normalizeRealEnvironment } from "../lib/arqdor-real-environment.js";

describe("Arqdor real environment", () => {
  it("normaliza leitura e nao inventa remocao", () => {
    const result = normalizeRealEnvironment({
      kind: "terreno",
      confidence: 0.91,
      elements: [
        { label: "Arvore", category: "vegetacao", confidence: 0.8, bbox: { x: .1, y: .2, width: .2, height: .4 }, suggestedAction: "preserve" },
        { label: "Muro", category: "muro", confidence: .6, bbox: { x: .4, y: .5, width: .4, height: .1 }, suggestedAction: "delete" },
      ],
    }, { requestedKind: "auto", useMode: "existing", sourceModel: "test" });
    expect(result.kind).toBe("terreno");
    expect(result.elements[0].action).toBe("preserve");
    expect(result.elements[1].action).toBe("review");
  });

  it("gera contexto de intervencao apenas com acao confirmada", () => {
    const env = normalizeRealEnvironment({
      kind: "cozinha",
      elements: [
        { label: "Janela", category: "abertura", suggestedAction: "preserve", bbox: {} },
        { label: "Armario antigo", category: "marcenaria", suggestedAction: "preserve", bbox: {} },
      ],
    }, { requestedKind: "cozinha", useMode: "modify", sourceModel: "test" });
    env.elements[1].action = "remove";
    const prompt = interventionPromptContext(env);
    expect(prompt).toContain("Janela");
    expect(prompt).toContain("Armario antigo");
    expect(prompt).toContain("Never invent demolition");
  });
});
