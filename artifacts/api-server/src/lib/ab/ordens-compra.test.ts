import { describe, expect, it } from "vitest";
import {
  ordemEditavel,
  podeTransicionarOrdem,
  proximosStatusOrdem,
  statusOrdemValido,
} from "./ordens-compra.js";

describe("ordens de compra de A&B — ciclo de status", () => {
  it("segue o fluxo sugerida → aprovada → enviada → recebida", () => {
    expect(podeTransicionarOrdem("sugerida", "aprovada")).toBe(true);
    expect(podeTransicionarOrdem("aprovada", "enviada")).toBe(true);
    expect(podeTransicionarOrdem("enviada", "recebida")).toBe(true);
  });

  it("permite cancelar antes de receber e não reabre ordem terminal", () => {
    expect(podeTransicionarOrdem("sugerida", "cancelada")).toBe(true);
    expect(podeTransicionarOrdem("aprovada", "cancelada")).toBe(true);
    expect(podeTransicionarOrdem("enviada", "cancelada")).toBe(true);
    expect(podeTransicionarOrdem("recebida", "cancelada")).toBe(false);
    expect(podeTransicionarOrdem("cancelada", "aprovada")).toBe(false);
  });

  it("não pula etapas", () => {
    expect(podeTransicionarOrdem("sugerida", "enviada")).toBe(false);
    expect(podeTransicionarOrdem("sugerida", "recebida")).toBe(false);
    expect(podeTransicionarOrdem("aprovada", "recebida")).toBe(false);
  });

  it("aceita o mesmo status como no-op (ex.: só observação)", () => {
    expect(podeTransicionarOrdem("sugerida", "sugerida")).toBe(true);
    expect(podeTransicionarOrdem("recebida", "recebida")).toBe(true);
  });

  it("só edita itens enquanto a ordem está sugerida", () => {
    expect(ordemEditavel("sugerida")).toBe(true);
    expect(ordemEditavel("aprovada")).toBe(false);
    expect(ordemEditavel("enviada")).toBe(false);
    expect(ordemEditavel("recebida")).toBe(false);
    expect(ordemEditavel("cancelada")).toBe(false);
  });

  it("conhece os próximos passos e valida o vocabulário", () => {
    expect(proximosStatusOrdem("sugerida")).toEqual(["aprovada", "cancelada"]);
    expect(proximosStatusOrdem("recebida")).toEqual([]);
    expect(statusOrdemValido("aprovada")).toBe(true);
    expect(statusOrdemValido("paga")).toBe(false);
  });
});
