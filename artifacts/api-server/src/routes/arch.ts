import { Router, type IRouter } from "express";
import { and, eq, ilike, sql, desc, sum, ne, gte, lte } from "drizzle-orm";
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
} from "@workspace/db";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { authenticate } from "../middlewares/auth.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { iniciarRender, processarSolicitacao } from "../services/blenderService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
    .set({ ...parsed.data, updatedAt: new Date() })
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

  const [produto] = await db.insert(archCatalogoTable).values(parsed.data).returning();
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
    .set(parsed.data)
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
    .select({ tenantId: archProjetosTable.tenantId, nome: archProjetosTable.nome })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto) return null;

  return { cena, tenantId: projeto.tenantId, projetoNome: projeto.nome ?? null };
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
router.post("/arch/cenas/:cenaId/solicitacoes", async (req, res) => {
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
router.get("/arch/cenas/:cenaId/solicitacoes/:solId/status", async (req, res) => {
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

    return res.json({ status: sol.status, imageUrl: versao?.imageUrl ?? null });
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

export default router;
