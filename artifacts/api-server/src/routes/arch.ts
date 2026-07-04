import { Router, type Request, type IRouter } from "express";
import { and, eq, ilike, sql, desc, sum, ne, gte, lte, inArray } from "drizzle-orm";
import multer from "multer";
import {
  db,
  archProjetosTable,
  archAmbientesTable,
  archOrcamentoItensTable,
  archCenasTable,
  archRendersTable,
  archCatalogoTable,
  archMarketplaceItemsTable,
  archMarketplacePedidosTable,
  archRenderVersoesTable,
  archRenderSolicitacoesTable,
  archSuggestionsTable,
  renderSurfacesTable,
  renderSurfaceMaterialsTable,
  notificationsTable,
  tenantsTable,
  insertArchProjetoSchema,
  updateArchProjetoSchema,
  insertArchAmbienteSchema,
  updateArchAmbienteSchema,
  insertArchOrcamentoItemSchema,
  updateArchOrcamentoItemSchema,
  insertArchCatalogoSchema,
  updateArchCatalogoSchema,
  insertArchCenaSchema,
  updateArchCenaSchema,
  insertArchRenderSolicitacaoSchema,
  insertRenderSurfaceSchema,
  updateRenderSurfaceSchema,
  insertRenderSurfaceMaterialSchema,
  arqObjectsTable,
  arqMaterialsTable,
  arqAieSnapshotsTable,
  archPromptVariationsTable,
  insertArchPromptVariationSchema,
  updateArchPromptVariationSchema,
  arqdorWorkspaceProjectsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { authenticate } from "../middlewares/auth.js";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage.js";
import { iniciarRender, processarSolicitacao } from "../services/blenderService.js";
import { toFile } from "openai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { callReplicateFlux } from "../lib/ai-gateway.js";
import { automationLogsTable } from "@workspace/db";

function sanitizeAIError(err: any): { status: number; message: string } {
  const raw: string = err?.message ?? String(err ?? "");
  const rawLow = raw.toLowerCase();
  const httpStatus: number = err?.status ?? err?.statusCode ?? 500;

  if (
    rawLow.includes("billing hard limit") ||
    rawLow.includes("you exceeded your current quota") ||
    rawLow.includes("insufficient_quota") ||
    rawLow.includes("exceeded your current quota")
  ) {
    return { status: 402, message: "Limite de uso de IA atingido. Entre em contato com o suporte para recarregar os créditos." };
  }
  if (rawLow.includes("rate limit") || rawLow.includes("too many requests") || httpStatus === 429) {
    return { status: 429, message: "Muitas requisições simultâneas. Aguarde alguns segundos e tente novamente." };
  }
  if (rawLow.includes("content policy") || rawLow.includes("safety system")) {
    return { status: 400, message: "A imagem ou prompt foi bloqueado pela política de conteúdo. Tente com uma imagem diferente." };
  }
  const safeStatus = httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500;
  return { status: safeStatus, message: raw || "Erro ao processar com IA." };
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router: IRouter = Router();

// Rotas públicas (sem autenticação) — registradas antes do middleware authenticate no index.ts
const archPublicRouter: IRouter = Router();

function tenantId(req: Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccessTenant(req: Request, tid: string) {
  return isSuperAdmin(req) || tenantId(req) === tid;
}

function getPortalBaseUrl(req: Request): string {
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

  const [ambientes, orcamento, cenas, tenantRow] = await Promise.all([
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
    db
      .select({
        name:       tenantsTable.name,
        nomeEmpresa: tenantsTable.nomeEmpresa,
        logoUrl:    tenantsTable.logoUrl,
        site:       tenantsTable.site,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, projeto.tenantId))
      .limit(1),
  ]);

  return res.json({ projeto, ambientes, orcamento, cenas, tenant: tenantRow[0] ?? null });
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
    } as any)
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
    .set({ ...parsed.data, updatedAt: new Date() } as any)
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
    .values(parsed.data as any)
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
    .set(parsed.data as any)
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
// Cenas
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/projetos/:id/cenas
router.get("/arch/projetos/:id/cenas", authenticate, async (req, res) => {
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

  const cenas = await db
    .select()
    .from(archCenasTable)
    .where(eq(archCenasTable.projetoId, projetoId))
    .orderBy(desc(archCenasTable.createdAt));

  return res.json(cenas);
});

// POST /api/arch/projetos/:id/cenas
router.post("/arch/projetos/:id/cenas", authenticate, async (req, res) => {
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

  const parsed = insertArchCenaSchema.safeParse({ ...req.body, projetoId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [cena] = await db.insert(archCenasTable).values(parsed.data).returning();
  return res.status(201).json(cena);
});

// PATCH /api/arch/cenas/:cenaId
router.patch("/arch/cenas/:cenaId", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchCenaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [updated] = await db
    .update(archCenasTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(archCenasTable.id, cenaId))
    .returning();

  return res.json(updated);
});

// POST /api/arch/cenas/:cenaId/renderizar
router.post("/arch/cenas/:cenaId/renderizar", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId, status: archCenasTable.status })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  if (cena.status === "renderizando") {
    return res.status(409).json({ error: "Render já em andamento." });
  }

  const result = await iniciarRender(cenaId);
  return res.status(202).json(result);
});

// GET /api/arch/renders/gallery — renders recentes do tenant para o seletor de imagens da proposta
router.get("/arch/renders/gallery", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const limit = Math.min(Number(req.query.limit) || 40, 80);

  const rows = await db
    .select({
      id:        archRenderVersoesTable.id,
      imageUrl:  archRenderVersoesTable.imageUrl,
      versao:    archRenderVersoesTable.versao,
      origem:    archRenderVersoesTable.origem,
      createdAt: archRenderVersoesTable.createdAt,
      cenaId:    archRenderVersoesTable.cenaId,
      cenaNome:  archCenasTable.nome,
      projetoId: archCenasTable.projetoId,
    })
    .from(archRenderVersoesTable)
    .innerJoin(archCenasTable, eq(archCenasTable.id, archRenderVersoesTable.cenaId))
    .innerJoin(archProjetosTable, eq(archProjetosTable.id, archCenasTable.projetoId))
    .where(eq(archProjetosTable.tenantId, tid))
    .orderBy(desc(archRenderVersoesTable.createdAt))
    .limit(limit);

  return res.json(rows);
});

// GET /api/arch/cenas/:cenaId/render-status
router.get("/arch/cenas/:cenaId/render-status", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId, status: archCenasTable.status, renderUrl: archCenasTable.renderUrl })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  // Último render
  const [ultimoRender] = await db
    .select()
    .from(archRendersTable)
    .where(eq(archRendersTable.cenaId, cenaId))
    .orderBy(desc(archRendersTable.createdAt))
    .limit(1);

  return res.json({
    status:      cena.status,
    renderUrl:   cena.renderUrl,
    render:      ultimoRender ?? null,
  });
});

