import { Router, type IRouter } from "express";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import {
  listReferenceCreators,
  addReferenceCreator,
  removeReferenceCreator,
  refreshReferenceCreatorAnalysis,
  ReferenceCreatorError,
} from "../services/content-reference-creators.js";

const router: IRouter = Router();

function assertTenantAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/content-reference-creators", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const creators = await listReferenceCreators(tenantId);
  return res.json(creators);
});

router.post("/tenants/:tenantId/content-reference-creators", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const created = await addReferenceCreator(tenantId, String(req.body?.instagramUsername ?? ""));
    return res.status(201).json(created);
  } catch (err) {
    if (err instanceof ReferenceCreatorError) return res.status(422).json({ error: err.message });
    logger.error({ err, tenantId }, "content-reference-creators: erro ao adicionar");
    return res.status(500).json({ error: "Erro inesperado." });
  }
});

router.delete("/tenants/:tenantId/content-reference-creators/:id", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  await removeReferenceCreator(tenantId, String(req.params.id));
  return res.json({ success: true });
});

router.post("/tenants/:tenantId/content-reference-creators/:id/atualizar", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const updated = await refreshReferenceCreatorAnalysis(tenantId, String(req.params.id));
    return res.json(updated);
  } catch (err) {
    if (err instanceof ReferenceCreatorError) return res.status(422).json({ error: err.message });
    logger.error({ err, tenantId }, "content-reference-creators: erro ao atualizar análise");
    return res.status(500).json({ error: "Erro inesperado." });
  }
});

export default router;
