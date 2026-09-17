import { describe, expect, it } from "vitest";
import { renderTemplate } from "./proactiveMessageGuard.js";

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    const result = renderTemplate("Olá {nome}, tudo bem?", { nome: "Marcos" });
    expect(result.ok).toBe(true);
    expect(result.mensagem).toBe("Olá Marcos, tudo bem?");
  });

  it("accepts double-brace syntax too", () => {
    const result = renderTemplate("Olá {{nome}}, tudo bem?", { nome: "Marcos" });
    expect(result.ok).toBe(true);
    expect(result.mensagem).toBe("Olá Marcos, tudo bem?");
  });

  it("blocks a message with an unresolved placeholder", () => {
    const result = renderTemplate("Olá {nome_errado}, temos uma novidade!", { nome: "Marcos" });
    expect(result.ok).toBe(false);
  });

  it("passes plain text with no placeholders through unchanged", () => {
    // Caso central do fix de scout.ts /aprovar: mensagem editada manualmente
    // pelo admin, sem nenhum placeholder — não pode ser rejeitada.
    const result = renderTemplate("Oi! Vi que você ficou interessado no orçamento, ainda podemos conversar?", { nome: "Marcos" });
    expect(result.ok).toBe(true);
  });

  it("blocks manually-edited text that still has a leftover placeholder", () => {
    // Caso que o fix de scout.ts /aprovar existe pra pegar: admin editou o
    // preview mas esqueceu de preencher um campo.
    const result = renderTemplate("Oi {nome}, seu pedido de {produto} está pronto!", { nome: "Marcos" });
    expect(result.ok).toBe(false);
  });
});
