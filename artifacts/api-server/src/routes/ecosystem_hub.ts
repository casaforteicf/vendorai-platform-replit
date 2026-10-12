/**
 * Vendor Ecosystem Platform (VEP) — Ecosystem Hub routes
 * FASE 21 — Platform-level. Connects all participants in the construction chain.
 *
 * GET    /ecosystem-hub/companies               — list companies
 * POST   /ecosystem-hub/companies               — create company
 * GET    /ecosystem-hub/companies/:id           — get company detail
 * PATCH  /ecosystem-hub/companies/:id           — update company
 * DELETE /ecosystem-hub/companies/:id           — delete company
 * GET    /ecosystem-hub/companies/:id/professionals — list professionals
 * POST   /ecosystem-hub/companies/:id/professionals — add professional
 * PATCH  /ecosystem-hub/professionals/:profId   — update professional
 * DELETE /ecosystem-hub/professionals/:profId   — delete professional
 * GET    /ecosystem-hub/companies/:id/portfolio — get portfolio items
 * POST   /ecosystem-hub/companies/:id/portfolio — add portfolio item
 * PATCH  /ecosystem-hub/portfolio/:itemId       — update portfolio item
 * DELETE /ecosystem-hub/portfolio/:itemId       — delete portfolio item
 * POST   /ecosystem-hub/companies/:id/follow    — follow a company
 * GET    /ecosystem-hub/directory               — full ecosystem directory
 * GET    /ecosystem-hub/smart-match            — recommendations
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { authorizeSharedDirectory } from "../middlewares/shared-directory-authorization.js";
import { eq, and, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  vepCompaniesTable,
  vepProfessionalsTable,
  vepPortfolioTable,
  vepConnectionsTable,
  insertVepCompanySchema,
  insertVepProfessionalSchema,
  insertVepPortfolioSchema,
  insertVepConnectionSchema,
} from "@workspace/db";

const router: IRouter = Router();
router.use("/ecosystem-hub", authorizeSharedDirectory);

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json(data);
}
function err(res: Response, message: string, status = 400) {
  return res.status(status).json({ error: message });
}

// ─── GET /ecosystem-hub/companies ─────────────────────────────────────────────

router.get("/ecosystem-hub/companies", async (req: Request, res: Response) => {
  try {
    const { type, tier, status, q, verified, featured } = req.query;
    let query = db.select().from(vepCompaniesTable).$dynamic();

    const conditions = [];
    if (status)   conditions.push(eq(vepCompaniesTable.status, String(status)));
    if (type)     conditions.push(eq(vepCompaniesTable.type, String(type)));
    if (tier)     conditions.push(eq(vepCompaniesTable.tier, String(tier)));
    if (verified === "true") conditions.push(eq(vepCompaniesTable.verified, true));
    if (featured === "true") conditions.push(eq(vepCompaniesTable.featured, true));
    if (q)        conditions.push(ilike(vepCompaniesTable.legalName, `%${q}%`));

    if (conditions.length > 0) query = query.where(and(...conditions));

    const companies = await query.orderBy(
      sql`CASE ${vepCompaniesTable.tier}
        WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 WHEN 'certified' THEN 3
        WHEN 'verified' THEN 4 ELSE 5 END`,
    );
    return ok(res, companies);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub companies list error");
    return err(res, "Erro ao listar empresas", 500);
  }
});

// ─── POST /ecosystem-hub/companies ────────────────────────────────────────────

router.post("/ecosystem-hub/companies", async (req: Request, res: Response) => {
  try {
    const parsed = insertVepCompanySchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [company] = await db.insert(vepCompaniesTable).values(parsed.data).returning();
    return ok(res, company, 201);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub company create error");
    return err(res, "Erro ao criar empresa", 500);
  }
});

// ─── GET /ecosystem-hub/companies/:id ─────────────────────────────────────────

router.get("/ecosystem-hub/companies/:id", async (req: Request, res: Response) => {
  try {
    const [company] = await db
      .select().from(vepCompaniesTable).where(eq(vepCompaniesTable.id, (req.params.id as string)));
    if (!company) return err(res, "Empresa não encontrada", 404);
    return ok(res, company);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub company get error");
    return err(res, "Erro ao buscar empresa", 500);
  }
});

// ─── PATCH /ecosystem-hub/companies/:id ───────────────────────────────────────

router.patch("/ecosystem-hub/companies/:id", async (req: Request, res: Response) => {
  try {
    const parsed = insertVepCompanySchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vepCompaniesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vepCompaniesTable.id, (req.params.id as string)))
      .returning();
    if (!updated) return err(res, "Empresa não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub company update error");
    return err(res, "Erro ao atualizar empresa", 500);
  }
});

// ─── DELETE /ecosystem-hub/companies/:id ──────────────────────────────────────

router.delete("/ecosystem-hub/companies/:id", async (req: Request, res: Response) => {
  try {
    const [deleted] = await db
      .delete(vepCompaniesTable).where(eq(vepCompaniesTable.id, (req.params.id as string))).returning({ id: vepCompaniesTable.id });
    if (!deleted) return err(res, "Empresa não encontrada", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "ecosystem-hub company delete error");
    return err(res, "Erro ao deletar empresa", 500);
  }
});

// ─── GET /ecosystem-hub/companies/:id/professionals ───────────────────────────

router.get("/ecosystem-hub/companies/:id/professionals", async (req: Request, res: Response) => {
  try {
    const professionals = await db
      .select().from(vepProfessionalsTable)
      .where(and(
        eq(vepProfessionalsTable.companyId, (req.params.id as string)),
        eq(vepProfessionalsTable.active, true),
      ))
      .orderBy(vepProfessionalsTable.name);
    return ok(res, professionals);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub professionals list error");
    return err(res, "Erro ao listar profissionais", 500);
  }
});

// ─── POST /ecosystem-hub/companies/:id/professionals ──────────────────────────

router.post("/ecosystem-hub/companies/:id/professionals", async (req: Request, res: Response) => {
  try {
    const parsed = insertVepProfessionalSchema.safeParse({ ...req.body, companyId: (req.params.id as string) });
    if (!parsed.success) return err(res, parsed.error.message);
    const [prof] = await db.insert(vepProfessionalsTable).values(parsed.data).returning();
    return ok(res, prof, 201);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub professional create error");
    return err(res, "Erro ao criar profissional", 500);
  }
});

// ─── PATCH /ecosystem-hub/professionals/:profId ───────────────────────────────

router.patch("/ecosystem-hub/professionals/:profId", async (req: Request, res: Response) => {
  try {
    const parsed = insertVepProfessionalSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vepProfessionalsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vepProfessionalsTable.id, (req.params.profId as string)))
      .returning();
    if (!updated) return err(res, "Profissional não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub professional update error");
    return err(res, "Erro ao atualizar profissional", 500);
  }
});

// ─── DELETE /ecosystem-hub/professionals/:profId ──────────────────────────────

router.delete("/ecosystem-hub/professionals/:profId", async (req: Request, res: Response) => {
  try {
    const [del] = await db
      .delete(vepProfessionalsTable).where(eq(vepProfessionalsTable.id, (req.params.profId as string)))
      .returning({ id: vepProfessionalsTable.id });
    if (!del) return err(res, "Profissional não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "ecosystem-hub professional delete error");
    return err(res, "Erro ao deletar profissional", 500);
  }
});

// ─── GET /ecosystem-hub/companies/:id/portfolio ───────────────────────────────

router.get("/ecosystem-hub/portfolio", async (req: Request, res: Response) => {
  try {
    const items = await db.select().from(vepPortfolioTable)
      .where(eq(vepPortfolioTable.published, true))
      .orderBy(vepPortfolioTable.featured, vepPortfolioTable.createdAt)
      .limit(100);
    return ok(res, items);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub portfolio directory error");
    return err(res, "Erro ao carregar portfólios", 500);
  }
});

router.get("/ecosystem-hub/companies/:id/portfolio", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const conditions = [
      eq(vepPortfolioTable.companyId, (req.params.id as string)),
      eq(vepPortfolioTable.published, true),
    ];
    if (type) conditions.push(eq(vepPortfolioTable.type, String(type)));

    const items = await db
      .select().from(vepPortfolioTable).where(and(...conditions))
      .orderBy(vepPortfolioTable.featured, vepPortfolioTable.createdAt);
    return ok(res, items);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub portfolio list error");
    return err(res, "Erro ao listar portfólio", 500);
  }
});

// ─── POST /ecosystem-hub/companies/:id/portfolio ──────────────────────────────

router.post("/ecosystem-hub/companies/:id/portfolio", async (req: Request, res: Response) => {
  try {
    const parsed = insertVepPortfolioSchema.safeParse({ ...req.body, companyId: (req.params.id as string) });
    if (!parsed.success) return err(res, parsed.error.message);
    const [item] = await db.insert(vepPortfolioTable).values(parsed.data).returning();
    return ok(res, item, 201);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub portfolio create error");
    return err(res, "Erro ao criar item de portfólio", 500);
  }
});

// ─── PATCH /ecosystem-hub/portfolio/:itemId ───────────────────────────────────

router.patch("/ecosystem-hub/portfolio/:itemId", async (req: Request, res: Response) => {
  try {
    const parsed = insertVepPortfolioSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db
      .update(vepPortfolioTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vepPortfolioTable.id, (req.params.itemId as string)))
      .returning();
    if (!updated) return err(res, "Item não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub portfolio update error");
    return err(res, "Erro ao atualizar portfólio", 500);
  }
});

// ─── DELETE /ecosystem-hub/portfolio/:itemId ──────────────────────────────────

router.delete("/ecosystem-hub/portfolio/:itemId", async (req: Request, res: Response) => {
  try {
    const [del] = await db
      .delete(vepPortfolioTable).where(eq(vepPortfolioTable.id, (req.params.itemId as string)))
      .returning({ id: vepPortfolioTable.id });
    if (!del) return err(res, "Item não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "ecosystem-hub portfolio delete error");
    return err(res, "Erro ao deletar portfólio", 500);
  }
});

// ─── POST /ecosystem-hub/companies/:id/follow ─────────────────────────────────

router.post("/ecosystem-hub/companies/:id/follow", async (req: Request, res: Response) => {
  try {
    const bodySchema = z.object({
      fromCompanyId: z.string().min(1),
      type: z.enum(["follow", "partner", "favorite"]).optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);

    const [conn] = await db
      .insert(vepConnectionsTable)
      .values({
        fromCompanyId: parsed.data.fromCompanyId,
        toCompanyId:   (req.params.id as string),
        type:          parsed.data.type ?? "follow",
      })
      .onConflictDoNothing()
      .returning();
    return ok(res, conn ?? { message: "Already connected" }, 201);
  } catch (e) {
    req.log?.error(e, "ecosystem-hub follow error");
    return err(res, "Erro ao seguir empresa", 500);
  }
});

// ─── GET /ecosystem-hub/directory ─────────────────────────────────────────────

router.get("/ecosystem-hub/directory", async (req: Request, res: Response) => {
  try {
    const companies = await db
      .select().from(vepCompaniesTable)
      .where(eq(vepCompaniesTable.status, "active"))
      .orderBy(vepCompaniesTable.featured, vepCompaniesTable.legalName)
      .limit(200);
    return ok(res, { companies, total: companies.length });
  } catch (e) {
    req.log?.error(e, "ecosystem-hub directory error");
    return err(res, "Erro ao carregar diretório", 500);
  }
});

// ─── GET /ecosystem-hub/smart-match ───────────────────────────────────────────
// Stub — FASE 22 will connect this to the Vendor Brain engine.

router.get("/ecosystem-hub/smart-match", async (req: Request, res: Response) => {
  try {
    const { style, segments, region, type } = req.query;
    const terms = [style, segments, region, type]
      .flatMap(value => String(value ?? "").split(","))
      .map(value => value.trim().toLocaleLowerCase("pt-BR"))
      .filter(Boolean);
    if (terms.length === 0) return err(res, "Informe ao menos um segmento, especialidade, região ou tipo", 422);

    const companies = await db.select().from(vepCompaniesTable)
      .where(eq(vepCompaniesTable.status, "active"));
    const matches = companies.map(company => {
      const fields = {
        type: company.type.toLocaleLowerCase("pt-BR"),
        location: [company.city, company.state, ...(company.regions ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR"),
        expertise: [...(company.segments ?? []), ...(company.specialties ?? []), ...(company.tags ?? [])].join(" ").toLocaleLowerCase("pt-BR"),
        profile: [company.tradeName, company.legalName, company.description].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR"),
      };
      const reasons: string[] = [];
      let score = company.verified ? 8 : 0;
      if (["premium", "enterprise"].includes(company.tier)) score += 5;
      for (const term of terms) {
        if (fields.type.includes(term)) { score += 30; reasons.push(`tipo compatível: ${term}`); }
        if (fields.expertise.includes(term)) { score += 24; reasons.push(`especialidade: ${term}`); }
        if (fields.location.includes(term)) { score += 18; reasons.push(`atende a região: ${term}`); }
        if (fields.profile.includes(term)) { score += 12; reasons.push(`perfil relacionado: ${term}`); }
      }
      return { company, score: Math.min(99, score), reasons: [...new Set(reasons)].slice(0, 3) };
    }).filter(match => match.score > 8)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    return ok(res, {
      matches,
      totalEvaluated: companies.length,
      context: { terms },
      humanApprovalRequired: true,
    });
  } catch (e) {
    req.log?.error(e, "ecosystem-hub smart-match error");
    return err(res, "Erro no smart match", 500);
  }
});

export default router;
