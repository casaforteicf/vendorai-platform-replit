import { describe, expect, it } from "vitest";

type ProductModel = {
  appProduct?: { valueProposition?: string; nativeFunctions?: string[] };
  appAdmin?: { nativeFunctions?: string[] };
  vendorAiSaas?: { valueProposition?: string; capabilities?: string[] };
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function ready(model: ProductModel | null) {
  return Boolean(
    model?.appProduct?.valueProposition?.trim() &&
    strings(model?.appProduct?.nativeFunctions).length > 0 &&
    strings(model?.appAdmin?.nativeFunctions).length > 0 &&
    model?.vendorAiSaas?.valueProposition?.trim() &&
    strings(model?.vendorAiSaas?.capabilities).length > 0,
  );
}

describe("App Builder product model gate", () => {
  it("aceita app vendavel com admin nativo e SaaS separado", () => {
    expect(ready({
      appProduct: {
        valueProposition: "App jurídico para clientes acompanharem seus serviços",
        nativeFunctions: ["Acompanhamento", "Documentos", "Notificações"],
      },
      appAdmin: { nativeFunctions: ["Gerenciar clientes do app", "Publicar comunicados"] },
      vendorAiSaas: {
        valueProposition: "Gestão e inteligência recorrente do escritório",
        capabilities: ["CRM", "Marketing", "Automação", "Analytics"],
      },
    })).toBe(true);
  });

  it("rejeita app que depende do SaaS para sua função principal", () => {
    expect(ready({
      appProduct: { valueProposition: "App jurídico", nativeFunctions: [] },
      appAdmin: { nativeFunctions: ["Configurações"] },
      vendorAiSaas: { valueProposition: "Tudo fica no SaaS", capabilities: ["Processos", "Documentos"] },
    })).toBe(false);
  });

  it("rejeita arquitetura sem painel administrativo nativo", () => {
    expect(ready({
      appProduct: { valueProposition: "Produto completo", nativeFunctions: ["Função principal"] },
      appAdmin: { nativeFunctions: [] },
      vendorAiSaas: { valueProposition: "Gestão avançada", capabilities: ["CRM"] },
    })).toBe(false);
  });
});