import { describe, expect, it } from "vitest";
import { resolveJarvisOrchestration } from "./jarvis-action-orchestrator.js";

describe("resolveJarvisOrchestration", () => {
  it("mantém análise sem executar por inferência", () => {
    const result = resolveJarvisOrchestration("Analise nossa prospecção e diga o que você faria");
    expect(result.route).toBe("analysis");
    expect(result.explicitAction).toBe(false);
    expect(result.preferredAgent).toBe("sdr");
  });

  it("roteia aprovação explícita antes do LLM", () => {
    const result = resolveJarvisOrchestration("Aprova o desconto dessa proposta");
    expect(result.route).toBe("approval");
    expect(result.explicitAction).toBe(true);
    expect(result.preferredAgent).toBe("closer");
  });

  it("roteia execução somente quando há comando e alvo operacional", () => {
    expect(resolveJarvisOrchestration("Execute a tarefa aprovada").route).toBe("execution");
    expect(resolveJarvisOrchestration("Como funciona a execução de tarefas?").route).not.toBe("execution");
  });

  it("roteia missão explícita sem confundir conversa sobre missões", () => {
    expect(resolveJarvisOrchestration("Crie uma missão para aumentar a conversão em 20%").route).toBe("mission");
    expect(resolveJarvisOrchestration("Como estão nossas missões?").route).not.toBe("mission");
  });

  it("roteia plano de ação explícito", () => {
    const result = resolveJarvisOrchestration("Monte um plano de ação para recuperar leads inativos");
    expect(result.route).toBe("action_plan");
    expect(result.explicitAction).toBe(true);
    expect(result.preferredAgent).toBe("reactivation");
  });

  it("roteia ação externa e escolhe executor quando possível", () => {
    const result = resolveJarvisOrchestration("Agende uma reunião com este cliente amanhã");
    expect(result.route).toBe("external_action");
    expect(result.explicitAction).toBe(true);
    expect(result.preferredAgent).toBe("scheduler");
  });

  it("identifica agente especializado sem transformar assunto em execução", () => {
    const result = resolveJarvisOrchestration("Precisamos melhorar a cobrança de pagamentos atrasados");
    expect(result.route).toBe("specialist_agent");
    expect(result.explicitAction).toBe(false);
    expect(result.preferredAgent).toBe("cobranca");
  });

  it("mantém conversa geral fora do fluxo operacional", () => {
    const result = resolveJarvisOrchestration("Bom dia, Jarvis");
    expect(result.route).toBe("conversation");
    expect(result.explicitAction).toBe(false);
    expect(result.preferredAgent).toBeNull();
  });
});
