/**
 * Webhooks de Sinais de Intenção — Revenue Scout
 *
 * Recebe sinais externos (Google Ads, Meta, visitas ao site) ou internos
 * (perguntas WhatsApp) e os persiste em intent_signals. Após salvar, recalcula
 * o intent_score do lead e enfileira reavaliação de oportunidades pelo Scout.
 *
 * Rotas (todas protegidas por authenticate):
 *   POST /tenants/:tenantId/webhooks/intent/google
 *   POST /tenants/:tenantId/webhooks/intent/meta
 *   POST /tenants/:tenantId/webhooks/intent/site
 *   POST /tenants/:tenantId/webhooks/intent/whatsapp
 *   GET  /tenants/:tenantId/intent-signals
 *   GET  /tenants/:tenantId/leads/:leadId/intent-signals
 */
import { Router, type Request, type Response } from "express";
import { and, eq, gte } from "drizzle-orm";
import {
  db,
  leadsTable,
  intentSignalsTable,
  type InsertIntentSignal,
} from "@workspace/db";

const router = Router();

// ── Pesos por tipo de sinal ────────────────────────────────────────────────────
const SIGNAL_WEIGHTS: Record<string, number> = {
  google_search:    30,
  meta_click:       25,
  site_visit:       20,
  whatsapp_question:40,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(req: Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Request): boolean {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccess(req: Request, tenantId: string): boolean {
  return isSuperAdmin(req) || uid(req) === tenantId;
}

async function recalcLeadIntentScore(tenantId: string, leadId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const signals = await db
    .select({ signalType: intentSignalsTable.signalType, value: intentSignalsTable.value })
    .from(intentSignalsTable)
    .where(
      and(
        eq(intentSignalsTable.leadId, leadId),
        eq(intentSignalsTable.tenantId, tenantId),
        gte(intentSignalsTable.capturedAt, cutoff),
      ),
    );

  if (signals.length === 0) return 0;

  let total = 0;
  for (const s of signals) {
    const weight = SIGNAL_WEIGHTS[s.signalType] ?? 10;
    total += weight * ((s.value ?? 50) / 100);
  }

  return Math.min(Math.round(total), 100);
}

async function saveSignalAndUpdateScore(
  tenantId: string,
  leadId: string,
  signal: Omit<InsertIntentSignal, "id" | "tenantId" | "leadId" | "capturedAt">,
  req: Request,
): Promise<{ saved: boolean; intentScore: number }> {
  const log = (req as any).log ?? console;

  // Verifica se o lead pertence ao tenant
  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) return { saved: false, intentScore: 0 };

  await db.insert(intentSignalsTable).values({
    tenantId,
    leadId,
    capturedAt: new Date(),
    ...signal,
  });

  const score = await recalcLeadIntentScore(tenantId, leadId);

  await db
    .update(leadsTable)
    .set({ intentScore: score, lastIntentUpdate: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  log.info({ tenantId, leadId, signalType: signal.signalType, score }, "intent: sinal registrado");

  return { saved: true, intentScore: score };
}

// ── POST /tenants/:tenantId/webhooks/intent/google ────────────────────────────

router.post("/tenants/:tenantId/webhooks/intent/google", async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { leadId, searchTerm, productName, value } = req.body as {
    leadId?: string;
    searchTerm?: string;
    productName?: string;
    value?: number;
  };

  if (!leadId) return res.status(400).json({ error: "leadId é obrigatório" });

  const result = await saveSignalAndUpdateScore(tenantId, leadId, {
    signalType: "google_search",
    source: "google_ads",
    searchTerm: searchTerm ?? null,
    productName: productName ?? null,
    value: value ?? 50,
    confidence: 0.8,
    metadata: { searchTerm, source: "google_ads" },
  }, req);

  if (!result.saved) return res.status(404).json({ error: "Lead não encontrado" });
  return res.json({ success: true, intentScore: result.intentScore });
});

// ── POST /tenants/:tenantId/webhooks/intent/meta ──────────────────────────────

router.post("/tenants/:tenantId/webhooks/intent/meta", async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { leadId, eventType, productName, value } = req.body as {
    leadId?: string;
    eventType?: string;
    productName?: string;
    value?: number;
  };

  if (!leadId) return res.status(400).json({ error: "leadId é obrigatório" });

  const source = eventType === "instagram" ? "instagram" as const : "facebook" as const;

  const result = await saveSignalAndUpdateScore(tenantId, leadId, {
    signalType: "meta_click",
    source,
    productName: productName ?? null,
    value: value ?? 25,
    confidence: 0.7,
    metadata: { eventType },
  }, req);

  if (!result.saved) return res.status(404).json({ error: "Lead não encontrado" });
  return res.json({ success: true, intentScore: result.intentScore });
});

// ── POST /tenants/:tenantId/webhooks/intent/site ──────────────────────────────

router.post("/tenants/:tenantId/webhooks/intent/site", async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { leadId, url, productName, value } = req.body as {
    leadId?: string;
    url?: string;
    productName?: string;
    value?: number;
  };

  if (!leadId) return res.status(400).json({ error: "leadId é obrigatório" });

  const result = await saveSignalAndUpdateScore(tenantId, leadId, {
    signalType: "site_visit",
    source: "site",
    url: url ?? null,
    productName: productName ?? null,
    value: value ?? 20,
    confidence: 0.9,
    metadata: { url },
  }, req);

  if (!result.saved) return res.status(404).json({ error: "Lead não encontrado" });
  return res.json({ success: true, intentScore: result.intentScore });
});

// ── POST /tenants/:tenantId/webhooks/intent/whatsapp ─────────────────────────

router.post("/tenants/:tenantId/webhooks/intent/whatsapp", async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { leadId, question, productName, value } = req.body as {
    leadId?: string;
    question?: string;
    productName?: string;
    value?: number;
  };

  if (!leadId || !question) {
    return res.status(400).json({ error: "leadId e question são obrigatórios" });
  }

  const result = await saveSignalAndUpdateScore(tenantId, leadId, {
    signalType: "whatsapp_question",
    source: "whatsapp",
    searchTerm: question,
    productName: productName ?? null,
    value: value ?? 40,
    confidence: 0.95,
    metadata: { question },
  }, req);

  if (!result.saved) return res.status(404).json({ error: "Lead não encontrado" });
  return res.json({ success: true, intentScore: result.intentScore });
});

// ── GET /tenants/:tenantId/intent-signals ────────────────────────────────────

router.get("/tenants/:tenantId/intent-signals", async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const signals = await db
    .select()
    .from(intentSignalsTable)
    .where(eq(intentSignalsTable.tenantId, tenantId))
    .orderBy(intentSignalsTable.capturedAt);

  return res.json(signals);
});

// ── GET /tenants/:tenantId/leads/:leadId/intent-signals ──────────────────────

router.get("/tenants/:tenantId/leads/:leadId/intent-signals", async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  const leadId = req.params.leadId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const signals = await db
    .select()
    .from(intentSignalsTable)
    .where(
      and(
        eq(intentSignalsTable.tenantId, tenantId),
        eq(intentSignalsTable.leadId, leadId),
      ),
    )
    .orderBy(intentSignalsTable.capturedAt);

  return res.json(signals);
});

export default router;
