import { describe, expect, it } from "vitest";
import { sanitizeConfigurationSnapshot } from "./configuration-audit.js";

describe("configuration audit sanitizer", () => {
  it("redige credenciais sem remover dados úteis da configuração", () => {
    expect(sanitizeConfigurationSnapshot({
      nomeFantasia: "Empresa Teste",
      accessToken: "segredo",
      nested: { api_key: "abc", telefone: "49999999999" },
    })).toEqual({
      nomeFantasia: "Empresa Teste",
      accessToken: "[redigido]",
      nested: { api_key: "[redigido]", telefone: "49999999999" },
    });
  });

  it("limita arrays e strings para não inflar a trilha", () => {
    const result = sanitizeConfigurationSnapshot({
      items: Array.from({ length: 80 }, (_, index) => index),
      texto: "x".repeat(3_000),
    }) as { items: number[]; texto: string };

    expect(result.items).toHaveLength(50);
    expect(result.texto).toHaveLength(2_000);
  });
});
