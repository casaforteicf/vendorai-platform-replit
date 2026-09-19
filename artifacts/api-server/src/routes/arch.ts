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
  obrasTable,
  obraEtapasTable,
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
  archSpecificationsTable,
  archSpecItemsTable,
  updateArchSpecItemSchema,
  updateArchSpecificationSchema,
  archPartnersTable,
  archSolicitacoesTable,
  insertArchPartnerSchema,
  updateArchPartnerSchema,
  archKnowledgeEntriesTable,
  archKnowledgeTagsTable,
  archOfficeTemplatesTable,
  archAiRendersTable,
  archConceptProjectsTable,
  leadsTable,
  dealsTable,
  insertArchConceptProjectSchema,
  updateArchConceptProjectSchema,
} from "@workspace/db";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { authenticate } from "../middlewares/auth.js";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage.js";
import { iniciarRender, processarSolicitacao } from "../services/blenderService.js";
import { toFile } from "openai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { callReplicateFlux, callOpenAI } from "../lib/ai-gateway.js";
import { arqOrchestrator } from "../lib/arqdor/orchestrator/index.js";
import { automationLogsTable } from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { pickNextVendedor } from "../lib/round-robin.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// Arqdor Concept — drafts persistidos por usuário
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/concept-projects/latest", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [row] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .orderBy(desc(archConceptProjectsTable.updatedAt))
    .limit(1);

  return res.json(row ?? null);
});

router.get("/arch/concept-projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [row] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!row) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  return res.json(row);
});

router.post("/arch/concept-projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const parsed = insertArchConceptProjectSchema.safeParse({
    ...req.body,
    tenantId: tid,
    ownerUserId: userId,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados do pré-projeto inválidos.", details: parsed.error.flatten() });
  }

  const [created] = await db
    .insert(archConceptProjectsTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(created);
});

router.patch("/arch/concept-projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const parsed = updateArchConceptProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados do pré-projeto inválidos.", details: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(archConceptProjectsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  return res.json(updated);
});

router.post("/arch/concept-projects/:id/promote", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  if (concept.archProjetoId) {
    const [existingProject] = await db
      .select()
      .from(archProjetosTable)
      .where(
        and(
          eq(archProjetosTable.id, concept.archProjetoId),
          eq(archProjetosTable.tenantId, tid),
        ),
      )
      .limit(1);

    if (existingProject) {
      return res.json({
        ok: true,
        alreadyPromoted: true,
        project: existingProject,
        leadId: existingProject.leadId,
        dealId: existingProject.dealId,
      });
    }
  }

  const config = (concept.configuration ?? {}) as { floors?: number; desiredArea?: number };
  const lot = (concept.lot ?? {}) as { width?: number; depth?: number };
  const facade = (concept.facadePreferences ?? {}) as Record<string, unknown>;
  const customer = (concept.customerProfile ?? {}) as {
    name?: string;
    phone?: string;
    email?: string;
    budgetRange?: string;
    timeframe?: string;
    notes?: string;
  };
  const rooms = Array.isArray(concept.rooms) ? concept.rooms : [];
  const roomSummary = rooms
    .map((room: any) => {
      const area = Number(room.width ?? 0) * Number(room.depth ?? 0);
      return `${room.label ?? room.kind ?? "Ambiente"} (${area.toFixed(1)} m²)`;
    })
    .join(", ");

  let leadId: string | null = null;
  let dealId: string | null = null;

  const hasCustomerName = Boolean(customer.name?.trim());
  const hasCustomerContact = Boolean(customer.phone?.trim() || customer.email?.trim());
  if (!hasCustomerName || !hasCustomerContact) {
    return res.status(400).json({
      error: "Informe nome e pelo menos um contato (telefone ou e-mail) antes de enviar ao profissional.",
    });
  }

  if (customer.name?.trim()) {
    if (customer.email?.trim()) {
      const [byEmail] = await db
        .select()
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.tenantId, tid),
            eq(leadsTable.email, customer.email.trim()),
          ),
        )
        .limit(1);
      if (byEmail) leadId = byEmail.id;
    }

    if (!leadId) {
      const match = await findLeadByDedup(
        tid,
        customer.phone?.trim() || null,
        null,
        customer.name.trim(),
      );
      if (match.found) leadId = match.lead.id;
    }

    if (!leadId) {
      const assignedTo = await pickNextVendedor(tid, {});
      const [lead] = await db
        .insert(leadsTable)
        .values({
          tenantId: tid,
          nome: customer.name.trim(),
          telefone: storePhone(customer.phone?.trim() || null),
          email: customer.email?.trim() || null,
          source: "arqdor_concept",
          objetivo: "Projeto residencial",
          orcamento: customer.budgetRange?.trim() || null,
          urgencia: customer.timeframe?.trim() || null,
          notasNutricao: customer.notes?.trim() || null,
          assignedTo,
          metadata: {
            arqdorConceptId: concept.id,
            desiredArea: config.desiredArea ?? null,
            floors: config.floors ?? null,
            facadeStyle: typeof facade.style === "string" ? facade.style : null,
            roofType: typeof facade.roof === "string" ? facade.roof : null,
            roofWaters: typeof facade.roofWaters === "number" ? facade.roofWaters : null,
            roofPitchDeg: typeof facade.roofPitchDeg === "number" ? facade.roofPitchDeg : null,
          },
        })
        .returning();
      leadId = lead?.id ?? null;
    }

    if (leadId) {
      const [existingDeal] = await db
        .select()
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tid), eq(dealsTable.leadId, leadId)))
        .orderBy(desc(dealsTable.updatedAt))
        .limit(1);

      if (existingDeal) {
        dealId = existingDeal.id;
      } else {
        const [lead] = await db
          .select({ assignedTo: leadsTable.assignedTo })
          .from(leadsTable)
          .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tid)))
          .limit(1);

        const [deal] = await db
          .insert(dealsTable)
          .values({
            tenantId: tid,
            leadId,
            titulo: `Projeto residencial — ${customer.name.trim()}`,
            etapa: "em_aquecimento",
            assignedTo: lead?.assignedTo ?? null,
          })
          .returning();
        dealId = deal?.id ?? null;
      }
    }
  }

  const description = [
    "Pré-projeto originado no Arqdor Concept.",
    `Terreno: ${lot.width ?? "—"} × ${lot.depth ?? "—"} m.`,
    `Pavimentos: ${config.floors ?? "—"}.`,
    `Área desejada: ${config.desiredArea ?? "—"} m².`,
    roomSummary ? `Ambientes: ${roomSummary}.` : null,
    typeof facade.style === "string" ? `Estilo: ${facade.style}.` : null,
    typeof facade.roof === "string"
      ? [
          `Cobertura: ${facade.roof}`,
          typeof facade.roofWaters === "number" && facade.roof !== "platibanda" ? `${facade.roofWaters} água(s)` : null,
          typeof facade.roofPitchDeg === "number" && facade.roof !== "platibanda" ? `${facade.roofPitchDeg}°` : null,
          typeof facade.roofOverhang === "number" && facade.roof !== "platibanda" ? `beiral ${facade.roofOverhang} m` : null,
          typeof facade.roofParapetHeight === "number" && facade.roof !== "aparente" ? `platibanda ${facade.roofParapetHeight} m` : null,
        ].filter(Boolean).join(" · ") + "."
      : null,
    typeof facade.primaryMaterial === "string" ? `Material principal: ${facade.primaryMaterial}.` : null,
    typeof facade.accentMaterial === "string" ? `Destaque: ${facade.accentMaterial}.` : null,
    customer.budgetRange ? `Faixa de investimento informada: ${customer.budgetRange}.` : null,
    customer.timeframe ? `Prazo desejado: ${customer.timeframe}.` : null,
    customer.notes ? `Observações do cliente: ${customer.notes}.` : null,
  ].filter(Boolean).join("\n");

  const [project] = await db
    .insert(archProjetosTable)
    .values({
      tenantId: tid,
      leadId,
      dealId,
      clienteNome: customer.name?.trim() || null,
      clienteEmail: customer.email?.trim() || null,
      clienteTelefone: customer.phone?.trim() || null,
      titulo: concept.title || "Projeto originado do Arqdor Concept",
      descricao: description,
      status: "briefing",
      pipelineStage: "briefing",
      tipoObra: "Residencial",
      areaM2: config.desiredArea != null ? String(config.desiredArea) : null,
      portalToken: crypto.randomUUID(),
      portalAtivo: false,
    })
    .returning();

  await db
    .update(archConceptProjectsTable)
    .set({
      archProjetoId: project.id,
      status: "submitted",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    );

  await db
    .update(archAiRendersTable)
    .set({ projectId: project.id })
    .where(
      and(
        eq(archAiRendersTable.tenantId, tid),
        eq(archAiRendersTable.projectId, id),
      ),
    );

  return res.status(201).json({
    ok: true,
    alreadyPromoted: false,
    project,
    leadId,
    dealId,
  });
});

