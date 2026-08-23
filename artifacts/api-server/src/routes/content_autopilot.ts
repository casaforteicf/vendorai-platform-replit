import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  contentAutopilotConfigTable,
  contentAutopilotKeywordsTable,
  insertContentAutopilotConfigSchema,
  updateContentAutopilotConfigSchema,
} from "@workspace/db";
import { z } from "zod/v4";
import { analyzeSiteTone, discoverKeywords, researchCompetitors, getConfig, OrcamentoExcedidoError } from "../services/contentAutopilot.js";
import { isDataForSeoConfigured } from "../lib/dataforseoClient.js";

const router: IRouter = Router();

function checkAccess(req: any, res: any, tenantId: string): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ── GET /tenants/:tenantId/content-autopilot/config ─────────────────────────
router.get("/tenants/:tenantId/content-autopilot/config", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const config = await getConfig(tenantId);
  res.json({ config, dataForSeoConfigured: isDataForSeoConfigured() });
});

// ── PUT /tenants/:tenantId/content-autopilot/config ──────────────────────────
// Cria ou atualiza a config (upsert por tenant_id, que já é unique index).
router.put("/tenants/:tenantId/content-autopilot/config", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const parsed = updateContentAutopilotConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Payload inválido", issues: parsed.error.issues });
    return;
  }

  const existing = await getConfig(tenantId);
  if (existing) {
    const [updated] = await db
      .update(contentAutopilotConfigTable)
      .set({ ...parsed.data, updatedAt: new Date() } as any)
      .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
      .returning();
    res.json({ config: updated });
    return;
  }

  const insertParsed = insertContentAutopilotConfigSchema.safeParse({ tenantId, ...parsed.data });
  if (!insertParsed.success) {
    res.status(422).json({ error: "Payload inválido pra criação", issues: insertParsed.error.issues });
    return;
  }
  const [created] = await db.insert(contentAutopilotConfigTable).values(insertParsed.data as any).returning();
  res.status(201).json({ config: created });
});

// ── POST /tenants/:tenantId/content-autopilot/analyze-site ──────────────────
// Faz scrape do site_url já salvo na config e extrai o tom de marca via Claude.
router.post("/tenants/:tenantId/content-autopilot/analyze-site", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const config = await getConfig(tenantId);
  if (!config?.siteUrl) {
    res.status(422).json({ error: "Configure site_url antes de analisar" });
    return;
  }

  try {
    const brandTone = await analyzeSiteTone(tenantId, config.siteUrl);
    res.json({ brandTone });
  } catch (err) {
    req.log?.error({ err, tenantId }, "content-autopilot/analyze-site: falhou");
    res.status(502).json({ error: err instanceof Error ? err.message : "Falha ao analisar o site" });
  }
});

// ── POST /tenants/:tenantId/content-autopilot/keywords/research ─────────────
// Body: { seedKeywords: string[] } — descobre keywords relacionadas via DataForSEO.
const researchKeywordsSchema = z.object({ seedKeywords: z.array(z.string().min(1)).min(1).max(20) });

router.post("/tenants/:tenantId/content-autopilot/keywords/research", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const parsed = researchKeywordsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Payload inválido — esperado { seedKeywords: string[] }", issues: parsed.error.issues });
    return;
  }

  try {
    const result = await discoverKeywords(tenantId, parsed.data.seedKeywords);
    res.json(result);
  } catch (err) {
    if (err instanceof OrcamentoExcedidoError) {
      res.status(402).json({ error: err.message });
      return;
    }
    req.log?.error({ err, tenantId }, "content-autopilot/keywords/research: falhou");
    res.status(502).json({ error: err instanceof Error ? err.message : "Falha ao pesquisar keywords" });
  }
});

// ── GET /tenants/:tenantId/content-autopilot/keywords ────────────────────────
router.get("/tenants/:tenantId/content-autopilot/keywords", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db
    .select()
    .from(contentAutopilotKeywordsTable)
    .where(
      statusFilter
        ? and(eq(contentAutopilotKeywordsTable.tenantId, tenantId), eq(contentAutopilotKeywordsTable.status, statusFilter as any))
        : eq(contentAutopilotKeywordsTable.tenantId, tenantId),
    )
    .orderBy(desc(contentAutopilotKeywordsTable.volumeBusca));
  res.json({ keywords: rows });
});

// ── PATCH /tenants/:tenantId/content-autopilot/keywords/:id ─────────────────
// Só pra aprovar/descartar por enquanto (status). Demais campos vêm só do Pesquisador.
const patchKeywordSchema = z.object({ status: z.enum(["descoberta", "aprovada", "em_uso", "descartada"]) });

router.patch("/tenants/:tenantId/content-autopilot/keywords/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const parsed = patchKeywordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Payload inválido — esperado { status }", issues: parsed.error.issues });
    return;
  }

  const [updated] = await db
    .update(contentAutopilotKeywordsTable)
    .set({ status: parsed.data.status })
    .where(and(eq(contentAutopilotKeywordsTable.id, req.params.id as string), eq(contentAutopilotKeywordsTable.tenantId, tenantId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Keyword não encontrada" });
    return;
  }
  res.json({ keyword: updated });
});

// ── POST /tenants/:tenantId/content-autopilot/keywords/:id/research-competitors ──
router.post("/tenants/:tenantId/content-autopilot/keywords/:id/research-competitors", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  try {
    const result = await researchCompetitors(tenantId, req.params.id as string);
    res.json(result);
  } catch (err) {
    if (err instanceof OrcamentoExcedidoError) {
      res.status(402).json({ error: err.message });
      return;
    }
    req.log?.error({ err, tenantId, keywordId: req.params.id }, "content-autopilot/research-competitors: falhou");
    res.status(502).json({ error: err instanceof Error ? err.message : "Falha ao pesquisar concorrência" });
  }
});

export default router;
