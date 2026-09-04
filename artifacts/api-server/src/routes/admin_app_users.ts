import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appInstancesTable,
  appUserMembershipsTable,
  appUsersTable,
  db,
  leadsTable,
  tenantsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireRole("super_admin"));

const metadataSchema = z.record(z.string(), z.unknown());
const roleKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "role_key inválido");
const permissionSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/, "Permissão inválida");

const appUserCreateSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.string().min(1).nullable().optional(),
  displayName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  status: z.enum(["invited", "active", "blocked", "archived"]).default("invited"),
  locale: z.string().trim().min(2).max(35).nullable().optional(),
  metadata: metadataSchema.default({}),
});

const appUserPatchSchema = z
  .object({
    leadId: z.string().min(1).nullable(),
    displayName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(320).nullable(),
    phone: z.string().trim().min(3).max(40).nullable(),
    status: z.enum(["invited", "active", "blocked", "archived"]),
    locale: z.string().trim().min(2).max(35).nullable(),
    metadata: metadataSchema,
  })
  .partial();

const membershipCreateSchema = z.object({
  appUserId: z.string().min(1),
  roleKey: roleKeySchema.default("customer"),
  status: z.enum(["invited", "active", "suspended", "archived"]).default("invited"),
  permissions: z.array(permissionSchema).max(200).default([]),
  metadata: metadataSchema.default({}),
});

const membershipPatchSchema = z
  .object({
    roleKey: roleKeySchema,
    status: z.enum(["invited", "active", "suspended", "archived"]),
    permissions: z.array(permissionSchema).max(200),
    metadata: metadataSchema,
  })
  .partial();

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

function normalizeEmail(email: string | null | undefined): string | null | undefined {
  if (email === undefined || email === null) return email;
  return email.trim().toLowerCase();
}

async function tenantExists(tenantId: string): Promise<boolean> {
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  return Boolean(tenant);
}

async function getLeadInTenant(tenantId: string, leadId: string) {
  const [lead] = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      nome: leadsTable.nome,
      email: leadsTable.email,
      telefone: leadsTable.telefone,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  return lead;
}

async function leadAlreadyLinked(tenantId: string, leadId: string, exceptUserId?: string) {
  const rows = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(and(eq(appUsersTable.tenantId, tenantId), eq(appUsersTable.leadId, leadId)))
    .limit(2);
  return rows.some((row) => row.id !== exceptUserId);
}

async function getApp(appId: string) {
  const [app] = await db
    .select({ id: appInstancesTable.id, tenantId: appInstancesTable.tenantId })
    .from(appInstancesTable)
    .where(eq(appInstancesTable.id, appId))
    .limit(1);
  return app;
}

const safeAppUserSelect = {
  id: appUsersTable.id,
  tenantId: appUsersTable.tenantId,
  leadId: appUsersTable.leadId,
  displayName: appUsersTable.displayName,
  email: appUsersTable.email,
  phone: appUsersTable.phone,
  identityProvider: appUsersTable.identityProvider,
  status: appUsersTable.status,
  locale: appUsersTable.locale,
  metadata: appUsersTable.metadata,
  emailVerifiedAt: appUsersTable.emailVerifiedAt,
  phoneVerifiedAt: appUsersTable.phoneVerifiedAt,
  lastLoginAt: appUsersTable.lastLoginAt,
  createdAt: appUsersTable.createdAt,
  updatedAt: appUsersTable.updatedAt,
} as const;

router.get("/admin/app-builder/app-users", async (req, res) => {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const appInstanceId =
    typeof req.query.appInstanceId === "string" ? req.query.appInstanceId : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  if (appInstanceId) {
    const app = await getApp(appInstanceId);
    if (!app) return res.status(404).json({ error: "App não encontrado" });
    if (tenantId && tenantId !== app.tenantId) {
      return res.status(422).json({ error: "O app não pertence ao tenant informado" });
    }

    const rows = await db
      .select({
        ...safeAppUserSelect,
        membershipId: appUserMembershipsTable.id,
        roleKey: appUserMembershipsTable.roleKey,
        membershipStatus: appUserMembershipsTable.status,
        permissions: appUserMembershipsTable.permissions,
        membershipMetadata: appUserMembershipsTable.metadata,
      })
      .from(appUserMembershipsTable)
      .innerJoin(appUsersTable, eq(appUsersTable.id, appUserMembershipsTable.appUserId))
      .where(
        and(
          eq(appUserMembershipsTable.appInstanceId, app.id),
          eq(appUserMembershipsTable.tenantId, app.tenantId),
          eq(appUsersTable.tenantId, app.tenantId),
        ),
      )
      .orderBy(asc(appUsersTable.displayName))
      .limit(limit)
      .offset(offset);
    return res.json(rows);
  }

  const query = db.select(safeAppUserSelect).from(appUsersTable);
  const rows = tenantId
    ? await query
        .where(eq(appUsersTable.tenantId, tenantId))
        .orderBy(asc(appUsersTable.displayName))
        .limit(limit)
        .offset(offset)
    : await query.orderBy(desc(appUsersTable.updatedAt)).limit(limit).offset(offset);
  return res.json(rows);
});