function getPortalBaseUrl(req: Request): string {
  // Mesmo achado do reset de senha: REPLIT_DOMAINS aponta pro backend
  // (Railway), não pro site (Vercel) -- link de portal do cliente
  // caía na mesma tela de erro. APP_URL é a variável correta.
  const appUrl = process.env["APP_URL"];
  if (appUrl) {
    return appUrl.replace(/\/$/, "");
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

  const [ambientes, orcamento, cenas, tenantRow, obraRow] = await Promise.all([
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
    projeto.obraId
      ? db
          .select({
            id: obrasTable.id,
            nome: obrasTable.nome,
            status: obrasTable.status,
            dataInicio: obrasTable.dataInicio,
            dataFimPrevista: obrasTable.dataFimPrevista,
            orcamentoTotal: obrasTable.orcamentoTotal,
            custoRealizado: obrasTable.custoRealizado,
          })
          .from(obrasTable)
          .where(and(eq(obrasTable.id, projeto.obraId), eq(obrasTable.tenantId, projeto.tenantId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const obra = obraRow[0] ?? null;
  const etapas = obra
    ? await db
        .select({
          id: obraEtapasTable.id,
          nome: obraEtapasTable.nome,
          ordem: obraEtapasTable.ordem,
          status: obraEtapasTable.status,
          percentualExecutado: obraEtapasTable.percentualExecutado,
          dataInicioPrevista: obraEtapasTable.dataInicioPrevista,
          dataFimPrevista: obraEtapasTable.dataFimPrevista,
        })
        .from(obraEtapasTable)
        .where(eq(obraEtapasTable.obraId, obra.id))
        .orderBy(obraEtapasTable.ordem)
    : [];

  return res.json({
    projeto,
    ambientes,
    orcamento,
    cenas,
    tenant: tenantRow[0] ?? null,
    obra,
    etapas,
  });
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
  const id = String((req.params.id as string));
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
  const id = String((req.params.id as string));

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
  const id = String((req.params.id as string));

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
  const id = String((req.params.id as string));

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
  const projetoId = String((req.params.id as string));

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
  const projetoId = String((req.params.id as string));
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
  const projetoId = String((req.params.id as string));
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
  const projetoId = String((req.params.id as string));

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
  const projetoId = String((req.params.id as string));

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
    const id = String((req.params.id as string));
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
  const id = String((req.params.id as string));

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
  const projetoId = String((req.params.id as string));

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
  const projetoId = String((req.params.id as string));

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
  const projetoId = String((req.params.id as string));

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

// ══════════════════════════════════════════════════════════════════════════════
// Render Studio Async API — /arch/ai-render
// Frontend creates a job, then polls GET /arch/ai-render/:id every ~2s.
// ══════════════════════════════════════════════════════════════════════════════

// ── Helper: build and execute a render job (shared logic) ─────────────────────
async function executeRenderJob(opts: {
  tid: string;
  renderId: string;
  originalImageUrl: string | null;
  prompt: string;
  log: import("pino").Logger;
}): Promise<void> {
  const { tid, renderId, originalImageUrl, prompt, log } = opts;
  const storage = new ObjectStorageService();
  let b64: string | undefined;
  let motor = "gpt-image-1";

  try {
    if (originalImageUrl) {
      let dataUrl = originalImageUrl;

      // If it's a storage path, fetch and convert to data URL
      if (originalImageUrl.startsWith("/api/storage/") || originalImageUrl.startsWith("/storage/")) {
        const absUrl = `http://localhost:${process.env["PORT"] ?? 8080}${originalImageUrl}`;
        const imgRes = await fetch(absUrl);
        if (!imgRes.ok) throw new Error(`Não foi possível buscar imagem: ${imgRes.status}`);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      }

      const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!dataUrlMatch) throw new Error("Imagem de referência deve ser um data URL base64 válido");

      if (process.env["REPLICATE_API_TOKEN"]) {
        try {
          b64   = await callReplicateFlux({ controlImageDataUrl: dataUrl, prompt, logger: log });
          motor = "replicate-flux";
        } catch (replicateErr: any) {
          log.warn({ err: replicateErr?.message, tenantId: tid }, "arch/ai-render: Replicate falhou → fallback gpt-image-1");
          db.insert(automationLogsTable).values({
            flow: "render_fallback", step: "replicate_to_openai",
            status: "warning", errorMessage: replicateErr?.message ?? "Replicate failed",
          }).catch(() => undefined);
        }
      }

      if (!b64) {
        const openai    = await getOpenAIForTenant(tid);
        const mimeType  = dataUrlMatch[1]!;
        const imgBuffer = Buffer.from(dataUrlMatch[2]!, "base64");
        const ext       = mimeType.split("/")[1] ?? "png";
        const refFile   = await toFile(imgBuffer, `reference.${ext}`, { type: mimeType });
        const result    = await (openai.images.edit as Function)({
          model: "gpt-image-1", image: refFile, prompt, n: 1, size: "1536x1024", quality: "high",
        });
        b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
      }
    } else {
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

    await db.update(archAiRendersTable)
      .set({ status: "concluido", resultImageUrl: imageUrl, motor, prompt, concluidoEm: new Date() })
      .where(eq(archAiRendersTable.id, renderId));

    log.info({ tenantId: tid, renderId, motor }, "arch/ai-render: concluído");
  } catch (err: any) {
    log.error({ err, tenantId: tid, renderId }, "arch/ai-render: erro no processamento async");
    await db.update(archAiRendersTable)
      .set({ status: "erro", erroMsg: err?.message ?? "Erro desconhecido" })
      .where(eq(archAiRendersTable.id, renderId))
      .catch(() => undefined);
  }
}

// ── Helper: build prompt for ai-render ───────────────────────────────────────
function buildAiRenderPrompt(opts: {
  ambiente: string;
  mode: string;
  estilo: string | null;
  lighting: string | null;
  angle: string | null;
  userNotes: string | null;
  ajustePrompt?: string;
}): string {
  const { ambiente, mode, estilo, lighting, angle, userNotes, ajustePrompt } = opts;
  const isExterior = !ambiente || ambiente === "fachada_externa" || ambiente === "fachada externa";

  const preservationRules = isExterior
    ? [
        "ABSOLUTE PRESERVATION RULES — NEVER BREAK:",
        "• DO NOT add any new element not already visible in the reference.",
        "• DO NOT remove, move, or alter any existing architectural element.",
        "• DO NOT change viewpoint, perspective, or camera position.",
        "• Preserve PIXEL-EXACTLY: building shape, all window positions, all door positions, roof geometry.",
        "PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition.",
      ].join(" ")
    : [
        "ABSOLUTE PRESERVATION RULES — NEVER BREAK:",
        "• DO NOT add any object not already present in the reference.",
        "• DO NOT remove, move, or replace any existing furniture or object.",
        "• DO NOT change viewpoint, perspective, or camera angle.",
        "• Preserve PIXEL-EXACTLY: room geometry, all wall/window/door positions, every piece of furniture in its exact place.",
        "PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition.",
      ].join(" ");

  const estiloMap: Record<string, string> = {
    minimalista:   "minimalist style with clean lines, neutral palette, uncluttered spaces",
    contemporaneo: "contemporary modern style with bold geometric forms and refined materials",
    classico:      "timeless classic style with quality materials, warm tones, and refined simplicity",
    industrial:    "industrial style with raw concrete, exposed steel, and dark tones",
    escandinavo:   "Scandinavian style with natural light, pale wood, and simple functional forms",
    tropical:      "tropical Brazilian style with warm earthy tones, natural textures, and lush accents",
  };

  const lightingInstruction = lighting && lighting !== "auto" && lightingMapArch[lighting as keyof typeof lightingMapArch]
    ? `LIGHTING CONDITION: ${lightingMapArch[lighting as keyof typeof lightingMapArch]}`
    : null;

  const angleInstruction = angle && angleMapArch[angle as keyof typeof angleMapArch]
    ? `CAMERA ANGLE: render from a ${angleMapArch[angle as keyof typeof angleMapArch]}.`
    : null;

  const estiloInstruction = estilo && estiloMap[estilo]
    ? `VISUAL STYLE: ${estiloMap[estilo]}.`
    : null;

  return [
    "You are a professional architectural visualization engine.",
    ajustePrompt
      ? `Apply the following adjustment to the render: ${ajustePrompt}`
      : `Transform this ${isExterior ? "architectural photo" : "interior photo"} into a photorealistic render.`,
    mode === "preservar" ? preservationRules : null,
    estiloInstruction,
    lightingInstruction,
    angleInstruction,
    userNotes ? `Additional notes: ${userNotes}` : null,
    "Output: ultra-sharp 4K detail, high dynamic range, photorealistic, Brazilian architecture context.",
  ].filter(Boolean).join(" ");
}

// ── POST /arch/ai-render — create async render job ───────────────────────────
router.post("/arch/ai-render", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const body = req.body as {
    original_image_url?: string;
    mode?: string;
    ambiente?: string;
    user_notes?: string;
    project_id?: string;
    estilo?: string;
    lighting?: string;
    angle?: string;
  };

  const ambiente        = body.ambiente ?? "sala";
  const mode            = body.mode ?? "preservar";
  const originalImageUrl = body.original_image_url ?? null;
  const userNotes       = body.user_notes ?? null;
  const projectId       = body.project_id ?? null;
  const estilo          = body.estilo ?? null;
  const lighting        = body.lighting ?? "auto";
  const angle           = body.angle ?? "frontal";

  const prompt = buildAiRenderPrompt({ ambiente, mode, estilo, lighting, angle, userNotes });

  const [job] = await db
    .insert(archAiRendersTable)
    .values({
      tenantId:         tid,
      projectId:        projectId ?? undefined,
      mode,
      ambiente,
      estilo:           estilo ?? undefined,
      iluminacao:       lighting,
      angulo:           angle,
      originalImageUrl: originalImageUrl ?? undefined,
      status:           "processando",
      prompt,
    })
    .returning({ id: archAiRendersTable.id });

  const renderId = job!.id;
  const log      = req.log;

  setImmediate(() => {
    executeRenderJob({ tid, renderId, originalImageUrl, prompt, log }).catch(() => undefined);
  });

  req.log.info({ tenantId: tid, renderId, ambiente, mode }, "arch/ai-render: job criado");
  return res.json({ render_id: renderId });
});

// ── GET /arch/ai-render/:id — poll render job status ─────────────────────────
router.get("/arch/ai-render/:id", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const [job] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, req.params["id"]!), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!job) return res.status(404).json({ error: "Render não encontrado" });

  return res.json({
    status:           job.status,
    result_image_url: job.resultImageUrl ?? undefined,
    erro_msg:         job.erroMsg ?? undefined,
    motor:            job.motor ?? undefined,
    ambiente:         job.ambiente,
    created_at:       job.createdAt,
    concluido_em:     job.concluidoEm ?? undefined,
  });
});

// ── POST /arch/ai-render/:id/adjust — create adjusted version ─────────────────
router.post("/arch/ai-render/:id/adjust", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const parentId = req.params["id"]!;
  const [parent] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, parentId), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!parent) return res.status(404).json({ error: "Render pai não encontrado" });

  const body = req.body as {
    ajuste_prompt?: string;
    mask_zones?: string[];
    user_notes?: string;
  };

  const ajustePrompt = body.ajuste_prompt ?? "";
  const prompt = buildAiRenderPrompt({
    ambiente:    parent.ambiente,
    mode:        parent.mode,
    estilo:      parent.estilo,
    lighting:    parent.iluminacao,
    angle:       parent.angulo,
    userNotes:   body.user_notes ?? null,
    ajustePrompt,
  });

  const [job] = await db
    .insert(archAiRendersTable)
    .values({
      tenantId:         tid,
      projectId:        parent.projectId ?? undefined,
      parentRenderId:   parentId,
      mode:             parent.mode,
      ambiente:         parent.ambiente,
      estilo:           parent.estilo ?? undefined,
      iluminacao:       parent.iluminacao ?? undefined,
      angulo:           parent.angulo ?? undefined,
      originalImageUrl: parent.resultImageUrl ?? parent.originalImageUrl ?? undefined,
      maskZones:        body.mask_zones,
      status:           "processando",
      prompt,
    })
    .returning({ id: archAiRendersTable.id });

  const renderId       = job!.id;
  const referenceImage = parent.resultImageUrl ?? parent.originalImageUrl ?? null;
  const log            = req.log;

  setImmediate(() => {
    executeRenderJob({ tid, renderId, originalImageUrl: referenceImage, prompt, log }).catch(() => undefined);
  });

  req.log.info({ tenantId: tid, renderId, parentId }, "arch/ai-render/adjust: job criado");
  return res.json({ render_id: renderId });
});