// DELETE /api/arch/cenas/:cenaId
router.delete("/arch/cenas/:cenaId", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  // Renders são removidos por CASCADE (FK cena_id → arch_cenas)
  await db.delete(archCenasTable).where(eq(archCenasTable.id, cenaId));

  return res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/catalogo
router.get("/arch/catalogo", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { categoria, fornecedor, busca, limit = "20", offset = "0" } =
    req.query as Record<string, string | undefined>;

  const conditions = [eq(archCatalogoTable.tenantId, tid), eq(archCatalogoTable.ativo, true)];
  if (categoria) conditions.push(eq(archCatalogoTable.categoria, categoria));
  if (fornecedor) conditions.push(ilike(archCatalogoTable.fornecedor, `%${fornecedor}%`));
  if (busca)      conditions.push(ilike(archCatalogoTable.nome, `%${busca}%`));

  const produtos = await db
    .select()
    .from(archCatalogoTable)
    .where(and(...conditions))
    .orderBy(desc(archCatalogoTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  return res.json(produtos);
});

// POST /api/arch/catalogo
router.post("/arch/catalogo", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const parsed = insertArchCatalogoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [produto] = await db.insert(archCatalogoTable).values(parsed.data as any).returning();
  return res.status(201).json(produto);
});

// POST /api/arch/catalogo/:id/imagens
router.post(
  "/arch/catalogo/:id/imagens",
  authenticate,
  upload.array("imagens", 5),
  async (req, res) => {
    const id = String(req.params.id);
    const tid = tenantId(req);

    const [produto] = await db
      .select({ tenantId: archCatalogoTable.tenantId, imagens: archCatalogoTable.imagens })
      .from(archCatalogoTable)
      .where(eq(archCatalogoTable.id, id))
      .limit(1);

    if (!produto) return res.status(404).json({ error: "Produto não encontrado." });
    if (!canAccessTenant(req, produto.tenantId)) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "Nenhuma imagem enviada." });

    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return res.status(500).json({ error: "PRIVATE_OBJECT_DIR não configurado." });

    const uploadedUrls: string[] = [];
    for (const file of files) {
      const ts   = Date.now();
      const ext  = file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
      const objectPath = `${privateDir}/arch-catalogo/${tid}/${id}/${ts}.${ext}`;
      const parts      = objectPath.replace(/^\//, "").split("/");
      const bucketName = parts[0]!;
      const objectName = parts.slice(1).join("/");

      const bucket  = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);
      await gcsFile.save(file.buffer, { contentType: file.mimetype, resumable: false });

      uploadedUrls.push(`/api/storage/objects/arch-catalogo/${tid}/${id}/${ts}.${ext}`);
    }

    const existing  = (produto.imagens as string[] | null) ?? [];
    const newImages = [...existing, ...uploadedUrls];

    const [updated] = await db
      .update(archCatalogoTable)
      .set({ imagens: newImages })
      .where(eq(archCatalogoTable.id, id))
      .returning();

    return res.json(updated);
  },
);

// PATCH /api/arch/catalogo/:id
router.patch("/arch/catalogo/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archCatalogoTable.tenantId })
    .from(archCatalogoTable)
    .where(eq(archCatalogoTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Produto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchCatalogoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [updated] = await db
    .update(archCatalogoTable)
    .set(parsed.data as any)
    .where(eq(archCatalogoTable.id, id))
    .returning();

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/marketplace
router.get("/arch/marketplace", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { categoria, precoMin, precoMax, busca, limit = "20", offset = "0" } =
    req.query as Record<string, string | undefined>;

  const conditions = [
    eq(archMarketplaceItemsTable.ativo, true),
    ne(archMarketplaceItemsTable.vendedorTenantId, tid),
  ];
  if (categoria) conditions.push(eq(archMarketplaceItemsTable.categoria, categoria));
  if (busca)     conditions.push(ilike(archMarketplaceItemsTable.nome, `%${busca}%`));
  if (precoMin)  conditions.push(gte(archMarketplaceItemsTable.preco, precoMin));
  if (precoMax)  conditions.push(lte(archMarketplaceItemsTable.preco, precoMax));

  const items = await db
    .select()
    .from(archMarketplaceItemsTable)
    .where(and(...conditions))
    .orderBy(desc(archMarketplaceItemsTable.totalVendas))
    .limit(Number(limit))
    .offset(Number(offset));

  return res.json(items);
});

// GET /api/arch/marketplace/meus-produtos
router.get("/arch/marketplace/meus-produtos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const items = await db
    .select()
    .from(archMarketplaceItemsTable)
    .where(eq(archMarketplaceItemsTable.vendedorTenantId, tid))
    .orderBy(desc(archMarketplaceItemsTable.createdAt));

  return res.json(items);
});

// GET /api/arch/marketplace/pedidos
router.get("/arch/marketplace/pedidos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const pedidos = await db
    .select()
    .from(archMarketplacePedidosTable)
    .where(eq(archMarketplacePedidosTable.compradorTenantId, tid))
    .orderBy(desc(archMarketplacePedidosTable.createdAt));

  return res.json(pedidos);
});

// GET /api/arch/marketplace/vendas
router.get("/arch/marketplace/vendas", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const vendas = await db
    .select({
      pedido:    archMarketplacePedidosTable,
      itemNome:  archMarketplaceItemsTable.nome,
    })
    .from(archMarketplacePedidosTable)
    .innerJoin(
      archMarketplaceItemsTable,
      eq(archMarketplacePedidosTable.itemId, archMarketplaceItemsTable.id),
    )
    .where(eq(archMarketplaceItemsTable.vendedorTenantId, tid))
    .orderBy(desc(archMarketplacePedidosTable.createdAt));

  const totalComissoes = vendas.reduce((acc, v) => acc + Number(v.pedido.comissao ?? 0), 0);

  return res.json({ vendas, totalComissoes });
});

