import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, count } from "drizzle-orm";
import { z } from "zod/v4";
import { db, bugReportsTable, relatosTecnicosTable, jarvisCasesTable, tenantsTable, usersTable, vieSourcesTable, vieItemsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const jarvisSignalSchema = z.object({
  signalKey: z.string().min(1).max(255),
  source: z.string().min(1).max(80).default("internal"),
  category: z.string().min(1).max(80),
  severity: z.enum(["opportunity", "attention", "risk"]),
  title: z.string().min(1).max(255),
  detail: z.string().min(1).max(5000),
  metric: z.string().max(500).nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  impact: z.number().min(0).nullable().optional(),
  href: z.string().max(1000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
  recommendedAction: z.string().max(5000).nullable().optional(),
});

const jarvisSyncSchema = z.object({
  signals: z.array(jarvisSignalSchema).max(50),
});

// GET /jarvis/history — histórico do tenant autenticado, reutilizando a persistência existente.
router.get("/jarvis/history", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.json([]);

  const reports = await db
    .select({
      id: bugReportsTable.id,
      conversationId: bugReportsTable.conversationId,
      titulo: bugReportsTable.titulo,
      descricao: bugReportsTable.descricao,
      categoria: bugReportsTable.categoria,
      status: bugReportsTable.status,
      prioridade: bugReportsTable.prioridade,
      rotaAfetada: bugReportsTable.rotaAfetada,
      respostaJarvis: bugReportsTable.respostaSuporte,
      resolvidoPor: bugReportsTable.resolvidoPor,
      createdAt: bugReportsTable.createdAt,
      updatedAt: bugReportsTable.updatedAt,
    })
    .from(bugReportsTable)
    .where(eq(bugReportsTable.tenantId, tenantId))
    .orderBy(desc(bugReportsTable.updatedAt))
    .limit(20);

  const relatos = await db
    .select({
      conversationId: relatosTecnicosTable.conversationId,
      transcript: relatosTecnicosTable.transcriptRelevante,
    })
    .from(relatosTecnicosTable)
    .where(eq(relatosTecnicosTable.tenantId, tenantId as any))
    .orderBy(desc(relatosTecnicosTable.criadoEm))
    .limit(50);

  const transcriptByConversation = new Map(
    relatos
      .filter((item) => item.conversationId)
      .map((item) => [String(item.conversationId), item.transcript ?? null]),
  );

  return res.json(reports.map((report) => ({
    ...report,
    transcript: report.conversationId
      ? transcriptByConversation.get(String(report.conversationId)) ?? null
      : null,
  })));
});

// GET /jarvis/cases — Casos Vendor persistentes do tenant autenticado.
router.get("/jarvis/cases", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.json([]);

  const rows = await db
    .select()
    .from(jarvisCasesTable)
    .where(eq(jarvisCasesTable.tenantId, tenantId))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(100);

  return res.json(rows);
});