// ── POST /arch/ai-render/:id/approve — approve a render ──────────────────────
router.post("/arch/ai-render/:id/approve", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const [job] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, req.params["id"]!), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!job) return res.status(404).json({ error: "Render não encontrado" });
  if (job.status !== "concluido") {
    return res.status(400).json({ error: "Somente renders concluídos podem ser aprovados" });
  }

  // Corrigido: approvedBy vem do JWT autenticado, não do corpo da
  // requisição (antes qualquer chamador podia alegar ser qualquer pessoa) —
  // e agora fica persistido no banco, não só num log transiente.
  const approvedBy = (req as any).user?.sub as string | undefined;
  await db.update(archAiRendersTable)
    .set({ versionTag: "fiel_ao_original", approvedBy: approvedBy ?? null, approvedAt: new Date() })
    .where(eq(archAiRendersTable.id, job.id));

  req.log.info({ tenantId: tid, renderId: job.id, approvedBy }, "arch/ai-render: aprovado");
  return res.json({ success: true, render_id: job.id, result_image_url: job.resultImageUrl });
});

// ── POST /arch/ai-render/:id/send-to-specification — forward to spec pipeline ─
router.post("/arch/ai-render/:id/send-to-specification", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const [job] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, req.params["id"]!), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!job) return res.status(404).json({ error: "Render não encontrado" });

  req.log.info({ tenantId: tid, renderId: job.id }, "arch/ai-render: enviado para especificação");
  return res.json({
    success:          true,
    render_id:        job.id,
    result_image_url: job.resultImageUrl,
    project_id:       job.projectId,
  });
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

  const projectId = req.params.projectId as string;

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

  const surfaceId = req.params.surfaceId as string;
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

  const surfaceId = req.params.surfaceId as string;

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
    .values({ ...parsed.data, surfaceId, appliedBy: (req as any).user?.sub ?? null })
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
  const id  = String((req.params.id as string));

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
  const id  = String((req.params.id as string));

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
  const id  = String((req.params.id as string));

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
  const id  = String((req.params.id as string));

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
  const id  = String((req.params.id as string));

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
  const id  = String((req.params.id as string));

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
  const id  = String((req.params.id as string));

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
  const id = (req.params.id as string) as string;

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
  const id = (req.params.id as string) as string;

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
  const id = String((req.params.id as string));

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
  const id = String((req.params.id as string));

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
  const id = String((req.params.id as string));

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
  const id = String((req.params.id as string));
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
${ambientes.map((a) => `- ${a.nome}`).join("\n") || "Nenhum ambiente cadastrado"}

CENAS DE RENDER (${cenas.length}):
${cenas.map((c) => `- ${c.nome}: status ${c.status}`).join("\n") || "Nenhuma cena cadastrada"}

RENDERS GERADOS: ${renders.length === 0 ? "Nenhum render gerado ainda" : `${renders.length} render(s). Mais recente: versão ${renders[0]?.versao || "N/A"}, motor ${renders[0]?.origem || "N/A"}`}

