import { describe, expect, it } from "vitest";
import { scoreVieNewsForTenant } from "./vie-news-relevance.js";

const constructionTenant = {
  name: "Construtora Exemplo",
  vertical: "construtora ICF casas residenciais",
  audience: "famílias que desejam construir casas de alto desempenho",
  differentiators: "conforto térmico rapidez de obra eficiência energética",
  competitors: ["Construtora Alfa"],
  suppliers: ["Fornecedor Beta"],
  products: ["Casa ICF", "obra chave na mão", "projeto residencial"],
  regions: ["Chapecó SC"],
};

describe("scoreVieNewsForTenant", () => {
  it("classifica notícia setorial aderente como relevante", () => {
    const result = scoreVieNewsForTenant(constructionTenant, {
      title: "Novo financiamento amplia crédito para construção de casa residencial",
      excerpt: "A medida deve estimular novas obras e aumentar a demanda no setor de construção.",
      categories: ["Economia", "Construção"],
      sourceReliability: 90,
    });

    expect(result.relevant).toBe(true);
    expect(result.category).toBe("Oportunidade");
    expect(result.signalType).toBe("sectoral");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.confidence).toBeGreaterThan(60);
  });

  it("rejeita notícia genérica sem relação suficiente com o tenant", () => {
    const result = scoreVieNewsForTenant(constructionTenant, {
      title: "Festival de cinema divulga programação internacional",
      excerpt: "Evento terá sessões e convidados durante o fim de semana.",
      categories: ["Cultura"],
      sourceReliability: 95,
    });

    expect(result.relevant).toBe(false);
    expect(result.matchedTerms).toHaveLength(0);
    expect(result.signalType).toBe("market");
  });

  it("identifica sinal de risco quando há aderência ao negócio", () => {
    const result = scoreVieNewsForTenant(constructionTenant, {
      title: "Alta de preço de materiais pressiona custo da construção residencial",
      excerpt: "Empresas do setor relatam aumento de custo em obras e projetos residenciais.",
      categories: ["Construção", "Economia"],
      sourceReliability: 88,
    });

    expect(result.relevant).toBe(true);
    expect(result.category).toBe("Risco");
    expect(result.severity).toBe("risk");
    expect(result.signalType).toBe("sectoral");
  });

  it("prioriza concorrente conhecido como natureza do sinal", () => {
    const result = scoreVieNewsForTenant(constructionTenant, {
      title: "Construtora Alfa anuncia expansão e novo projeto residencial",
      excerpt: "A concorrente pretende ampliar sua atuação em casas e obras residenciais.",
      categories: ["Negócios", "Construção"],
      sourceReliability: 86,
    });

    expect(result.relevant).toBe(true);
    expect(result.signalType).toBe("competitor");
    expect(result.matchedCompetitors).toEqual(["Construtora Alfa"]);
  });

  it("identifica fornecedor conhecido e risco de abastecimento", () => {
    const result = scoreVieNewsForTenant(constructionTenant, {
      title: "Fornecedor Beta alerta para atraso e alta de preço",
      excerpt: "A empresa informou restrição temporária de abastecimento.",
      categories: ["Indústria"],
      sourceReliability: 84,
    });

    expect(result.relevant).toBe(true);
    expect(result.category).toBe("Risco");
    expect(result.signalType).toBe("supplier");
    expect(result.matchedSuppliers).toEqual(["Fornecedor Beta"]);
  });

  it("identifica sinal regional quando a notícia menciona território do tenant", () => {
    const result = scoreVieNewsForTenant(constructionTenant, {
      title: "Chapecó amplia crédito para novas obras residenciais",
      excerpt: "O programa regional busca estimular construção de casas e novos investimentos.",
      categories: ["Regional", "Construção"],
      sourceReliability: 82,
    });

    expect(result.relevant).toBe(true);
    expect(result.signalType).toBe("regional");
    expect(result.matchedRegions).toEqual(["Chapecó SC"]);
  });
});
