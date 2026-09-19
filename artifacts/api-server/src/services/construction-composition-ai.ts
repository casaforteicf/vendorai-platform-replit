import { z } from "zod/v4";
import { callOpenAI } from "../lib/ai-gateway.js";

export type ConstructionCompositionCatalogItem = {
  id: string;
  nome: string;
  unidade: string;
  codigo: string | null;
  categoria: string | null;
  precoUnitario: string | null;
};

const generatedCompositionSchema = z.object({
  nome: z.string().trim().min(2).max(220),
  descricao: z.string().trim().max(1000).nullable().optional(),
  unidade: z.string().trim().min(1).max(20),
  itens: z.array(z.object({
    insumoId: z.string().trim().nullable(),
    nomeSugerido: z.string().trim().min(1).max(220),
    unidade: z.string().trim().min(1).max(20),
    quantidade: z.coerce.number().positive().max(1000000),
    observacao: z.string().trim().max(500).nullable().optional(),
  })).min(1).max(80),
});

export type GeneratedConstructionComposition = z.infer<typeof generatedCompositionSchema>;

function compactCatalog(items: ConstructionCompositionCatalogItem[]) {
  return items.map((item) => ({
    id: item.id,
    nome: item.nome,
    unidade: item.unidade,
    codigo: item.codigo,
    categoria: item.categoria,
    precoCadastrado: item.precoUnitario != null && Number(item.precoUnitario) > 0,
  }));
}

export async function generateConstructionComposition(input: {
  tenantId: string;
  pedido: string;
  unidadePreferida?: string | null;
  catalogo: ConstructionCompositionCatalogItem[];
}): Promise<GeneratedConstructionComposition> {
  const pedido = input.pedido.trim();
  if (!pedido) throw new Error("Descreva o serviço que deve ser composto.");

  const model = process.env.CONSTRUCTION_COMPOSITION_MODEL?.trim() || "gpt-5.6-sol";
  const catalogo = compactCatalog(input.catalogo);

  const completion = await callOpenAI(
    input.tenantId,
    "auto_quote",
    [
      {
        role: "system",
        content: [
          "Você é um engenheiro orçamentista de obras brasileiras especializado em composições unitárias.",
          "Sua tarefa é propor os CONSUMOS FÍSICOS por unidade de serviço. Nunca invente preços.",
          "Use os insumos cadastrados fornecidos no catálogo sempre que houver correspondência tecnicamente adequada.",
          "Quando usar um item do catálogo, copie EXATAMENTE o id dele em insumoId.",
          "Quando um insumo necessário não existir no catálogo, use insumoId=null e descreva-o em nomeSugerido/unidade.",
          "Não substitua um insumo técnico por outro apenas para evitar pendência.",
          "Inclua materiais, mão de obra e equipamentos relevantes, inclusive perdas quando tecnicamente cabível no próprio coeficiente.",
          "As quantidades são consumos por UMA unidade da composição, não quantidades totais da obra.",
          "Não inclua BDI, impostos, margem, comissão, frete ou preço de venda na composição técnica.",
          "Retorne somente JSON válido no formato: {nome, descricao, unidade, itens:[{insumoId,nomeSugerido,unidade,quantidade,observacao}]}.",
          "Se houver incerteza técnica, registre-a em observacao em vez de inventar precisão.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `SERVIÇO SOLICITADO:\n${pedido}`,
          input.unidadePreferida ? `UNIDADE PREFERIDA: ${input.unidadePreferida}` : "",
          `CATÁLOGO DE INSUMOS DISPONÍVEL:\n${JSON.stringify(catalogo)}`,
        ].filter(Boolean).join("\n\n"),
      },
    ],
    {
      model,
      temperature: 0.1,
      maxTokens: 5000,
      responseFormat: { type: "json_object" },
    },
  );

  const raw = completion.content.trim();
  if (!raw) throw new Error("A IA não retornou uma composição.");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("A IA retornou uma composição em formato inválido.");
  }

  const parsed = generatedCompositionSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error("A composição gerada não passou pela validação técnica de estrutura.");

  const validIds = new Set(input.catalogo.map((item) => item.id));
  return {
    ...parsed.data,
    itens: parsed.data.itens.map((item) => ({
      ...item,
      insumoId: item.insumoId && validIds.has(item.insumoId) ? item.insumoId : null,
    })),
  };
}