CATÁLOGO DISPONÍVEL (${catalogItems.length} itens registrados):
${catalogItems.slice(0, 10).map((i) => `- ${i.nome} [${i.categoria}] — ${i.fornecedor}`).join("\n") || "Catálogo vazio"}
`.trim();

      // Inject partner directory into copilot context
      const partners = await db
        .select({
          nome:          archPartnersTable.nome,
          tipo:          archPartnersTable.tipo,
          especialidades: archPartnersTable.especialidades,
          cidade:        archPartnersTable.cidade,
          prazoDescricao: archPartnersTable.prazoDescricao,
          email:         archPartnersTable.email,
        })
        .from(archPartnersTable)
        .where(and(eq(archPartnersTable.tenantId, tid), eq(archPartnersTable.ativo, true)))
        .limit(20);

      if (partners.length > 0) {
        contextStr += `\n\nPARCEIROS CADASTRADOS (${partners.length} no diretório do escritório):\n` +
          partners.map(p =>
            `- ${p.nome} [${p.tipo}]${p.cidade ? ` · ${p.cidade}` : ""}${p.prazoDescricao ? ` · prazo: ${p.prazoDescricao}` : ""}${(p.especialidades as string[] | null)?.length ? ` · especialidades: ${(p.especialidades as string[]).join(", ")}` : ""}`
          ).join("\n");
      }
    }
  }

  // ── Knowledge Engine: inject top patterns into copilot context ───────────
  try {
    const kTags = await db
      .select({ tag: archKnowledgeTagsTable.tag, count: archKnowledgeTagsTable.count })
      .from(archKnowledgeTagsTable)
      .where(eq(archKnowledgeTagsTable.tenantId, tid))
      .orderBy(desc(archKnowledgeTagsTable.count))
      .limit(8);

    if (kTags.length > 0) {
      contextStr += `\n\nBASE DE CONHECIMENTO DO ESCRITÓRIO (padrões extraídos de projetos anteriores):\nPadrões mais recorrentes: ${kTags.map(t => t.tag).join(", ")}`;
    }
  } catch { /* non-blocking */ }

  // ── 2-6. Delegate to AI Orchestrator (intent → specialists → AI → parse) ──
  let orchResult: import("../lib/arqdor/orchestrator").OrchestrationResult;
  let logEntry:   import("../lib/arqdor/orchestrator").OrchestratorLogEntry;

  try {
    ({ result: orchResult, logEntry } = await arqOrchestrator.orchestrate(
      {
        message,
        projectContext: contextStr,
        history,
        tenantId: tid,
        projectId,
      },
      callOpenAI,
      req.log,
    ));
  } catch (err: any) {
    const { status, message: msg } = sanitizeAIError(err);
    return res.status(status).json({ error: msg });
  }

  // ── 7. Persist orchestrator log as snapshot (non-blocking) ───────────────
  if (projectId) {
    db.insert(arqAieSnapshotsTable)
      .values({
        projetoId: projectId,
        projectSnapshot: {
          type:         "copilot_exchange",
          messageId:    logEntry.messageId,
          question:     message.slice(0, 500),
          answer:       orchResult.reply.slice(0, 1000),
          intent:       logEntry.intent,
          specialists:  logEntry.specialists,
          provider:     orchResult.provider,
          model:        orchResult.model,
          inputTokens:  logEntry.inputTokens,
          outputTokens: logEntry.outputTokens,
          costUsd:      logEntry.costUsd,
          durationMs:   logEntry.durationMs,
          tenantId:     tid,
        } as any,
      } as any)
      .catch(() => {/* non-blocking */});
  }

  return res.json({
    reply:       orchResult.reply,
    actions:     orchResult.actions,
    intent:      orchResult.intent,
    specialists: orchResult.specialists,
    provider:    orchResult.provider,
    model:       orchResult.model,
    tokens:      { input: orchResult.inputTokens, output: orchResult.outputTokens },
    cost:        orchResult.costUsd,
    durationMs:  orchResult.durationMs,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/specification/analyze — IA analisa render e identifica itens
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/specification/analyze", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { imageUrl, projetoId, renderId } = req.body as { imageUrl?: string; projetoId?: string; renderId?: string };

  if (!imageUrl || !projetoId) {
    return res.status(400).json({ error: "imageUrl e projetoId são obrigatórios" });
  }

  try {
    // Anthropic only accepts base64 images (not URLs). Fetch internally and convert.
    let imageBase64: string;
    let imageMime: string = "image/png";
    if (imageUrl.startsWith("/")) {
      const absUrl = `http://localhost:${process.env["PORT"] ?? 8080}${imageUrl}`;
      const imgRes = await fetch(absUrl);
      if (!imgRes.ok) throw new Error(`Não foi possível buscar imagem do render: ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      imageMime = contentType.split(";")[0]!.trim() || "image/png";
      imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    } else {
      // External URL — fetch and encode
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Não foi possível buscar imagem: ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      imageMime = contentType.split(";")[0]!.trim() || "image/png";
      imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    }

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: imageMime as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: imageBase64 },
          },
          {
            type: "text",
            text: `Você é um arquiteto especialista em especificação técnica de projetos de interiores brasileiros.

Analise esta imagem de render arquitetônico e identifique TODOS os itens presentes na cena.

Para cada item, retorne:
- categoria: uma de (Mobiliário | Iluminação | Revestimento | Metal | Louça | Decoração | Eletrodoméstico | Esquadria | Componente)
- descricao: descrição técnica específica e detalhada do item
- quantidade: número estimado de unidades visíveis na cena
- confianca: nível de confiança da identificação entre 0.50 e 1.00

Seja específico e técnico. Exemplo: "Sofá em L com chaise, estofamento em couro natural bege" em vez de apenas "sofá".

Responda SOMENTE com JSON válido, sem texto adicional:
{"items":[{"categoria":"Mobiliário","descricao":"Sofá modular 3 lugares, estofamento em veludo cinza","quantidade":1,"confianca":0.92}]}`
          }
        ]
      }]
    });

    const textContent = message.content[0];
    if (textContent.type !== "text") throw new Error("Resposta inesperada da IA");

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("IA não retornou JSON válido");

    const parsed = JSON.parse(jsonMatch[0]) as { items?: Array<{ categoria: string; descricao: string; quantidade: number; confianca: number }> };
    const aiItems = parsed.items ?? [];

    if (aiItems.length === 0) {
      return res.status(422).json({ error: "A IA não identificou itens na imagem. Tente com uma imagem de maior qualidade." });
    }

    const [spec] = await db
      .insert(archSpecificationsTable)
      .values({
        tenantId:       tid,
        projetoId:      String(projetoId),
        renderId:       renderId ? String(renderId) : null,
        renderImageUrl: String(imageUrl),
        status:         "draft",
        itemsCount:     aiItems.length,
        specifiedCount: 0,
      })
      .returning();

    const items = await db
      .insert(archSpecItemsTable)
      .values(
        aiItems.map(item => ({
          specificationId: spec.id,
          categoria:       item.categoria,
          descricao:       item.descricao,
          quantidade:      Math.max(1, Math.round(item.quantidade)),
          confianca:       String(Math.min(1, Math.max(0.5, item.confianca)).toFixed(2)),
          status:          "pendente",
        }))
      )
      .returning();

    return res.json({ spec, items });
  } catch (err: unknown) {
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/specification/:projetoId — especificação mais recente do projeto
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/specification/:projetoId", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projetoId = req.params.projetoId as string;

  const [spec] = await db
    .select()
    .from(archSpecificationsTable)
    .where(and(
      eq(archSpecificationsTable.tenantId, tid),
      eq(archSpecificationsTable.projetoId, projetoId),
    ))
    .orderBy(desc(archSpecificationsTable.createdAt))
    .limit(1);

  if (!spec) {
    return res.status(404).json({ error: "Nenhuma especificação encontrada." });
  }

  const items = await db
    .select()
    .from(archSpecItemsTable)
    .where(eq(archSpecItemsTable.specificationId, spec.id))
    .orderBy(archSpecItemsTable.categoria, archSpecItemsTable.descricao);

  return res.json({ spec, items });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/arch/specification/:id — atualiza medidas do ambiente (área,
// pé-direito) — preenchimento manual, não estimado por IA.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/arch/specification/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const specId = req.params.id as string;

  const parsed = updateArchSpecificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [updated] = await db
    .update(archSpecificationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(archSpecificationsTable.id, specId), eq(archSpecificationsTable.tenantId, tid)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Especificação não encontrada." });

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/arch/specification/item/:itemId — atualiza status/match de um item
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/arch/specification/item/:itemId", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const itemId = req.params.itemId as string;

  const [ownership] = await db
    .select({ id: archSpecItemsTable.id, specificationId: archSpecItemsTable.specificationId })
    .from(archSpecItemsTable)
    .innerJoin(archSpecificationsTable, eq(archSpecificationsTable.id, archSpecItemsTable.specificationId))
    .where(and(
      eq(archSpecItemsTable.id, itemId),
      eq(archSpecificationsTable.tenantId, tid),
    ))
    .limit(1);

  if (!ownership) return res.status(404).json({ error: "Item não encontrado." });

  const parsed = updateArchSpecItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [updated] = await db
    .update(archSpecItemsTable)
    .set(parsed.data)
    .where(eq(archSpecItemsTable.id, itemId))
    .returning();

  if (parsed.data.status) {
    const [counts] = await db
      .select({
        total:     sql<number>`count(*)`.mapWith(Number),
        specified: sql<number>`count(*) filter (where status = 'especificado')`.mapWith(Number),
      })
      .from(archSpecItemsTable)
      .where(eq(archSpecItemsTable.specificationId, ownership.specificationId));

    await db
      .update(archSpecificationsTable)
      .set({
        itemsCount:     counts?.total ?? 0,
        specifiedCount: counts?.specified ?? 0,
        updatedAt:      new Date(),
      })
      .where(eq(archSpecificationsTable.id, ownership.specificationId));
  }

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/specification/:specificationId/enviar-orcamento
// Ponte real especificação técnica → orçamento. Resolve cada item
// especificado (via catálogo vinculado ou override manual) e cria a linha
// correspondente em arch_orcamento_itens. Quality gate: só permite enviar
// se não sobrar nenhum item 'pendente' (todo item precisa ter sido resolvido
// como especificado ou marcado explicitamente como não-especificado).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/specification/:specificationId/enviar-orcamento", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const specificationId = req.params.specificationId as string;

  const [spec] = await db
    .select()
    .from(archSpecificationsTable)
    .where(and(eq(archSpecificationsTable.id, specificationId), eq(archSpecificationsTable.tenantId, tid)))
    .limit(1);

  if (!spec) return res.status(404).json({ error: "Especificação não encontrada." });

  const items = await db
    .select()
    .from(archSpecItemsTable)
    .where(eq(archSpecItemsTable.specificationId, specificationId));

  // Nota: os itens nascem com status 'pendente' assim que a IA gera a
  // especificação (endpoint /analyze) — a tela atual ainda não tem controle
  // pra marcar item por item como 'especificado', então travar o envio até
  // isso não existiria caminho nenhum pro usuário desbloquear. Envia tudo
  // que não foi explicitamente rejeitado ('nao_especificado'); item
  // 'pendente' ainda tem descrição/quantidade sugeridas pela IA, então é
  // dado válido pra semear a linha de orçamento (marcado geradoPorIa=true,
  // editável depois na tela de orçamento).
  const enviaveis = items.filter((i) => i.status !== "nao_especificado");
  if (enviaveis.length === 0) {
    return res.status(422).json({ error: "Nenhum item disponível pra enviar pro orçamento (todos marcados como não especificados)." });
  }

  // Resolve nome/preço/fornecedor de cada item — catálogo vinculado tem
  // prioridade, override manual é o fallback (mesma regra usada na tela de
  // especificação pra decidir o que mostrar).
  const catalogoIds = enviaveis.map((i) => i.catalogoItemId).filter(Boolean) as string[];
  const catalogoItens = catalogoIds.length
    ? await db.select().from(archCatalogoTable).where(inArray(archCatalogoTable.id, catalogoIds))
    : [];
  const catalogoMap = new Map(catalogoItens.map((c) => [c.id, c]));

  const novosItens = enviaveis.map((item) => {
    const catalogo = item.catalogoItemId ? catalogoMap.get(item.catalogoItemId) : undefined;
    const valorUnitario = catalogo?.precoBase ?? item.overridePreco ?? "0";
    const quantidade = item.quantidade ?? 1;
    return {
      projetoId: spec.projetoId,
      categoria: item.categoria,
      descricao: catalogo?.nome ?? item.overrideNome ?? item.descricao,
      quantidade: String(quantidade),
      unidade: catalogo?.unidade ?? "un",
      valorUnitario: String(valorUnitario),
      valorTotal: String(Number(valorUnitario) * Number(quantidade)),
      fornecedor: catalogo?.fornecedor ?? item.overrideFornecedor ?? null,
      produtoId: item.catalogoItemId ?? null,
      geradoPorIa: true,
    };
  });

  const inseridos = await db.insert(archOrcamentoItensTable).values(novosItens).returning();

  await db
    .update(archSpecificationsTable)
    .set({ status: "enviado_orcamento", updatedAt: new Date() })
    .where(eq(archSpecificationsTable.id, specificationId));

  req.log.info({ tenantId: tid, specificationId, itensCriados: inseridos.length }, "arch/specification: enviado pro orçamento");

  return res.status(201).json({ success: true, itensCriados: inseridos.length, itens: inseridos });
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 6 — ECOSYSTEM ENGINE: Partner Directory + Solicitações
// ═════════════════════════════════════════════════════════════════════════════

// ── Helper: send partner notification via Resend ──────────────────────────────
async function sendPartnerEmail(opts: {
  to: string; subject: string; html: string
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey || !opts.to) return false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "arqdor.ai <noreply@vendorai.app>",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return resp.ok;
  } catch { return false; }
}

// ── GET /arch/partners — listar parceiros do tenant (com search + tipo filter) ─
router.get("/arch/partners", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { q, tipo } = req.query as Record<string, string>;

  const conditions = [
    eq(archPartnersTable.tenantId, tid),
    eq(archPartnersTable.ativo, true),
  ];
  if (tipo && tipo !== "todos") {
    conditions.push(eq(archPartnersTable.tipo, tipo));
  }
  if (q?.trim()) {
    conditions.push(
      sql`(${archPartnersTable.nome} ilike ${"%" + q + "%"} OR ${archPartnersTable.cidade} ilike ${"%" + q + "%"} OR ${archPartnersTable.especialidades}::text ilike ${"%" + q + "%"})`
    );
  }

  const rows = await db
    .select()
    .from(archPartnersTable)
    .where(and(...conditions))
    .orderBy(desc(archPartnersTable.createdAt));

  return res.json(rows);
});

// ── POST /arch/partners — criar parceiro ──────────────────────────────────────
router.post("/arch/partners", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const parsed = insertArchPartnerSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [created] = await db
    .insert(archPartnersTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(created);
});

// ── PATCH /arch/partners/:id — atualizar parceiro ─────────────────────────────
router.patch("/arch/partners/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const [existing] = await db
    .select({ id: archPartnersTable.id })
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, (req.params.id as string)), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Parceiro não encontrado." });

  const parsed = updateArchPartnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [updated] = await db
    .update(archPartnersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(archPartnersTable.id, (req.params.id as string)))
    .returning();

  return res.json(updated);
});

// ── DELETE /arch/partners/:id — desativar parceiro (soft delete) ──────────────
router.delete("/arch/partners/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const [existing] = await db
    .select({ id: archPartnersTable.id })
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, (req.params.id as string)), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Parceiro não encontrado." });

  await db
    .update(archPartnersTable)
    .set({ ativo: false, updatedAt: new Date() })
    .where(eq(archPartnersTable.id, (req.params.id as string)));

  return res.json({ ok: true });
});

// ── POST /arch/partners/:id/solicitar — criar solicitação ─────────────────────
router.post("/arch/partners/:id/solicitar", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const partnerId = (req.params.id as string) as string;
  const { tipo, mensagem, canal, projetoId, projetoTitulo, catalogoItemId, itemNome } = req.body as {
    tipo: string; mensagem?: string; canal?: string
    projetoId?: string; projetoTitulo?: string; catalogoItemId?: string; itemNome?: string
  };

  const [partner] = await db
    .select()
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, partnerId), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!partner) return res.status(404).json({ error: "Parceiro não encontrado." });

  const TIPO_LABELS: Record<string, string> = {
    orcamento: "Orçamento", amostra: "Amostra", visita: "Visita Técnica", compartilhar: "Compartilhamento de Projeto",
  };

  const canalEnvio = canal ?? "manual";
  let enviadoEm: Date | undefined;

  // Tentar envio por email se parceiro tiver email e canal = email
  if (canalEnvio === "email" && partner.email) {
    const tipoLabel = TIPO_LABELS[tipo] ?? tipo;
    const sent = await sendPartnerEmail({
      to: partner.email,
      subject: `Solicitação de ${tipoLabel} — arqdor.ai`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
          <h2 style="font-size:20px;color:#111;margin:0 0 16px;">Solicitação de ${tipoLabel}</h2>
          ${projetoTitulo ? `<p style="color:#444;font-size:14px;margin:0 0 12px;">📁 Projeto: <strong>${projetoTitulo}</strong></p>` : ""}
          ${itemNome ? `<p style="color:#444;font-size:14px;margin:0 0 12px;">📋 Item: <strong>${itemNome}</strong></p>` : ""}
          ${mensagem ? `<div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#374151;line-height:1.6;">${mensagem.replace(/\n/g, "<br>")}</div>` : ""}
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">Esta solicitação foi enviada via <strong>arqdor.ai</strong> — Ecosystem Engine.</p>
        </div>
      `,
    });
    if (sent) enviadoEm = new Date();
  }

  const [sol] = await db
    .insert(archSolicitacoesTable)
    .values({
      tenantId:       tid,
      tipo,
      status:         enviadoEm ? "enviado" : "pendente",
      partnerId,
      parceiroNome:   partner.nome,
      projetoId:      projetoId ?? null,
      projetoTitulo:  projetoTitulo ?? null,
      catalogoItemId: catalogoItemId ?? null,
      itemNome:       itemNome ?? null,
      mensagem:       mensagem ?? null,
      canalEnvio:     canalEnvio,
      enviadoEm:      enviadoEm ?? null,
    })
    .returning();

  return res.status(201).json({ ...sol, emailSent: !!enviadoEm });
});

// ── POST /arch/partners/compartilhar — compartilhar projeto com parceiro ───────
router.post("/arch/partners/compartilhar", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { partnerId, mensagem, canal, projetoId, projetoTitulo } = req.body as {
    partnerId: string; mensagem?: string; canal?: string; projetoId?: string; projetoTitulo?: string
  };

  const [partner] = await db
    .select()
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, partnerId), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!partner) return res.status(404).json({ error: "Parceiro não encontrado." });

  let enviadoEm: Date | undefined;
  if ((canal === "email") && partner.email) {
    const sent = await sendPartnerEmail({
      to: partner.email,
      subject: `Projeto Compartilhado: ${projetoTitulo ?? "arqdor.ai"} — arqdor.ai`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
          <h2 style="font-size:20px;color:#111;margin:0 0 16px;">📁 Projeto Compartilhado</h2>
          <p style="color:#444;font-size:14px;margin:0 0 12px;">Você recebeu um projeto via <strong>arqdor.ai</strong>.</p>
          ${projetoTitulo ? `<div style="background:#f4f4f5;border-radius:8px;padding:12px 16px;margin-bottom:16px;"><strong style="font-size:16px;color:#111;">${projetoTitulo}</strong></div>` : ""}
          ${mensagem ? `<div style="background:#f9f9f9;border-radius:8px;padding:16px;font-size:14px;color:#374151;line-height:1.6;">${mensagem.replace(/\n/g, "<br>")}</div>` : ""}
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">— Enviado via arqdor.ai · Ecosystem Engine</p>
        </div>
      `,
    });
    if (sent) enviadoEm = new Date();
  }

  const [sol] = await db
    .insert(archSolicitacoesTable)
    .values({
      tenantId:      tid,
      tipo:          "compartilhar",
      status:        enviadoEm ? "enviado" : "pendente",
      partnerId,
      parceiroNome:  partner.nome,
      projetoId:     projetoId ?? null,
      projetoTitulo: projetoTitulo ?? null,
      mensagem:      mensagem ?? null,
      canalEnvio:    canal ?? "manual",
      enviadoEm:     enviadoEm ?? null,
    })
    .returning();

  return res.status(201).json({ ...sol, emailSent: !!enviadoEm });
});

