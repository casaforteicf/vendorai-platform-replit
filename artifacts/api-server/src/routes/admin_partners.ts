import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, partnersTable, usersTable, tenantsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { createSubaccount, isAsaasConfigured } from "../lib/asaas.js";

const router: IRouter = Router();

const createPartnerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  cnpj: z.string().min(14, "CNPJ must have at least 14 characters"),
  phone: z.string().min(10, "Phone must have at least 10 characters"),
});

const updatePartnerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  cnpj: z.string().min(14).optional(),
  phone: z.string().min(10).optional(),
});

const linkTenantSchema = z.object({
  partnerId: z.string().nullable(),
});

// GET /admin/partners moved to routes/partners.ts (uses new schema fields)

router.post("/admin/partners", requireRole("super_admin"), async (req, res) => {
  const parsed = createPartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, cnpj, phone } = parsed.data;

  const superAdminUser = await db
    .select({ tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub));

  if (!superAdminUser[0]) {
    res.status(500).json({ error: "Could not resolve super_admin tenant" });
    return;
  }

  const tenantId = superAdminUser[0].tenantId;
  const hashed = await bcrypt.hash(password, 12);

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId,
        name,
        email,
        password: hashed,
        role: "member",
        platformRole: "partner",
      })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        platformRole: usersTable.platformRole,
      });

    const [partner] = await db
      .insert(partnersTable)
      .values({ name, email, cnpj, phone, userId: user.id })
      .returning();

    // ── Criar subconta Asaas para o parceiro ────────────────────────────────
    if (await isAsaasConfigured()) {
      try {
        const subaccount = await createSubaccount({
          name,
          email,
          cpfCnpj: cnpj.replace(/\D/g, ""),
          mobilePhone: phone.replace(/\D/g, ""),
          companyType: "LIMITED",
        });

        const [updated] = await db
          .update(partnersTable)
          .set({
            asaasAccountId: subaccount.id,
            asaasWalletId: subaccount.walletId,
          })
          .where(eq(partnersTable.id, partner.id))
          .returning();

        res.status(201).json({ partner: updated, user, asaasSubconta: true });
        return;
      } catch (err) {
        req.log.warn({ err, partnerId: partner.id }, "Asaas subaccount creation failed — partner created without walletId");
      }
    } else {
      req.log.warn({ partnerId: partner.id }, "ASAAS_API_KEY not configured — skipping subaccount creation");
    }

    res.status(201).json({ partner, user, asaasSubconta: false });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email or CNPJ already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/admin/partners/:id", requireRole("super_admin"), async (req, res) => {
  const partnerId = String(req.params["id"]);

  const parsed = updatePartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const [partner] = await db
      .update(partnersTable)
      .set(parsed.data)
      .where(eq(partnersTable.id, partnerId))
      .returning();

    if (!partner) {
      res.status(404).json({ error: "Partner not found" });
      return;
    }

    res.json(partner);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email or CNPJ already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/admin/tenants/:id/partner", requireRole("super_admin"), async (req, res) => {
  const parsed = linkTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const tenantId = String(req.params["id"]);
  const { partnerId } = parsed.data;

  if (partnerId) {
    const [exists] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.id, partnerId));

    if (!exists) {
      res.status(404).json({ error: "Partner not found" });
      return;
    }
  }

  const [tenant] = await db
    .update(tenantsTable)
    .set({ partnerId: partnerId ?? null, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export default router;
