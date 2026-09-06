type CatalogProposalItem = {
  nome: string;
  precoBase: string | number;
  unidade?: string | null;
  categoria?: string | null;
};

type LegacyProposalItem = {
  nome?: string | null;
  preco?: number | null;
};

function compact(value: string | null | undefined, max = 160): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatBrl(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildProposalProductContext(
  catalog: CatalogProposalItem[],
  legacyProducts: LegacyProposalItem[] | null | undefined,
): { context: string; source: "catalog" | "legacy" | "empty" } {
  if (catalog.length > 0) {
    const items = catalog.slice(0, 20).map((item) => {
      const nome = compact(item.nome, 100);
      const unidade = compact(item.unidade, 30) || "un";
      const categoria = compact(item.categoria, 80);
      return `${nome} · ${formatBrl(item.precoBase)}/${unidade}${categoria ? ` (${categoria})` : ""}`;
    });
    return {
      source: "catalog",
      context: `Catálogo oficial ativo — use exclusivamente estes itens e preços:\n${items.map((item) => `- ${item}`).join("\n")}`,
    };
  }

  const legacy = (legacyProducts ?? [])
    .filter((item) => compact(item.nome, 100))
    .slice(0, 20)
    .map((item) => {
      const nome = compact(item.nome, 100);
      const preco = item.preco != null && Number.isFinite(Number(item.preco))
        ? ` — referência antiga ${formatBrl(item.preco)}`
        : "";
      return `${nome}${preco}`;
    });

  if (legacy.length > 0) {
    return {
      source: "legacy",
      context: `Produtos/serviços de referência legada — use apenas porque o Catálogo oficial está vazio:\n${legacy.map((item) => `- ${item}`).join("\n")}`,
    };
  }

  return { source: "empty", context: "Catálogo oficial vazio e sem referência legada de produtos." };
}

export function proposalProductPromptRules(source: "catalog" | "legacy" | "empty"): string[] {
  if (source === "catalog") {
    return [
      "Existe Catálogo oficial ativo: use exclusivamente itens e preços presentes nele.",
      "Não invente produtos, serviços, unidades ou preços fora do Catálogo oficial.",
    ];
  }
  if (source === "legacy") {
    return [
      "O Catálogo oficial está vazio; a lista fornecida é apenas referência legada de compatibilidade.",
      "Não trate preço legado como preço oficial sem confirmação posterior do vendedor.",
    ];
  }
  return [
    "Não há Catálogo oficial nem referência legada; sugira apenas categorias genéricas relevantes e evite afirmar preços como oficiais.",
  ];
}
