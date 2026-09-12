import type { NextFunction, Request, Response } from "express";
import { writeConfigurationAudit } from "./configuration-audit.js";
import { logger } from "./logger.js";

function importIdFromUrl(req: Request): string | null {
  const path = req.originalUrl.split("?", 1)[0] ?? "";
  const parts = path.split("/").filter(Boolean);
  const index = parts.lastIndexOf("imports");
  return index >= 0 && parts[index + 1] ? parts[index + 1] : null;
}

export function aiVisibilityAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST" && req.method !== "DELETE") return next();

  const tenantId = String(req.params.tenantId ?? "");
  if (!tenantId) return next();

  const actor = {
    userId: req.user?.sub ?? req.user?.id ?? null,
    ip: req.ip ?? null,
  };
  const rowCount = Array.isArray((req.body as { rows?: unknown })?.rows)
    ? ((req.body as { rows: unknown[] }).rows.length)
    : null;
  const fileName = typeof (req.body as { fileName?: unknown })?.fileName === "string"
    ? String((req.body as { fileName?: string }).fileName).slice(0, 500)
    : null;
  const importId = importIdFromUrl(req);

  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const action = req.method === "DELETE" ? "excluir" as const : "criar" as const;
    const snapshot = req.method === "DELETE"
      ? { provider: "bing_ai_performance", importId }
      : { provider: "bing_ai_performance", fileName, rowCount };

    void writeConfigurationAudit({
      tenantId,
      action,
      entity: "ai_visibility_import",
      entityId: importId ?? tenantId,
      before: action === "excluir" ? snapshot : undefined,
      after: action === "criar" ? snapshot : undefined,
      actor,
    }).then((audited) => {
      if (!audited) logger.warn({ tenantId, action }, "AI visibility: audit trail could not be persisted");
    }).catch((error) => {
      logger.warn({ tenantId, action, error }, "AI visibility: audit trail failed");
    });
  });

  return next();
}
