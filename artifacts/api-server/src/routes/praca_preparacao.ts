import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, produtosCatalogoTable, servicosTiposTable, categoriasProdutoTable } from "@workspace/db";

const router: IRouter = Router();

/** Private readiness inventory, NOT a public listing or publication endpoint. */
router.get("/tenants/:tenantId/praca-ai/preparacao", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const [products, services, categories] = await Promise.all([
      db.select({
        id: produtosCatalogoTable.id, nome: produtosCatalogoTable.nome,
        ativo: produtosCatalogoTable.ativo, categoriaId: produtosCatalogoTable.categoriaId,
        vendeNoPracaAi: produtosCatalogoTable.vendeNoPracaAi,
      }).from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId)),
      db.select({
        id: servicosTiposTable.id, nome: servicosTiposTable.nome,
        ativo: servicosTiposTable.ativo, categoria: servicosTiposTable.categoria,
        vendeNoPracaAi: servicosTiposTable.vendeNoPracaAi,
      }).from(servicosTiposTable).where(eq(servicosTiposTable.tenantId, tenantId)),
      db.select({
        id: categoriasProdutoTable.id, ativo: categoriasProdutoTable.ativo,
        precisaAprovacao: categoriasProdutoTable.precisaAprovacao,
      }).from(categoriasProdutoTable).where(eq(categoriasProdutoTable.tenantId, tenantId)),
    ]);
    const validCategories = new Set(categories.filter(c => c.ativo && !c.precisaAprovacao).map(c => c.id));
    const items = [
      ...products.filter(p => p.vendeNoPracaAi === true).map(p => ({
        id: p.id, type: "product" as const, title: p.nome,
        readyForReview: p.ativo === true && !!p.categoriaId && validCategories.has(p.categoriaId),
        reason: p.ativo !== true ? "inactive" : !p.categoriaId || !validCategories.has(p.categoriaId) ? "category_invalid" : null,
      })),
      ...services.filter(s => s.vendeNoPracaAi === true).map(s => ({
        id: s.id, type: "service" as const, title: s.nome,
        readyForReview: s.ativo === true && !!s.categoria?.trim(),
        reason: s.ativo !== true ? "inactive" : !s.categoria?.trim() ? "category_missing" : null,
      })),
    ];
    return res.json({
      publicationActive: false, // no canonical moderation/publication integration yet
      totalSelected: items.length,
      readyForReview: items.filter(i => i.readyForReview).length,
      items,
    });
  } catch {
    return res.status(500).json({ error: "Não foi possível consultar a preparação dos anúncios." });
  }
});

export default router;