// POST /api/arch/marketplace
router.post("/arch/marketplace", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const bodySchema = z.object({
    nome:           z.string().min(1),
    descricao:      z.string().optional(),
    categoria:      z.string().optional(),
    preco:          z.coerce.number().nonnegative(),
    especificacoes: z.record(z.string(), z.unknown()).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [item] = await db
    .insert(archMarketplaceItemsTable)
    .values({
      vendedorTenantId: tid,
      nome:             parsed.data.nome,
      descricao:        parsed.data.descricao,
      categoria:        parsed.data.categoria,
      preco:            String(parsed.data.preco),
      especificacoes:   parsed.data.especificacoes,
    })
    .returning();

  return res.status(201).json(item);
});

// PATCH /api/arch/marketplace/:itemId
router.patch("/arch/marketplace/:itemId", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);
  const tid    = tenantId(req);

  const [item] = await db
    .select({ vendedorTenantId: archMarketplaceItemsTable.vendedorTenantId })
    .from(archMarketplaceItemsTable)
    .where(eq(archMarketplaceItemsTable.id, itemId))
    .limit(1);

  if (!item) return res.status(404).json({ error: "Produto não encontrado." });
  if (item.vendedorTenantId !== tid && !isSuperAdmin(req)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const bodySchema = z.object({
    nome:      z.string().optional(),
    descricao: z.string().optional(),
    categoria: z.string().optional(),
    preco:     z.coerce.number().nonnegative().optional(),
    ativo:     z.boolean().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updates: Record<string, unknown> = {};
  if (parsed.data.nome      !== undefined) updates.nome      = parsed.data.nome;
  if (parsed.data.descricao !== undefined) updates.descricao = parsed.data.descricao;
  if (parsed.data.categoria !== undefined) updates.categoria = parsed.data.categoria;
  if (parsed.data.preco     !== undefined) updates.preco     = String(parsed.data.preco);
  if (parsed.data.ativo     !== undefined) updates.ativo     = parsed.data.ativo;

  const [updated] = await db
    .update(archMarketplaceItemsTable)
    .set(updates)
    .where(eq(archMarketplaceItemsTable.id, itemId))
    .returning();

  return res.json(updated);
});

// POST /api/arch/marketplace/:itemId/comprar
router.post("/arch/marketplace/:itemId/comprar", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);
  const tid    = tenantId(req);

  const bodySchema = z.object({
    quantidade: z.coerce.number().positive(),
    projetoId:  z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [item] = await db
    .select()
    .from(archMarketplaceItemsTable)
    .where(and(eq(archMarketplaceItemsTable.id, itemId), eq(archMarketplaceItemsTable.ativo, true)))
    .limit(1);

  if (!item) return res.status(404).json({ error: "Produto não encontrado no marketplace." });
  if (item.vendedorTenantId === tid) {
    return res.status(400).json({ error: "Não é possível comprar o próprio produto." });
  }

  const { quantidade, projetoId } = parsed.data;
  const valorUnitario = Number(item.preco ?? 0);
  const valorTotal    = quantidade * valorUnitario;
  const comissao      = valorTotal * 0.10;

  const [pedido] = await db
    .insert(archMarketplacePedidosTable)
    .values({
      compradorTenantId: tid,
      itemId,
      projetoId:         projetoId ?? null,
      quantidade:        String(quantidade),
      valorUnitario:     String(valorUnitario),
      valorTotal:        String(valorTotal.toFixed(2)),
      comissao:          String(comissao.toFixed(2)),
    })
    .returning();

  // Incrementar totalVendas do item
  await db
    .update(archMarketplaceItemsTable)
    .set({ totalVendas: sql`${archMarketplaceItemsTable.totalVendas} + 1` })
    .where(eq(archMarketplaceItemsTable.id, itemId));

  // Se projetoId, adicionar ao orçamento do projeto
  if (projetoId) {
    const vTotal = valorTotal.toFixed(2);
    await db.insert(archOrcamentoItensTable).values({
      projetoId,
      ambienteId:    null,
      categoria:     item.categoria ?? "Marketplace",
      descricao:     item.nome,
      quantidade:    String(quantidade),
      unidade:       "un",
      valorUnitario: String(valorUnitario),
      valorTotal:    vTotal,
      fornecedor:    item.vendedorTenantId,
      produtoId:     itemId,
    });
    await recalcularOrcamentoTotal(projetoId);
  }

  // Notificar vendedor
  await db.insert(notificationsTable).values({
    tenantId: item.vendedorTenantId,
    title:    "Nova venda no Marketplace",
    message:  `Seu produto "${item.nome}" foi comprado (qtd: ${quantidade}). Valor: R$ ${valorTotal.toFixed(2)} — Comissão VendorAI: R$ ${comissao.toFixed(2)}.`,
    type:     "info",
    category: "general",
  });

  return res.status(201).json({ pedido, comissao });
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
    .set({ ...parsed.data, valorTotal } as any)
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
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ error: message });
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

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolver tenantId a partir do cenaId
// ─────────────────────────────────────────────────────────────────────────────
async function getCenaTenant(cenaId: string): Promise<{ cena: typeof archCenasTable.$inferSelect; tenantId: string; projetoNome: string | null } | null> {
  const [cena] = await db
    .select()
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return null;

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId, titulo: archProjetosTable.titulo })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto) return null;

  return { cena, tenantId: projeto.tenantId, projetoNome: projeto.titulo ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/cenas/:cenaId/versoes (autenticado)
// Listar versões de render ordenadas por versao desc
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/cenas/:cenaId/versoes", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const versoes = await db
    .select({
      id:        archRenderVersoesTable.id,
      versao:    archRenderVersoesTable.versao,
      imageUrl:  archRenderVersoesTable.imageUrl,
      origem:    archRenderVersoesTable.origem,
      createdAt: archRenderVersoesTable.createdAt,
    })
    .from(archRenderVersoesTable)
    .where(eq(archRenderVersoesTable.cenaId, cenaId))
    .orderBy(desc(archRenderVersoesTable.versao));

  return res.json(versoes);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/cenas/:cenaId/versoes/download (autenticado)
// Registrar log de download e retornar URL original + nome sugerido
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/cenas/:cenaId/versoes/download", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const bodySchema = z.object({ versaoId: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "versaoId é obrigatório." });

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const [versao] = await db
    .select({ id: archRenderVersoesTable.id, versao: archRenderVersoesTable.versao, imageUrl: archRenderVersoesTable.imageUrl })
    .from(archRenderVersoesTable)
    .where(and(eq(archRenderVersoesTable.id, parsed.data.versaoId), eq(archRenderVersoesTable.cenaId, cenaId)))
    .limit(1);

  if (!versao) return res.status(404).json({ error: "Versão não encontrada." });

  const nomeProjeto = (ctx.projetoNome ?? "projeto")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const nomeArquivo = `render-${nomeProjeto}-v${versao.versao}.png`;

  // Log de download (sem modificar a imagem)
  req.log.info({ versaoId: versao.id, cenaId, nomeArquivo }, "arch:download-versao");

  return res.json({ imageUrl: versao.imageUrl, versao: versao.versao, nomeArquivo });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/cenas/:cenaId/solicitacoes (autenticado)
// Listar solicitações da cena
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/cenas/:cenaId/solicitacoes", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const solicitacoes = await db
    .select()
    .from(archRenderSolicitacoesTable)
    .where(eq(archRenderSolicitacoesTable.cenaId, cenaId))
    .orderBy(desc(archRenderSolicitacoesTable.createdAt));

  return res.json(solicitacoes);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/cenas/:cenaId/solicitacoes (PÚBLICA — portal do cliente)
// Criar solicitação e disparar render em background
// ─────────────────────────────────────────────────────────────────────────────
archPublicRouter.post("/arch/cenas/:cenaId/solicitacoes", async (req, res) => {
  const cenaId = String(req.params.cenaId);

  // Verificar que a cena existe (sem checar tenant — rota pública)
  const [cena] = await db
    .select({ id: archCenasTable.id })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const solSchema = insertArchRenderSolicitacaoSchema.extend({
    clienteNome:       z.string().max(255).optional(),
    observacoes:       z.string().optional(),
    itensAdicionados:  z.array(z.object({
      tipo:    z.enum(["sofa", "mesa", "cadeira", "cama", "armario", "luminaria", "janela", "porta"]),
      cor:     z.string(),
      posicao: z.enum(["esquerda", "centro", "direita"]),
    })).optional(),
    texturasAlteradas: z.array(z.object({
      superficie: z.enum(["parede", "piso", "teto"]),
      material:   z.enum(["madeira", "marmore", "cimento", "tinta"]),
      cor:        z.string(),
    })).optional(),
  }).omit({ cenaId: true, versaoGeradaId: true, status: true });

  const parsed = solSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos.", detail: parsed.error.flatten() });
  }

  const { itensAdicionados, texturasAlteradas } = parsed.data;
  const temItens    = itensAdicionados    && itensAdicionados.length > 0;
  const temTexturas = texturasAlteradas   && texturasAlteradas.length > 0;

  if (!temItens && !temTexturas) {
    return res.status(400).json({ error: "Informe pelo menos 1 item ou 1 textura a alterar." });
  }

  const [solicitacao] = await db
    .insert(archRenderSolicitacoesTable)
    .values({ ...parsed.data, cenaId, status: "pendente" })
    .returning({ id: archRenderSolicitacoesTable.id, status: archRenderSolicitacoesTable.status });

  if (!solicitacao) return res.status(500).json({ error: "Falha ao criar solicitação." });

  // Disparar processamento em background — não aguardar resposta
  setImmediate(() => {
    processarSolicitacao(solicitacao.id).catch(() => undefined);
  });

  return res.status(201).json({
    solicitacaoId: solicitacao.id,
    status:        "pendente",
    mensagem:      "Seu render está sendo gerado",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/cenas/:cenaId/solicitacoes/:solId/status (PÚBLICA — polling)
// ─────────────────────────────────────────────────────────────────────────────
archPublicRouter.get("/arch/cenas/:cenaId/solicitacoes/:solId/status", async (req, res) => {
  const cenaId = String(req.params.cenaId);
  const solId  = String(req.params.solId);

  const [sol] = await db
    .select({
      id:              archRenderSolicitacoesTable.id,
      cenaId:          archRenderSolicitacoesTable.cenaId,
      status:          archRenderSolicitacoesTable.status,
      versaoGeradaId:  archRenderSolicitacoesTable.versaoGeradaId,
    })
    .from(archRenderSolicitacoesTable)
    .where(
      and(
        eq(archRenderSolicitacoesTable.id, solId),
        eq(archRenderSolicitacoesTable.cenaId, cenaId),
      ),
    )
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });

  // Se já tem versão gerada, retornar imageUrl
  if (sol.versaoGeradaId) {
    const [versao] = await db
      .select({ imageUrl: archRenderVersoesTable.imageUrl })
      .from(archRenderVersoesTable)
      .where(eq(archRenderVersoesTable.id, sol.versaoGeradaId))
      .limit(1);

    return res.json({ status: sol.status, imageUrl: versao?.imageUrl ?? null, versaoGeradaId: sol.versaoGeradaId });
  }

  // Se em processamento, verificar se a cena já tem renderUrl nova (via scheduler)
  if (sol.status === "processando") {
    const [cena] = await db
      .select({ renderUrl: archCenasTable.renderUrl, status: archCenasTable.status })
      .from(archCenasTable)
      .where(eq(archCenasTable.id, cenaId))
      .limit(1);

    if (cena?.renderUrl && cena.status !== "renderizando") {
      // Render concluído — criar versão e vincular (lazy promotion)
      const [ultimaVersao] = await db
        .select({ versao: archRenderVersoesTable.versao })
        .from(archRenderVersoesTable)
        .where(eq(archRenderVersoesTable.cenaId, cenaId))
        .orderBy(desc(archRenderVersoesTable.versao))
        .limit(1);

      const proximaVersao = (ultimaVersao?.versao ?? 0) + 1;

      const [novaVersao] = await db
        .insert(archRenderVersoesTable)
        .values({
          cenaId,
          versao:   proximaVersao,
          imageUrl: cena.renderUrl,
          origem:   "solicitacao",
        })
        .returning({ id: archRenderVersoesTable.id, imageUrl: archRenderVersoesTable.imageUrl });

      if (novaVersao) {
        await db
          .update(archRenderSolicitacoesTable)
          .set({ status: "concluido", versaoGeradaId: novaVersao.id, processadoEm: new Date() })
          .where(eq(archRenderSolicitacoesTable.id, solId));

        return res.json({ status: "concluido", imageUrl: novaVersao.imageUrl });
      }
    }
  }

  return res.json({ status: sol.status, imageUrl: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/projetos/:projetoId/solicitacoes (autenticado)
// Listar todas as solicitações do projeto (todas as cenas), com join
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/projetos/:projetoId/solicitacoes", authenticate, async (req, res) => {
  const projetoId = String(req.params.projetoId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const rows = await db
    .select({
      id:                archRenderSolicitacoesTable.id,
      cenaId:            archRenderSolicitacoesTable.cenaId,
      cenaNome:          archCenasTable.nome,
      clienteNome:       archRenderSolicitacoesTable.clienteNome,
      status:            archRenderSolicitacoesTable.status,
      itensAdicionados:  archRenderSolicitacoesTable.itensAdicionados,
      texturasAlteradas: archRenderSolicitacoesTable.texturasAlteradas,
      observacoes:       archRenderSolicitacoesTable.observacoes,
      versaoGeradaId:    archRenderSolicitacoesTable.versaoGeradaId,
      versaoNum:         archRenderVersoesTable.versao,
      imageUrl:          archRenderVersoesTable.imageUrl,
      createdAt:         archRenderSolicitacoesTable.createdAt,
      processadoEm:      archRenderSolicitacoesTable.processadoEm,
    })
    .from(archRenderSolicitacoesTable)
    .innerJoin(archCenasTable, eq(archRenderSolicitacoesTable.cenaId, archCenasTable.id))
    .leftJoin(archRenderVersoesTable, eq(archRenderSolicitacoesTable.versaoGeradaId, archRenderVersoesTable.id))
    .where(eq(archCenasTable.projetoId, projetoId))
    .orderBy(desc(archRenderSolicitacoesTable.createdAt));

  return res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/cenas/:cenaId/solicitacoes/:solId/retry (autenticado)
// Re-processar uma solicitação com erro
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/cenas/:cenaId/solicitacoes/:solId/retry", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);
  const solId  = String(req.params.solId);

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const [sol] = await db
    .select({ id: archRenderSolicitacoesTable.id, status: archRenderSolicitacoesTable.status })
    .from(archRenderSolicitacoesTable)
    .where(and(
      eq(archRenderSolicitacoesTable.id, solId),
      eq(archRenderSolicitacoesTable.cenaId, cenaId),
    ))
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (sol.status === "processando") return res.status(409).json({ error: "Solicitação já está sendo processada." });

  await db
    .update(archRenderSolicitacoesTable)
    .set({ status: "pendente", versaoGeradaId: null, processadoEm: null })
    .where(eq(archRenderSolicitacoesTable.id, solId));

  setImmediate(() => {
    processarSolicitacao(solId).catch(() => undefined);
  });

  return res.json({ ok: true, status: "pendente" });
});

// ── Schemas de validação ────────────────────────────────────────────────────
const archRenderBodySchema = z.object({
  referenceImageUrl: z.string().optional(),
  lighting: z.enum(["auto", "manha", "tarde", "golden", "noturno", "nublado"]).default("auto"),
  angle:    z.enum(["frontal", "45", "lateral_esq", "lateral_dir", "ampla", "aerea"]).default("frontal"),
  roomType: z.string().default("fachada externa"),
  estilo:   z.string().optional(),
  materials: z.array(z.object({
    zone:             z.string(),
    materialName:     z.string(),
    promptFragment:   z.string(),
  })).default([]),
  userNotes: z.string().optional(),
});

const lightingMapArch: Record<string, string> = {
  manha:   "Early morning daylight (7–9 am): soft warm sunlight from low angle, gentle shadows, golden-warm color temperature.",
  tarde:   "Bright midday/afternoon (1–4 pm): strong overhead daylight, crisp shadows, neutral-white color temperature.",
  golden:  "Golden hour (5–6 pm): warm amber-orange sunlight raking across surfaces, long soft shadows, romantic golden glow.",
  noturno: "Night scene (8 pm+): TURN ON all lamps, exterior fixtures, and lighting elements physically present; dark sky; warm artificial light; no daylight.",
  nublado: "Overcast cloudy day: soft diffuse light with no direct sun, cool neutral tones, no hard shadows, even illumination.",
};

const angleMapArch: Record<string, string> = {
  frontal:     "straight-on frontal camera angle",
  "45":        "45-degree diagonal perspective angle",
  lateral_esq: "side view from the left (−90° Y-axis rotation from frontal view)",
  lateral_dir: "side view from the right (+90° Y-axis rotation from frontal view)",
  ampla:       "wide-angle lens expansive view",
  aerea:       "aerial top-down bird's-eye view",
};

// ── POST /api/arch/render — Renderização por IA com preservação estrutural ──
router.post("/arch/render", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = archRenderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const { referenceImageUrl, lighting, angle, roomType, estilo, materials, userNotes } = parsed.data;
  const isExterior = !roomType || roomType === "fachada externa";

  const preservationRules = isExterior
    ? [
        "ABSOLUTE PRESERVATION RULES — NEVER BREAK:",
        "• DO NOT add any new element (trees, cars, people, plants, decorations) not already visible in the reference.",
        "• DO NOT remove, move, or alter any existing architectural element.",
        "• DO NOT change viewpoint, perspective, or camera position.",
        "• Preserve PIXEL-EXACTLY: building shape, footprint, number of floors, all window positions, all door positions, roof geometry, every structural volume.",
        "PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition.",
      ].join(" ")
    : [
        "ABSOLUTE PRESERVATION RULES — NEVER BREAK:",
        "• DO NOT add any object, furniture, plant, decoration, or element not already present in the reference.",
        "• DO NOT remove, move, reposition, or replace any existing furniture or object.",
        "• DO NOT change viewpoint, perspective, or camera angle.",
        "• Preserve PIXEL-EXACTLY: room geometry, all wall/window/door positions, ceiling height, every piece of furniture in its exact place.",
        "PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition.",
      ].join(" ");

  const materialInstructions = materials.length > 0
    ? [
        "MATERIAL APPLICATIONS (apply only to each specified zone — leave ALL other surfaces unchanged):",
        ...materials.map(m => `• ${m.zone}: ${m.promptFragment} — photorealistic texture, correct scale and perspective`),
      ].join(" ")
    : null;

  const lightingInstruction = lighting !== "auto" && lightingMapArch[lighting]
    ? `LIGHTING CONDITION: ${lightingMapArch[lighting]}`
    : null;

  const angleInstruction = angleMapArch[angle]
    ? `CAMERA ANGLE: render from a ${angleMapArch[angle]}.`
    : null;

  const estiloMap: Record<string, string> = {
    minimalista:   "minimalist style with clean lines, neutral palette (white/grey/beige), uncluttered spaces",
    contemporaneo: "contemporary modern style with bold geometric forms and refined materials",
    classico:      "timeless classic style with quality materials, warm tones, and refined simplicity",
    industrial:    "industrial style with raw concrete, exposed steel, and dark tones",
    escandinavo:   "Scandinavian style with natural light, pale wood, and simple functional forms",
    tropical:      "tropical Brazilian style with warm earthy tones, natural textures, and lush accents",
  };
  const estiloInstruction = estilo && estiloMap[estilo]
    ? `VISUAL STYLE: ${estiloMap[estilo]}.`
    : null;

  const prompt = [
    "You are a professional architectural visualization engine.",
    `Transform this ${isExterior ? "architectural photo" : "interior photo"} into a photorealistic render.`,
    preservationRules,
    materialInstructions,
    estiloInstruction,
    lightingInstruction,
    angleInstruction,
    userNotes ? `Additional notes: ${userNotes}` : null,
    "Output: ultra-sharp 4K detail, high dynamic range, photorealistic, Brazilian architecture context.",
  ].filter(Boolean).join(" ");

  try {
    const storage = new ObjectStorageService();
    let b64: string | undefined;
    let motor = "gpt-image-1";

    if (referenceImageUrl) {
      // Validate data URL before anything else
      const dataUrlMatch = referenceImageUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ success: false, error: "referenceImageUrl deve ser um data URL base64 válido (data:<mime>;base64,<dados>)" });
      }

      // ── Try Replicate Flux+ControlNet first ───────────────────────
      if (process.env["REPLICATE_API_TOKEN"]) {
        try {
          b64    = await callReplicateFlux({ controlImageDataUrl: referenceImageUrl, prompt, logger: req.log });
          motor  = "replicate-flux";
        } catch (replicateErr: any) {
          req.log.warn({ err: replicateErr?.message, tenantId: tid }, "arch/render: Replicate falhou → fallback gpt-image-1");
          db.insert(automationLogsTable).values({
            flow: "render_fallback", step: "replicate_to_openai",
            status: "warning", errorMessage: replicateErr?.message ?? "Replicate failed",
          }).catch(() => undefined);
        }
      }

      // ── Fallback: gpt-image-1 (img2img) ──────────────────────────
      if (!b64) {
        const openai    = await getOpenAIForTenant(tid);
        const mimeType  = dataUrlMatch[1];
        const imgBuffer = Buffer.from(dataUrlMatch[2], "base64");
        const ext       = mimeType.split("/")[1] ?? "png";
        const refFile   = await toFile(imgBuffer, `reference.${ext}`, { type: mimeType });
        const result    = await (openai.images.edit as Function)({
          model: "gpt-image-1", image: refFile, prompt, n: 1, size: "1536x1024", quality: "high",
        });
        b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
      }
    } else {
      // No reference image — text-to-image via gpt-image-1
      const openai = await getOpenAIForTenant(tid);
      const result = await (openai.images.generate as Function)({
        model: "gpt-image-1", prompt, n: 1, size: "1536x1024", quality: "high",
      });
      b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    }

    if (!b64) throw new Error("Motor de render não retornou imagem");

    const buf       = Buffer.from(b64, "base64");
    const objPath   = await storage.savePrivateBuffer(buf, "image/png", `arch-render-${tid}-${Date.now()}.png`);
    const servePath = objPath.replace(/^\/objects\//, "");
    const imageUrl  = `/api/storage/objects/${servePath}`;

    req.log.info({ tenantId: tid, lighting, angle, motor }, "arch/render: concluído");
    return res.json({ success: true, imageUrl, prompt, motor });
  } catch (err: any) {
    req.log.error({ err, tenantId: tid }, "arch/render: erro");
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ success: false, error: message });
  }
});

