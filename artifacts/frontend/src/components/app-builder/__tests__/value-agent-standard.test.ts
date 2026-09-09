import { describe, expect, it } from "vitest";

type ValueAgent = {
  enabled?: boolean;
  name?: string;
  promise?: string;
  preLeadServices?: string[];
  handoff?: { triggers?: string[]; destination?: string };
};

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function ready(valueAgent: ValueAgent | null) {
  return Boolean(
    valueAgent?.enabled !== false &&
    valueAgent?.name?.trim() &&
    valueAgent?.promise?.trim() &&
    asStrings(valueAgent?.preLeadServices).length > 0 &&
    (valueAgent?.handoff?.destination?.trim() || asStrings(valueAgent?.handoff?.triggers).length > 0),
  );
}

describe("App Builder value agent minimum gate", () => {
  it("accepts a complete value-first agent", () => {
    expect(ready({
      enabled: true,
      name: "Assistente Jurídico de Pré-Análise",
      promise: "Explicar informações públicas e organizar o caso antes do contato comercial",
      preLeadServices: ["Explicação de andamento processual quando integrado"],
      handoff: { destination: "Equipe jurídica" },
    })).toBe(true);
  });

  it("rejects a lead form disguised as an agent", () => {
    expect(ready({
      enabled: true,
      name: "Captador",
      promise: "Coletar nome e telefone",
      preLeadServices: [],
      handoff: { destination: "Comercial" },
    })).toBe(false);
  });

  it("rejects an agent with no human handoff", () => {
    expect(ready({
      enabled: true,
      name: "Especialista",
      promise: "Entregar pré-análise útil",
      preLeadServices: ["Pré-análise"],
      handoff: {},
    })).toBe(false);
  });
});
