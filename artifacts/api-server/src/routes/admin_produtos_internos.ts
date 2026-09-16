import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  produtosInternosTable,
  insertProdutoInternoSchema,
  updateProdutoInternoSchema,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { callOpenAI } from "../lib/ai-gateway.js";

const router: IRouter = Router();

const productKnowledgeInputSchema = z.object({
  nome: z.string().trim().min(1).max(300),
  categoria: z.string().trim().max(200).optional().default(""),
  tipo: z.string().trim().max(80).optional().default("produto"),
  descricao: z.string().trim().max(12000).optional().default(""),
  current: z.record(z.string(), z.unknown()).optional().default({}),
});

const generatedKnowledgeSchema = z.object({
  descricaoUso: z.string().optional().default(""),
  descricaoCompleta: z.string().optional().default(""),
  caracteristicas: z.string().optional().default(""),
  beneficios: z.string().optional().default(""),
  diferenciais: z.string().optional().default(""),
  aplicacoes: z.string().optional().default(""),
  publicoIndicado: z.string().optional().default(""),
  argumentosComerciais: z.string().optional().default(""),
  duvidasFrequentes: z.string().optional().default(""),
  objecoesRespostas: z.string().optional().default(""),
  garantia: z.string().optional().default(""),
  instalacao: z.string().optional().default(""),
  entrega: z.string().optional().default(""),
  observacoesIa: z.string().optional().default(""),
  condicoesPagamento: z.string().optional().default(""),
  tags: z.string().optional().default(""),
});

function parseJsonObject(content: string): unknown {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(clean);
}

// Apoio de IA compartilhado pela Biblioteca de Produtos do Catálogo e pela
// linha interna Vendor.ai. A IA apenas sugere/preenche o formulário; o usuário
// continua responsável por revisar e salvar, evitando alterações automáticas.
router.post("/tenants/:tenantId/product-knowledge/ai-fill", async (req, res) => {
  const tenantId = String(req.params.tenantId ?? "");
  if (!tenantId) {
    res.status(422).json({ error: "Tenant inválido." });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = productKnowledgeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const system = [
    "Você organiza conhecimento comercial de produtos e serviços para uma biblioteca empresarial.",
    "Responda APENAS com JSON válido e exatamente com as chaves solicitadas.",
    "Use português do Brasil, texto objetivo e pronto para revisão humana.",
    "Nunca invente preço, garantia, prazo, medida, integração, certificação ou característica técnica não informada.",
    "Quando um fato objetivo não puder ser confirmado pelos dados fornecidos, retorne string vazia nesse campo.",
    "Benefícios, público, aplicações e argumentos comerciais podem ser redigidos somente quando forem consequência razoável da descrição fornecida, sem criar números ou promessas absolutas.",
    "Em dúvidas frequentes e objeções, não crie política comercial inexistente.",
  ].join("\n");

  const requestedKeys = Object.keys(generatedKnowledgeSchema.shape);
  const prompt = [
    `Produto/serviço: ${input.nome}`,
    `Categoria: ${input.categoria || "não informada"}`,
    `Tipo: ${input.tipo || "produto"}`,
    `Descrição existente: ${input.descricao || "não informada"}`,
    `Campos já preenchidos (use como contexto e preserve fatos): ${JSON.stringify(input.current)}`,
    "",
    "Gere uma sugestão de complemento para os campos abaixo. Não inclua markdown.",
    `Chaves obrigatórias do JSON: ${requestedKeys.join(", ")}.`,
    "Para tags, retorne uma string com termos separados por vírgula.",
  ].join("\n");

  try {
    const result = await callOpenAI(
      tenantId,
      "content_generator",
      [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      {
        maxTokens: 2600,
        temperature: 0.25,
        responseFormat: { type: "json_object" },
      },
    );

    const generated = generatedKnowledgeSchema.parse(parseJsonObject(result.content));
    res.json({ fields: generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar as sugestões.";
    res.status(502).json({ error: message });
  }
});

router.get("/admin/produtos-internos", requireRole("super_admin"), async (_req, res) => {
  const produtos = await db
    .select()
    .from(produtosInternosTable)
    .orderBy(asc(produtosInternosTable.categoria), asc(produtosInternosTable.ordem));
  res.json(produtos);
});

// Compatibilidade com consumidores internos antigos: o catálogo comercial
// continua acessível por esta rota, mas exclusivamente para super_admin.
// Tenants não devem consultar nem receber os produtos comerciais internos.
router.get("/produtos-internos", requireRole("super_admin"), async (_req, res) => {
  const produtos = await db
    .select()
    .from(produtosInternosTable)
    .where(eq(produtosInternosTable.ativo, true))
    .orderBy(asc(produtosInternosTable.categoria), asc(produtosInternosTable.ordem));
  res.json(produtos);
});

router.post("/admin/produtos-internos", requireRole("super_admin"), async (req, res) => {
  const parsed = insertProdutoInternoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [produto] = await db.insert(produtosInternosTable).values(parsed.data).returning();
  res.status(201).json(produto);
});

router.patch("/admin/produtos-internos/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = updateProdutoInternoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [produto] = await db
    .update(produtosInternosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(produtosInternosTable.id, String(req.params.id)))
    .returning();
  if (!produto) {
    res.status(404).json({ error: "Produto not found" });
    return;
  }
  res.json(produto);
});

router.delete("/admin/produtos-internos/:id", requireRole("super_admin"), async (req, res) => {
  await db.delete(produtosInternosTable).where(eq(produtosInternosTable.id, String(req.params.id)));
  res.status(204).send();
});

export default router;