// ── POST /api/arch/suggestions — Card de sugestões de decoração por IA ──────
const archSuggestionsBodySchema = z.object({
  style:             z.enum(["minimalista", "atemporal", "provencal", "neoclassico", "moderno"]),
  projectId:         z.string().optional(),
  referenceImageUrl: z.string().optional(),
});

const stylePromptsMap: Record<string, string> = {
  minimalista:  "minimalist interior design: clean lines, very few elements, neutral palette (white/grey/beige), functional furniture with simple forms, open empty spaces, no clutter, soft diffuse natural lighting",
  atemporal:    "timeless interior design: classic discreet elements, balanced neutral palette, quality materials (solid wood, stone, linen), refined simplicity, warm ambient light, no trendy items",
  provencal:    "Provençal rustic French interior: aged distressed wood furniture, pastel tones (lavender, cream, sage green), wrought iron details, linen curtains, dried flower arrangements, terracotta accents, warm natural light",
  neoclassico:  "neoclassical interior: symmetrical layout, ivory and gold tones, ornamental columns or pilasters, high ceiling with plaster moldings, elegant curved-leg furniture, crystal chandelier lighting",
  moderno:      "modern contemporary interior: bold geometric forms, industrial materials (exposed concrete, glass, steel), contrasting dark/light palette, integrated technology, architectural statement lighting, abstract artwork",
};

