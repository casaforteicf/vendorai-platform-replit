import { describe, expect, it } from "vitest";
import {
  conceptStepCta,
  nextConceptStep,
  normalizeConceptStep,
  previousConceptStep,
} from "./conceptNavigation";

describe("Arqdor Concept navigation regression", () => {
  it("reabre um Concept salvo na Fachada sem voltar para o editor", () => {
    expect(normalizeConceptStep(5, 6)).toBe(5);
    expect(normalizeConceptStep(6, 6)).toBe(6);
    expect(normalizeConceptStep(4, 6)).toBe(4);
  });

  it("mantém a sequência principal Editor → Fachada → Resultado", () => {
    expect(nextConceptStep(4)).toBe(5);
    expect(nextConceptStep(5)).toBe(6);
  });

  it("mantém a sequência de retorno Resultado → Fachada → Editor", () => {
    expect(previousConceptStep(6)).toBe(5);
    expect(previousConceptStep(5)).toBe(4);
  });

  it("mantém as etapas iniciais compatíveis com o fluxo existente", () => {
    expect(nextConceptStep(0)).toBe(1);
    expect(nextConceptStep(1)).toBe(4);
    expect(previousConceptStep(4)).toBe(1);
  });

  it("expõe CTAs coerentes com cada transição", () => {
    expect(conceptStepCta(1)).toBe("Abrir editor");
    expect(conceptStepCta(4)).toBe("Ir para fachada");
    expect(conceptStepCta(5)).toBe("Ver resultado");
  });
});