// ── GET /arch/solicitacoes — histórico de solicitações do tenant ──────────────
router.get("/arch/solicitacoes", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const rows = await db
    .select()
    .from(archSolicitacoesTable)
    .where(eq(archSolicitacoesTable.tenantId, tid))
    .orderBy(desc(archSolicitacoesTable.createdAt))
    .limit(100);

  return res.json(rows);
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 7 — KNOWLEDGE ENGINE
// ═════════════════════════════════════════════════════════════════════════════

// ── Knowledge Extraction Helper ───────────────────────────────────────────────
function classifyKnowledgeTag(tag: string): string {
  if (["residencial","comercial","corporativo","hospitalar","educacional","industrial","misto"].some(t => tag.includes(t))) return "tipo_obra";
  if (["alto-padrao","medio-padrao","economico"].includes(tag)) return "padrao";
  if (["grande-porte","medio-porte","pequeno-porte"].includes(tag)) return "porte";
  if (tag.startsWith("fornecedor-")) return "fabricante";
  if (["concluido","em-andamento","alta-aprovacao"].includes(tag)) return "status";
  if (["piso","parede","teto","madeira","metal","pedra","vidro","ceramica","tecido","iluminacao"].some(m => tag.includes(m))) return "material";
  return "geral";
}

async function extractTenantKnowledge(tid: string): Promise<number> {
  // 1. Get all projects
  const projects = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid))
    .limit(100);

  // 2. Get tenant catalog
  const catalog = await db
    .select({
      nome:       archCatalogoTable.nome,
      categoria:  archCatalogoTable.categoria,
      fornecedor: archCatalogoTable.fornecedor,
    })
    .from(archCatalogoTable)
    .where(eq(archCatalogoTable.tenantId, tid))
    .limit(60);

  // 3. Process each project
  for (const projeto of projects) {
    const [cenas, orcItems, prompts] = await Promise.all([
      db.select().from(archCenasTable).where(eq(archCenasTable.projetoId, projeto.id)),
      db.select().from(archOrcamentoItensTable).where(eq(archOrcamentoItensTable.projetoId, projeto.id)).limit(50),
      db.select({ prompt: archPromptVariationsTable.prompt })
        .from(archPromptVariationsTable)
        .where(eq(archPromptVariationsTable.tenantId, tid))
        .limit(10),
    ]);

    const renders = await db
      .select({ id: archRenderVersoesTable.id })
      .from(archRenderVersoesTable)
      .innerJoin(archCenasTable, eq(archCenasTable.id, archRenderVersoesTable.cenaId))
      .where(eq(archCenasTable.projetoId, projeto.id));

    // Build auto-tags
    const tags: string[] = [];
    if (projeto.tipoObra) tags.push(projeto.tipoObra.toLowerCase().replace(/\s+/g, "-").slice(0, 40));

    const orc = Number(projeto.orcamentoTotal);
    if (orc > 500_000) tags.push("alto-padrao");
    else if (orc > 100_000) tags.push("medio-padrao");
    else if (orc > 0) tags.push("economico");

    const area = Number(projeto.areaM2);
    if (area > 200) tags.push("grande-porte");
    else if (area > 80) tags.push("medio-porte");
    else if (area > 0) tags.push("pequeno-porte");

    if (projeto.status === "concluido") tags.push("concluido");
    const aprovadas = cenas.filter(c => c.status === "aprovado").length;
    if (cenas.length > 0 && aprovadas / cenas.length >= 0.7) tags.push("alta-aprovacao");

    catalog.forEach(item => {
      if (item.categoria) {
        const t = item.categoria.toLowerCase().slice(0, 30);
        if (!tags.includes(t)) tags.push(t);
      }
    });

    const fabricantes = [...new Set(orcItems.filter(i => i.fornecedor).map(i => i.fornecedor!))];
    const componentes  = orcItems.slice(0, 30).map(i => ({ descricao: i.descricao, categoria: i.categoria ?? null, fornecedor: i.fornecedor ?? null }));
    const materiaisUsados = catalog.map(i => ({ nome: i.nome, categoria: i.categoria ?? null, fornecedor: i.fornecedor ?? null }));
    const promptsUsados   = prompts.map(p => p.prompt.slice(0, 300));
    const uniqueTags      = [...new Set(tags)];

    await db
      .insert(archKnowledgeEntriesTable)
      .values({
        tenantId:        tid,
        projectId:       projeto.id,
        titulo:          projeto.titulo,
        tipo:            projeto.tipoObra ?? null,
        areaM2:          projeto.areaM2,
        orcamentoTotal:  projeto.orcamentoTotal,
        status:          projeto.status ?? null,
        tags:            uniqueTags,
        materiaisUsados,
        fabricantes,
        componentes,
        promptsUsados,
        renderCount:      renders.length,
        rendersAprovados: aprovadas,
        cenasCount:       cenas.length,
        revisoes:         Math.max(0, renders.length - cenas.length),
        snapshotAt:       new Date(),
      })
      .onConflictDoUpdate({
        target: archKnowledgeEntriesTable.projectId,
        set: {
          titulo:           projeto.titulo,
          tipo:             projeto.tipoObra ?? null,
          status:           projeto.status ?? null,
          tags:             uniqueTags,
          materiaisUsados,
          fabricantes,
          componentes,
          promptsUsados,
          renderCount:      renders.length,
          rendersAprovados: aprovadas,
          cenasCount:       cenas.length,
          revisoes:         Math.max(0, renders.length - cenas.length),
          snapshotAt:       new Date(),
          updatedAt:        new Date(),
        },
      });
  }

  // 4. Rebuild tag frequency index
  await db.delete(archKnowledgeTagsTable).where(eq(archKnowledgeTagsTable.tenantId, tid));

  const allEntries = await db
    .select({ tags: archKnowledgeEntriesTable.tags })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  const tagFreq = new Map<string, number>();
  allEntries.forEach(e => {
    ((e.tags as string[] | null) ?? []).forEach(tag => tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1));
  });

  const total = allEntries.length || 1;
  const tagRows = [...tagFreq.entries()].map(([tag, count]) => ({
    tenantId: tid, tag, tipo: classifyKnowledgeTag(tag), count, score: count / total,
  }));

  if (tagRows.length > 0) {
    await db.insert(archKnowledgeTagsTable).values(tagRows);
  }

  return projects.length;
}

