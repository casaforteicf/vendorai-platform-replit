import { Router, type IRouter } from "express";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  propostasTable,
  produtosCatalogoTable,
  businessProfilesTable,
  insertPropostaSchema,
  updatePropostaSchema,
  tenantsTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { getOpenAI } from "../lib/agent-engine.js";

const router: IRouter = Router();

// ── Proposal number generation ────────────────────────────────────────────────
async function generateNumero(tenantId: string): Promise<string> {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const datePart =
    String(now.getFullYear()) +
    pad2(now.getMonth() + 1) +
    pad2(now.getDate());
  const timePart = pad2(now.getHours()) + pad2(now.getMinutes());
  const prefix = `ORC-${datePart}-${timePart}`;

  // Count proposals created today for this tenant to get sequence number
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(propostasTable)
    .where(
      and(
        eq(propostasTable.tenantId, tenantId),
        sql`${propostasTable.createdAt} >= ${startOfDay}`
      )
    );
  const seq = ((result[0]?.count ?? 0) + 1).toString().padStart(3, "0");
  return `${prefix}-${seq}`;
}

router.post("/propostas", async (req, res) => {
  const parsed = insertPropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const numero = await generateNumero(parsed.data.tenantId);

  const [proposta] = await db
    .insert(propostasTable)
    .values({ ...parsed.data, numero })
    .returning();
  res.status(201).json(proposta);
});

router.get("/tenants/:tenantId/propostas", async (req, res) => {
  const { leadId, dealId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(propostasTable.tenantId, String(req.params.tenantId))];
  if (leadId) conditions.push(eq(propostasTable.leadId, leadId));
  if (dealId) conditions.push(eq(propostasTable.dealId, dealId));

  const propostas = await db
    .select()
    .from(propostasTable)
    .where(and(...conditions))
    .orderBy(propostasTable.createdAt);

  res.json(propostas);
});

router.get("/propostas/:id", async (req, res) => {
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(proposta);
});

router.patch("/propostas/:id", async (req, res) => {
  const parsed = updatePropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: propostasTable.id, tenantId: propostasTable.tenantId })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [proposta] = await db
    .update(propostasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(propostasTable.id, existing.id))
    .returning();

  res.json(proposta);
});

const PROPOSTA_TRANSITIONS: Record<string, string[]> = {
  rascunho: ["enviada"],
  enviada: ["aceita", "rejeitada", "expirada"],
  aceita: [],
  rejeitada: [],
  expirada: [],
};

router.patch("/propostas/:id/status", async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status) {
    res.status(422).json({ error: "status is required" });
    return;
  }

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const allowed = PROPOSTA_TRANSITIONS[proposta.status] ?? [];
  if (!allowed.includes(status)) {
    res.status(422).json({
      error: `Transition from "${proposta.status}" to "${status}" is not allowed. Allowed: [${allowed.join(", ") || "none"}]`,
    });
    return;
  }

  const [updated] = await db
    .update(propostasTable)
    .set({ status: status as typeof proposta.status, updatedAt: new Date() })
    .where(eq(propostasTable.id, String(req.params.id)))
    .returning();

  // ── Webhook de saída: proposta aceita = venda realizada ───────────────────
  if (status === "aceita") {
    void (async () => {
      try {
        const [tenant] = await db
          .select({ webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, proposta.tenantId));

        if (!tenant?.webhookEstoqueUrl) return;

        const itens = (updated.itens ?? []) as Array<{
          nome: string;
          sku?: string | null;
          quantidade: number;
          precoUnitario?: number | null;
        }>;

        const valorTotal = itens.reduce(
          (acc, item) => acc + item.quantidade * (item.precoUnitario ?? 0),
          0,
        );

        dispatchVendaWebhook(
          tenant.webhookEstoqueUrl,
          {
            event: "venda_realizada",
            tenantId: proposta.tenantId,
            vendaId: updated.id,
            tipo: "proposta",
            produtos: itens.map((item) => ({
              nome: item.nome,
              sku: item.sku ?? null,
              quantidade: item.quantidade,
            })),
            valorTotal,
            realizadaEm: new Date().toISOString(),
          },
          req.log,
        );
      } catch (err) {
        req.log.warn({ err }, "erp-webhook: failed to read tenant config");
      }
    })();
  }

  res.json(updated);
});

const fromCatalogoBodySchema = z.object({
  leadId: z.string().min(1),
  titulo: z.string().min(1),
  dealId: z.string().optional(),
  validadeAte: z.coerce.date().optional(),
  observacoes: z.string().optional(),
  formaPagamento: z.string().optional(),
  condPagamento: z.string().optional(),
  prazoEntrega: z.string().optional(),
  recorrente: z.boolean().optional(),
  valorMensal: z.number().optional(),
  prazoContratoMeses: z.number().int().optional(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1),
        quantidade: z.number().positive(),
      })
    )
    .min(1, "At least one item is required"),
});

