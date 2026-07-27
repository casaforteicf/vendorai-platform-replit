/**
 * Vendor Certified Network (VCN) routes — FASE 22
 * Official certified manufacturers, digital specialists, product catalog, knowledge base.
 *
 * GET    /vcn/companies               — list certified companies
 * POST   /vcn/companies               — create company
 * GET    /vcn/companies/:id           — company detail
 * PATCH  /vcn/companies/:id           — update company
 * DELETE /vcn/companies/:id           — delete company
 * GET    /vcn/companies/:id/specialists — list specialists
 * POST   /vcn/companies/:id/specialists — add specialist
 * PATCH  /vcn/specialists/:specId     — update specialist
 * DELETE /vcn/specialists/:specId     — delete specialist
 * GET    /vcn/companies/:id/products  — list products
 * POST   /vcn/companies/:id/products  — add product
 * PATCH  /vcn/products/:productId     — update product
 * DELETE /vcn/products/:productId     — delete product
 * GET    /vcn/companies/:id/knowledge — list knowledge docs
 * POST   /vcn/companies/:id/knowledge — add knowledge doc
 * PATCH  /vcn/knowledge/:docId        — update doc
 * DELETE /vcn/knowledge/:docId        — delete doc
 * GET    /vcn/directory               — full directory
 * GET    /vcn/search                  — search across companies + products
 * GET    /vcn/companies/:id/analytics — company analytics stub
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, ilike, sql } from "drizzle-orm";
import {
  db,
  vcnCompaniesTable,
  vcnSpecialistsTable,
  vcnProductsTable,
  vcnKnowledgeTable,
  insertVcnCompanySchema,
  insertVcnSpecialistSchema,
  insertVcnProductSchema,
  insertVcnKnowledgeSchema,
} from "@workspace/db";

const router: IRouter = Router();

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json(data);
}
function err(res: Response, message: string, status = 400) {
  return res.status(status).json({ error: message });
}

// ─── Companies ────────────────────────────────────────────────────────────────

router.get("/vcn/companies", async (req: Request, res: Response) => {
  try {
    const { type, certificationLevel, q, verified, featured } = req.query;
    let query = db.select().from(vcnCompaniesTable).$dynamic();

    const conditions = [eq(vcnCompaniesTable.status, "active")];
    if (type)               conditions.push(eq(vcnCompaniesTable.type, String(type)));
    if (certificationLevel) conditions.push(eq(vcnCompaniesTable.certificationLevel, String(certificationLevel)));
    if (verified === "true") conditions.push(eq(vcnCompaniesTable.verified, true));
    if (featured === "true") conditions.push(eq(vcnCompaniesTable.featured, true));
    if (q) {
      conditions.push(ilike(vcnCompaniesTable.legalName, `%${q}%`));
    }

    query = query.where(and(...conditions));
    const companies = await query.orderBy(
      sql`CASE ${vcnCompaniesTable.certificationLevel}
        WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 WHEN 'certified' THEN 3
        ELSE 4 END`,
    );
    return ok(res, companies);
  } catch (e) {
    req.log?.error(e, "vcn companies list error");
    return err(res, "Erro ao listar empresas", 500);
  }
});

router.post("/vcn/companies", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnCompanySchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [company] = await db.insert(vcnCompaniesTable).values(parsed.data).returning();
    return ok(res, company, 201);
  } catch (e) {
    req.log?.error(e, "vcn company create error");
    return err(res, "Erro ao criar empresa", 500);
  }
});

router.get("/vcn/companies/:id", async (req: Request, res: Response) => {
  try {
    const [company] = await db.select().from(vcnCompaniesTable).where(eq(vcnCompaniesTable.id, (req.params.id as string)));
    if (!company) return err(res, "Empresa não encontrada", 404);
    return ok(res, company);
  } catch (e) {
    req.log?.error(e, "vcn company get error");
    return err(res, "Erro ao buscar empresa", 500);
  }
});

router.patch("/vcn/companies/:id", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnCompanySchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vcnCompaniesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vcnCompaniesTable.id, (req.params.id as string)))
      .returning();
    if (!updated) return err(res, "Empresa não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "vcn company update error");
    return err(res, "Erro ao atualizar empresa", 500);
  }
});

router.delete("/vcn/companies/:id", async (req: Request, res: Response) => {
  try {
    const [del] = await db.delete(vcnCompaniesTable).where(eq(vcnCompaniesTable.id, (req.params.id as string))).returning({ id: vcnCompaniesTable.id });
    if (!del) return err(res, "Empresa não encontrada", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "vcn company delete error");
    return err(res, "Erro ao deletar empresa", 500);
  }
});

// ─── Specialists ──────────────────────────────────────────────────────────────

router.get("/vcn/companies/:id/specialists", async (req: Request, res: Response) => {
  try {
    const specialists = await db.select().from(vcnSpecialistsTable)
      .where(and(eq(vcnSpecialistsTable.companyId, (req.params.id as string)), eq(vcnSpecialistsTable.active, true)))
      .orderBy(vcnSpecialistsTable.featured, vcnSpecialistsTable.name);
    return ok(res, specialists);
  } catch (e) {
    req.log?.error(e, "vcn specialists list error");
    return err(res, "Erro ao listar especialistas", 500);
  }
});

router.post("/vcn/companies/:id/specialists", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnSpecialistSchema.safeParse({ ...req.body, companyId: (req.params.id as string) });
    if (!parsed.success) return err(res, parsed.error.message);
    const [spec] = await db.insert(vcnSpecialistsTable).values(parsed.data).returning();
    return ok(res, spec, 201);
  } catch (e) {
    req.log?.error(e, "vcn specialist create error");
    return err(res, "Erro ao criar especialista", 500);
  }
});

router.patch("/vcn/specialists/:specId", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnSpecialistSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vcnSpecialistsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vcnSpecialistsTable.id, (req.params.specId as string)))
      .returning();
    if (!updated) return err(res, "Especialista não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "vcn specialist update error");
    return err(res, "Erro ao atualizar especialista", 500);
  }
});

router.delete("/vcn/specialists/:specId", async (req: Request, res: Response) => {
  try {
    const [del] = await db.delete(vcnSpecialistsTable).where(eq(vcnSpecialistsTable.id, (req.params.specId as string))).returning({ id: vcnSpecialistsTable.id });
    if (!del) return err(res, "Especialista não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "vcn specialist delete error");
    return err(res, "Erro ao deletar especialista", 500);
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────

router.get("/vcn/companies/:id/products", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const conditions = [eq(vcnProductsTable.companyId, (req.params.id as string)), eq(vcnProductsTable.published, true)];
    if (category) conditions.push(eq(vcnProductsTable.category, String(category)));
    const products = await db.select().from(vcnProductsTable).where(and(...conditions))
      .orderBy(vcnProductsTable.featured, vcnProductsTable.name);
    return ok(res, products);
  } catch (e) {
    req.log?.error(e, "vcn products list error");
    return err(res, "Erro ao listar produtos", 500);
  }
});

router.post("/vcn/companies/:id/products", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnProductSchema.safeParse({ ...req.body, companyId: (req.params.id as string) });
    if (!parsed.success) return err(res, parsed.error.message);
    const [product] = await db.insert(vcnProductsTable).values(parsed.data).returning();
    return ok(res, product, 201);
  } catch (e) {
    req.log?.error(e, "vcn product create error");
    return err(res, "Erro ao criar produto", 500);
  }
});

router.patch("/vcn/products/:productId", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnProductSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vcnProductsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vcnProductsTable.id, (req.params.productId as string)))
      .returning();
    if (!updated) return err(res, "Produto não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "vcn product update error");
    return err(res, "Erro ao atualizar produto", 500);
  }
});

router.delete("/vcn/products/:productId", async (req: Request, res: Response) => {
  try {
    const [del] = await db.delete(vcnProductsTable).where(eq(vcnProductsTable.id, (req.params.productId as string))).returning({ id: vcnProductsTable.id });
    if (!del) return err(res, "Produto não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "vcn product delete error");
    return err(res, "Erro ao deletar produto", 500);
  }
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────

router.get("/vcn/companies/:id/knowledge", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const conditions = [eq(vcnKnowledgeTable.companyId, (req.params.id as string)), eq(vcnKnowledgeTable.published, true)];
    if (type) conditions.push(eq(vcnKnowledgeTable.type, String(type)));
    const docs = await db.select().from(vcnKnowledgeTable).where(and(...conditions))
      .orderBy(vcnKnowledgeTable.type, vcnKnowledgeTable.title);
    return ok(res, docs);
  } catch (e) {
    req.log?.error(e, "vcn knowledge list error");
    return err(res, "Erro ao listar documentos", 500);
  }
});

router.post("/vcn/companies/:id/knowledge", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnKnowledgeSchema.safeParse({ ...req.body, companyId: (req.params.id as string) });
    if (!parsed.success) return err(res, parsed.error.message);
    const [doc] = await db.insert(vcnKnowledgeTable).values(parsed.data).returning();
    return ok(res, doc, 201);
  } catch (e) {
    req.log?.error(e, "vcn knowledge create error");
    return err(res, "Erro ao criar documento", 500);
  }
});

router.patch("/vcn/knowledge/:docId", async (req: Request, res: Response) => {
  try {
    const parsed = insertVcnKnowledgeSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vcnKnowledgeTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vcnKnowledgeTable.id, (req.params.docId as string)))
      .returning();
    if (!updated) return err(res, "Documento não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "vcn knowledge update error");
    return err(res, "Erro ao atualizar documento", 500);
  }
});

router.delete("/vcn/knowledge/:docId", async (req: Request, res: Response) => {
  try {
    const [del] = await db.delete(vcnKnowledgeTable).where(eq(vcnKnowledgeTable.id, (req.params.docId as string))).returning({ id: vcnKnowledgeTable.id });
    if (!del) return err(res, "Documento não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "vcn knowledge delete error");
    return err(res, "Erro ao deletar documento", 500);
  }
});

// ─── Directory & Search ───────────────────────────────────────────────────────

router.get("/vcn/directory", async (req: Request, res: Response) => {
  try {
    const companies = await db.select().from(vcnCompaniesTable)
      .where(eq(vcnCompaniesTable.status, "active"))
      .orderBy(vcnCompaniesTable.featured, vcnCompaniesTable.legalName)
      .limit(200);
    return ok(res, { companies, total: companies.length });
  } catch (e) {
    req.log?.error(e, "vcn directory error");
    return err(res, "Erro ao carregar diretório", 500);
  }
});

router.get("/vcn/search", async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return ok(res, { companies: [], products: [] });
    const companies = await db.select().from(vcnCompaniesTable)
      .where(and(eq(vcnCompaniesTable.status, "active"), ilike(vcnCompaniesTable.legalName, `%${q}%`)))
      .limit(20);
    const products = await db.select().from(vcnProductsTable)
      .where(and(eq(vcnProductsTable.published, true), ilike(vcnProductsTable.name, `%${q}%`)))
      .limit(20);
    return ok(res, { companies, products });
  } catch (e) {
    req.log?.error(e, "vcn search error");
    return err(res, "Erro na busca", 500);
  }
});

// ─── Analytics (stub) ─────────────────────────────────────────────────────────

router.get("/vcn/companies/:id/analytics", async (req: Request, res: Response) => {
  try {
    const [company] = await db.select({
      productsCount:       vcnCompaniesTable.productsCount,
      specificationsCount: vcnCompaniesTable.specificationsCount,
      quotationsCount:     vcnCompaniesTable.quotationsCount,
      specialistsCount:    vcnCompaniesTable.specialistsCount,
    }).from(vcnCompaniesTable).where(eq(vcnCompaniesTable.id, (req.params.id as string)));
    if (!company) return err(res, "Empresa não encontrada", 404);
    return ok(res, {
      ...company,
      conversionRate: company.quotationsCount > 0
        ? Math.round((company.specificationsCount / company.quotationsCount) * 100)
        : 0,
    });
  } catch (e) {
    req.log?.error(e, "vcn analytics error");
    return err(res, "Erro ao buscar analytics", 500);
  }
});

export default router;
