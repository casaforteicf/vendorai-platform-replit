import { describe, expect, it } from "vitest";
import { scoreVieNewsForTenant } from "./vie-news-relevance.js";

const constructionTenant = {
  name: "Construtora Exemplo",
  vertical: "construtora ICF casas residenciais",
  audience: "famílias que desejam construir casas de alto desempenho",
  differentiators: "conforto térmico rapidez de obra eficiência energética",
  competitors: ["Construtora Alfa"],
  products: ["Casa ICF", "obra chave na mão", "projeto residencial"],
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
  });
});
