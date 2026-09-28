import { describe, expect, it } from "vitest";
import { CONCEPT_JOURNEY, conceptJourneyContinueLabel, conceptJourneyIndex } from "./conceptJourney";

describe("conceptJourney", () => {
  it("tem 5 etapas na ordem do usuário", () => {
    expect(CONCEPT_JOURNEY.map((stage) => stage.label)).toEqual(["Terreno", "Casa", "Ajustes", "Fachada", "Enviar"]);
  });

  it("mapeia abas e visões para a etapa certa", () => {
    expect(conceptJourneyIndex({ step: 4, editorView: "plan", libraryTab: "site" })).toBe(0);
    expect(conceptJourneyIndex({ step: 4, editorView: "plan", libraryTab: "brief" })).toBe(1);
    expect(conceptJourneyIndex({ step: 4, editorView: "plan", libraryTab: "models" })).toBe(1);
    expect(conceptJourneyIndex({ step: 4, editorView: "plan", libraryTab: "placement" })).toBe(2);
    expect(conceptJourneyIndex({ step: 4, editorView: "plan", libraryTab: "rooms" })).toBe(2);
    expect(conceptJourneyIndex({ step: 4, editorView: "plan", libraryTab: "build" })).toBe(2);
    expect(conceptJourneyIndex({ step: 4, editorView: "model3d", libraryTab: "site" })).toBe(2);
    expect(conceptJourneyIndex({ step: 4, editorView: "render", libraryTab: "site" })).toBe(3);
    expect(conceptJourneyIndex({ step: 6, editorView: "plan", libraryTab: "site" })).toBe(4);
  });

  it("não oferece continuar na última etapa", () => {
    expect(conceptJourneyContinueLabel(0)).toBe("Continuar: Casa");
    expect(conceptJourneyContinueLabel(3)).toBe("Revisar e enviar");
    expect(conceptJourneyContinueLabel(4)).toBeNull();
  });
});
