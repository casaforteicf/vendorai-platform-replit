import { describe, expect, it } from "vitest";
import { missionTitleFromObjective, resolveJarvisMissionNaturalIntent } from "./jarvis-mission-natural-intent.js";

describe("Jarvis Mission Engine natural intent", () => {
  it("registra uma missão declarada explicitamente", () => {
    expect(resolveJarvisMissionNaturalIntent("Jarvis, nossa missão é aumentar a conversão em 20% nos próximos 90 dias"))
      .toEqual({ type: "create_mission", objective: "aumentar a conversão em 20% nos próximos 90 dias" });
  });

  it("lista missões em linguagem natural", () => {
    expect(resolveJarvisMissionNaturalIntent("Quais são nossas missões?"))
      .toEqual({ type: "list_missions" });
  });

  it("detecta pausa, retomada e conclusão", () => {
    expect(resolveJarvisMissionNaturalIntent("Pause a missão aumentar conversão"))
      .toEqual({ type: "pause_mission", reference: "aumentar conversão" });
    expect(resolveJarvisMissionNaturalIntent("Retome a missão aumentar conversão"))
      .toEqual({ type: "resume_mission", reference: "aumentar conversão" });
    expect(resolveJarvisMissionNaturalIntent("Conclua a missão aumentar conversão"))
      .toEqual({ type: "complete_mission", reference: "aumentar conversão" });
  });

  it("registra progresso somente quando há referência e nota explícitas", () => {
    expect(resolveJarvisMissionNaturalIntent("Atualize a missão aumentar conversão: fechamos 12 propostas esta semana"))
      .toEqual({ type: "update_mission", reference: "aumentar conversão", note: "fechamos 12 propostas esta semana" });
  });

  it("registra decisão explicitamente declarada", () => {
    expect(resolveJarvisMissionNaturalIntent("Registre a decisão: priorizar Joinville neste trimestre"))
      .toEqual({ type: "record_decision", decision: "priorizar Joinville neste trimestre" });
  });

  it("não intercepta conversa comum sobre missões", () => {
    expect(resolveJarvisMissionNaturalIntent("Você acha que essa missão faz sentido para o negócio?"))
      .toBeNull();
    expect(resolveJarvisMissionNaturalIntent("Quero pensar melhor sobre a decisão"))
      .toBeNull();
  });

  it("gera título compacto sem perder o objetivo persistido", () => {
    const objective = "a".repeat(130);
    expect(missionTitleFromObjective(objective).length).toBeLessThanOrEqual(96);
  });
});
