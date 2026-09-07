import { describe, expect, it } from "vitest";
import { resolveJarvisNaturalAction } from "./jarvis-natural-action-intent.js";

const pending = (id: string, actionType: string) => ({
  id,
  actionType,
  status: "pendente_aprovacao",
});

const approved = (id: string, actionType: string) => ({
  id,
  actionType,
  status: "aprovado",
});

describe("resolveJarvisNaturalAction", () => {
  it("aprova a única pendência sem depender do LLM", () => {
    const result = resolveJarvisNaturalAction("aprova", [pending("1", "aprovacao_desconto")]);
    expect(result).toEqual({ action: "approve", targetId: "1", ambiguous: false, matchedBy: "single" });
  });

  it("usa palavra-chave quando existem várias pendências", () => {
    const result = resolveJarvisNaturalAction("aprova o desconto", [
      pending("1", "aprovacao_fechamento"),
      pending("2", "aprovacao_desconto"),
    ]);
    expect(result.targetId).toBe("2");
    expect(result.matchedBy).toBe("keyword");
  });

  it("não escolhe arbitrariamente quando o comando é ambíguo", () => {
    const result = resolveJarvisNaturalAction("aprova", [
      pending("1", "aprovacao_fechamento"),
      pending("2", "aprovacao_desconto"),
    ]);
    expect(result.action).toBe("approve");
    expect(result.targetId).toBeNull();
    expect(result.ambiguous).toBe(true);
  });

  it("executa somente tarefas já aprovadas", () => {
    const result = resolveJarvisNaturalAction("executa", [
      pending("1", "enviar_whatsapp"),
      approved("2", "acao_interna"),
    ]);
    expect(result).toEqual({ action: "execute", targetId: "2", ambiguous: false, matchedBy: "single" });
  });

  it("reconhece rejeição, mas deixa a execução para a camada de segurança", () => {
    const result = resolveJarvisNaturalAction("rejeita", [pending("1", "conferencia_estoque")]);
    expect(result.action).toBe("reject");
    expect(result.targetId).toBe("1");
  });

  it("ignora frases não imperativas", () => {
    const result = resolveJarvisNaturalAction("o que você acha desse desconto?", [pending("1", "aprovacao_desconto")]);
    expect(result.action).toBeNull();
  });
});
