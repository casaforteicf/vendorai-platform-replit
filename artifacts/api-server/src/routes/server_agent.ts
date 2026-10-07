import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, agentActionsLogTable } from "@workspace/db";
import { executeServerCommand, serverAgentStatus } from "../services/server-agent.js";

const router: IRouter = Router();

const executeSchema = z.object({
  command: z.string().min(1).max(6000),
  mode: z.enum(["read", "write"]).default("read"),
  approved: z.boolean().default(false),
  timeoutMs: z.number().int().min(3000).max(300000).optional(),
});

function isSuperAdmin(req: any) {
  return req.user?.platformRole === "super_admin";
}

router.get("/server-agent/status", (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  res.json(serverAgentStatus());
});

router.post("/server-agent/execute", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.mode === "write" && !parsed.data.approved) {
    res.status(409).json({
      error: "APPROVAL_REQUIRED",
      message: "Ação de escrita no servidor exige aprovação explícita.",
      command: parsed.data.command,
    });
    return;
  }

  const tenantId = req.user?.tenantId ?? "platform";
  try {
    const result = await executeServerCommand({
      command: parsed.data.command,
      mode: parsed.data.mode,
      timeoutMs: parsed.data.timeoutMs,
    });

    await db.insert(agentActionsLogTable).values({
      tenantId,
      agentName: "server",
      actionType: parsed.data.mode === "write" ? "server_write_command" : "server_read_command",
      status: result.ok ? "executed" : "failed",
      payload: {
        host: result.host,
        user: result.user,
        command: parsed.data.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      },
    });

    res.status(result.ok ? 200 : 502).json(result);
  } catch (error: any) {
    await db.insert(agentActionsLogTable).values({
      tenantId,
      agentName: "server",
      actionType: parsed.data.mode === "write" ? "server_write_command" : "server_read_command",
      status: "failed",
      payload: {
        command: parsed.data.command,
        error: error?.message ?? "SERVER_AGENT_FAILED",
      },
    }).catch(() => undefined);

    res.status(502).json({ error: error?.message ?? "SERVER_AGENT_FAILED" });
  }
});

export default router;
