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
  dealsTable,
  leadsTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { getOpenAI } from "../lib/agent-engine.js";
import { proposalAccepted } from "../lib/proposal-accepted.js";

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
  rascunho: ["enviada", "pendente"],
  enviada: ["pendente", "aceita", "rejeitada", "expirada"],
  pendente: ["aceita", "rejeitada", "expirada"],
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

  // ── Central funnel: proposalAccepted handles deal ganho + automation ───────
  if (status === "aceita" && proposta.dealId) {
    const result = await proposalAccepted(proposta.id, "manual");
    if (!result.ok) {
      req.log.warn({ propostaId: proposta.id, error: result.error }, "proposalAccepted failed during status transition");
    } else {
      req.log.info({ propostaId: proposta.id, dealId: result.dealId, alreadyProcessed: result.alreadyProcessed }, "proposalAccepted executed via status transition");
    }
  } else if (proposta.dealId && status !== "aceita") {
    // Auto-sync deal stage for non-aceita transitions (rejeitada, expirada, pendente)
    const dealEtapaMap: Record<string, string> = {
      pendente: "proposta",
      rejeitada: "perdido",
      expirada: "perdido",
    };
    const targetEtapa = dealEtapaMap[status];
    if (targetEtapa) {
      await db
        .update(dealsTable)
        .set({ etapa: targetEtapa as typeof dealsTable.$inferSelect.etapa, updatedAt: new Date() })
        .where(eq(dealsTable.id, proposta.dealId));
      req.log.info({ dealId: proposta.dealId, from: proposta.status, to: status, etapa: targetEtapa }, "proposta: auto-synced deal stage");
    }
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
  numParcelas: z.number().int().min(1).optional(),
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
      recorrente, valorMensal, prazoContratoMeses, numParcelas,
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
        ...(numParcelas !== undefined ? { numParcelas } : {}),
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

// ── Canal A: Link público de aceite ───────────────────────────────────────────

router.get("/propostas/:id/public", async (req, res) => {
  const [proposta] = await db
    .select({
      id: propostasTable.id,
      tenantId: propostasTable.tenantId,
      leadId: propostasTable.leadId,
      titulo: propostasTable.titulo,
      numero: propostasTable.numero,
      itens: propostasTable.itens,
      valorTotal: propostasTable.valorTotal,
      formaPagamento: propostasTable.formaPagamento,
      condPagamento: propostasTable.condPagamento,
      prazoEntrega: propostasTable.prazoEntrega,
      validadeAte: propostasTable.validadeAte,
      status: propostasTable.status,
      observacoes: propostasTable.observacoes,
    })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (proposta.status !== "enviada" && proposta.status !== "pendente") {
    res.status(422).json({ error: "Proposta cannot be accepted in current status" });
    return;
  }

  const [lead] = await db
    .select({ nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(eq(leadsTable.id, proposta.leadId));

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, proposta.tenantId));

  res.json({
    proposta,
    lead: lead ?? null,
    tenant: tenant ?? null,
  });
});

const acceptBodySchema = z.object({
  nome: z.string().min(1).optional(),
  documento: z.string().optional(),
});

router.post("/propostas/:id/accept", async (req, res) => {
  const parsed = acceptBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const propostaId = String(req.params.id);
  const ip = req.ip ?? req.headers["x-forwarded-for"] as string ?? undefined;

  const result = await proposalAccepted(propostaId, "link", {
    ip,
    nome: parsed.data.nome,
    documento: parsed.data.documento,
  });

  if (!result.ok) {
    res.status(404).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(200).json({ message: "Proposta already accepted", propostaId: result.propostaId });
    return;
  }

  res.status(200).json({
    message: "Proposta accepted successfully",
    propostaId: result.propostaId,
    dealId: result.dealId,
  });
});

// ── Canal C: Marcação manual pelo vendedor ──────────────────────────────────

router.post("/propostas/:id/accept-manual", async (req, res) => {
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

  const result = await proposalAccepted(proposta.id, "manual", {
    nome: req.user?.email ?? undefined,
  });

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(200).json({ message: "Proposta already accepted", propostaId: result.propostaId });
    return;
  }

  res.status(200).json({
    message: "Proposta accepted manually",
    propostaId: result.propostaId,
    dealId: result.dealId,
  });
});

export default router;
