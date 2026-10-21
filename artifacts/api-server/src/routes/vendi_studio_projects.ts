import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, vendiStudioProjectsTable, tenantNavModulesTable } from "@workspace/db";

// Mounted under the existing authenticated, access-scoped routes tree.
const router: IRouter = Router();
// Pilot access: fail closed unless explicitly enabled for a tenant admin.
router.use(async (req: any, res, next) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId || !req.user?.sub) return void res.status(403).json({ error: "Contexto inválido" });
  const admin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  if (!admin) return void res.status(403).json({ error: "Módulo restrito durante o piloto" });
  try {
    const [grant] = await db.select({ enabled: tenantNavModulesTable.isEnabled })
      .from(tenantNavModulesTable).where(and(
        eq(tenantNavModulesTable.tenantId, tenantId),
        eq(tenantNavModulesTable.moduleKey, "vendi_studio"),
      )).limit(1);
    if (!grant?.enabled) return void res.status(403).json({ error: "Vendi Studio não habilitado para este tenant" });
    next();
  } catch {
    res.status(503).json({ error: "Não foi possível validar o acesso ao módulo" });
  }
});
const kinds = ["web_app","mobile_app","website","book","ebook","course","agent","design","media","other"] as const;
const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(kinds).default("web_app"),
  brief: z.string().max(20000).optional(),
}).strict();

function tenantOf(req: any): string | undefined { return req.user?.tenantId; }
function userOf(req: any): string | undefined { return req.user?.sub; }
function unavailable(res: any) { return res.status(503).json({ error: "Projetos indisponíveis no momento", code: "STUDIO_PROJECT_STORAGE_UNAVAILABLE" }); }

router.get("/vendi-studio/projects", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return void res.status(403).json({ error: "Tenant inválido" });
  const parsed = z.coerce.number().int().min(1).max(50).default(20).safeParse(req.query.limit ?? 20);
  if (!parsed.success) return void res.status(422).json({ error: "Limite inválido" });
  try {
    const projects = await db.select().from(vendiStudioProjectsTable)
      .where(eq(vendiStudioProjectsTable.tenantId, tenantId))
      .orderBy(desc(vendiStudioProjectsTable.updatedAt)).limit(parsed.data);
    res.json({ projects });
  } catch { unavailable(res); }
});

router.post("/vendi-studio/projects", async (req, res) => {
  const tenantId = tenantOf(req), ownerUserId = userOf(req);
  if (!tenantId || !ownerUserId) return void res.status(403).json({ error: "Acesso não autorizado" });
  const payload = createSchema.safeParse(req.body);
  if (!payload.success) return void res.status(422).json({ error: payload.error.flatten() });
  try {
    const [project] = await db.insert(vendiStudioProjectsTable).values({
      tenantId, ownerUserId, title: payload.data.title, kind: payload.data.kind,
      brief: payload.data.brief ?? "",
    }).returning();
    res.status(201).json({ project });
  } catch { unavailable(res); }
});

router.get("/vendi-studio/projects/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return void res.status(403).json({ error: "Tenant inválido" });
  const id = req.params.id;
  if (typeof id !== "string" || id.length > 100) return void res.status(422).json({ error: "ID inválido" });
  try {
    const [project] = await db.select().from(vendiStudioProjectsTable).where(and(
      eq(vendiStudioProjectsTable.tenantId, tenantId), eq(vendiStudioProjectsTable.id, id),
    )).limit(1);
    if (!project) return void res.status(404).json({ error: "Projeto não encontrado" });
    res.json({ project });
  } catch { unavailable(res); }
});

export default router;
