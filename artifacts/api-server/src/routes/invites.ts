import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { db, tenantsTable, usersTable, tenantInvitesTable } from "@workspace/db";
import { signToken } from "../lib/jwt.js";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
const protectedRouter: IRouter = Router();

const PUBLIC_USER_FIELDS = {
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

const createInviteSchema = z.object({
  tenantId: z.string().min(1),
  email: z.email(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(8),
});

function buildInviteUrl(req: import("express").Request, token: string): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const baseUrl = domain
    ? `https://${domain}`
    : `${req.get("x-forwarded-proto") ?? req.protocol}://${req.get("host")}`;
  return `${baseUrl}/invite/${token}`;
}

router.get("/invites/:token", async (req, res) => {
  const token = String(req.params["token"]);

  const [invite] = await db
    .select()
    .from(tenantInvitesTable)
    .where(eq(tenantInvitesTable.token, token));

  if (!invite) {
    res.status(404).json({ error: "Token de convite não encontrado" });
    return;
  }

  if (invite.usedAt) {
    res.status(410).json({ error: "Este convite já foi utilizado" });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: "Este convite expirou" });
    return;
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, invite.tenantId));

  if (!tenant) {
    res.status(404).json({ error: "Tenant não encontrado" });
    return;
  }

  res.json({
    tenantId: tenant.id,
    tenantName: tenant.name,
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
  });
});

router.post("/auth/accept-invite", async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { token, name, password } = parsed.data;

  const [invite] = await db
    .select()
    .from(tenantInvitesTable)
    .where(eq(tenantInvitesTable.token, token));

  if (!invite) {
    res.status(404).json({ error: "Token de convite não encontrado" });
    return;
  }

  if (invite.usedAt) {
    res.status(410).json({ error: "Este convite já foi utilizado" });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: "Este convite expirou" });
    return;
  }

  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.email, invite.email),
        eq(usersTable.tenantId, invite.tenantId)
      )
    );

  if (existingUser.length > 0) {
    res.status(409).json({ error: "Já existe uma conta com este email neste tenant" });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({
      tenantId: invite.tenantId,
      name,
      email: invite.email,
      password: hashed,
      role: "admin",
      platformRole: "tenant_admin",
    })
    .returning(PUBLIC_USER_FIELDS);

  await db
    .update(tenantInvitesTable)
    .set({ usedAt: new Date() })
    .where(eq(tenantInvitesTable.id, invite.id));

  const jwtToken = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
  });

  res.status(201).json({ token: jwtToken, user });
});

protectedRouter.post(
  "/admin/invites",
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const { tenantId, email } = parsed.data;

    const [tenant] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado" });
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invite] = await db
      .insert(tenantInvitesTable)
      .values({
        tenantId,
        email,
        expiresAt,
        createdBy: req.user!.sub,
      })
      .returning();

    const inviteUrl = buildInviteUrl(req, invite.token);

    req.log.info({ inviteId: invite.id, tenantId, email }, "Invite created");

    res.status(201).json({
      id: invite.id,
      tenantId: invite.tenantId,
      email: invite.email,
      token: invite.token,
      expiresAt: invite.expiresAt.toISOString(),
      inviteUrl,
    });
  }
);

protectedRouter.get(
  "/admin/invites/:tenantId",
  requireRole("super_admin"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    const invites = await db
      .select()
      .from(tenantInvitesTable)
      .where(eq(tenantInvitesTable.tenantId, tenantId))
      .orderBy(tenantInvitesTable.createdAt);

    const result = invites.map((inv) => ({
      id: inv.id,
      tenantId: inv.tenantId,
      email: inv.email,
      token: inv.token,
      expiresAt: inv.expiresAt.toISOString(),
      usedAt: inv.usedAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
      inviteUrl: buildInviteUrl(req, inv.token),
    }));

    res.json(result);
  }
);

export { protectedRouter as invitesProtectedRouter };
export default router;