// GET /jarvis/vie/coverage — saúde operacional das fontes reais do VIE.
router.get("/jarvis/vie/coverage", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const sources = await db
    .select({
      id: vieSourcesTable.id,
      code: vieSourcesTable.code,
      name: vieSourcesTable.name,
      scope: vieSourcesTable.scope,
      sourceType: vieSourcesTable.sourceType,
      countryCode: vieSourcesTable.countryCode,
      regionCode: vieSourcesTable.regionCode,
      city: vieSourcesTable.city,
      reliabilityScore: vieSourcesTable.reliabilityScore,
      lastCheckedAt: vieSourcesTable.lastCheckedAt,
      lastSuccessAt: vieSourcesTable.lastSuccessAt,
      lastFailureAt: vieSourcesTable.lastFailureAt,
    })
    .from(vieSourcesTable)
    .where(and(eq(vieSourcesTable.active, true), eq(vieSourcesTable.domain, "news")))
    .orderBy(vieSourcesTable.name);

  const recentItems = await db
    .select({ sourceId: vieItemsTable.sourceId, total: count() })
    .from(vieItemsTable)
    .where(gte(vieItemsTable.collectedAt, since24h))
    .groupBy(vieItemsTable.sourceId);

  const collected24hBySource = new Map(recentItems.map((row) => [row.sourceId, Number(row.total ?? 0)]));

  const operationalSources = sources.map((source) => {
    let status: "healthy" | "failing" | "stale" | "never_checked" = "healthy";
    if (!source.lastCheckedAt) {
      status = "never_checked";
    } else if (source.lastFailureAt && (!source.lastSuccessAt || source.lastFailureAt > source.lastSuccessAt)) {
      status = "failing";
    } else if (source.lastCheckedAt < staleBefore) {
      status = "stale";
    }

    return {
      ...source,
      status,
      collected24h: collected24hBySource.get(source.id) ?? 0,
    };
  });

  const latestDate = (values: Array<Date | null>) => {
    const valid = values.filter((value): value is Date => value instanceof Date);
    if (!valid.length) return null;
    return new Date(Math.max(...valid.map((value) => value.getTime())));
  };

  return res.json({
    generatedAt: now,
    cadenceHours: 6,
    staleAfterHours: 12,
    summary: {
      activeSources: operationalSources.length,
      healthySources: operationalSources.filter((source) => source.status === "healthy").length,
      failingSources: operationalSources.filter((source) => source.status === "failing").length,
      staleSources: operationalSources.filter((source) => source.status === "stale").length,
      neverCheckedSources: operationalSources.filter((source) => source.status === "never_checked").length,
      collected24h: operationalSources.reduce((total, source) => total + source.collected24h, 0),
      lastCheckedAt: latestDate(operationalSources.map((source) => source.lastCheckedAt)),
      lastSuccessAt: latestDate(operationalSources.map((source) => source.lastSuccessAt)),
      lastFailureAt: latestDate(operationalSources.map((source) => source.lastFailureAt)),
    },
    sources: operationalSources,
  });
});

// POST /jarvis/cases/sync — upsert idempotente dos sinais já calculados pelo VendorAI.
router.post("/jarvis/cases/sync", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const parsed = jarvisSyncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const now = new Date();
  for (const signal of parsed.data.signals) {
    await db
      .insert(jarvisCasesTable)
      .values({
        tenantId,
        signalKey: signal.signalKey,
        source: signal.source,
        category: signal.category,
        severity: signal.severity,
        title: signal.title,
        detail: signal.detail,
        metric: signal.metric ?? null,
        confidence: signal.confidence ?? null,
        impact: signal.impact == null ? null : Math.round(signal.impact),
        href: signal.href ?? null,
        status: "open",
        evidence: signal.evidence ?? null,
        recommendedAction: signal.recommendedAction ?? null,
        firstDetectedAt: now,
        lastDetectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [jarvisCasesTable.tenantId, jarvisCasesTable.signalKey],
        set: {
          source: signal.source,
          category: signal.category,
          severity: signal.severity,
          title: signal.title,
          detail: signal.detail,
          metric: signal.metric ?? null,
          confidence: signal.confidence ?? null,
          impact: signal.impact == null ? null : Math.round(signal.impact),
          href: signal.href ?? null,
          status: "open",
          evidence: signal.evidence ?? null,
          recommendedAction: signal.recommendedAction ?? null,
          lastDetectedAt: now,
          updatedAt: now,
        },
      });
  }

  return res.json({ synced: parsed.data.signals.length });
});

