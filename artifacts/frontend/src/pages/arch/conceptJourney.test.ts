import { describe, expect, it } from "vitest";
import {
  CONCEPT_JOURNEY,
  buildConceptJourney,
  conceptJourneyContinueLabel,
  conceptJourneyIndex,
} from "./conceptJourney";

describe("conceptJourney", () => {
  it("mantém a jornada residencial legada compatível", () => {
    expect(CONCEPT_JOURNEY.map((stage) => stage.label)).toEqual(["Terreno", "Projeto", "Ajustes", "Fachada", "Enviar"]);
  });

  it("cria jornada real para ambiente sem terreno e sem fachada", () => {
    const stages = buildConceptJourney({ scope: "room", terrainDefined: false });
    expect(stages.map((stage) => stage.label)).toEqual([
      "Briefing",
      "Layout",
      "Materiais e mobiliário",
      "Render",
      "Apresentar",
    ]);
    expect(stages.some((stage) => stage.id === "terrain")).toBe(false);
    expect(stages.some((stage) => stage.id === "visual")).toBe(false);
  });

  it("cria jornada de casa sem terreno sem inventar lote", () => {
    const stages = buildConceptJourney({ scope: "house", terrainDefined: false });
    expect(stages.map((stage) => stage.label)).toEqual([
      "Briefing",
      "Planta",
      "Ajustes",
      "Visual",
      "Apresentar",
    ]);
    expect(stages.some((stage) => stage.id === "terrain")).toBe(false);
  });

  it("mantém terreno como primeira etapa somente quando ele foi definido", () => {
    const stages = buildConceptJourney({ scope: "house", terrainDefined: true });
    expect(stages[0].id).toBe("terrain");
    expect(stages[0].label).toBe("Terreno");
  });

  it("mapeia a jornada de ambiente sem cair em fachada", () => {
    expect(conceptJourneyIndex({
      step: 4,
      editorView: "plan",
      libraryTab: "brief",
      scope: "room",
      terrainDefined: false,
    })).toBe(0);
    expect(conceptJourneyIndex({
      step: 4,
      editorView: "plan",
      libraryTab: "build",
      scope: "room",
      terrainDefined: false,
    })).toBe(1);
    expect(conceptJourneyIndex({
      step: 4,
      editorView: "plan",
      libraryTab: "materials",
      scope: "room",
      terrainDefined: false,
    })).toBe(2);
    expect(conceptJourneyIndex({
      step: 4,
      editorView: "model3d",
      libraryTab: "materials",
      scope: "room",
      terrainDefined: false,
    })).toBe(3);
  });

  it("mapeia abas e visões residenciais legadas para a etapa certa", () => {
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

  it("gera CTA a partir da jornada adaptativa", () => {
    const roomStages = buildConceptJourney({ scope: "room", terrainDefined: false });
    expect(conceptJourneyContinueLabel(0, roomStages)).toBe("Continuar: Layout");
    expect(conceptJourneyContinueLabel(3, roomStages)).toBe("Revisar e apresentar");
    expect(conceptJourneyContinueLabel(4, roomStages)).toBeNull();
  });
});
