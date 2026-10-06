import { Router, type IRouter } from "express";
import { and, eq, gt, desc } from "drizzle-orm";
import { db, variedadesDiaTable, insertVariedadeDiaSchema, VARIEDADE_CATEGORIAS_PADRAO } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed tenant route; every caller immediately enforces canAccess before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}
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
function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "23505";
}

// Dia de referência sempre em horário de Brasília — não é o fuso do
// servidor, senão a virada de vaga aconteceria na hora errada pro lojista.
function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Status das vagas de hoje (livre/ocupada) — usado pela tela do lojista
// pra mostrar antes de tentar publicar. Não expõe qual tenant ocupou, só
// se está livre ou não.
router.get("/variedades-dia/vagas-hoje", async (_req, res) => {
  const hoje = hojeBrasilia();
  const rows = await db.select({ categoria: variedadesDiaTable.categoria })
    .from(variedadesDiaTable)
    .where(and(eq(variedadesDiaTable.dataReferencia, hoje), eq(variedadesDiaTable.ativo, true)));

  const ocupadas = new Set(rows.map((r) => r.categoria));
  res.json({
    data: hoje,
    categoriasPadrao: VARIEDADE_CATEGORIAS_PADRAO,
    ocupadas: [...ocupadas],
  });
});

router.get("/tenants/:tenantId/variedades-dia", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(variedadesDiaTable)
    .where(and(
      eq(variedadesDiaTable.tenantId, tenantId),
      eq(variedadesDiaTable.ativo, true),
      gt(variedadesDiaTable.expiresAt, new Date()),
    ))
    .orderBy(desc(variedadesDiaTable.createdAt));

  res.json(rows);
});

router.post("/tenants/:tenantId/variedades-dia", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVariedadeDiaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
    return;
  }

  // A vitrine é diária; usa URL assinada com folga de 36h em vez de URL
  // pública permanente do bucket.
  let videoUrl = parsed.data.videoUrl ?? null;
  if (videoUrl) {
    try {
      const normalized = objectStorageService.normalizeObjectEntityPath(videoUrl);
      videoUrl = await objectStorageService.getObjectEntitySignedUrl(normalized, 36 * 60 * 60);
    } catch {
      // já veio como URL pública — usa como está
    }
  }

  try {
    const [row] = await db.insert(variedadesDiaTable)
      .values({ ...parsed.data, videoUrl, dataReferencia: hojeBrasilia() })
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `A vaga de "${parsed.data.categoria}" já foi ocupada hoje por outro parceiro. Tenta amanhã ou escolhe outra categoria.` });
      return;
    }
    throw err;
  }
});

router.delete("/tenants/:tenantId/variedades-dia/:id", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.update(variedadesDiaTable)
    .set({ ativo: false })
    .where(and(eq(variedadesDiaTable.id, req.params.id as string), eq(variedadesDiaTable.tenantId, tenantId)));

  res.status(204).end();
});

export default router;
