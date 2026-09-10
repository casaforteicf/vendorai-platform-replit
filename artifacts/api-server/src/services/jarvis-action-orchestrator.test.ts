import { describe, expect, it } from "vitest";
import { ownsJarvisOrchestrationRoute, resolveJarvisOrchestration } from "./jarvis-action-orchestrator.js";

describe("resolveJarvisOrchestration", () => {
  it("mantém análise sem executar por inferência", () => {
    const result = resolveJarvisOrchestration("Analise nossa prospecção e diga o que você faria");
    expect(result.route).toBe("analysis");
    expect(result.owner).toBe("support");
    expect(result.explicitAction).toBe(false);
    expect(result.preferredAgent).toBe("sdr");
  });

  it("roteia aprovação explícita ao router de ações naturais", () => {
    const result = resolveJarvisOrchestration("Aprova o desconto dessa proposta");
    expect(result.route).toBe("approval");
    expect(result.owner).toBe("natural_actions");
    expect(result.explicitAction).toBe(true);
    expect(result.preferredAgent).toBe("closer");
  });

  it("preserva confirmações e comandos curtos já suportados", () => {
    expect(resolveJarvisOrchestration("Confirmo")).toMatchObject({ route: "approval", owner: "natural_actions", explicitAction: true });
    expect(resolveJarvisOrchestration("Executa")).toMatchObject({ route: "execution", owner: "natural_actions", explicitAction: true });
  });

  it("roteia execução somente quando há comando explícito", () => {
    const execution = resolveJarvisOrchestration("Execute a tarefa aprovada");
    expect(execution.route).toBe("execution");
    expect(execution.owner).toBe("natural_actions");
    expect(resolveJarvisOrchestration("Como funciona a execução de tarefas?").route).not.toBe("execution");
  });

  it("separa comandos de Missão de consultas de estado", () => {
    const create = resolveJarvisOrchestration("Crie uma missão para aumentar a conversão em 20%");
    const declared = resolveJarvisOrchestration("Jarvis, nossa missão é aumentar a conversão em 20% nos próximos 90 dias");
    const status = resolveJarvisOrchestration("Como estão nossas missões?");
    expect(create).toMatchObject({ route: "mission", owner: "missions", explicitAction: true });
    expect(declared).toMatchObject({ route: "mission", owner: "missions", explicitAction: true });
    expect(status).toMatchObject({ route: "mission", owner: "missions", explicitAction: false });
  });

  it("roteia registro e consulta de decisões ao Mission Engine", () => {
    const record = resolveJarvisOrchestration("Registre a decisão: priorizar Joinville neste trimestre");
    const declared = resolveJarvisOrchestration("Nossa decisão foi priorizar Joinville neste trimestre");
    const list = resolveJarvisOrchestration("Quais decisões ainda precisam de revisão?");
    expect(record).toMatchObject({ route: "decision", owner: "missions", explicitAction: true });
    expect(declared).toMatchObject({ route: "decision", owner: "missions", explicitAction: true });
    expect(list).toMatchObject({ route: "decision", owner: "missions", explicitAction: false });
  });

  it("roteia plano de ação explícito e consulta de andamento ao mesmo proprietário", () => {
    const create = resolveJarvisOrchestration("Monte um plano de ação para recuperar leads inativos");
    const status = resolveJarvisOrchestration("Qual o andamento dos nossos planos de ação?");
    expect(create.route).toBe("action_plan");
    expect(create.owner).toBe("action_plans");
    expect(create.explicitAction).toBe(true);
    expect(create.preferredAgent).toBe("reactivation");
    expect(status).toMatchObject({ route: "action_plan", owner: "action_plans", explicitAction: false });
  });

  it("roteia ação externa e escolhe executor quando possível", () => {
    const result = resolveJarvisOrchestration("Agende uma reunião com este cliente amanhã");
    expect(result.route).toBe("external_action");
    expect(result.owner).toBe("support");
    expect(result.explicitAction).toBe(true);
    expect(result.preferredAgent).toBe("scheduler");
  });

  it("identifica agente especializado sem transformar assunto em execução", () => {
    const result = resolveJarvisOrchestration("Precisamos melhorar a cobrança de pagamentos atrasados");
    expect(result.route).toBe("specialist_agent");
    expect(result.owner).toBe("support");
    expect(result.explicitAction).toBe(false);
    expect(result.preferredAgent).toBe("cobranca");
  });

  it("mantém conversa geral fora do fluxo operacional", () => {
    const result = resolveJarvisOrchestration("Bom dia, Jarvis");
    expect(result.route).toBe("conversation");
    expect(result.owner).toBe("support");
    expect(result.explicitAction).toBe(false);
    expect(result.preferredAgent).toBeNull();
  });

  it("expõe um contrato simples para routers evitarem disputa", () => {
    expect(ownsJarvisOrchestrationRoute("natural_actions", "Aprova o desconto")).toBe(true);
    expect(ownsJarvisOrchestrationRoute("missions", "Como estão nossas missões?")).toBe(true);
    expect(ownsJarvisOrchestrationRoute("action_plans", "Quais pendências existem nos planos?")).toBe(true);
    expect(ownsJarvisOrchestrationRoute("natural_actions", "Analise a prospecção")).toBe(false);
  });
});
