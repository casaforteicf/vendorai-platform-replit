import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { z } from "zod/v4";
import { db, usersTable, tenantsTable, partnersTable, passwordResetTokensTable } from "@workspace/db";
import { signToken } from "../lib/jwt.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { sendPasswordResetEmail } from "../lib/email.js";

const router: IRouter = Router();
const protectedRouter: IRouter = Router();

// ── In-memory rate limiter for demo login ─────────────────────────
const demoLoginAttempts = new Map<string, number[]>();

function checkDemoRateLimit(clientKey: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const MINUTE_MS = 60_000;
  const HOUR_MS = 60 * MINUTE_MS;

  const attempts = demoLoginAttempts.get(clientKey) ?? [];
  const recent = attempts.filter((t) => now - t < HOUR_MS);

  // Max 5 per minute
  const inLastMinute = recent.filter((t) => now - t < MINUTE_MS).length;
  if (inLastMinute >= 5) {
    return { allowed: false, retryAfter: Math.ceil((MINUTE_MS - (now - recent[0]!)) / 1000) };
  }

  // Max 20 per hour
  if (recent.length >= 20) {
    return { allowed: false, retryAfter: Math.ceil((HOUR_MS - (now - recent[0]!)) / 1000) };
  }

  recent.push(now);
  demoLoginAttempts.set(clientKey, recent);
  return { allowed: true };
}

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

const demoSignupSchema = z.object({
  nomeEmpresa: z.string().min(1, "Nome da empresa é obrigatório"),
  nomePessoa: z.string().min(1, "Seu nome é obrigatório"),
  email: z.email(),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  telefone: z.string().optional(),
});

router.post("/auth/demo-signup", async (req, res) => {
  const parsed = demoSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { nomeEmpresa, nomePessoa, email, senha, telefone } = parsed.data;

  const slugBase = nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30);
  const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
  const demoExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  const hashed = await bcrypt.hash(senha, 12);

  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: nomeEmpresa,
        slug,
        status: "active",
        isDemo: true,
        demoExpiresAt,
        planId: null,
      })
      .returning();

    const { seedDemoData } = await import("./tenants.js");
    await seedDemoData(tenant.id);

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name: nomePessoa,
        email,
        password: hashed,
        role: "admin",
        platformRole: "tenant_admin",
      })
      .returning(PUBLIC_FIELDS);

    const token = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
    });

    res.status(201).json({
      token,
      user,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, isDemo: true, demoExpiresAt },
      demoUrl: `/app?tenant=${tenant.slug}`,
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email ou slug do tenant já existe" });
      return;
    }
    throw err;
  }
});

router.post("/auth/demo-login", async (req, res) => {
  const { email, password } = req.body;

  // Rate limiting check for demo credentials
  const isDemoCredentials = email === "demo" && password === "demo";
  if (!isDemoCredentials) {
    res.status(401).json({ error: "Invalid demo credentials" });
    return;
  }

  // Apply rate limiting (by IP)
  const clientKey = req.ip ?? "unknown";
  const rateLimit = checkDemoRateLimit(clientKey);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: "Muitas tentativas de login demo. Tente novamente em breve.", retryAfter: rateLimit.retryAfter });
    return;
  }

  // Find or create demo tenant
  let [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "demo"));

  if (!tenant) {
    [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: "Demo",
        slug: "demo",
        status: "active",
        isDemo: true,
        demoExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        planId: null,
      })
      .returning();
  }

  // Find or create demo user
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, "demo@demo.com"));

  if (!user) {
    const hashed = await bcrypt.hash("demo", 12);
    [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name: "Demo User",
        email: "demo@demo.com",
        password: hashed,
        role: "admin",
        platformRole: "tenant_admin",
      })
      .returning();
  }

  // Seed if not seeded
  if (!tenant.demoSeeded) {
    const { seedDemoData } = await import("./tenants.js");
    await seedDemoData(tenant.id);
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
  });

  const { password: _pw, ...publicUser } = user;
  res.json({
    token,
    user: publicUser,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, isDemo: true },
  });
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
  const [row] = await db
    .select({ ...PUBLIC_FIELDS, tenantVertical: tenantsTable.vertical })
    .from(usersTable)
    .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
    .where(eq(usersTable.id, req.user!.sub));

  if (!row || !row.active) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  res.json(row);
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

// ── Forgot password ───────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({ email: z.email() });

router.post("/auth/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Email inválido" });
    return;
  }

  const { email } = parsed.data;

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, active: usersTable.active })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  // Always respond 200 to avoid user enumeration
  if (!user || !user.active) {
    res.json({ ok: true });
    return;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const appUrl = domain ? `https://${domain}` : `http://localhost:3000`;
  const resetUrl = `${appUrl}/redefinir-senha?token=${rawToken}`;

  await sendPasswordResetEmail(user.email, resetUrl);

  res.json({ ok: true });
});

// ── Reset password ─────────────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

router.post("/auth/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
    return;
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  const [resetRecord] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, tokenHash));

  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < now) {
    res.status(400).json({ error: "Link inválido ou expirado. Solicite um novo link." });
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({ password: hashed, updatedAt: now })
    .where(eq(usersTable.id, resetRecord.userId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.id, resetRecord.id));

  res.json({ ok: true });
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}

export { protectedRouter as authProtectedRouter };
export default router;
