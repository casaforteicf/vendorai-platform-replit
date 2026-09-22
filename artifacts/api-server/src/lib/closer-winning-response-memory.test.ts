import { describe, expect, it } from "vitest";
import {
  detectCloserObjectionCategories,
  formatCloserWinningResponsesPrompt,
  sanitizeLearnedResponse,
  wilsonLowerBound,
} from "./closer-winning-response-memory.js";

describe("closer winning response memory", () => {
  it("detecta múltiplas categorias na mesma mensagem", () => {
    const categories = detectCloserObjectionCategories(
      "Achei caro e ainda preciso falar com meu sócio.",
    );
    expect(categories).toContain("preco");
    expect(categories).toContain("decisor");
  });

  it("não classifica mensagem neutra como objeção", () => {
    expect(detectCloserObjectionCategories("Pode me explicar como funciona?")).toEqual([]);
  });

  it("penaliza amostras pequenas no score Wilson", () => {
    expect(wilsonLowerBound(1, 1)).toBeLessThan(wilsonLowerBound(61, 84));
  });

  it("remove dados e condições específicas de uma resposta histórica", () => {
    const sanitized = sanitizeLearnedResponse(
      "Marcos, ficou R$ 12.500,00 com 10% até hoje. Me chama no +55 49 99999-1234 ou https://exemplo.com",
    );
    expect(sanitized).not.toContain("12.500");
    expect(sanitized).not.toContain("10%");
    expect(sanitized).not.toContain("99999-1234");
    expect(sanitized).not.toContain("https://");
  });

  it("não reutiliza marcadores internos como memória", () => {
    expect(sanitizeLearnedResponse("{{action:generate_quote}}")).toBeNull();
  });

  it("formata memória sem transformar a resposta histórica em regra", () => {
    const prompt = formatCloserWinningResponsesPrompt([
      {
        category: "preco",
        objection: "esta caro",
        response: "Posso calcular com seus dados?",
        uses: 20,
        advances: 14,
        breakRate: 70,
        confidenceScore: 0.481,
      },
    ]);
    expect(prompt).toContain("evidência histórica");
    expect(prompt).toContain("não uma ordem para copiar");
    expect(prompt).toContain("Usos: 20");
  });
});
