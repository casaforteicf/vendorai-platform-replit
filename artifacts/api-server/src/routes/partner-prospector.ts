import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  partnerLeadsTable,
  partnerProspectorJobsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { runPartnerProspectorJob } from "../jobs/partnerProspector.js";

const router: IRouter = Router();

// ── Schemas ────────────────────────────────────────────────────────────────────

const createJobSchema = z.object({
  cidade: z.string().min(2).max(100),
  uf: z.string().length(2),
  nichos: z.array(z.string().min(2)).min(1).max(20),
});

// ── POST /admin/partner-prospector/jobs ───────────────────────────────────────
// Create a new prospector job

router.post(
  "/admin/partner-prospector/jobs",
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }

    const { cidade, uf, nichos } = parsed.data;

    const [job] = await db
      .insert(partnerProspectorJobsTable)
      .values({ cidade, uf, nichos, status: "pendente" })
      .returning();

    return res.status(201).json(job);
  },
);

// ── GET /admin/partner-prospector/jobs ────────────────────────────────────────
// List all jobs ordered by newest first

router.get(
  "/admin/partner-prospector/jobs",
  requireRole("super_admin"),
  async (_req, res) => {
    const jobs = await db
      .select()
      .from(partnerProspectorJobsTable)
      .orderBy(desc(partnerProspectorJobsTable.createdAt));

    return res.json(jobs);
  },
);

// ── GET /admin/partner-prospector/jobs/:id ────────────────────────────────────
// Job detail with associated partner_leads

router.get(
  "/admin/partner-prospector/jobs/:id",
  requireRole("super_admin"),
  async (req, res) => {
    const { id } = req.params;

    const [job] = await db
      .select()
      .from(partnerProspectorJobsTable)
      .where(eq(partnerProspectorJobsTable.id, id as string))
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: "Job não encontrado" });
    }

    const leads = await db
      .select()
      .from(partnerLeadsTable)
      .where(eq(partnerLeadsTable.prospectorJobId, id as string))
      .orderBy(desc(partnerLeadsTable.score));

    return res.json({ ...job, leads });
  },
);

// ── POST /admin/partner-prospector/jobs/:id/run ───────────────────────────────
// Force immediate execution of a specific job (resets to 'pendente' first)

router.post(
  "/admin/partner-prospector/jobs/:id/run",
  requireRole("super_admin"),
  async (req, res) => {
    const { id } = req.params;

    const [job] = await db
      .select({ id: partnerProspectorJobsTable.id })
      .from(partnerProspectorJobsTable)
      .where(eq(partnerProspectorJobsTable.id, id as string))
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: "Job não encontrado" });
    }

    // Reset to pendente so the job runs
    await db
      .update(partnerProspectorJobsTable)
      .set({ status: "pendente", erroMsg: null, finishedAt: null })
      .where(eq(partnerProspectorJobsTable.id, id as string));

    // Fire and forget — returns immediately
    runPartnerProspectorJob(req.log).catch((err) => {
      req.log.error({ err }, "partner-prospector: forced run threw");
    });

    return res.json({ ok: true, message: "Execução iniciada em background" });
  },
);

export default router;
