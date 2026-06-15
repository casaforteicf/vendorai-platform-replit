import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, partnersTable, usersTable, tenantsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

router.use(requireRole("super_admin"));

const createPartnerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
});

const linkTenantSchema = z.object({
  partnerId: z.string().nullable(),
});

router.get("/admin/partners", async (req, res) => {
  const partners = await db
    .select({
      id: partnersTable.id,
      name: partnersTable.name,
      email: partnersTable.email,
      userId: partnersTable.userId,
      createdAt: partnersTable.createdAt,
    })
    .from(partnersTable)
    .orderBy(partnersTable.createdAt);

  res.json(partners);
});

router.post("/admin/partners", async (req, res) => {
  const parsed = createPartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password } = parsed.data;

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
      .values({ name, email, userId: user.id })
      .returning();

    res.status(201).json({ partner, user });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/admin/partners/:id", async (req, res) => {
  const partnerId = String(req.params["id"]);
  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.email().optional(),
  });

  const parsed = updateSchema.safeParse(req.body);
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
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/admin/tenants/:id/partner", async (req, res) => {
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