// ── POST /arch/knowledge/extract — extrai conhecimento de todos os projetos ───
router.post("/arch/knowledge/extract", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const count = await extractTenantKnowledge(tid);
  return res.json({ ok: true, projectsProcessed: count });
});

// ── GET /arch/knowledge/dashboard — painel de inteligência ────────────────────
router.get("/arch/knowledge/dashboard", authenticate, async (req, res) => {
  const tid = tenantId(req);

  // Auto-seed if empty
  const [check] = await db
    .select({ id: archKnowledgeEntriesTable.id })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid))
    .limit(1);
  if (!check) await extractTenantKnowledge(tid);

  // Aggregate stats
  const [stats] = await db
    .select({
      totalProjects:  sql<number>`count(*)`.mapWith(Number),
      totalRenders:   sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
      totalAprovados: sql<number>`coalesce(sum(renders_aprovados), 0)`.mapWith(Number),
      avgRevisoes:    sql<number>`coalesce(avg(revisoes), 0)`.mapWith(Number),
      avgAreaM2:      sql<number>`coalesce(avg(area_m2::numeric), 0)`.mapWith(Number),
    })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  // Top tipos de obra
  const topTipos = await db
    .select({
      tipo:  archKnowledgeEntriesTable.tipo,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(archKnowledgeEntriesTable)
    .where(and(eq(archKnowledgeEntriesTable.tenantId, tid), sql`tipo IS NOT NULL`))
    .groupBy(archKnowledgeEntriesTable.tipo)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  // Top tags
  const topTags = await db
    .select()
    .from(archKnowledgeTagsTable)
    .where(eq(archKnowledgeTagsTable.tenantId, tid))
    .orderBy(desc(archKnowledgeTagsTable.count))
    .limit(24);

  // Flatten fabricantes & materiais across entries
  const allEntries = await db
    .select({ fabricantes: archKnowledgeEntriesTable.fabricantes, materiaisUsados: archKnowledgeEntriesTable.materiaisUsados })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  const fabFreq  = new Map<string, number>();
  const matFreq  = new Map<string, { count: number; cat: string }>();

  allEntries.forEach(e => {
    ((e.fabricantes as string[] | null) ?? []).forEach(f => fabFreq.set(f, (fabFreq.get(f) ?? 0) + 1));
    ((e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? []).forEach(m => {
      const prev = matFreq.get(m.nome);
      matFreq.set(m.nome, { count: (prev?.count ?? 0) + 1, cat: m.categoria ?? "outros" });
    });
  });

  const topFabricantes = [...fabFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  const topMateriais   = [...matFreq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([nome, v]) => ({ nome, count: v.count, categoria: v.cat }));

  const approvalRate = (stats?.totalRenders ?? 0) > 0
    ? Math.round(((stats?.totalAprovados ?? 0) / stats.totalRenders) * 100)
    : 0;

  return res.json({
    totalProjects:  stats?.totalProjects ?? 0,
    totalRenders:   stats?.totalRenders ?? 0,
    approvalRate,
    avgRevisoes:    Math.round((stats?.avgRevisoes ?? 0) * 10) / 10,
    avgAreaM2:      Math.round(stats?.avgAreaM2 ?? 0),
    topTipos:       topTipos.filter(t => t.tipo),
    topTags,
    topFabricantes,
    topMateriais,
  });
});

// ── GET /arch/knowledge/patterns — biblioteca de padrões ──────────────────────
router.get("/arch/knowledge/patterns", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const entries = await db
    .select({
      tipo:             archKnowledgeEntriesTable.tipo,
      materiaisUsados:  archKnowledgeEntriesTable.materiaisUsados,
      fabricantes:      archKnowledgeEntriesTable.fabricantes,
      renderCount:      archKnowledgeEntriesTable.renderCount,
      rendersAprovados: archKnowledgeEntriesTable.rendersAprovados,
      tags:             archKnowledgeEntriesTable.tags,
    })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  // Aggregate tipo × categoria combos
  const patterns = new Map<string, { count: number; aprovados: number; renders: number; tags: Set<string> }>();

  entries.forEach(e => {
    const mats = (e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [];
    const cats = [...new Set(mats.map(m => m.categoria).filter(Boolean) as string[])];
    const tipo  = e.tipo ?? "outros";
    const tags  = (e.tags as string[] | null) ?? [];

    cats.forEach(cat => {
      const key = `${tipo}|${cat}`;
      const prev = patterns.get(key) ?? { count: 0, aprovados: 0, renders: 0, tags: new Set<string>() };
      tags.forEach(t => prev.tags.add(t));
      patterns.set(key, {
        count:    prev.count + 1,
        aprovados:prev.aprovados + (e.rendersAprovados ?? 0),
        renders:  prev.renders + (e.renderCount ?? 0),
        tags:     prev.tags,
      });
    });

    // Also a fabricante-level pattern
    const fabs = (e.fabricantes as string[] | null) ?? [];
    fabs.forEach(fab => {
      const key = `${tipo}|fab:${fab}`;
      const prev = patterns.get(key) ?? { count: 0, aprovados: 0, renders: 0, tags: new Set<string>() };
      tags.forEach(t => prev.tags.add(t));
      patterns.set(key, {
        count:    prev.count + 1,
        aprovados:prev.aprovados + (e.rendersAprovados ?? 0),
        renders:  prev.renders + (e.renderCount ?? 0),
        tags:     prev.tags,
      });
    });
  });

  const result = [...patterns.entries()]
    .map(([key, v]) => {
      const [tipo, cat] = key.split("|");
      const isFab = cat?.startsWith("fab:");
      const approvalRate = v.renders > 0 ? Math.round((v.aprovados / v.renders) * 100) : 0;
      return {
        id: key,
        tipo,
        categoria:    isFab ? null : cat,
        fabricante:   isFab ? cat?.slice(4) : null,
        tipoPattern:  isFab ? "fabricante" : "material",
        count:        v.count,
        approvalRate,
        tags:         [...v.tags].slice(0, 6),
      };
    })
    .sort((a, b) => b.count - a.count || b.approvalRate - a.approvalRate)
    .slice(0, 24);

  return res.json(result);
});

// ── GET /arch/knowledge/ranking — ranking de combinações ─────────────────────
router.get("/arch/knowledge/ranking", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const entries = await db
    .select({
      tipo:             archKnowledgeEntriesTable.tipo,
      fabricantes:      archKnowledgeEntriesTable.fabricantes,
      materiaisUsados:  archKnowledgeEntriesTable.materiaisUsados,
      renderCount:      archKnowledgeEntriesTable.renderCount,
      rendersAprovados: archKnowledgeEntriesTable.rendersAprovados,
    })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  // Score: 70% approval rate × 30% frequency weight
  const comboMap = new Map<string, { count: number; aprovados: number; renders: number }>();

  entries.forEach(e => {
    const tipo = e.tipo ?? "outros";
    const fabs = (e.fabricantes as string[] | null) ?? [];
    const mats = (e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [];
    const cats = [...new Set(mats.map(m => m.categoria).filter(Boolean) as string[])];

    // Fabricante combos
    fabs.forEach(fab => {
      const key = `fab|${tipo}|${fab}`;
      const prev = comboMap.get(key) ?? { count: 0, aprovados: 0, renders: 0 };
      comboMap.set(key, { count: prev.count + 1, aprovados: prev.aprovados + (e.rendersAprovados ?? 0), renders: prev.renders + (e.renderCount ?? 0) });
    });

    // Material category combos
    cats.forEach(cat => {
      const key = `mat|${tipo}|${cat}`;
      const prev = comboMap.get(key) ?? { count: 0, aprovados: 0, renders: 0 };
      comboMap.set(key, { count: prev.count + 1, aprovados: prev.aprovados + (e.rendersAprovados ?? 0), renders: prev.renders + (e.renderCount ?? 0) });
    });
  });

  const maxCount = Math.max(...[...comboMap.values()].map(v => v.count), 1);

  const ranked = [...comboMap.entries()]
    .map(([key, v]) => {
      const [kind, tipo, combo] = key.split("|");
      const approvalRate = v.renders > 0 ? (v.aprovados / v.renders) * 100 : 50;
      const freqScore    = (v.count / maxCount) * 100;
      const score        = approvalRate * 0.7 + freqScore * 0.3;
      return { key, kind, tipo, combo, count: v.count, approvalRate: Math.round(approvalRate), score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return res.json(ranked);
});

// ── GET /arch/knowledge/suggestions — sugestões automáticas ──────────────────
router.get("/arch/knowledge/suggestions", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { projectId } = req.query as Record<string, string>;

  let tipo: string | null = null;
  if (projectId) {
    const [proj] = await db
      .select({ tipoObra: archProjetosTable.tipoObra })
      .from(archProjetosTable)
      .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)))
      .limit(1);
    tipo = proj?.tipoObra ?? null;
  }

  const conditions = [eq(archKnowledgeEntriesTable.tenantId, tid)];
  if (tipo) conditions.push(eq(archKnowledgeEntriesTable.tipo, tipo));
  if (projectId) conditions.push(sql`project_id != ${projectId}`);

  let candidates = await db
    .select()
    .from(archKnowledgeEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(archKnowledgeEntriesTable.rendersAprovados))
    .limit(10);

  // Fallback to all entries
  if (candidates.length === 0 && tipo) {
    candidates = await db
      .select()
      .from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid))
      .orderBy(desc(archKnowledgeEntriesTable.rendersAprovados))
      .limit(10);
  }

  const matFreq  = new Map<string, { count: number; cat: string }>();
  const fabFreq  = new Map<string, number>();
  const tagFreq  = new Map<string, number>();
  const promptSet: string[] = [];

  candidates.forEach(c => {
    ((c.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [])
      .forEach(m => { const prev = matFreq.get(m.nome); matFreq.set(m.nome, { count: (prev?.count ?? 0) + 1, cat: m.categoria ?? "outros" }); });
    ((c.fabricantes as string[] | null) ?? [])
      .forEach(f => fabFreq.set(f, (fabFreq.get(f) ?? 0) + 1));
    ((c.promptsUsados as string[] | null) ?? [])
      .forEach(p => { if (!promptSet.includes(p)) promptSet.push(p); });
    ((c.tags as string[] | null) ?? [])
      .forEach(t => tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1));
  });

  return res.json({
    basedOnProjects: candidates.length,
    tipo:            tipo ?? "geral",
    materiais:       [...matFreq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([nome, v]) => ({ nome, count: v.count, categoria: v.cat })),
    fabricantes:     [...fabFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome, count]) => ({ nome, count })),
    prompts:         promptSet.slice(0, 5),
    tags:            [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
  });
});

