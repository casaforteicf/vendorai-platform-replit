import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, agentActionsLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runBrowserAgent } from "../services/browser-agent.js";

const router: IRouter = Router();

const runSchema = z.object({
  goal: z.string().min(3).max(4000),
  startUrl: z.string().url(),
  agentName: z.string().min(1).default("browser"),
  leadId: z.string().optional(),
  mode: z.enum(["assistido", "autonomo"]).default("assistido"),
  allowWrite: z.boolean().default(false),
  maxSteps: z.number().int().min(1).max(30).default(12),
  tenantId: z.string().optional(),
});

router.get("/browser-agent/status", (_req, res) => {
  res.json({
    configured: Boolean(process.env["BROWSER_CDP_URL"]),
    allowlistEnabled: Boolean(process.env["BROWSER_ALLOWED_HOSTS"]),
    runtime: "cdp",
  });
});

router.post("/browser-agent/run", async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const ownTenantId = req.user?.tenantId;
  const isSuperAdmin = req.user?.platformRole === "super_admin";
  const tenantId = ownTenantId ?? (isSuperAdmin ? parsed.data.tenantId : undefined);

  if (!tenantId) {
    res.status(422).json({ error: "tenantId não resolvido" });
    return;
  }

  const [audit] = await db.insert(agentActionsLogTable).values({
    tenantId,
    leadId: parsed.data.leadId ?? null,
    agentName: parsed.data.agentName,
    actionType: "browser_run",
    status: parsed.data.allowWrite ? "approved" : "pending",
    payload: {
      goal: parsed.data.goal,
      startUrl: parsed.data.startUrl,
      mode: parsed.data.mode,
      allowWrite: parsed.data.allowWrite,
    },
  }).returning();

  try {
    const result = await runBrowserAgent({
      tenantId,
      goal: parsed.data.goal,
      startUrl: parsed.data.startUrl,
      mode: parsed.data.mode,
      allowWrite: parsed.data.allowWrite,
      maxSteps: parsed.data.maxSteps,
    });

    if (audit?.id) {
      await db.update(agentActionsLogTable)
        .set({ status: "executed", payload: { ...(audit.payload ?? {}), result } })
        .where(eq(agentActionsLogTable.id, audit.id));
    }

    res.json({ runId: audit?.id, ...result });
  } catch (error: any) {
    const approvalRequired = String(error?.message ?? "").startsWith("APPROVAL_REQUIRED:");
    if (audit?.id) {
      await db.update(agentActionsLogTable)
        .set({
          status: approvalRequired ? "pending" : "rejected",
          payload: { ...(audit.payload ?? {}), error: error?.message ?? "Browser Agent failed" },
        })
        .where(eq(agentActionsLogTable.id, audit.id));
    }

    res.status(approvalRequired ? 409 : 500).json({
      error: error?.message ?? "Browser Agent failed",
      runId: audit?.id,
      approvalRequired,
    });
  }
});

export default router;