router.post("/arch/suggestions", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = archSuggestionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const { style, projectId, referenceImageUrl } = parsed.data;
  const styleDesc = stylePromptsMap[style] ?? style;

  const suggestionPrompt = referenceImageUrl
    ? `Use this room as the spatial reference and transform it into an inspiring decoration concept with ${styleDesc}. You MAY freely add furniture, decorative objects, plants, art, rugs, and atmospheric lighting to fill the space. This is a decoration INSPIRATION image — creative additions are welcome and encouraged. Photorealistic render, 4K quality.`
    : `Generate an inspiring interior decoration concept with ${styleDesc}. A beautifully decorated room filled with furniture, plants, art objects, rugs, and atmospheric lighting. Photorealistic render, 4K quality, Brazilian residential context.`;

  try {
    const openai  = await getOpenAIForTenant(tid);
    const storage = new ObjectStorageService();
    let b64: string | undefined;

    if (referenceImageUrl) {
      const dataUrlMatch = referenceImageUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ success: false, error: "referenceImageUrl deve ser um data URL base64 válido" });
      }
      const mimeType  = dataUrlMatch[1];
      const imgBuffer = Buffer.from(dataUrlMatch[2], "base64");
      const ext       = mimeType.split("/")[1] ?? "png";
      const refFile   = await toFile(imgBuffer, `reference.${ext}`, { type: mimeType });
      const result    = await (openai.images.edit as Function)({
        model:   "gpt-image-1",
        image:   refFile,
        prompt:  suggestionPrompt,
        n:       1,
        size:    "1024x1024",
        quality: "medium",
      });
      b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    } else {
      const result = await (openai.images.generate as Function)({
        model:   "gpt-image-1",
        prompt:  suggestionPrompt,
        n:       1,
        size:    "1024x1024",
        quality: "medium",
      });
      b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    }

    if (!b64) throw new Error("gpt-image-1 não retornou imagem");

    const buf       = Buffer.from(b64, "base64");
    const objPath   = await storage.savePrivateBuffer(buf, "image/png", `arch-suggestion-${tid}-${Date.now()}.png`);
    const servePath = objPath.replace(/^\/objects\//, "");
    const imageUrl  = `/api/storage/objects/${servePath}`;

    let suggestionId: string | undefined;
    try {
      const [saved] = await db
        .insert(archSuggestionsTable)
        .values({ tenantId: tid, projectId: projectId ?? null, style, imageUrl })
        .returning({ id: archSuggestionsTable.id });
      suggestionId = saved?.id;
    } catch (dbErr) {
      req.log.warn({ dbErr }, "arch/suggestions: falha ao persistir no DB");
    }

    req.log.info({ tenantId: tid, style }, "arch/suggestions: concluído");
    return res.json({ success: true, imageUrl, suggestionId, saved: !!suggestionId });
  } catch (err: any) {
    req.log.error({ err, tenantId: tid }, "arch/suggestions: erro");
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ success: false, error: message });
  }
});