router.post(
  "/tenants/:tenantId/propostas/from-catalogo",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const parsed = fromCatalogoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const {
      leadId, titulo, dealId, validadeAte, observacoes, itens,
      formaPagamento, condPagamento, prazoEntrega,
      recorrente, valorMensal, prazoContratoMeses,
    } = parsed.data;

    const produtoIds = itens.map((i) => i.produtoId);

    const produtos = await db
      .select()
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenantId),
          inArray(produtosCatalogoTable.id, produtoIds)
        )
      );

    const missingIds = produtoIds.filter(
      (id) => !produtos.find((p) => p.id === id)
    );
    if (missingIds.length > 0) {
      res.status(422).json({
        error: `Products not found or do not belong to this tenant: ${missingIds.join(", ")}`,
      });
      return;
    }

    const inactiveProdutos = produtos.filter((p) => !p.ativo);
    if (inactiveProdutos.length > 0) {
      res.status(422).json({
        error: `Inactive products cannot be added to a proposta: ${inactiveProdutos.map((p) => p.nome).join(", ")}`,
      });
      return;
    }

    const produtoMap = new Map(produtos.map((p) => [p.id, p]));

    let valorTotal = 0;
    const propostaItens = itens.map((item) => {
      const produto = produtoMap.get(item.produtoId)!;
      const valorUnitario = parseFloat(produto.precoBase);
      valorTotal += item.quantidade * valorUnitario;
      return {
        nome: produto.nome,
        quantidade: item.quantidade,
        valorUnitario,
      };
    });

    const numero = await generateNumero(tenantId);

    const [proposta] = await db
      .insert(propostasTable)
      .values({
        tenantId,
        leadId,
        titulo,
        numero,
        ...(dealId ? { dealId } : {}),
        ...(validadeAte ? { validadeAte } : {}),
        ...(observacoes ? { observacoes } : {}),
        ...(formaPagamento ? { formaPagamento: formaPagamento as typeof propostasTable.$inferInsert.formaPagamento } : {}),
        ...(condPagamento ? { condPagamento } : {}),
        ...(prazoEntrega ? { prazoEntrega } : {}),
        ...(recorrente !== undefined ? { recorrente } : {}),
        ...(valorMensal !== undefined ? { valorMensal: String(valorMensal) } : {}),
        ...(prazoContratoMeses !== undefined ? { prazoContratoMeses } : {}),
        itens: propostaItens,
        valorTotal: valorTotal.toFixed(2),
      })
      .returning();

    res.status(201).json(proposta);
  }
);

// ─── AI item suggestion ───────────────────────────────────────────────────────
const suggestBodySchema = z.object({
  titulo: z.string().min(1),
  leadNome: z.string().optional(),
  contexto: z.string().optional(),
});

router.post("/tenants/:tenantId/propostas/suggest-items", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = suggestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const catalog = await db
    .select({
      nome: produtosCatalogoTable.nome,
      precoBase: produtosCatalogoTable.precoBase,
      unidade: produtosCatalogoTable.unidade,
      categoria: produtosCatalogoTable.categoria,
    })
    .from(produtosCatalogoTable)
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
    .limit(20);

  const contextParts: string[] = [`Título do orçamento: ${parsed.data.titulo}`];
  if (parsed.data.leadNome) contextParts.push(`Cliente: ${parsed.data.leadNome}`);
  if (parsed.data.contexto) contextParts.push(`Contexto adicional: ${parsed.data.contexto}`);
  if (profile?.nomeFantasia) contextParts.push(`Empresa vendedora: ${profile.nomeFantasia}`);
  if (profile?.vertical) contextParts.push(`Segmento: ${profile.vertical}`);
  if ((profile?.produtos as unknown[])?.length) {
    contextParts.push(
      `Produtos da empresa: ${(profile.produtos as Array<{ nome: string; preco?: number }>)
        .map((p) => `${p.nome}${p.preco ? ` (R$ ${p.preco})` : ""}`)
        .join(", ")}`
    );
  }
  if (catalog.length > 0) {
    contextParts.push(
      `Catálogo disponível: ${catalog
        .map((c) => `${c.nome} · R$ ${c.precoBase}/${c.unidade}${c.categoria ? ` (${c.categoria})` : ""}`)
        .join("; ")}`
    );
  }

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um assistente especializado em criar orçamentos comerciais brasileiros.
Com base nas informações fornecidas, sugira uma lista de itens para o orçamento.
Retorne APENAS JSON válido:
{"itens":[{"nome":"nome do item","quantidade":número,"valorUnitario":número_decimal}]}
Regras:
- Sugira entre 3 e 7 itens relevantes ao contexto
- Valores coerentes com mercado brasileiro em R$
- Prefira itens do catálogo disponível quando relevante
- Retorne SOMENTE o JSON, sem texto extra`,
        },
        { role: "user", content: contextParts.join("\n") },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.7,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    res.json(JSON.parse(raw));
  } catch (err) {
    req.log.error({ err }, "suggest-items: OpenAI error");
    res.status(500).json({ error: "Erro ao gerar sugestão" });
  }
});

router.delete("/propostas/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: propostasTable.id, tenantId: propostasTable.tenantId })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(propostasTable).where(eq(propostasTable.id, existing.id));

  res.status(204).send();
});

export default router;
