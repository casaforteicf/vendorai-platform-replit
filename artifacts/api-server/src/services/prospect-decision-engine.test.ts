import { describe, expect, it } from "vitest";
import { decideProspectNextAction, recommendProspectSolution } from "./prospect-decision-engine.js";

describe("prospect decision engine", () => {
  it("does not sell before mapping a useful contact", () => {
    const result = decideProspectNextAction({
      stage: "analisado",
      vendoraiFitScore: 80,
      arqdorFitScore: 90,
      qualification: {},
      opportunitySummary: null,
    });
    expect(result.currentObjective).toContain("primeiro interlocutor");
    expect(result.nextBestAction.toLowerCase()).toContain("descobrir");
  });

  it("treats a gatekeeper as path to the responsible person", () => {
    const result = decideProspectNextAction({
      stage: "em_contato",
      vendoraiFitScore: 70,
      arqdorFitScore: 70,
      qualification: {
        facts: [{
          key: "contact_role",
          value: "gatekeeper",
          confidence: 100,
          source: "conversation",
          confirmed: true,
        }],
      },
      opportunitySummary: null,
    });
    expect(result.currentObjective).toContain("responsável");
    expect(result.stage).toBe("em_contato");
  });

  it("keeps inferred pain from becoming an opportunity", () => {
    const result = decideProspectNextAction({
      stage: "em_contato",
      vendoraiFitScore: 50,
      arqdorFitScore: 90,
      qualification: {
        inferredPains: ["levantamento manual"],
        project: { recebeProjetos: true, formatosProjetos: ["PDF"] },
        facts: [{
          key: "responsible_identified",
          value: true,
          confidence: 100,
          source: "conversation",
          confirmed: true,
        }],
      },
      opportunitySummary: null,
    });
    expect(result.stage).toBe("conta_mapeada");
    expect(result.currentObjective).toContain("confirmar uma dor");
  });

  it("uses Arqdor as hook when project pain is confirmed and Arqdor fit is higher", () => {
    const result = decideProspectNextAction({
      stage: "conta_mapeada",
      vendoraiFitScore: 70,
      arqdorFitScore: 95,
      qualification: {
        confirmedPains: ["demora no levantamento de projetos"],
        project: { recebeProjetos: true, formatosProjetos: ["PDF"] },
        facts: [{
          key: "responsible_identified",
          value: true,
          confidence: 100,
          source: "conversation",
          confirmed: true,
        }],
      },
      opportunitySummary: "Orçamentos acumulam quando chegam muitos PDFs.",
    });
    expect(result.stage).toBe("oportunidade_identificada");
    expect(result.primaryHook).toBe("arqdor");
    expect(result.nextBestAction).toContain("Arqdor");
  });

  it("can recommend both products while preserving a primary hook", () => {
    const result = recommendProspectSolution(88, 92, {
      confirmedPains: ["retrabalho entre comercial e orçamento"],
    });
    expect(result.recommendedSolution).toBe("vendorai_arqdor");
    expect(result.primaryHook).toBe("arqdor");
  });

  it("stops all outreach after opt-out", () => {
    const result = decideProspectNextAction({
      stage: "nao_contatar",
      vendoraiFitScore: 100,
      arqdorFitScore: 100,
      qualification: { confirmedPains: ["qualquer"] },
      opportunitySummary: null,
    });
    expect(result.stage).toBe("nao_contatar");
    expect(result.nextBestAction).toBe("Não realizar novos contatos");
  });
});