// ── GET /api/arch/surfaces/:projectId — Listar superfícies do projeto ────────
router.get("/arch/surfaces/:projectId", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const { projectId } = req.params;

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado" });

  const surfaces = await db
    .select()
    .from(renderSurfacesTable)
    .where(eq(renderSurfacesTable.projectId, projectId))
    .orderBy(renderSurfacesTable.displayOrder, renderSurfacesTable.createdAt);

  return res.json(surfaces);
});

// ── POST /api/arch/surfaces — Criar superfície ───────────────────────────────
router.post("/arch/surfaces", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const parsed = insertRenderSurfaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues.map(i => i.message).join("; ") });
  }

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, parsed.data.projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado" });

  const [surface] = await db
    .insert(renderSurfacesTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(surface);
});

// ── PATCH /api/arch/surfaces/:surfaceId — Atualizar superfície ───────────────
router.patch("/arch/surfaces/:surfaceId", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const { surfaceId } = req.params;
  const parsed = updateRenderSurfaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues.map(i => i.message).join("; ") });
  }

  const [existing] = await db
    .select({ projectId: renderSurfacesTable.projectId })
    .from(renderSurfacesTable)
    .where(eq(renderSurfacesTable.id, surfaceId));

  if (!existing) return res.status(404).json({ error: "Superfície não encontrada" });

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, existing.projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(403).json({ error: "Acesso negado" });

  const [updated] = await db
    .update(renderSurfacesTable)
    .set(parsed.data)
    .where(eq(renderSurfacesTable.id, surfaceId))
    .returning();

  return res.json(updated);
});

// ── POST /api/arch/surfaces/:surfaceId/material — Aplicar material ────────────
router.post("/arch/surfaces/:surfaceId/material", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const { surfaceId } = req.params;

  const parsed = insertRenderSurfaceMaterialSchema.omit({ surfaceId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues.map(i => i.message).join("; ") });
  }

  const [existing] = await db
    .select({ projectId: renderSurfacesTable.projectId })
    .from(renderSurfacesTable)
    .where(eq(renderSurfacesTable.id, surfaceId));

  if (!existing) return res.status(404).json({ error: "Superfície não encontrada" });

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, existing.projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(403).json({ error: "Acesso negado" });

  const [applied] = await db
    .insert(renderSurfaceMaterialsTable)
    .values({ ...parsed.data, surfaceId, appliedBy: (req as any).user?.id ?? null })
    .returning();

  return res.status(201).json(applied);
});

// ─────────────────────────────────────────────────────────────────────────────
// ARQ PROJECTS — workspace persistence (objects, materials, AIE snapshots)
// ─────────────────────────────────────────────────────────────────────────────

// GET /arq/projects — list workspace projects for tenant
router.get("/arq/projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projetos = await db
    .select({
      id:          archProjetosTable.id,
      titulo:      archProjetosTable.titulo,
      clienteNome: archProjetosTable.clienteNome,
      status:      archProjetosTable.status,
      tipoObra:    archProjetosTable.tipoObra,
      areaM2:      archProjetosTable.areaM2,
      createdAt:   archProjetosTable.createdAt,
      updatedAt:   archProjetosTable.updatedAt,
    })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid))
    .orderBy(desc(archProjetosTable.updatedAt));
  return res.json(projetos);
});

// GET /arq/projects/:id — get project with objects + materials
router.get("/arq/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const [objects, materials] = await Promise.all([
    db.select().from(arqObjectsTable).where(eq(arqObjectsTable.projetoId, id)),
    db.select().from(arqMaterialsTable).where(eq(arqMaterialsTable.projetoId, id)),
  ]);

  return res.json({ projeto, objects, materials });
});

// POST /arq/projects — create project
router.post("/arq/projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const parsed = insertArchProjetoSchema.safeParse({
    ...req.body,
    tenantId: tid,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [projeto] = await db
    .insert(archProjetosTable)
    .values({ ...parsed.data, portalToken: crypto.randomUUID(), portalAtivo: false } as any)
    .returning();
  return res.status(201).json(projeto);
});

// PATCH /arq/projects/:id — update project metadata
router.patch("/arq/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [existing] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = updateArchProjetoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [updated] = await db
    .update(archProjetosTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(archProjetosTable.id, id))
    .returning();
  return res.json(updated);
});

// DELETE /arq/projects/:id — delete project (cascades to objects/materials/aie_snapshots)
router.delete("/arq/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [existing] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });

  await db.delete(archProjetosTable).where(eq(archProjetosTable.id, id));
  return res.status(204).end();
});

const arqObjectRowSchema = z.object({
  objectClientId:  z.string(),
  name:            z.string(),
  category:        z.string(),
  material:        z.string().optional(),
  finish:          z.string().optional(),
  color:           z.string().optional(),
  dimensions:      z.object({ width: z.number(), height: z.number(), depth: z.number(), unit: z.string() }).optional(),
  position:        z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  visualWeight:    z.number().optional(),
  designIntent:    z.array(z.string()).optional(),
  componentId:     z.string().optional(),
  manufacturerId:  z.string().optional(),
  locked:          z.boolean().optional(),
});

