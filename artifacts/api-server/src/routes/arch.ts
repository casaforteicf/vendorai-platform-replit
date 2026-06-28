import { Router, type IRouter } from "express";
import { and, eq, ilike, sql, desc, sum } from "drizzle-orm";
import {
  db,
  archProjetosTable,
  archAmbientesTable,
  archOrcamentoItensTable,
  archCenasTable,
  archCatalogoTable,
  insertArchProjetoSchema,
  updateArchProjetoSchema,
  insertArchAmbienteSchema,
  updateArchAmbienteSchema,
  insertArchOrcamentoItemSchema,
  updateArchOrcamentoItemSchema,
} from "@workspace/db";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { authenticate } from "../middlewares/auth.js";

const router: IRouter = Router();

function tenantId(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccessTenant(req: Express.Request, tid: string) {
  return isSuperAdmin(req) || tenantId(req) === tid;
}

function getPortalBaseUrl(req: Express.Request): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    return `https://${domains.split(",")[0].trim()}`;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${Array.isArray(host) ? host[0] : host}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /arch/portal/:token — PUBLIC (no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/portal/:token", async (req, res) => {
  const token = String(req.params.token);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(
      and(
        eq(archProjetosTable.portalToken, token),
        eq(archProjetosTable.portalAtivo, true),
      ),
    )
    .limit(1);

  if (!projeto) {
    return res.status(404).json({ error: "Portal não encontrado ou inativo." });
  }

  const [ambientes, orcamento, cenas] = await Promise.all([
    db
      .select()
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.projetoId, projeto.id))
      .orderBy(archAmbientesTable.ordem),
    db
      .select()
      .from(archOrcamentoItensTable)
      .where(eq(archOrcamentoItensTable.projetoId, projeto.id)),
    db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.projetoId, projeto.id)),
  ]);

  return res.json({ projeto, ambientes, orcamento, cenas });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes below — all require authentication
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/projetos
router.get("/arch/projetos", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { status, clienteNome } = req.query as Record<string, string | undefined>;

  const conditions = [eq(archProjetosTable.tenantId, tid)];
  if (status) conditions.push(eq(archProjetosTable.status, status));
  if (clienteNome)
    conditions.push(ilike(archProjetosTable.clienteNome, `%${clienteNome}%`));

  const projetos = await db
    .select({
      id:              archProjetosTable.id,
      titulo:          archProjetosTable.titulo,
      clienteNome:     archProjetosTable.clienteNome,
      clienteEmail:    archProjetosTable.clienteEmail,
      clienteTelefone: archProjetosTable.clienteTelefone,
      status:          archProjetosTable.status,
      tipoObra:        archProjetosTable.tipoObra,
      areaM2:          archProjetosTable.areaM2,
      orcamentoTotal:  archProjetosTable.orcamentoTotal,
      prazoEstimado:   archProjetosTable.prazoEstimado,
      portalAtivo:     archProjetosTable.portalAtivo,
      createdAt:       archProjetosTable.createdAt,
      updatedAt:       archProjetosTable.updatedAt,
      totalAmbientes: sql<number>`(
        select count(*) from arch_ambientes
        where arch_ambientes.projeto_id = ${archProjetosTable.id}
      )`.mapWith(Number),
    })
    .from(archProjetosTable)
    .where(and(...conditions))
    .orderBy(desc(archProjetosTable.createdAt));

  return res.json(projetos);
});

// POST /api/arch/projetos
router.post("/arch/projetos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const parsed = insertArchProjetoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [projeto] = await db
    .insert(archProjetosTable)
    .values({
      ...parsed.data,
      portalToken: crypto.randomUUID(),
      portalAtivo: false,
    })
    .returning();

  return res.status(201).json(projeto);
});

// GET /api/arch/projetos/:id
router.get("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const tid = tenantId(req);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [ambientes, orcamento, cenas] = await Promise.all([
    db
      .select()
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.projetoId, id))
      .orderBy(archAmbientesTable.ordem),
    db
      .select()
      .from(archOrcamentoItensTable)
      .where(eq(archOrcamentoItensTable.projetoId, id)),
    db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.projetoId, id)),
  ]);

  return res.json({ projeto, ambientes, orcamento, cenas });
});

// PATCH /api/arch/projetos/:id
router.patch("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchProjetoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(archProjetosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id))
    .returning();

  return res.json(updated);
});

// DELETE /api/arch/projetos/:id — soft delete (status = cancelado)
router.delete("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [updated] = await db
    .update(archProjetosTable)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id))
    .returning();

  return res.json(updated);
});

