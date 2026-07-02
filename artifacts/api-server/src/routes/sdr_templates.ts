/**
 * SDR Templates routes — Cmd 16
 * GET  /sdr-templates          — list templates for tenant (merged with globals)
 * PUT  /sdr-templates/:id      — upsert tenant-specific template
 * POST /sdr-templates/test-send — send test to logged-in user's phone
 * POST /sdr-templates/send-approach — trigger SDR first approach for a lead
 */
import { Router } from "express";
import { z } from "zod/v4";
import { and, eq, isNull, or, asc } from "drizzle-orm";
import { db, sdrTemplatesTable, usersTable } from "@workspace/db";
import { sendSdrFirstApproach, resolveTemplateVars, getTemplateForCenario } from "../services/sdrService.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";

const router = Router();

function resolveTenantId(req: any): string {
  return req.user?.role === "super_admin"
    ? ((req.query.tenantId as string) ?? req.user.tenantId)
    : req.user.tenantId;
}

// ── GET /sdr-templates — list (globals + tenant overrides) ────────────────────
router.get("/sdr-templates", async (req, res) => {
  const tenantId = resolveTenantId(req);

  const globals = await db
    .select()
    .from(sdrTemplatesTable)
    .where(isNull(sdrTemplatesTable.tenantId))
    .orderBy(asc(sdrTemplatesTable.cenario), asc(sdrTemplatesTable.ordem));

  const tenantOverrides = await db
    .select()
    .from(sdrTemplatesTable)
    .where(eq(sdrTemplatesTable.tenantId, tenantId))
    .orderBy(asc(sdrTemplatesTable.cenario), asc(sdrTemplatesTable.ordem));

  // Merge: tenant override wins per (cenario, ordem)
  const overrideMap = new Map(tenantOverrides.map((t) => [`${t.cenario}:${t.ordem}`, t]));
  const merged = globals.map((g) => overrideMap.get(`${g.cenario}:${g.ordem}`) ?? { ...g, isGlobal: true });

  // Add tenant-only templates (custom cenarios not in globals)
  const globalKeys = new Set(globals.map((g) => `${g.cenario}:${g.ordem}`));
  for (const t of tenantOverrides) {
    if (!globalKeys.has(`${t.cenario}:${t.ordem}`)) merged.push(t);
  }

  return res.status(200).json({ templates: merged });
});

// ── PUT /sdr-templates/:id — upsert tenant override ──────────────────────────
const updateSchema = z.object({
  template: z.string().min(1),
  ativo: z.boolean().optional(),
  delayHoras: z.number().int().min(0).optional(),
});

router.put("/sdr-templates/:id", async (req, res) => {
  const tenantId = resolveTenantId(req);
  const globalId = req.params.id;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
  }

  // Find the global template to copy its cenario/ordem
  const [global] = await db
    .select()
    .from(sdrTemplatesTable)
    .where(eq(sdrTemplatesTable.id, globalId))
    .limit(1);

  if (!global) return res.status(404).json({ error: "Template não encontrado" });

  // Check if tenant override exists
  const [existing] = await db
    .select({ id: sdrTemplatesTable.id })
    .from(sdrTemplatesTable)
    .where(and(
      eq(sdrTemplatesTable.tenantId, tenantId),
      eq(sdrTemplatesTable.cenario, global.cenario),
      eq(sdrTemplatesTable.ordem, global.ordem),
    ))
    .limit(1);

  let saved;
  if (existing) {
    [saved] = await db
      .update(sdrTemplatesTable)
      .set({
        template: parsed.data.template,
        ativo: parsed.data.ativo ?? global.ativo,
        delayHoras: parsed.data.delayHoras ?? global.delayHoras,
        updatedAt: new Date(),
      })
      .where(eq(sdrTemplatesTable.id, existing.id))
      .returning();
  } else {
    [saved] = await db
      .insert(sdrTemplatesTable)
      .values({
        tenantId,
        cenario: global.cenario,
        ordem: global.ordem,
        delayHoras: parsed.data.delayHoras ?? global.delayHoras,
        template: parsed.data.template,
        ativo: parsed.data.ativo ?? global.ativo,
      })
      .returning();
  }

  return res.status(200).json({ template: saved });
});

// ── POST /sdr-templates/test-send — send test to logged-in user ───────────────
router.post("/sdr-templates/test-send", async (req, res) => {
  const tenantId = resolveTenantId(req);
  const userId = req.user?.sub;

  const parsed = z.object({ cenario: z.string(), ordem: z.number().int().default(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "cenario obrigatório" });

  const [user] = await db
    .select({ telefone: usersTable.telefone, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId ?? ""))
    .limit(1);

  if (!user?.telefone) {
    return res.status(422).json({ error: "Seu perfil não tem telefone cadastrado para teste." });
  }

  const rawTemplate = await getTemplateForCenario(tenantId, parsed.data.cenario, parsed.data.ordem);
  if (!rawTemplate) return res.status(404).json({ error: "Template não encontrado ou inativo" });

  // Fill with demo data
  const demo: Record<string, string> = {
    segmento_produto: "móveis planejados",
    segmento: "móveis",
    cidade: "sua cidade",
    dono_nome: user.name.split(" ")[0],
    nome_gatekeeper: "Ana",
    principal_reclamacao: "demora na resposta",
    vendedor_nome: user.name.split(" ")[0],
    nome_atendente: "",
    tempo_espera: "pouco tempo",
    status_resposta: "ainda não tive resposta",
    dia_sugestao_1: "terça (8/7)",
    dia_sugestao_2: "quarta (9/7)",
    hora_sugestao_1: "10h",
    empresa_nome: "Vendor.ai",
  };

  let message = rawTemplate;
  for (const [k, v] of Object.entries(demo)) message = message.replaceAll(`{${k}}`, v);
  message = message.replace(/\{[^}]+\}/g, "");
  message = `[TESTE] ${message}`;

  await sendDirectWhatsAppMessage(tenantId, user.telefone, message, req.log);

  return res.status(200).json({ ok: true, preview: message });
});

// ── POST /sdr-templates/send-approach — trigger SDR for a lead ────────────────
router.post("/sdr-templates/send-approach", async (req, res) => {
  const tenantId = resolveTenantId(req);
  const parsed = z.object({ leadId: z.string(), dealId: z.string().nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "leadId obrigatório" });

  const result = await sendSdrFirstApproach(
    parsed.data.leadId,
    parsed.data.dealId ?? null,
    tenantId,
    req.log,
  );

  return res.status(200).json(result);
});

export default router;
