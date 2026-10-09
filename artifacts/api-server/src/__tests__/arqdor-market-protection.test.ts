import { describe, expect, it } from "vitest";
import { evaluateMarketProtection, normalizeMarketProtectionValue } from "../lib/arqdor-market-protection.js";

const sponsor = "tenant-parceiro";

function rule(input: Partial<any> & { escopo: string; valor: string; modo: string }) {
  return {
    id: input.id ?? crypto.randomUUID(),
    tenantId: sponsor,
    escopo: input.escopo,
    valor: input.valor,
    valorNormalizado: normalizeMarketProtectionValue(input.valor),
    modo: input.modo,
    prioridade: input.prioridade ?? 100,
    ativo: true,
    observacoes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Arqdor Market commercial protection", () => {
  it("exclusive category only allows sponsor tenant", () => {
    const rules = [rule({ escopo: "categoria", valor: "Materiais de construção", modo: "exclusivo" })] as any;

    expect(evaluateMarketProtection({
      vendedorTenantId: sponsor,
      categoria: "Materiais de construção",
      nome: "Cimento CP-II",
    }, sponsor, rules)).toMatchObject({ incluir: true, modo: "exclusivo", boost: 1000 });

    expect(evaluateMarketProtection({
      vendedorTenantId: "concorrente",
      categoria: "Materiais de construção",
      nome: "Cimento CP-II",
    }, sponsor, rules)).toMatchObject({ incluir: false, modo: "exclusivo" });
  });

  it("does not block complementary categories", () => {
    const rules = [rule({ escopo: "categoria", valor: "Materiais de construção", modo: "exclusivo" })] as any;
    expect(evaluateMarketProtection({
      vendedorTenantId: "tenant-esquadrias",
      categoria: "Esquadrias",
      nome: "Janela PVC",
    }, sponsor, rules)).toMatchObject({ incluir: true, modo: "sem_regra" });
  });

  it("preferential keeps competitors but boosts sponsor", () => {
    const rules = [rule({ escopo: "subcategoria", valor: "Cimento", modo: "preferencial" })] as any;
    const spec = { subcategoria: "Cimento" };

    expect(evaluateMarketProtection({
      vendedorTenantId: sponsor,
      categoria: "Materiais",
      nome: "Cimento CP-II",
      especificacoes: spec,
    }, sponsor, rules)).toMatchObject({ incluir: true, boost: 500 });

    expect(evaluateMarketProtection({
      vendedorTenantId: "concorrente",
      categoria: "Materiais",
      nome: "Cimento CP-II",
      especificacoes: spec,
    }, sponsor, rules)).toMatchObject({ incluir: true, boost: 0 });
  });

  it("blocked hides sponsor and competitors", () => {
    const rules = [rule({ escopo: "produto_servico", valor: "Piscina de fibra", modo: "bloqueado" })] as any;
    for (const seller of [sponsor, "outro"]) {
      expect(evaluateMarketProtection({
        vendedorTenantId: seller,
        categoria: "Piscinas",
        nome: "Piscina de fibra",
      }, sponsor, rules)).toMatchObject({ incluir: false, modo: "bloqueado" });
    }
  });

  it("normalizes accents and punctuation", () => {
    expect(normalizeMarketProtectionValue("  Materiais de Construção  ")).toBe("materiais de construcao");
  });
});
