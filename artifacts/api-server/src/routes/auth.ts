import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { db, usersTable, tenantsTable, partnersTable } from "@workspace/db";
import { signToken } from "../lib/jwt.js";
import { authenticate, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
const protectedRouter: IRouter = Router();

const PUBLIC_FIELDS = {
  id: usersTable.id,
  tenantId: usersTable.tenantId,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  platformRole: usersTable.platformRole,
  active: usersTable.active,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  tenantName: z.string().min(1),
  tenantSlug: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    )
    .refine((s) => s.length > 0, "Slug must contain valid characters"),
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  let partnerId: string | undefined;
  if (user.platformRole === "partner") {
    const [partnerRow] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.userId, user.id));
    partnerId = partnerRow?.id;
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
    ...(partnerId ? { partnerId } : {}),
  });

  const { password: _pw, ...publicUser } = user;
  res.json({ token, user: publicUser });
});

router.post("/auth/register", authenticate, requireRole("super_admin"), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { tenantName, tenantSlug, name, email, password } = parsed.data;

  const hashed = await bcrypt.hash(password, 12);

  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ name: tenantName, slug: tenantSlug })
      .returning();

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name,
        email,
        password: hashed,
        role: "admin",
        platformRole: "super_admin",
      })
      .returning(PUBLIC_FIELDS);

    const token = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
    });

    res.status(201).json({ token, user });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email or tenant slug already exists" });
      return;
    }
    throw err;
  }
});

protectedRouter.get("/auth/me", async (req, res) => {
  const [user] = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub));

  if (!user || !user.active) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  res.json(user);
});

protectedRouter.post("/auth/refresh", async (req, res) => {
  const [user] = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub));

  if (!user || !user.active) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  let partnerId: string | undefined;
  if (user.platformRole === "partner") {
    const [partnerRow] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.userId, user.id));
    partnerId = partnerRow?.id;
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
    ...(partnerId ? { partnerId } : {}),
  });

  res.json({ token, user });
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export { protectedRouter as authProtectedRouter };
export default router;