// ── GET /arch/knowledge/tags — tag cloud do tenant ───────────────────────────
router.get("/arch/knowledge/tags", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const tags = await db
    .select()
    .from(archKnowledgeTagsTable)
    .where(eq(archKnowledgeTagsTable.tenantId, tid))
    .orderBy(desc(archKnowledgeTagsTable.count))
    .limit(50);
  return res.json(tags);
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 9 — OFFICE OPERATING SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

const PIPELINE_STAGES = ["lead","briefing","anteprojeto","projeto","render","cliente","executivo","obra","concluido"] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

// ── GET /arch/office/pipeline — projetos agrupados por etapa ─────────────────
router.get("/arch/office/pipeline", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projects = await db
    .select({
      id:            archProjetosTable.id,
      titulo:        archProjetosTable.titulo,
      clienteNome:   archProjetosTable.clienteNome,
      status:        archProjetosTable.status,
      tipoObra:      archProjetosTable.tipoObra,
      areaM2:        archProjetosTable.areaM2,
      pipelineStage: archProjetosTable.pipelineStage,
      prazoEstimado: archProjetosTable.prazoEstimado,
      createdAt:     archProjetosTable.createdAt,
      updatedAt:     archProjetosTable.updatedAt,
    })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid))
    .orderBy(desc(archProjetosTable.updatedAt));

  const grouped: Record<string, typeof projects> = {};
  PIPELINE_STAGES.forEach(s => { grouped[s] = []; });
  projects.forEach(p => {
    const s = (p.pipelineStage ?? p.status ?? "briefing") as string;
    const key = PIPELINE_STAGES.includes(s as PipelineStage) ? s : "briefing";
    grouped[key].push(p);
  });

  return res.json({ stages: PIPELINE_STAGES, projects: grouped });
});

// ── PATCH /arch/office/pipeline/:projectId/stage — mover etapa ───────────────
router.patch("/arch/office/pipeline/:projectId/stage", authenticate, async (req, res) => {
  const projectId = req.params.projectId as string;
  const { stage }     = req.body as { stage: string };
  const tid           = tenantId(req);

  if (!PIPELINE_STAGES.includes(stage as PipelineStage)) {
    return res.status(400).json({ error: "Stage inválido" });
  }

  await db
    .update(archProjetosTable)
    .set({ pipelineStage: stage, updatedAt: new Date() })
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)));

  return res.json({ ok: true, stage });
});

// ── GET /arch/office/dashboard — visão geral do escritório ───────────────────
router.get("/arch/office/dashboard", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const [projects, knowledgeOverview, templateCount, partnerCount] = await Promise.all([
    db.select({
      id:            archProjetosTable.id,
      titulo:        archProjetosTable.titulo,
      clienteNome:   archProjetosTable.clienteNome,
      pipelineStage: archProjetosTable.pipelineStage,
      status:        archProjetosTable.status,
      tipoObra:      archProjetosTable.tipoObra,
      updatedAt:     archProjetosTable.updatedAt,
    }).from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tid))
      .orderBy(desc(archProjetosTable.updatedAt)),

    db.select({
      total:      sql<number>`count(*)`.mapWith(Number),
      renders:    sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
      aprovados:  sql<number>`coalesce(sum(renders_aprovados), 0)`.mapWith(Number),
      avgRevisoes:sql<number>`coalesce(avg(revisoes), 0)`.mapWith(Number),
    }).from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid)),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(archOfficeTemplatesTable)
      .where(eq(archOfficeTemplatesTable.tenantId, tid)),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(archPartnersTable)
      .where(and(eq(archPartnersTable.tenantId, tid), eq(archPartnersTable.ativo, true))),
  ]);

  const ACTIVE = ["lead","briefing","anteprojeto","projeto","render","cliente","executivo","obra"];
  const byStage: Record<string, number> = {};
  PIPELINE_STAGES.forEach(s => { byStage[s] = 0; });
  projects.forEach(p => {
    const s = p.pipelineStage ?? p.status ?? "briefing";
    if (s in byStage) byStage[s]++;
  });

  const ks = knowledgeOverview[0];
  const approvalRate = (ks?.renders ?? 0) > 0 ? Math.round((ks.aprovados / ks.renders) * 100) : 0;

  return res.json({
    totalProjetos:  projects.length,
    projetosAtivos: projects.filter(p => ACTIVE.includes(p.pipelineStage ?? p.status ?? "")).length,
    emRender:       byStage["render"],
    concluidos:     byStage["concluido"],
    byStage,
    approvalRate,
    totalRenders:   ks?.renders ?? 0,
    avgRevisoes:    Math.round((ks?.avgRevisoes ?? 0) * 10) / 10,
    totalTemplates: templateCount[0]?.count ?? 0,
    totalParceiros: partnerCount[0]?.count ?? 0,
    recentActivity: projects.slice(0, 8),
  });
});

