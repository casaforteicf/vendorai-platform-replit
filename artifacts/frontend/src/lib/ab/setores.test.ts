import { describe, expect, it } from "vitest";
import { normalizarSetor, rotuloSetor, setorEhConhecido, SETORES } from "./setores";

describe("normalizarSetor", () => {
  it("remove acento, espaço e caixa", () => {
    expect(normalizarSetor("Gerência")).toBe("gerencia");
    expect(normalizarSetor("  SALADEIRA  ")).toBe("saladeira");
  });

  it("transforma espaço e pontuação em hífen", () => {
    expect(normalizarSetor("Cozinha Quente")).toBe("cozinha-quente");
    expect(normalizarSetor("Bar / Copa")).toBe("bar-copa");
    expect(normalizarSetor("--Confeitaria--")).toBe("confeitaria");
  });

  it("colapsa repetições e limita a 80 caracteres", () => {
    expect(normalizarSetor("a   b")).toBe("a-b");
    expect(normalizarSetor("x".repeat(200))).toHaveLength(80);
  });

  it("devolve string vazia para entrada sem conteúdo útil", () => {
    expect(normalizarSetor("   ")).toBe("");
    expect(normalizarSetor("!!!")).toBe("");
  });

  it("é idempotente para os setores conhecidos", () => {
    for (const setor of SETORES) {
      expect(normalizarSetor(setor.valor)).toBe(setor.valor);
      expect(normalizarSetor(setor.rotulo)).toBe(setor.valor);
    }
  });
});

describe("rotuloSetor", () => {
  it("usa o vocabulário fixo", () => {
    expect(rotuloSetor("gerencia")).toBe("Gerência");
    expect(rotuloSetor("cozinha")).toBe("Cozinha");
  });

  it("deriva rótulo de slug livre", () => {
    expect(rotuloSetor("cozinha-quente")).toBe("Cozinha quente");
  });

  it("tem fallback para valor vazio", () => {
    expect(rotuloSetor("   ")).toBe("Sem setor");
  });
});

describe("setorEhConhecido", () => {
  it("reconhece apenas o vocabulário fixo", () => {
    expect(setorEhConhecido("confeitaria")).toBe(true);
    expect(setorEhConhecido("bar")).toBe(false);
    expect(setorEhConhecido("")).toBe(false);
  });
});
