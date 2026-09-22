import { describe, expect, it } from "vitest";
import {
  buildProspectorOpening,
  defaultProspectorPlaybook,
  detectProspectorStateFromReply,
  evaluateProspectorQualification,
  resolveProspectorPlaybook,
} from "./prospector-consultive.js";

describe("prospector consultive playbook", () => {
  it("selects the construction playbook from construction context", () => {
    const playbook = defaultProspectorPlaybook("Construção civil residencial");
    expect(playbook.identity.offer).toContain("casas de alto padrão");
    expect(playbook.diagnosis.map((q) => q.fieldKey)).toEqual([
      "project_stage",
      "project_or_permit",
      "start_timeline",
      "main_challenge",
      "project_lead",
      "construction_firm_status",
    ]);
  });

  it("never invents an observed signal in the opening", () => {
    const playbook = defaultProspectorPlaybook("Construção civil residencial");
    const message = buildProspectorOpening({
      playbook,
      leadName: "Carlos Silva",
      companyName: "Projeto Carlos",
      metadata: {},
    });
    expect(message).toContain("Posso entender em que estágio");
    expect(message.toLowerCase()).not.toContain("alvará emitido");
    expect(message.toLowerCase()).not.toContain("tapume");
    expect(message.toLowerCase()).not.toContain("movimentação de terra");
  });

  it("uses verified public evidence when it exists", () => {
    const playbook = defaultProspectorPlaybook("Construção civil residencial");
    const message = buildProspectorOpening({
      playbook,
      leadName: "Carlos Silva",
      companyName: "Projeto Carlos",
      metadata: {
        coldProspectDossier: {
          evidence: [{
            label: "Alvará residencial publicado",
            value: "Processo 123",
            source: "prefeitura",
            confidence: "high",
          }],
        },
      },
    });
    expect(message).toContain("Alvará residencial publicado");
    expect(message).toContain("Processo 123");
  });

  it("only confirms state after an explicit positive reply to the right question", () => {
    const confirmed = detectProspectorStateFromReply({
      incomingMessage: "Sim, é isso mesmo.",
      previousAgentMessage: "Então o projeto começa em novembro e falta definir a construtora. É isso mesmo?",
      existingDiscoveryData: {},
    });
    expect(confirmed.contextConfirmed).toBe(true);
    expect(confirmed.nextStepAccepted).toBe(false);

    const accepted = detectProspectorStateFromReply({
      incomingMessage: "Pode ser",
      previousAgentMessage: "Posso organizar uma reunião técnica de 20 min com nosso engenheiro?",
      existingDiscoveryData: { prospector_context_confirmed: true },
    });
    expect(accepted.contextConfirmed).toBe(true);
    expect(accepted.nextStepAccepted).toBe(true);
  });

  it("requires all configured diagnosis fields, confirmation and next-step acceptance for SQL", () => {
    const playbook = resolveProspectorPlaybook(undefined, "Construção civil residencial");
    const complete = Object.fromEntries(playbook.diagnosis.map((q) => [q.fieldKey, "respondido"]));

    const beforeAcceptance = evaluateProspectorQualification({
      playbook,
      hasTerrainSignal: true,
      discoveryData: {
        ...complete,
        prospector_context_confirmed: true,
      },
    });
    expect(beforeAcceptance.diagnosticsComplete).toBe(true);
    expect(beforeAcceptance.qualified).toBe(false);

    const qualified = evaluateProspectorQualification({
      playbook,
      hasTerrainSignal: true,
      discoveryData: {
        ...complete,
        prospector_context_confirmed: true,
        prospector_next_step_accepted: true,
      },
    });
    expect(qualified.qualified).toBe(true);
  });
});
