/**
 * Vendor Partner Network (VPN) — Partner Hub routes
 * FASE 20 — Platform-level, shared by ALL verticals.
 *
 * GET    /partner-hub/partners               — list partners (filterable)
 * POST   /partner-hub/partners               — create partner
 * GET    /partner-hub/partners/:id           — get partner detail
 * PATCH  /partner-hub/partners/:id           — update partner
 * DELETE /partner-hub/partners/:id           — delete partner
 * GET    /partner-hub/partners/:id/products  — list products for a partner
 * POST   /partner-hub/partners/:id/products  — add product to partner
 * PATCH  /partner-hub/products/:productId    — update product
 * DELETE /partner-hub/products/:productId    — delete product
 * GET    /partner-hub/partners/:id/contacts  — list contacts for a partner
 * POST   /partner-hub/partners/:id/contacts  — add contact
 * DELETE /partner-hub/contacts/:contactId    — delete contact
 * GET    /partner-hub/marketplace            — public listing (all active partners + products)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { authorizeSharedDirectory } from "../middlewares/shared-directory-authorization.js";
import { eq, and, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  vpnPartnersTable,
  vpnPartnerProductsTable,
  vpnPartnerContactsTable,
  insertVpnPartnerSchema,
  insertVpnPartnerProductSchema,
  insertVpnPartnerContactSchema,
} from "@workspace/db";

const router: IRouter = Router();
router.use("/partner-hub", authorizeSharedDirectory);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json(data);
}

function err(res: Response, message: string, status = 400) {
  return res.status(status).json({ error: message });
}

// ─── GET /partner-hub/partners ────────────────────────────────────────────────

router.get("/partner-hub/partners", async (req: Request, res: Response) => {
  try {
    const { type, tier, status, q, featured } = req.query;

    let query = db.select().from(vpnPartnersTable).$dynamic();

    const conditions = [];
    if (status)   conditions.push(eq(vpnPartnersTable.status, String(status)));
    if (type)     conditions.push(eq(vpnPartnersTable.type, String(type)));
    if (tier)     conditions.push(eq(vpnPartnersTable.tier, String(tier)));
    if (featured === "true") conditions.push(eq(vpnPartnersTable.featured, true));
    if (q)        conditions.push(ilike(vpnPartnersTable.name, `%${q}%`));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const partners = await query.orderBy(
      sql`CASE ${vpnPartnersTable.tier}
        WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 WHEN 'official' THEN 3
        WHEN 'verified'   THEN 4 ELSE 5
      END`,
    );
    return ok(res, partners);
  } catch (e) {
    req.log?.error(e, "partner-hub list error");
    return err(res, "Erro ao listar parceiros", 500);
  }
});

// ─── POST /partner-hub/partners ───────────────────────────────────────────────

router.post("/partner-hub/partners", async (req: Request, res: Response) => {
  try {
    const parsed = insertVpnPartnerSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);

    const [partner] = await db
      .insert(vpnPartnersTable)
      .values(parsed.data)
      .returning();
    return ok(res, partner, 201);
  } catch (e) {
    req.log?.error(e, "partner-hub create error");
    return err(res, "Erro ao criar parceiro", 500);
  }
});

// ─── GET /partner-hub/partners/:id ───────────────────────────────────────────

router.get("/partner-hub/partners/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [partner] = await db
      .select()
      .from(vpnPartnersTable)
      .where(eq(vpnPartnersTable.id, id));
    if (!partner) return err(res, "Parceiro não encontrado", 404);
    return ok(res, partner);
  } catch (e) {
    req.log?.error(e, "partner-hub get error");
    return err(res, "Erro ao buscar parceiro", 500);
  }
});

// ─── PATCH /partner-hub/partners/:id ─────────────────────────────────────────

router.patch("/partner-hub/partners/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsed = insertVpnPartnerSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);

    const [updated] = await db
      .update(vpnPartnersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vpnPartnersTable.id, id))
      .returning();
    if (!updated) return err(res, "Parceiro não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "partner-hub update error");
    return err(res, "Erro ao atualizar parceiro", 500);
  }
});

// ─── DELETE /partner-hub/partners/:id ────────────────────────────────────────

router.delete("/partner-hub/partners/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [deleted] = await db
      .delete(vpnPartnersTable)
      .where(eq(vpnPartnersTable.id, id))
      .returning({ id: vpnPartnersTable.id });
    if (!deleted) return err(res, "Parceiro não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "partner-hub delete error");
    return err(res, "Erro ao deletar parceiro", 500);
  }
});

// ─── GET /partner-hub/partners/:id/products ──────────────────────────────────

router.get("/partner-hub/partners/:id/products", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { category, active } = req.query;

    const conditions = [eq(vpnPartnerProductsTable.partnerId, id)];
    if (category) conditions.push(eq(vpnPartnerProductsTable.category, String(category)));
    if (active !== undefined)
      conditions.push(eq(vpnPartnerProductsTable.active, active === "true"));

    const products = await db
      .select()
      .from(vpnPartnerProductsTable)
      .where(and(...conditions))
      .orderBy(vpnPartnerProductsTable.name);
    return ok(res, products);
  } catch (e) {
    req.log?.error(e, "partner-hub products list error");
    return err(res, "Erro ao listar produtos", 500);
  }
});

// ─── POST /partner-hub/partners/:id/products ─────────────────────────────────

router.post("/partner-hub/partners/:id/products", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsed = insertVpnPartnerProductSchema.safeParse({ ...req.body, partnerId: id });
    if (!parsed.success) return err(res, parsed.error.message);

    const [product] = await db
      .insert(vpnPartnerProductsTable)
      .values(parsed.data)
      .returning();
    return ok(res, product, 201);
  } catch (e) {
    req.log?.error(e, "partner-hub product create error");
    return err(res, "Erro ao criar produto", 500);
  }
});

// ─── PATCH /partner-hub/products/:productId ──────────────────────────────────

router.patch("/partner-hub/products/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId as string;
    const parsed = insertVpnPartnerProductSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);

    const [updated] = await db
      .update(vpnPartnerProductsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(vpnPartnerProductsTable.id, productId))
      .returning();
    if (!updated) return err(res, "Produto não encontrado", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "partner-hub product update error");
    return err(res, "Erro ao atualizar produto", 500);
  }
});

// ─── DELETE /partner-hub/products/:productId ─────────────────────────────────

router.delete("/partner-hub/products/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId as string;
    const [deleted] = await db
      .delete(vpnPartnerProductsTable)
      .where(eq(vpnPartnerProductsTable.id, productId))
      .returning({ id: vpnPartnerProductsTable.id });
    if (!deleted) return err(res, "Produto não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "partner-hub product delete error");
    return err(res, "Erro ao deletar produto", 500);
  }
});

// ─── GET /partner-hub/partners/:id/contacts ──────────────────────────────────

router.get("/partner-hub/partners/:id/contacts", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const contacts = await db
      .select()
      .from(vpnPartnerContactsTable)
      .where(eq(vpnPartnerContactsTable.partnerId, id))
      .orderBy(vpnPartnerContactsTable.name);
    return ok(res, contacts);
  } catch (e) {
    req.log?.error(e, "partner-hub contacts list error");
    return err(res, "Erro ao listar contatos", 500);
  }
});

// ─── POST /partner-hub/partners/:id/contacts ─────────────────────────────────

router.post("/partner-hub/partners/:id/contacts", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsed = insertVpnPartnerContactSchema.safeParse({ ...req.body, partnerId: id });
    if (!parsed.success) return err(res, parsed.error.message);

    const [contact] = await db
      .insert(vpnPartnerContactsTable)
      .values(parsed.data)
      .returning();
    return ok(res, contact, 201);
  } catch (e) {
    req.log?.error(e, "partner-hub contact create error");
    return err(res, "Erro ao criar contato", 500);
  }
});

// ─── DELETE /partner-hub/contacts/:contactId ─────────────────────────────────

router.delete("/partner-hub/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    const contactId = req.params.contactId as string;
    const [deleted] = await db
      .delete(vpnPartnerContactsTable)
      .where(eq(vpnPartnerContactsTable.id, contactId))
      .returning({ id: vpnPartnerContactsTable.id });
    if (!deleted) return err(res, "Contato não encontrado", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "partner-hub contact delete error");
    return err(res, "Erro ao deletar contato", 500);
  }
});

// ─── GET /partner-hub/marketplace ────────────────────────────────────────────

router.get("/partner-hub/marketplace", async (req: Request, res: Response) => {
  try {
    const { category, q } = req.query;

    const activePartners = await db
      .select({
        partner: vpnPartnersTable,
      })
      .from(vpnPartnersTable)
      .where(eq(vpnPartnersTable.status, "active"))
      .orderBy(vpnPartnersTable.featured, vpnPartnersTable.name)
      .limit(100);

    let productsQuery = db
      .select()
      .from(vpnPartnerProductsTable)
      .where(eq(vpnPartnerProductsTable.active, true))
      .$dynamic();

    const productConditions = [eq(vpnPartnerProductsTable.active, true)];
    if (category) productConditions.push(eq(vpnPartnerProductsTable.category, String(category)));
    if (q)        productConditions.push(ilike(vpnPartnerProductsTable.name, `%${q}%`));
    if (productConditions.length > 1) {
      productsQuery = productsQuery.where(and(...productConditions));
    }

    const featuredProducts = await productsQuery
      .where(and(...productConditions))
      .orderBy(vpnPartnerProductsTable.featured, vpnPartnerProductsTable.name)
      .limit(50);

    return ok(res, {
      partners: activePartners.map(r => r.partner),
      featuredProducts,
    });
  } catch (e) {
    req.log?.error(e, "partner-hub marketplace error");
    return err(res, "Erro ao carregar marketplace", 500);
  }
});

export default router;