// GET /admin/bug-reports
router.get("/admin/bug-reports", requireRole("super_admin"), async (req, res) => {
  const { status, prioridade, categoria, tenantId, startDate, endDate } = req.query;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status && status !== "all") conditions.push(eq(bugReportsTable.status, status as "aberto" | "em_analise" | "resolvido"));
  if (prioridade && prioridade !== "all") conditions.push(eq(bugReportsTable.prioridade, prioridade as "baixa" | "media" | "alta" | "critica"));
  if (categoria && categoria !== "all") conditions.push(eq(bugReportsTable.categoria, categoria as "bug" | "duvida" | "sugestao"));
  if (tenantId && tenantId !== "all") conditions.push(eq(bugReportsTable.tenantId, tenantId as string));
  if (startDate) conditions.push(gte(bugReportsTable.createdAt, new Date(startDate as string)));
  if (endDate) conditions.push(lte(bugReportsTable.createdAt, new Date(endDate as string)));

  const rows = await db
    .select({
      id: bugReportsTable.id,
      tenantId: bugReportsTable.tenantId,
      tenantName: tenantsTable.name,
      conversationId: bugReportsTable.conversationId,
      resolvidoPor: bugReportsTable.resolvidoPor,
      titulo: bugReportsTable.titulo,
      descricao: bugReportsTable.descricao,
      categoria: bugReportsTable.categoria,
      status: bugReportsTable.status,
      prioridade: bugReportsTable.prioridade,
      rotaAfetada: bugReportsTable.rotaAfetada,
      erroTecnico: bugReportsTable.erroTecnico,
      stackTrace: bugReportsTable.stackTrace,
      respostaSuporte: bugReportsTable.respostaSuporte,
      resolvidoAt: bugReportsTable.resolvidoAt,
      createdAt: bugReportsTable.createdAt,
      updatedAt: bugReportsTable.updatedAt,
    })
    .from(bugReportsTable)
    .leftJoin(tenantsTable, eq(bugReportsTable.tenantId, tenantsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bugReportsTable.createdAt));

  return res.json(rows);
});

// GET /admin/bug-reports/open-count — badge counter
router.get("/admin/bug-reports/open-count", requireRole("super_admin"), async (_req, res) => {
  const [result] = await db
    .select({ count: count() })
    .from(bugReportsTable)
    .where(eq(bugReportsTable.status, "aberto"));

  return res.json({ count: result?.count ?? 0 });
});

// PATCH /admin/bug-reports/:id
const patchSchema = z.object({
  status: z.enum(["em_analise", "resolvido"]),
  respostaSuporte: z.string().optional(),
});

router.patch("/admin/bug-reports/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { status, respostaSuporte } = parsed.data;

  const [existing] = await db
    .select()
    .from(bugReportsTable)
    .where(eq(bugReportsTable.id, (req.params.id as string)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Bug report not found" });
    return;
  }

  const [updated] = await (db as any)
    .update(bugReportsTable)
    .set({
      status,
      ...(respostaSuporte !== undefined ? { respostaSuporte } : {}),
      resolvidoPor: status === "resolvido" ? "humano" : null,
      resolvidoAt: status === "resolvido" ? new Date() : null,
      updatedAt: new Date(),
    } as any)
    .where(eq(bugReportsTable.id, (req.params.id as string)))
    .returning();

  if (status === "resolvido") {
    try {
      const [adminUser] = await db
        .select({ telefone: usersTable.telefone })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.tenantId, existing.tenantId),
            eq(usersTable.platformRole, "tenant_admin")
          )
        )
        .limit(1);

      if (adminUser?.telefone) {
        const protocolo = `#${existing.id.substring(0, 8).toUpperCase()}`;
        const resposta = respostaSuporte ?? existing.respostaSuporte;
        const msg = [
          `✅ *VendorAI — Chamado Resolvido*`,
          ``,
          `Protocolo: ${protocolo}`,
          `Assunto: ${existing.titulo}`,
          ``,
          `Seu chamado foi analisado e resolvido pela nossa equipe.`,
          ...(resposta ? [``, `Resposta: ${resposta}`] : []),
          ``,
          `Obrigado por usar o VendorAI! 🚀`,
        ].join("\n");

        await sendDirectWhatsAppMessage(existing.tenantId, adminUser.telefone, msg, logger);
      }
    } catch (err) {
      logger.warn({ err, bugId: existing.id }, "admin_bug_reports: WhatsApp notification failed (non-critical)");
    }
  }

  return res.json(updated);
});

export default router;
