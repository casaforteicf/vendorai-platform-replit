import { describe, expect, it } from "vitest";
import { buildJarvisExecutiveReasoningContext, resolveJarvisExecutiveIntent } from "./jarvis-executive-reasoning.js";

describe("Jarvis Executive Reasoning", () => {
  it("detects broad business status requests", () => {
    expect(resolveJarvisExecutiveIntent("Jarvis, como estamos no negócio hoje?")).toBe("business_status");
  });

  it("detects client 360 context requests", () => {
    expect(resolveJarvisExecutiveIntent("O que preciso saber sobre este cliente?")).toBe("client_context");
  });

  it("detects blind spot requests", () => {
    expect(resolveJarvisExecutiveIntent("O que eu não estou vendo aqui?")).toBe("blind_spots");
  });

  it("detects executive decision support", () => {
    expect(resolveJarvisExecutiveIntent("Qual o melhor caminho e o que você faria?")).toBe("decision_support");
  });

  it("emits a response contract without exposing chain of thought", () => {
    const context = buildJarvisExecutiveReasoningContext("O que devo fazer primeiro?");
    expect(context).toContain("Executive Reasoning Engine");
    expect(context).toContain("próxima ação");
    expect(context).toContain("Não exponha raciocínio interno passo a passo");
  });
});