router.post("/admin/app-builder/app-users", async (req, res) => {
  const parsed = appUserCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const data = parsed.data;
  if (!(await tenantExists(data.tenantId))) {
    return res.status(422).json({ error: "Tenant inválido" });
  }

  if (data.leadId) {
    const lead = await getLeadInTenant(data.tenantId, data.leadId);
    if (!lead) return res.status(422).json({ error: "Lead/contato não pertence ao tenant" });
    if (await leadAlreadyLinked(data.tenantId, data.leadId)) {
      return res.status(409).json({ error: "Este lead/contato já está vinculado a um App User" });
    }
  }

  try {
    const [row] = await db
      .insert(appUsersTable)
      .values({
        ...data,
        email: normalizeEmail(data.email),
        identityProvider: "local",
        authSubject: null,
      })
      .returning(safeAppUserSelect);
    return res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Já existe um App User com essa identidade no tenant" });
    }
    throw error;
  }
});

router.patch("/admin/app-builder/app-users/:id", async (req, res) => {
  const parsed = appUserPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const id = String(req.params.id);
  const [current] = await db
    .select({ id: appUsersTable.id, tenantId: appUsersTable.tenantId })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id))
    .limit(1);
  if (!current) return res.status(404).json({ error: "App User não encontrado" });

  if (parsed.data.leadId) {
    const lead = await getLeadInTenant(current.tenantId, parsed.data.leadId);
    if (!lead) return res.status(422).json({ error: "Lead/contato não pertence ao tenant" });
    if (await leadAlreadyLinked(current.tenantId, parsed.data.leadId, id)) {
      return res.status(409).json({ error: "Este lead/contato já está vinculado a outro App User" });
    }
  }

  try {
    const values = {
      ...parsed.data,
      ...(Object.prototype.hasOwnProperty.call(parsed.data, "email")
        ? { email: normalizeEmail(parsed.data.email) }
        : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(appUsersTable)
      .set(values)
      .where(eq(appUsersTable.id, id))
      .returning(safeAppUserSelect);
    return res.json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Já existe um App User com essa identidade no tenant" });
    }
    throw error;
  }
});

router.get("/admin/app-builder/apps/:appId/memberships", async (req, res) => {
  const app = await getApp(String(req.params.appId));
  if (!app) return res.status(404).json({ error: "App não encontrado" });

  const rows = await db
    .select({
      id: appUserMembershipsTable.id,
      tenantId: appUserMembershipsTable.tenantId,
      appInstanceId: appUserMembershipsTable.appInstanceId,
      appUserId: appUserMembershipsTable.appUserId,
      roleKey: appUserMembershipsTable.roleKey,
      status: appUserMembershipsTable.status,
      permissions: appUserMembershipsTable.permissions,
      metadata: appUserMembershipsTable.metadata,
      createdAt: appUserMembershipsTable.createdAt,
      updatedAt: appUserMembershipsTable.updatedAt,
      userDisplayName: appUsersTable.displayName,
      userEmail: appUsersTable.email,
      userPhone: appUsersTable.phone,
      userStatus: appUsersTable.status,
      leadId: appUsersTable.leadId,
    })
    .from(appUserMembershipsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, appUserMembershipsTable.appUserId))
    .where(
      and(
        eq(appUserMembershipsTable.appInstanceId, app.id),
        eq(appUserMembershipsTable.tenantId, app.tenantId),
        eq(appUsersTable.tenantId, app.tenantId),
      ),
    )
    .orderBy(asc(appUsersTable.displayName));
  return res.json(rows);
});

router.post("/admin/app-builder/apps/:appId/memberships", async (req, res) => {
  const parsed = membershipCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const app = await getApp(String(req.params.appId));
  if (!app) return res.status(404).json({ error: "App não encontrado" });

  const [appUser] = await db
    .select({ id: appUsersTable.id, tenantId: appUsersTable.tenantId, status: appUsersTable.status })
    .from(appUsersTable)
    .where(
      and(
        eq(appUsersTable.id, parsed.data.appUserId),
        eq(appUsersTable.tenantId, app.tenantId),
      ),
    )
    .limit(1);
  if (!appUser) {
    return res.status(422).json({ error: "App User não pertence ao mesmo tenant do app" });
  }
  if (appUser.status === "archived") {
    return res.status(422).json({ error: "App User arquivado não pode receber novo acesso" });
  }

  try {
    const [row] = await db
      .insert(appUserMembershipsTable)
      .values({
        tenantId: app.tenantId,
        appInstanceId: app.id,
        appUserId: appUser.id,
        roleKey: parsed.data.roleKey,
        status: parsed.data.status,
        permissions: Array.from(new Set(parsed.data.permissions)),
        metadata: parsed.data.metadata,
      })
      .returning();
    return res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Este App User já possui vínculo com o app" });
    }
    throw error;
  }
});

router.patch(
  "/admin/app-builder/apps/:appId/memberships/:membershipId",
  async (req, res) => {
    const parsed = membershipPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

    const app = await getApp(String(req.params.appId));
    if (!app) return res.status(404).json({ error: "App não encontrado" });

    const membershipId = String(req.params.membershipId);
    const [current] = await db
      .select({ id: appUserMembershipsTable.id })
      .from(appUserMembershipsTable)
      .where(
        and(
          eq(appUserMembershipsTable.id, membershipId),
          eq(appUserMembershipsTable.appInstanceId, app.id),
          eq(appUserMembershipsTable.tenantId, app.tenantId),
        ),
      )
      .limit(1);
    if (!current) return res.status(404).json({ error: "Membership não encontrado" });

    const values = {
      ...parsed.data,
      ...(parsed.data.permissions
        ? { permissions: Array.from(new Set(parsed.data.permissions)) }
        : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(appUserMembershipsTable)
      .set(values)
      .where(eq(appUserMembershipsTable.id, membershipId))
      .returning();
    return res.json(row);
  },
);

export default router;