// POST /api/arch/projetos/:id/portal/ativar
router.post("/arch/projetos/:id/portal/ativar", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId, portalToken: archProjetosTable.portalToken })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db
    .update(archProjetosTable)
    .set({ portalAtivo: true, updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const baseUrl = getPortalBaseUrl(req);
  return res.json({ portalUrl: `${baseUrl}/arch/portal/${existing.portalToken}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ambientes
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/arch/projetos/:id/ambientes
router.post("/arch/projetos/:id/ambientes", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = insertArchAmbienteSchema.safeParse({ ...req.body, projetoId });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [ambiente] = await db
    .insert(archAmbientesTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(ambiente);
});

// PATCH /api/arch/projetos/:id/ambientes/:ambId
router.patch("/arch/projetos/:id/ambientes/:ambId", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);
  const ambId = String(req.params.ambId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchAmbienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(archAmbientesTable)
    .set(parsed.data)
    .where(
      and(
        eq(archAmbientesTable.id, ambId),
        eq(archAmbientesTable.projetoId, projetoId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Ambiente não encontrado." });
  return res.json(updated);
});

// DELETE /api/arch/projetos/:id/ambientes/:ambId
router.delete("/arch/projetos/:id/ambientes/:ambId", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);
  const ambId = String(req.params.ambId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db
    .delete(archAmbientesTable)
    .where(
      and(
        eq(archAmbientesTable.id, ambId),
        eq(archAmbientesTable.projetoId, projetoId),
      ),
    );

  return res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento
// ─────────────────────────────────────────────────────────────────────────────

// Helper: recalcular orcamentoTotal do projeto
async function recalcularOrcamentoTotal(projetoId: string): Promise<void> {
  const [{ total }] = await db
    .select({ total: sum(archOrcamentoItensTable.valorTotal) })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.projetoId, projetoId));

  await db
    .update(archProjetosTable)
    .set({ orcamentoTotal: total ?? "0", updatedAt: new Date() })
    .where(eq(archProjetosTable.id, projetoId));
}

// GET /api/arch/projetos/:id/orcamento
router.get("/arch/projetos/:id/orcamento", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId, orcamentoTotal: archProjetosTable.orcamentoTotal })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const itens = await db
    .select()
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.projetoId, projetoId));

  // Agrupar por ambienteId e categoria
  const grupos: Record<string, { ambienteId: string | null; categoria: string | null; itens: typeof itens; totalCategoria: number }> = {};
  for (const item of itens) {
    const key = `${item.ambienteId ?? "sem-ambiente"}|${item.categoria ?? "sem-categoria"}`;
    if (!grupos[key]) {
      grupos[key] = { ambienteId: item.ambienteId, categoria: item.categoria, itens: [], totalCategoria: 0 };
    }
    grupos[key].itens.push(item);
    grupos[key].totalCategoria += Number(item.valorTotal ?? 0);
  }

  return res.json({
    grupos: Object.values(grupos),
    totalGeral: Number(projeto.orcamentoTotal ?? 0),
  });
});

// POST /api/arch/projetos/:id/orcamento
router.post("/arch/projetos/:id/orcamento", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const bodySchema = z.object({
    ambienteId:    z.string().optional(),
    categoria:     z.string().optional(),
    descricao:     z.string().min(1),
    quantidade:    z.coerce.number().nonnegative(),
    unidade:       z.string().optional(),
    valorUnitario: z.coerce.number().nonnegative(),
    fornecedor:    z.string().optional(),
    produtoId:     z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { quantidade, valorUnitario, ...rest } = parsed.data;
  const valorTotal = (quantidade * valorUnitario).toFixed(2);

  const [item] = await db
    .insert(archOrcamentoItensTable)
    .values({
      projetoId,
      quantidade: String(quantidade),
      valorUnitario: String(valorUnitario),
      valorTotal,
      ...rest,
    })
    .returning();

  await recalcularOrcamentoTotal(projetoId);

  return res.status(201).json(item);
});

// PATCH /api/arch/orcamento/:itemId
router.patch("/arch/orcamento/:itemId", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);

  const [existing] = await db
    .select({
      projetoId:     archOrcamentoItensTable.projetoId,
      quantidade:    archOrcamentoItensTable.quantidade,
      valorUnitario: archOrcamentoItensTable.valorUnitario,
    })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Item não encontrado." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, existing.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchOrcamentoItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const qty   = Number(parsed.data.quantidade    ?? existing.quantidade    ?? 0);
  const price = Number(parsed.data.valorUnitario ?? existing.valorUnitario ?? 0);
  const valorTotal = (qty * price).toFixed(2);

  const [updated] = await db
    .update(archOrcamentoItensTable)
    .set({ ...parsed.data, valorTotal })
    .where(eq(archOrcamentoItensTable.id, itemId))
    .returning();

  await recalcularOrcamentoTotal(existing.projetoId);

  return res.json(updated);
});

// DELETE /api/arch/orcamento/:itemId
router.delete("/arch/orcamento/:itemId", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);

  const [existing] = await db
    .select({ projetoId: archOrcamentoItensTable.projetoId })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Item não encontrado." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, existing.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db.delete(archOrcamentoItensTable).where(eq(archOrcamentoItensTable.id, itemId));
  await recalcularOrcamentoTotal(existing.projetoId);

  return res.status(204).send();
});

// POST /api/arch/orcamento/:itemId/vincular-produto
router.post("/arch/orcamento/:itemId/vincular-produto", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);

  const bodySchema = z.object({ produtoId: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [existing] = await db
    .select({
      projetoId:  archOrcamentoItensTable.projetoId,
      quantidade: archOrcamentoItensTable.quantidade,
    })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Item não encontrado." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, existing.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [produto] = await db
    .select({ precoBase: archCatalogoTable.precoBase, nome: archCatalogoTable.nome })
    .from(archCatalogoTable)
    .where(eq(archCatalogoTable.id, parsed.data.produtoId))
    .limit(1);

  if (!produto) return res.status(404).json({ error: "Produto não encontrado no catálogo." });

  const valorUnitario = String(produto.precoBase ?? "0");
  const valorTotal    = (Number(existing.quantidade ?? 0) * Number(valorUnitario)).toFixed(2);

  const [updated] = await db
    .update(archOrcamentoItensTable)
    .set({ produtoId: parsed.data.produtoId, valorUnitario, valorTotal })
    .where(eq(archOrcamentoItensTable.id, itemId))
    .returning();

  await recalcularOrcamentoTotal(existing.projetoId);

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// IA
// ─────────────────────────────────────────────────────────────────────────────

const iaItemSchema = z.object({
  ambiente:      z.string(),
  categoria:     z.string(),
  descricao:     z.string(),
  quantidade:    z.coerce.number(),
  unidade:       z.string(),
  valorUnitario: z.coerce.number(),
});

// POST /api/arch/projetos/:id/orcamento/gerar-ia
router.post("/arch/projetos/:id/orcamento/gerar-ia", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const ambientes = await db
    .select()
    .from(archAmbientesTable)
    .where(eq(archAmbientesTable.projetoId, projetoId))
    .orderBy(archAmbientesTable.ordem);

  const listaAmbientes = ambientes.length
    ? ambientes.map((a) => `${a.nome ?? "Sem nome"}${a.areaM2 ? ` (${a.areaM2}m²)` : ""}`).join(", ")
    : "Não especificado";

  const prompt = `Você é um especialista em orçamentos de arquitetura e design de interiores no Brasil.

Gere um orçamento detalhado e realista para a seguinte obra:
- Tipo de obra: ${projeto.tipoObra ?? "Reforma geral"}
- Área total: ${projeto.areaM2 ? `${projeto.areaM2}m²` : "não informada"}
- Ambientes: ${listaAmbientes}

Retorne APENAS um array JSON válido com objetos no formato:
[
  {
    "ambiente": "nome do ambiente",
    "categoria": "categoria do item (ex: Piso, Revestimento, Iluminação, Marcenaria, Pintura, Hidráulica, Elétrica, Móveis)",
    "descricao": "descrição do item",
    "quantidade": número,
    "unidade": "m², un, m, conjunto, etc.",
    "valorUnitario": número em reais
  }
]

Use preços de mercado brasileiro atuais. Seja detalhado e abrangente. Não inclua texto fora do JSON.`;

  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Erro ao chamar IA.", detail: err?.message });
  }

  const rawText = message.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");

  // Extrair JSON do response (pode vir com markdown)
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return res.status(422).json({ error: "IA não retornou JSON válido.", raw: rawText.slice(0, 500) });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return res.status(422).json({ error: "Falha ao parsear JSON da IA.", raw: rawText.slice(0, 500) });
  }

  const itemsRaw = z.array(iaItemSchema).safeParse(parsed);
  if (!itemsRaw.success) {
    return res.status(422).json({ error: "Schema inválido retornado pela IA.", detail: itemsRaw.error.flatten() });
  }

  // Mapear nome de ambiente para id
  const ambienteMap = new Map(ambientes.map((a) => [a.nome?.toLowerCase(), a.id]));

  const rows = itemsRaw.data.map((item) => {
    const ambienteId = ambienteMap.get(item.ambiente.toLowerCase()) ?? null;
    const valorTotal = (item.quantidade * item.valorUnitario).toFixed(2);
    return {
      projetoId,
      ambienteId,
      categoria:     item.categoria,
      descricao:     item.descricao,
      quantidade:    String(item.quantidade),
      unidade:       item.unidade,
      valorUnitario: String(item.valorUnitario),
      valorTotal,
      geradoPorIa:   true,
    };
  });

  const inseridos = await db
    .insert(archOrcamentoItensTable)
    .values(rows)
    .returning();

  await recalcularOrcamentoTotal(projetoId);

  return res.status(201).json({ count: inseridos.length, itens: inseridos });
});

export default router;