// PUT /arq/projects/:id/objects — replace all objects for project
router.put("/arq/projects/:id/objects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = z.array(arqObjectRowSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await db.delete(arqObjectsTable).where(eq(arqObjectsTable.projetoId, id));

  if (parsed.data.length > 0) {
    await db.insert(arqObjectsTable).values(
      parsed.data.map(o => ({ ...o, projetoId: id }))
    );
  }

  await db
    .update(archProjetosTable)
    .set({ updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const objects = await db.select().from(arqObjectsTable).where(eq(arqObjectsTable.projetoId, id));
  return res.json(objects);
});

const arqMaterialRowSchema = z.object({
  materialClientId: z.string(),
  name:             z.string(),
  category:         z.string(),
  manufacturer:     z.string().default(""),
  finish:           z.string().default(""),
  gloss:            z.number().optional(),
  palette:          z.array(z.string()).optional(),
  usedByObjects:    z.array(z.string()).optional(),
});

// PUT /arq/projects/:id/materials — replace all materials for project
router.put("/arq/projects/:id/materials", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = z.array(arqMaterialRowSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await db.delete(arqMaterialsTable).where(eq(arqMaterialsTable.projetoId, id));

  if (parsed.data.length > 0) {
    await db.insert(arqMaterialsTable).values(
      parsed.data.map(m => ({ ...m, projetoId: id }))
    );
  }

  await db
    .update(archProjetosTable)
    .set({ updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const materials = await db.select().from(arqMaterialsTable).where(eq(arqMaterialsTable.projetoId, id));
  return res.json(materials);
});

const arqAieSnapshotBodySchema = z.object({
  scores: z.object({
    overall:         z.number(),
    renderReadiness: z.number(),
    material:        z.number(),
    consistency:     z.number(),
    composition:     z.number(),
    lighting:        z.number(),
    photography:     z.number(),
    geometry:        z.number(),
    promptQuality:   z.number(),
  }),
  fullResult:       z.any(),
  projectSnapshot:  z.any().optional(),
});

// POST /arq/projects/:id/aie-snapshots — save AIE result snapshot
router.post("/arq/projects/:id/aie-snapshots", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = arqAieSnapshotBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { scores, fullResult, projectSnapshot } = parsed.data;

  const [snapshot] = await db
    .insert(arqAieSnapshotsTable)
    .values({
      projetoId:            id,
      overallScore:         scores.overall,
      renderReadinessScore: scores.renderReadiness,
      materialScore:        scores.material,
      consistencyScore:     scores.consistency,
      compositionScore:     scores.composition,
      lightingScore:        scores.lighting,
      photographyScore:     scores.photography,
      geometryScore:        scores.geometry,
      promptQualityScore:   scores.promptQuality,
      fullResult,
      projectSnapshot: projectSnapshot ?? null,
    })
    .returning();

  return res.status(201).json(snapshot);
});

// GET /arq/projects/:id/aie-snapshots — get AIE snapshot history for learning engine
router.get("/arq/projects/:id/aie-snapshots", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String(req.params.id);

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const snapshots = await db
    .select()
    .from(arqAieSnapshotsTable)
    .where(eq(arqAieSnapshotsTable.projetoId, id))
    .orderBy(desc(arqAieSnapshotsTable.createdAt));

  return res.json(snapshots);
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Variations — server-side persistence
// ─────────────────────────────────────────────────────────────────────────────

// GET /arch/prompt-variations — list all variations for the current user
router.get("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;

  const rows = await db
    .select()
    .from(archPromptVariationsTable)
    .where(
      and(
        eq(archPromptVariationsTable.tenantId, tid),
        eq(archPromptVariationsTable.userId, uid),
      ),
    )
    .orderBy(desc(archPromptVariationsTable.savedAt));

  return res.json(rows);
});

// POST /arch/prompt-variations — create a new variation
router.post("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;

  const body = insertArchPromptVariationSchema.safeParse({
    ...req.body,
    tenantId: tid,
    userId: uid,
  });

  if (!body.success) {
    return res.status(400).json({ error: "Dados inválidos", details: body.error.issues });
  }

  const [row] = await db
    .insert(archPromptVariationsTable)
    .values(body.data)
    .returning();

  return res.status(201).json(row);
});

// PATCH /arch/prompt-variations/:id — rename or update notes
router.patch("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;
  const id = req.params.id;

  const body = updateArchPromptVariationSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Dados inválidos", details: body.error.issues });
  }

  const [row] = await (db as any)
    .update(archPromptVariationsTable)
    .set({ ...body.data, updatedAt: new Date() } as any)
    .where(
      and(
        eq(archPromptVariationsTable.id, id),
        eq(archPromptVariationsTable.tenantId, tid!),
        eq(archPromptVariationsTable.userId, uid),
      )!,
    )
    .returning();

  if (!row) return res.status(404).json({ error: "Variação não encontrada" });
  return res.json(row);
});

// DELETE /arch/prompt-variations/:id — remove a variation
router.delete("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;
  const id = req.params.id;

  const [row] = await (db as any)
    .delete(archPromptVariationsTable)
    .where(
      and(
        eq(archPromptVariationsTable.id, id),
        eq(archPromptVariationsTable.tenantId, tid!),
        eq(archPromptVariationsTable.userId, uid),
      )!,
    )
    .returning({ id: archPromptVariationsTable.id });

  if (!row) return res.status(404).json({ error: "Variação não encontrada" });
  return res.json({ ok: true });
});

// POST /arch/prompt-variations/bulk — migrate localStorage batch on first login
router.post("/arch/prompt-variations/bulk", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;

  const items = z.array(insertArchPromptVariationSchema.omit({ tenantId: true, userId: true })).safeParse(req.body);
  if (!items.success) {
    return res.status(400).json({ error: "Dados inválidos", details: items.error.issues });
  }

  if (items.data.length === 0) return res.json([]);

  const rows = await db
    .insert(archPromptVariationsTable)
    .values(items.data.map(v => ({ ...v, tenantId: tid, userId: uid })))
    .onConflictDoNothing()
    .returning();

  return res.status(201).json(rows);
});

