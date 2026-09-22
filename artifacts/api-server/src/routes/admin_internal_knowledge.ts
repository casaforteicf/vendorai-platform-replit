import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, adminInternalKnowledgeSegmentsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

type ScopeModuleInput = {
  id: string;
  group: string;
  title: string;
  summary: string;
  bullets: string[];
  angle: string;
};

function cleanModules(input: unknown): ScopeModuleInput[] | null {
  if (!Array.isArray(input)) return null;
  const result: ScopeModuleInput[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const id = String(item.id ?? "").trim();
    const group = String(item.group ?? "").trim();
    const title = String(item.title ?? "").trim();
    const summary = String(item.summary ?? "").trim();
    const angle = String(item.angle ?? "").trim();
    const bullets = Array.isArray(item.bullets)
      ? item.bullets.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (!id || !group || !title || !summary || seen.has(id)) return null;
    seen.add(id);
    result.push({ id, group, title, summary, bullets, angle });
  }

  return result;
}

router.get("/admin/internal-knowledge", requireRole("super_admin"), async (_req, res) => {
  const rows = await db.select().from(adminInternalKnowledgeSegmentsTable);
  return res.json(rows);
});

router.put("/admin/internal-knowledge/:key", requireRole("super_admin"), async (req, res) => {
  const key = String(req.params.key ?? "").trim().toLowerCase();
  const label = String(req.body?.label ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const modules = cleanModules(req.body?.modules);
  const isCustom = Boolean(req.body?.isCustom);

  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(key)) {
    return res.status(400).json({ error: "Chave de segmento inválida." });
  }
  if (!label || !modules) {
    return res.status(400).json({ error: "Segmento ou módulos inválidos." });
  }

  const [saved] = await db
    .insert(adminInternalKnowledgeSegmentsTable)
    .values({ key, label, description, modules, isCustom })
    .onConflictDoUpdate({
      target: adminInternalKnowledgeSegmentsTable.key,
      set: { label, description, modules, isCustom, updatedAt: new Date() },
    })
    .returning();

  return res.json(saved);
});

router.delete("/admin/internal-knowledge/:key", requireRole("super_admin"), async (req, res) => {
  const key = String(req.params.key ?? "").trim().toLowerCase();
  const [deleted] = await db
    .delete(adminInternalKnowledgeSegmentsTable)
    .where(eq(adminInternalKnowledgeSegmentsTable.key, key))
    .returning({ key: adminInternalKnowledgeSegmentsTable.key });

  return res.json({ ok: true, deleted: Boolean(deleted) });
});

export default router;
