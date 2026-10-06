import { Router, type IRouter } from "express";
import { and, eq, gt, desc } from "drizzle-orm";
import { db, vendorStoriesTable, insertVendorStorySchema } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

// Stories do parceiro pra home do Praça.ai (tipo Instagram). Expira sozinho
// em 24h — a lista "minhas" aqui mostra só os ainda ativos e não expirados,
// os vencidos somem da tela sem precisar de job de limpeza (a linha continua
// no banco pro histórico, só não aparece mais em nenhuma consulta).
router.get("/tenants/:tenantId/stories", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(vendorStoriesTable)
    .where(and(
      eq(vendorStoriesTable.tenantId, tenantId),
      eq(vendorStoriesTable.ativo, true),
      gt(vendorStoriesTable.expiresAt, new Date()),
    ))
    .orderBy(desc(vendorStoriesTable.createdAt));

  return res.json(rows);
});

router.post("/tenants/:tenantId/stories", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVendorStorySchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  }

  // Stories expiram em 24h; usamos URL assinada pelo mesmo período em vez de
  // tornar o objeto privado permanentemente público no bucket.
  const normalized = objectStorageService.normalizeObjectEntityPath(parsed.data.mediaUrl);
  let mediaUrl = parsed.data.mediaUrl;
  try {
    mediaUrl = await objectStorageService.getObjectEntitySignedUrl(normalized, 24 * 60 * 60);
  } catch {
    // já veio como URL pública (ou formato inesperado) — usa como está
  }

  const [story] = await db.insert(vendorStoriesTable)
    .values({ ...parsed.data, mediaUrl })
    .returning();

  return res.status(201).json(story);
});

router.delete("/tenants/:tenantId/stories/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.update(vendorStoriesTable)
    .set({ ativo: false })
    .where(and(eq(vendorStoriesTable.id, req.params.id as string), eq(vendorStoriesTable.tenantId, tenantId)));

  return res.status(204).end();
});

export default router;