// GET /arq/learning — build learning profile from all tenant project snapshots
router.get("/arq/learning", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const projetos = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid));

  if (projetos.length === 0) return res.json({ snapshots: [], contexts: [] });

  const projectIds = projetos.map(p => p.id);

  const snapshots = await db
    .select({
      projetoId:      arqAieSnapshotsTable.projetoId,
      projectSnapshot: arqAieSnapshotsTable.projectSnapshot,
      overallScore:   arqAieSnapshotsTable.overallScore,
      createdAt:      arqAieSnapshotsTable.createdAt,
    })
    .from(arqAieSnapshotsTable)
    .where(inArray(arqAieSnapshotsTable.projetoId, projectIds))
    .orderBy(desc(arqAieSnapshotsTable.createdAt))
    .limit(50);

  return res.json({ snapshots });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /arch/prompt-variations — list all for tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const rows = await db
    .select()
    .from(archPromptVariationsTable)
    .where(eq(archPromptVariationsTable.tenantId, tid))
    .orderBy(desc(archPromptVariationsTable.savedAt));
  return res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /arch/prompt-variations — create
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const parsed = insertArchPromptVariationSchema.safeParse({
    ...req.body,
    tenantId: tid,
  });
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues });
  }
  const [created] = await db
    .insert(archPromptVariationsTable)
    .values(parsed.data)
    .returning();
  return res.status(201).json(created);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /arch/prompt-variations/:id — update name / notes
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archPromptVariationsTable.tenantId })
    .from(archPromptVariationsTable)
    .where(eq(archPromptVariationsTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Variação não encontrada." });
  if (existing.tenantId !== tid) return res.status(403).json({ error: "Acesso negado." });

  const parsed = updateArchPromptVariationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues });
  }

  const [updated] = await db
    .update(archPromptVariationsTable)
    .set(parsed.data)
    .where(eq(archPromptVariationsTable.id, id))
    .returning();

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /arch/prompt-variations/:id — remove
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archPromptVariationsTable.tenantId })
    .from(archPromptVariationsTable)
    .where(eq(archPromptVariationsTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Variação não encontrada." });
  if (existing.tenantId !== tid) return res.status(403).json({ error: "Acesso negado." });

  await db
    .delete(archPromptVariationsTable)
    .where(eq(archPromptVariationsTable.id, id));

  return res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /arqdor/projects/:id — load a full ProjectContext blob for this tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arqdor/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id = String(req.params.id);

  const [row] = await db
    .select()
    .from(arqdorWorkspaceProjectsTable)
    .where(
      and(
        eq(arqdorWorkspaceProjectsTable.id, id),
        eq(arqdorWorkspaceProjectsTable.tenantId, tid)
      )
    )
    .limit(1);

  if (!row) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(row.contextBlob);
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /arqdor/projects/:id — upsert (create or update) a ProjectContext blob
// ─────────────────────────────────────────────────────────────────────────────
router.put("/arqdor/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id = String(req.params.id);
  const contextBlob = req.body;

  if (!contextBlob || typeof contextBlob !== "object" || Array.isArray(contextBlob)) {
    return res.status(400).json({ error: "Corpo inválido: deve ser um objeto JSON." });
  }

  const [upserted] = await db
    .insert(arqdorWorkspaceProjectsTable)
    .values({ id, tenantId: tid, contextBlob, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [arqdorWorkspaceProjectsTable.id, arqdorWorkspaceProjectsTable.tenantId],
      set: { contextBlob, updatedAt: new Date() },
    })
    .returning();

  return res.json(upserted?.contextBlob ?? contextBlob);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /arch/copilot/chat — ARQ Copilot Intelligence (real AI, full context)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/copilot/chat", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { message, projectId, history = [] } = req.body as {
    message: string;
    projectId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: "Mensagem não pode ser vazia." });
  }

  // ── 1. Assemble project context ──────────────────────────────────────────
  let contextStr = "";

  if (projectId) {
    const [projeto] = await db
      .select()
      .from(archProjetosTable)
      .where(
        and(
          eq(archProjetosTable.id, projectId),
          eq(archProjetosTable.tenantId, tid),
        ),
      )
      .limit(1);

    if (projeto) {
      const [ambientes, cenas, catalogItems] = await Promise.all([
        db
          .select()
          .from(archAmbientesTable)
          .where(eq(archAmbientesTable.projetoId, projectId)),
        db
          .select()
          .from(archCenasTable)
          .where(eq(archCenasTable.projetoId, projectId))
          .orderBy(desc(archCenasTable.createdAt))
          .limit(5),
        db
          .select({
            nome: archCatalogoTable.nome,
            categoria: archCatalogoTable.categoria,
            fornecedor: archCatalogoTable.fornecedor,
            descricao: archCatalogoTable.descricao,
          })
          .from(archCatalogoTable)
          .where(eq(archCatalogoTable.tenantId, tid))
          .limit(20),
      ]);

      const renders = await db
        .select({
          imageUrl: archRenderVersoesTable.imageUrl,
          versao: archRenderVersoesTable.versao,
          origem: archRenderVersoesTable.origem,
          createdAt: archRenderVersoesTable.createdAt,
        })
        .from(archRenderVersoesTable)
        .innerJoin(archCenasTable, eq(archCenasTable.id, archRenderVersoesTable.cenaId))
        .where(eq(archCenasTable.projetoId, projectId))
        .orderBy(desc(archRenderVersoesTable.createdAt))
        .limit(3);

      contextStr = `
PROJETO ATIVO: ${projeto.titulo}
Cliente: ${projeto.clienteNome || "N/A"}
Status: ${projeto.status}
Tipo de obra: ${projeto.tipoObra || "N/A"}
Área: ${projeto.areaM2 ? `${projeto.areaM2}m²` : "N/A"}
Orçamento estimado: ${projeto.orcamentoTotal ? `R$ ${projeto.orcamentoTotal}` : "N/A"}
Prazo: ${projeto.prazoEstimado || "N/A"}

AMBIENTES (${ambientes.length}):
${ambientes.map((a) => `- ${a.nome}${a.tipoAmbiente ? ` [${a.tipoAmbiente}]` : ""}`).join("\n") || "Nenhum ambiente cadastrado"}

CENAS DE RENDER (${cenas.length}):
${cenas.map((c) => `- ${c.nome}: status ${c.status}`).join("\n") || "Nenhuma cena cadastrada"}

RENDERS GERADOS: ${renders.length === 0 ? "Nenhum render gerado ainda" : `${renders.length} render(s). Mais recente: versão ${renders[0]?.versao || "N/A"}, motor ${renders[0]?.origem || "N/A"}`}

CATÁLOGO DISPONÍVEL (${catalogItems.length} itens registrados):
${catalogItems.slice(0, 10).map((i) => `- ${i.nome} [${i.categoria}] — ${i.fornecedor}`).join("\n") || "Catálogo vazio"}
`.trim();
    }
  }

  // ── 2. System prompt ──────────────────────────────────────────────────────
  const systemPrompt = `Você é o ARQ Copilot, assistente de inteligência artificial do ARQDOR — plataforma de projetos de arquitetura e design de interiores da VendorAI.

SEU PAPEL:
- Ajudar arquitetos a otimizar projetos, ambientes e renders
- Sugerir materiais, acabamentos, fabricantes e componentes do catálogo
- Analisar ergonomia, iluminação, circulação e composição
- Criar e melhorar prompts de render
- Gerar memoriais descritivos e orçamentos preliminares
- Identificar pendências e orientar os próximos passos do projeto
- Comparar versões de renders e explicar diferenças

REGRAS ABSOLUTAS:
- Responda SEMPRE em português brasileiro
- Seja direto, técnico e útil — máximo 300 palavras salvo pedido explícito de documento longo
- Nunca invente dados do projeto — use apenas o contexto fornecido
- Nunca revele tokens, IDs internos, secrets, credenciais ou URLs de API
- Nunca mencione que você é da OpenAI, Anthropic ou qualquer LLM — você é o ARQ Copilot

AÇÕES SUGERIDAS:
Quando sua resposta implicar uma ação concreta que o arquiteto pode executar, inclua ao final exatamente:
ACTIONS: [{"label":"Texto do Botão","value":"identificador_acao","variant":"PRIMARY"}]
Use variant PRIMARY para ação principal, SECONDARY para alternativas. Máximo 3 ações por resposta.
Valores de ação válidos: gerar_render, atualizar_prompt, abrir_biblioteca, criar_memorial, criar_orcamento, comparar_versoes, adicionar_ambiente, ver_catalogo, abrir_projeto

${contextStr ? `CONTEXTO DO PROJETO ATUAL:\n${contextStr}` : "Nenhum projeto ativo no momento. O arquiteto pode abrir um projeto para respostas mais precisas sobre materiais, ambientes e renders."}`;

  // ── 3. Build message array ────────────────────────────────────────────────
  const aiMessages: import("openai").default.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map(
      (h) =>
        ({ role: h.role, content: h.content }) as import("openai").default.Chat.ChatCompletionMessageParam,
    ),
    { role: "user", content: message },
  ];

  // ── 4. Call AI via gateway ────────────────────────────────────────────────
  const startMs = Date.now();
  let aiResult: {
    content: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    usedByok: boolean;
  };

  try {
    aiResult = await callOpenAI(tid, "intelligence_analysis", aiMessages, {
      model: "gpt-4o-mini",
      temperature: 0.72,
      maxTokens: 900,
      log: req.log,
    });
  } catch (err: any) {
    const { status, message: msg } = sanitizeAIError(err);
    return res.status(status).json({ error: msg });
  }

  const durationMs = Date.now() - startMs;

  // ── 5. Parse reply — extract ACTIONS block ────────────────────────────────
  let replyText = aiResult.content;
  let actions: Array<{ label: string; value: string; variant: string }> = [];

  const actionsMatch = replyText.match(/ACTIONS:\s*(\[[\s\S]*?\])/);
  if (actionsMatch) {
    try {
      const parsed = JSON.parse(actionsMatch[1]);
      if (Array.isArray(parsed)) {
        actions = parsed.filter(
          (a) => typeof a.label === "string" && typeof a.value === "string",
        );
      }
      replyText = replyText.replace(/ACTIONS:\s*\[[\s\S]*?\]/, "").trim();
    } catch {
      // keep actions empty if JSON parse fails
    }
  }

  // ── 6. Log exchange as snapshot (non-blocking, only if projectId) ─────────
  if (projectId) {
    db.insert(arqAieSnapshotsTable)
      .values({
        projetoId: projectId,
        projectSnapshot: {
          type: "copilot_exchange",
          question: message.slice(0, 500),
          answer: replyText.slice(0, 1000),
          provider: aiResult.usedByok ? "openai_byok" : "openai",
          model: "gpt-4o-mini",
          inputTokens: aiResult.inputTokens,
          outputTokens: aiResult.outputTokens,
          costUsd: aiResult.costUsd,
          durationMs,
          tenantId: tid,
        } as any,
      } as any)
      .catch(() => {/* non-blocking */});
  }

  return res.json({
    reply: replyText,
    actions,
    provider: aiResult.usedByok ? "openai_byok" : "openai",
    model: "gpt-4o-mini",
    tokens: { input: aiResult.inputTokens, output: aiResult.outputTokens },
    cost: aiResult.costUsd,
    durationMs,
  });
});

export { archPublicRouter };
export default router;