// ── GET /arch/office/dna — DNA do escritório ─────────────────────────────────
router.get("/arch/office/dna", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const [entries, tags, partners, catalog] = await Promise.all([
    db.select({
      materiaisUsados: archKnowledgeEntriesTable.materiaisUsados,
      fabricantes:     archKnowledgeEntriesTable.fabricantes,
      promptsUsados:   archKnowledgeEntriesTable.promptsUsados,
    }).from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid)),

    db.select()
      .from(archKnowledgeTagsTable)
      .where(eq(archKnowledgeTagsTable.tenantId, tid))
      .orderBy(desc(archKnowledgeTagsTable.count))
      .limit(30),

    db.select({
      nome:          archPartnersTable.nome,
      tipo:          archPartnersTable.tipo,
      especialidades:archPartnersTable.especialidades,
      cidade:        archPartnersTable.cidade,
    }).from(archPartnersTable)
      .where(and(eq(archPartnersTable.tenantId, tid), eq(archPartnersTable.ativo, true)))
      .limit(20),

    db.select({
      nome:      archCatalogoTable.nome,
      categoria: archCatalogoTable.categoria,
      fornecedor:archCatalogoTable.fornecedor,
    }).from(archCatalogoTable)
      .where(eq(archCatalogoTable.tenantId, tid))
      .limit(60),
  ]);

  const matFreq  = new Map<string, { count: number; cat: string }>();
  const fabFreq  = new Map<string, number>();
  const promptFreq = new Map<string, number>();

  entries.forEach(e => {
    ((e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [])
      .forEach(m => { const p = matFreq.get(m.nome); matFreq.set(m.nome, { count: (p?.count ?? 0) + 1, cat: m.categoria ?? "outros" }); });
    ((e.fabricantes as string[] | null) ?? [])
      .forEach(f => fabFreq.set(f, (fabFreq.get(f) ?? 0) + 1));
    ((e.promptsUsados as string[] | null) ?? [])
      .forEach(p => promptFreq.set(p, (promptFreq.get(p) ?? 0) + 1));
  });

  const catFreq = new Map<string, number>();
  catalog.forEach(c => { if (c.categoria) catFreq.set(c.categoria, (catFreq.get(c.categoria) ?? 0) + 1); });

  return res.json({
    totalProjetos:        entries.length,
    materiaisPreferidos:  [...matFreq.entries()].sort((a,b) => b[1].count-a[1].count).slice(0,12).map(([nome,v]) => ({ nome, count: v.count, categoria: v.cat })),
    fabricantesFavoritos: [...fabFreq.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([nome,count]) => ({ nome, count })),
    promptsFrequentes:    [...promptFreq.entries()].sort((a,b) => b[1]-a[1]).slice(0,6).map(([texto,count]) => ({ texto: texto.slice(0,200), count })),
    estilos:              tags.filter(t => ["tipo_obra","estilo"].includes(t.tipo)),
    padroes:              tags.filter(t => ["padrao","porte"].includes(t.tipo)),
    parceiros:            partners,
    biblioteca:           catalog.slice(0,30),
    categoriasLibrary:    [...catFreq.entries()].sort((a,b) => b[1]-a[1]).map(([cat,count]) => ({ cat, count })),
  });
});

// ── GET /arch/office/agenda — agenda inteligente ─────────────────────────────
router.get("/arch/office/agenda", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projects = await db
    .select({
      id:            archProjetosTable.id,
      titulo:        archProjetosTable.titulo,
      clienteNome:   archProjetosTable.clienteNome,
      pipelineStage: archProjetosTable.pipelineStage,
      status:        archProjetosTable.status,
      tipoObra:      archProjetosTable.tipoObra,
      prazoEstimado: archProjetosTable.prazoEstimado,
      createdAt:     archProjetosTable.createdAt,
    }).from(archProjetosTable)
      .where(and(eq(archProjetosTable.tenantId, tid), sql`status != 'concluido'`))
      .orderBy(archProjetosTable.prazoEstimado);

  const events = projects
    .filter(p => p.prazoEstimado && p.prazoEstimado > 0)
    .map(p => {
      const due = new Date(p.createdAt);
      due.setDate(due.getDate() + (p.prazoEstimado ?? 30));
      const daysRemaining = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
      return {
        id:            p.id,
        titulo:        p.titulo,
        clienteNome:   p.clienteNome,
        pipelineStage: p.pipelineStage ?? p.status ?? "briefing",
        tipoObra:      p.tipoObra,
        dueDate:       due.toISOString().slice(0, 10),
        daysRemaining,
        urgente:       daysRemaining <= 7,
        atrasado:      daysRemaining < 0,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Without Google Calendar connection, also return projects without prazo as "backlog"
  const semPrazo = projects
    .filter(p => !p.prazoEstimado || p.prazoEstimado <= 0)
    .map(p => ({
      id:            p.id,
      titulo:        p.titulo,
      clienteNome:   p.clienteNome,
      pipelineStage: p.pipelineStage ?? p.status ?? "briefing",
      tipoObra:      p.tipoObra,
      dueDate:       null,
      daysRemaining: null,
      urgente:       false,
      atrasado:      false,
    }));

  return res.json({ events, semPrazo, total: events.length });
});

// ── POST /arch/office/agenda — criar evento de agenda ────────────────────────
router.post("/arch/office/agenda", authenticate, async (req, res) => {
  const { projectId, titulo, dueDate, nota } = req.body as Record<string, string>;
  const tid = tenantId(req);

  if (!projectId || !dueDate) {
    return res.status(400).json({ error: "projectId e dueDate são obrigatórios" });
  }

  // Compute prazoEstimado (days from project createdAt)
  const [proj] = await db.select({ createdAt: archProjetosTable.createdAt })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)))
    .limit(1);

  if (!proj) return res.status(404).json({ error: "Projeto não encontrado" });

  const due    = new Date(dueDate);
  const created = new Date(proj.createdAt);
  const daysDiff = Math.ceil((due.getTime() - created.getTime()) / 86_400_000);

  await db.update(archProjetosTable)
    .set({ prazoEstimado: Math.max(1, daysDiff), updatedAt: new Date() })
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)));

  return res.json({ ok: true, prazoEstimado: Math.max(1, daysDiff), titulo, nota });
});

// ── GET /arch/office/templates — listar templates ─────────────────────────────
router.get("/arch/office/templates", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const templates = await db
    .select()
    .from(archOfficeTemplatesTable)
    .where(eq(archOfficeTemplatesTable.tenantId, tid))
    .orderBy(desc(archOfficeTemplatesTable.vezesCriado), desc(archOfficeTemplatesTable.createdAt));
  return res.json(templates);
});

// ── POST /arch/office/templates — criar template ──────────────────────────────
router.post("/arch/office/templates", authenticate, async (req, res) => {
  const tid  = tenantId(req);
  const body = req.body as {
    nome: string; descricao?: string; tipoObra?: string; estiloBase?: string;
    prazoEstimado?: number; orcamentoBase?: number;
    ambientes?: { nome: string; descricao?: string }[];
    materiais?: { nome: string; categoria: string; fornecedor?: string }[];
    prompts?: string[];
  };

  if (!body.nome) return res.status(400).json({ error: "nome é obrigatório" });

  const [tmpl] = await db
    .insert(archOfficeTemplatesTable)
    .values({
      tenantId:       tid,
      nome:           body.nome,
      descricao:      body.descricao,
      tipoObra:       body.tipoObra,
      estiloBase:     body.estiloBase,
      prazoEstimado:  body.prazoEstimado,
      orcamentoBase:  body.orcamentoBase ? String(body.orcamentoBase) : undefined,
      ambientes:      body.ambientes ?? [],
      materiais:      body.materiais ?? [],
      prompts:        body.prompts ?? [],
    })
    .returning();

  return res.status(201).json(tmpl);
});

// ── DELETE /arch/office/templates/:id — remover template ─────────────────────
router.delete("/arch/office/templates/:id", authenticate, async (req, res) => {
  const id = (req.params.id as string) as string;
  const tid    = tenantId(req);
  await db.delete(archOfficeTemplatesTable)
    .where(and(eq(archOfficeTemplatesTable.id, id), eq(archOfficeTemplatesTable.tenantId, tid)));
  return res.json({ ok: true });
});

// ── GET /arch/office/indicators — KPIs do escritório ─────────────────────────
router.get("/arch/office/indicators", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const [projectStats, projectsByStage, knowledge, recentCount] = await Promise.all([
    db.select({
      total:    sql<number>`count(*)`.mapWith(Number),
      avgDias:  sql<number>`
        coalesce(avg(
          extract(epoch from (updated_at - created_at)) / 86400
        ), 0)
      `.mapWith(Number),
    }).from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tid)),

    db.select({
      stage: archProjetosTable.pipelineStage,
      count: sql<number>`count(*)`.mapWith(Number),
    }).from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tid))
      .groupBy(archProjetosTable.pipelineStage),

    db.select({
      total:       sql<number>`count(*)`.mapWith(Number),
      renders:     sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
      aprovados:   sql<number>`coalesce(sum(renders_aprovados), 0)`.mapWith(Number),
      revisoes:    sql<number>`coalesce(avg(revisoes), 0)`.mapWith(Number),
      iaRenderers: sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
    }).from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid)),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(archProjetosTable)
      .where(and(
        eq(archProjetosTable.tenantId, tid),
        sql`created_at >= now() - interval '30 days'`,
      )),
  ]);

  const ps = projectStats[0];
  const ks = knowledge[0];
  const approvalRate = (ks?.renders ?? 0) > 0 ? Math.round((ks.aprovados / ks.renders) * 100) : 0;
  const avgRendersPerProjeto = (ks?.total ?? 0) > 0 ? Math.round((ks.renders / ks.total) * 10) / 10 : 0;

  // Stage funnel
  const stageCounts: Record<string, number> = {};
  PIPELINE_STAGES.forEach(s => { stageCounts[s] = 0; });
  projectsByStage.forEach(r => {
    if (r.stage && r.stage in stageCounts) stageCounts[r.stage] = r.count;
  });

  return res.json({
    totalProjetos:        ps?.total ?? 0,
    projetosUltimos30Dias:recentCount[0]?.count ?? 0,
    tempMedioProjeto:     Math.round(ps?.avgDias ?? 0),
    totalRenders:         ks?.renders ?? 0,
    taxaAprovacao:        approvalRate,
    avgRendersPerProjeto,
    avgRevisoes:          Math.round((ks?.revisoes ?? 0) * 10) / 10,
    usoIA:                ks?.renders ?? 0,
    funnel:               stageCounts,
  });
});

export { archPublicRouter };
export default router;
