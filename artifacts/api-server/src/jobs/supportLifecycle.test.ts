import { describe, expect, it } from "vitest";
import { getSupportLifecyclePolicy } from "./supportLifecycle.js";

describe("support lifecycle policy", () => {
  it("acompanha todas as etapas abertas de suporte", () => {
    for (const stage of [
      "chamado_cliente",
      "agendamento_assistencia",
      "execucao_assistencia",
      "relatorio_assistencia",
      "feedback_cliente",
    ]) {
      expect(getSupportLifecyclePolicy(stage)).not.toBeNull();
    }
  });

  it("cobra o responsável mais cedo no chamado inicial", () => {
    expect(getSupportLifecyclePolicy("chamado_cliente")?.ownerReminderAfterHours).toBe(2);
  });

  it("não encerra feedback automaticamente", () => {
    expect(getSupportLifecyclePolicy("feedback_cliente")?.customerFollowupAfterHours).toBeNull();
  });

  it("ignora etapa terminal", () => {
    expect(getSupportLifecyclePolicy("fechamento_assistencia")).toBeNull();
  });
});
