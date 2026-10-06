import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  insertUserSchema,
  updateUserSchema,
  archPromptVariationsTable,
  tenantUserFunctionsTable,
  tenantsTable,
  createTenantUserFunctionSchema,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { geocodeAddressWithTimeout } from "../lib/geocoding.js";
import { sendWelcomeEmail } from "../lib/email.js";

const router: IRouter = Router();

const USER_MODULE_KEYS = new Set([
  "dashboard",
  "leads",
  "prospector",
  "deals",
  "conversations",
  "agenda",
  "deliveries",
  "proposals",
  "catalog",
  "erp",
  "agents",
  "knowledge",
  "analytics",
  "team",
  "settings",
  "content",
  "revenue_scout",
  "pharmacy",
]);

const PUBLIC_FIELDS = {
  id: usersTable.id,
  tenantId: usersTable.tenantId,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  platformRole: usersTable.platformRole,
  userFunction: usersTable.userFunction,
  customFunctionId: usersTable.customFunctionId,
  permissions: usersTable.permissions,
  telefone: usersTable.telefone,
  active: usersTable.active,
  leadAssignmentEnabled: usersTable.leadAssignmentEnabled,
  leadAssignmentCities: usersTable.leadAssignmentCities,
  leadAssignmentRegions: usersTable.leadAssignmentRegions,
  leadAssignmentSegments: usersTable.leadAssignmentSegments,
  leadAssignmentLat: usersTable.leadAssignmentLat,
  leadAssignmentLng: usersTable.leadAssignmentLng,
  leadAssignmentRaioKm: usersTable.leadAssignmentRaioKm,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

/**
 * `leadAssignmentBaseAddress` não é coluna de `users` — é o endereço em
 * texto que o admin digita na tela (ex: escritório/loja do vendedor), só
 * pra geocodificar uma vez e gravar lat/lng. O schema Drizzle descarta
 * chaves desconhecidas do body silenciosamente, então lemos ela direto do
 * req.body antes do parse. String vazia = admin removeu o ponto-base
 * (zera lat/lng); chave ausente = não mexe no que já estava salvo.
 */
async function resolveBaseAddressGeocode(req: any): Promise<{ leadAssignmentLat?: number | null; leadAssignmentLng?: number | null }> {
  const directLat = Number(req.body?.leadAssignmentLat);
  const directLng = Number(req.body?.leadAssignmentLng);
  // Quando o usuário escolhe o ponto no mapa, as coordenadas do pino são a
  // fonte mais precisa. Não geocodifique novamente o rótulo da cidade, pois
  // isso deslocaria o ponto para o centro do município e alteraria o raio.
  if (Number.isFinite(directLat) && Number.isFinite(directLng)) return {};

  const raw = req.body?.leadAssignmentBaseAddress;
  if (typeof raw !== "string") return {};
  const address = raw.trim();
  if (!address) return { leadAssignmentLat: null, leadAssignmentLng: null };
  const geocoded = await geocodeAddressWithTimeout(address);
  return { leadAssignmentLat: geocoded?.lat ?? null, leadAssignmentLng: geocoded?.lng ?? null };
}

function canManageTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function isTenantAdministrator(user: { platformRole?: string | null; userFunction?: string | null }) {
  return user.platformRole === "tenant_admin" || user.userFunction === "administrador";
}

async function hasOtherActiveTenantAdministrator(tenantId: string, excludedUserId: string) {
  const rows = await db
    .select({
      id: usersTable.id,
      active: usersTable.active,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
    })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)));

  return rows.some((row) => row.id !== excludedUserId && isTenantAdministrator(row));
}

async function findTenantUserFunction(id: string, tenantId: string) {
  const [customFunction] = await db
    .select()
    .from(tenantUserFunctionsTable)
    .where(
      and(
        eq(tenantUserFunctionsTable.id, id),
        eq(tenantUserFunctionsTable.tenantId, tenantId),
      ),
    )
    .limit(1);
  return customFunction;
}

async function resolveRepresentativeTenant(
  input: { kind?: "internal" | "external_company"; linkedTenantCode?: string | null },
  ownerTenantId: string,
) {
  if (input.kind !== "external_company") {
    return { linkedTenantId: null, linkedTenantCode: null };
  }
  const code = input.linkedTenantCode?.trim().toUpperCase();
  if (!code) {
    throw new Error("REPRESENTATIVE_TENANT_CODE_REQUIRED");
  }
  const [linked] = await db
    .select({ id: tenantsTable.id, tenantCode: tenantsTable.tenantCode, status: tenantsTable.status })
    .from(tenantsTable)
    .where(eq(tenantsTable.tenantCode, code))
    .limit(1);
  if (!linked || linked.status !== "active") {
    throw new Error("REPRESENTATIVE_TENANT_NOT_FOUND");
  }
  if (linked.id === ownerTenantId) {
    throw new Error("REPRESENTATIVE_TENANT_SAME_AS_OWNER");
  }
  return { linkedTenantId: linked.id, linkedTenantCode: linked.tenantCode };
}

async function validateRepresentativeUsers(
  representativeTenantId: string | null,
  representativeUserIds: string[],
) {
  if (!representativeTenantId || representativeUserIds.length === 0) return true;

  const activeUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, representativeTenantId),
        eq(usersTable.active, true),
      ),
    );

  const allowedIds = new Set(activeUsers.map((user) => user.id));
  return representativeUserIds.every((userId) => allowedIds.has(userId));
}

router.get(
  "/representation-access",
  requireRole("super_admin", "tenant_admin", "tenant_seller", "member"),
  async (req, res) => {
    const sourceTenantId = req.user?.tenantId;
    if (!sourceTenantId && req.user?.platformRole !== "super_admin") {
      res.status(403).json({ error: "Tenant não identificado." });
      return;
    }

    const links = sourceTenantId
      ? await db
          .select()
          .from(tenantUserFunctionsTable)
          .where(
            and(
              eq(tenantUserFunctionsTable.kind, "external_company"),
              eq(tenantUserFunctionsTable.linkedTenantId, sourceTenantId),
            ),
          )
          .orderBy(asc(tenantUserFunctionsTable.name))
      : [];

    const response = await Promise.all(
      links.map(async (link) => {
        const [represented] = await db
          .select({ id: tenantsTable.id, tenantCode: tenantsTable.tenantCode, name: tenantsTable.name, slug: tenantsTable.slug })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, link.tenantId))
          .limit(1);
        return {
          functionId: link.id,
          functionName: link.name,
          representedTenant: represented ?? null,
          permissions: link.permissions,
          leadAccessScope: link.leadAccessScope,
          representativeUserIds: link.representativeUserIds,
        };
      }),
    );

    res.json(response);
  },
);

router.get(
  "/tenants/:tenantId/representative-tenants",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]); // tenant-audit: reviewed requireRole + canManageTenant guard
    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const search = String(req.query["search"] ?? "").trim().toLowerCase();
    if (search.length < 2) {
      res.json([]);
      return;
    }

    const candidates = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        tenantCode: tenantsTable.tenantCode,
        status: tenantsTable.status,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.status, "active"))
      .orderBy(asc(tenantsTable.name));

    const matches = candidates
      .filter((tenant) => tenant.id !== tenantId)
      .filter((tenant) => {
        const haystack = `${tenant.name ?? ""} ${tenant.tenantCode ?? ""}`.toLowerCase();
        return haystack.includes(search);
      })
      .slice(0, 20)
      .map(({ id, name, tenantCode }) => ({ id, name, tenantCode }));

    res.json(matches);
  },
);

router.get(
  "/tenants/:tenantId/representative-tenants/:representativeTenantId/users",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]); // tenant-audit: reviewed requireRole + canManageTenant guard
    const representativeTenantId = String(req.params["representativeTenantId"]);

    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }
    if (tenantId === representativeTenantId) {
      res.status(422).json({ error: "A empresa representante precisa ser diferente da empresa representada." });
      return;
    }

    const [representativeTenant] = await db
      .select({ id: tenantsTable.id, status: tenantsTable.status })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, representativeTenantId))
      .limit(1);

    if (!representativeTenant || representativeTenant.status !== "active") {
      res.status(404).json({ error: "Empresa representante não encontrada ou inativa." });
      return;
    }

    const representativeUsers = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        active: usersTable.active,
        userFunction: usersTable.userFunction,
      })
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, representativeTenantId), eq(usersTable.active, true)))
      .orderBy(asc(usersTable.name));

    res.json(representativeUsers);
  },
);

router.get(
  "/tenants/:tenantId/user-functions",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const functions = await db
      .select()
      .from(tenantUserFunctionsTable)
      .where(eq(tenantUserFunctionsTable.tenantId, tenantId))
      .orderBy(asc(tenantUserFunctionsTable.name));

    res.json(functions);
  },
);

router.post(
  "/tenants/:tenantId/user-functions",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const parsed = createTenantUserFunctionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    let representativeLink: { linkedTenantId: string | null; linkedTenantCode: string | null };
    try {
      representativeLink = await resolveRepresentativeTenant(parsed.data, tenantId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message =
        code === "REPRESENTATIVE_TENANT_CODE_REQUIRED"
          ? "Informe o código Vendor.ai da empresa representante."
          : code === "REPRESENTATIVE_TENANT_SAME_AS_OWNER"
            ? "A empresa representante precisa ser diferente da empresa representada."
            : "Empresa representante não encontrada ou inativa.";
      res.status(422).json({ error: message });
      return;
    }

    const permissions = [...new Set(parsed.data.permissions)];
    const invalidPermission = permissions.find((permission) => !USER_MODULE_KEYS.has(permission));
    if (invalidPermission) {
      res.status(422).json({ error: `Invalid module permission: ${invalidPermission}` });
      return;
    }

    const representativeUserIds =
      parsed.data.kind === "external_company" ? [...new Set(parsed.data.representativeUserIds)] : [];
    if (!(await validateRepresentativeUsers(representativeLink.linkedTenantId, representativeUserIds))) {
      res.status(422).json({ error: "Um ou mais usuários selecionados não pertencem à empresa representante ou estão inativos." });
      return;
    }

    try {
      const [created] = await db
        .insert(tenantUserFunctionsTable)
        .values({
          tenantId,
          name: parsed.data.name.trim(),
          systemKey: parsed.data.systemKey ?? null,
          permissions,
          kind: parsed.data.kind,
          linkedTenantId: representativeLink.linkedTenantId,
          linkedTenantCode: representativeLink.linkedTenantCode,
          leadAccessScope: parsed.data.leadAccessScope,
          representativeUserIds,
        })
        .returning();

      res.status(201).json(created);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Já existe uma função com esse nome." });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/tenants/:tenantId/user-functions/:functionId",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    // tenant-audit: reviewed requireRole and canManageTenant enforce authenticated same-tenant/Super Admin access before queries.
    const tenantId = String(req.params["tenantId"]);
    const functionId = String(req.params["functionId"]);

    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const parsed = createTenantUserFunctionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const existing = await findTenantUserFunction(functionId, tenantId);
    if (!existing) {
      res.status(404).json({ error: "Função não encontrada." });
      return;
    }

    let representativeLink: { linkedTenantId: string | null; linkedTenantCode: string | null };
    try {
      representativeLink = await resolveRepresentativeTenant(parsed.data, tenantId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message =
        code === "REPRESENTATIVE_TENANT_CODE_REQUIRED"
          ? "Informe o código Vendor.ai da empresa representante."
          : code === "REPRESENTATIVE_TENANT_SAME_AS_OWNER"
            ? "A empresa representante precisa ser diferente da empresa representada."
            : "Empresa representante não encontrada ou inativa.";
      res.status(422).json({ error: message });
      return;
    }

    const permissions = [...new Set(parsed.data.permissions)];
    const invalidPermission = permissions.find((permission) => !USER_MODULE_KEYS.has(permission));
    if (invalidPermission) {
      res.status(422).json({ error: `Invalid module permission: ${invalidPermission}` });
      return;
    }

    const representativeUserIds =
      parsed.data.kind === "external_company" ? [...new Set(parsed.data.representativeUserIds)] : [];
    if (!(await validateRepresentativeUsers(representativeLink.linkedTenantId, representativeUserIds))) {
      res.status(422).json({ error: "Um ou mais usuários selecionados não pertencem à empresa representante ou estão inativos." });
      return;
    }

    try {
      const [updated] = await db
        .update(tenantUserFunctionsTable)
        .set({
          name: parsed.data.name.trim(),
          systemKey: parsed.data.systemKey ?? null,
          permissions,
          kind: parsed.data.kind,
          linkedTenantId: representativeLink.linkedTenantId,
          linkedTenantCode: representativeLink.linkedTenantCode,
          leadAccessScope: parsed.data.leadAccessScope,
          representativeUserIds,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantUserFunctionsTable.id, functionId),
            eq(tenantUserFunctionsTable.tenantId, tenantId),
          ),
        )
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Já existe uma função com esse nome." });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/tenants/:tenantId/user-functions/:functionId",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    // tenant-audit: reviewed requireRole and canManageTenant enforce authenticated same-tenant/Super Admin access before queries.
    const tenantId = String(req.params["tenantId"]);
    const functionId = String(req.params["functionId"]);

    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const existing = await findTenantUserFunction(functionId, tenantId);
    if (!existing) {
      res.status(404).json({ error: "Função não encontrada." });
      return;
    }

    const [assignedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.tenantId, tenantId),
          eq(usersTable.customFunctionId, functionId),
        ),
      )
      .limit(1);

    if (assignedUser) {
      res.status(409).json({
        error: "Esta função está vinculada a usuários. Altere a função desses usuários antes de excluir.",
      });
      return;
    }

    await db
      .delete(tenantUserFunctionsTable)
      .where(
        and(
          eq(tenantUserFunctionsTable.id, functionId),
          eq(tenantUserFunctionsTable.tenantId, tenantId),
        ),
      );

    res.status(204).send();
  },
);

router.get("/tenants/:tenantId/users", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (
    req.user?.platformRole !== "super_admin" &&
    req.user?.platformRole !== "tenant_admin" &&
    req.user?.tenantId !== tenantId
  ) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const users = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId))
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.get("/users", requireRole("super_admin"), async (req, res) => {
  const users = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const parsed = insertUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && parsed.data.platformRole === "super_admin") {
    res.status(403).json({ error: "Tenant administrators cannot create super administrators" });
    return;
  }

  const userData = { ...parsed.data };
  if (userData.customFunctionId) {
    const customFunction = await findTenantUserFunction(userData.customFunctionId, userData.tenantId);
    if (!customFunction) {
      res.status(422).json({ error: "Função personalizada inválida para este tenant." });
      return;
    }
    userData.userFunction = "outro";
    if (!Array.isArray(userData.permissions)) {
      userData.permissions = customFunction.permissions;
    }
  }

  const data = {
    ...userData,
    password: await bcrypt.hash(userData.password, 12),
    ...(await resolveBaseAddressGeocode(req)),
  };

  try {
    const [user] = await db
      .insert(usersTable)
      .values(data)
      .returning(PUBLIC_FIELDS);

    const [tenant] = await db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, userData.tenantId))
      .limit(1);

    const emailSent = await sendWelcomeEmail({
      to: userData.email,
      name: userData.name,
      tenantName: tenant?.name ?? "sua empresa",
      loginUrl: "https://app.appvendorai.com/login",
      tempPassword: userData.password,
    });

    res.status(201).json({ ...user, emailSent });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw err;
  }
});

router.get("/users/:id", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const [user] = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.id, (req.params.id as string)));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && user.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(user);
});

router.patch("/users/:id", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      active: usersTable.active,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
    })
    .from(usersTable)
    .where(eq(usersTable.id, (req.params.id as string)));

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (
    req.user?.platformRole !== "super_admin" &&
    parsed.data.platformRole !== undefined &&
    parsed.data.platformRole !== existing.platformRole
  ) {
    res.status(403).json({ error: "Tenant administrators cannot change platform roles" });
    return;
  }

  if (req.user?.sub === existing.id && parsed.data.active === false) {
    res.status(409).json({ error: "Você não pode desativar o próprio usuário." });
    return;
  }

  const data: typeof parsed.data = { ...parsed.data };
  if (data.customFunctionId) {
    const customFunction = await findTenantUserFunction(data.customFunctionId, existing.tenantId);
    if (!customFunction) {
      res.status(422).json({ error: "Função personalizada inválida para este tenant." });
      return;
    }
    data.userFunction = "outro";
    if (!Array.isArray(data.permissions)) {
      data.permissions = customFunction.permissions;
    }
  }

  const nextAdministratorState = {
    platformRole: data.platformRole ?? existing.platformRole,
    userFunction: data.userFunction ?? existing.userFunction,
  };
  const nextActive = data.active ?? existing.active;
  const losesLastAdminAccess =
    existing.active &&
    isTenantAdministrator(existing) &&
    (!nextActive || !isTenantAdministrator(nextAdministratorState));

  if (losesLastAdminAccess) {
    const hasOtherAdmin = await hasOtherActiveTenantAdministrator(existing.tenantId, existing.id);
    if (!hasOtherAdmin) {
      res.status(409).json({ error: "O tenant precisa manter pelo menos um administrador ativo." });
      return;
    }
  }

  if (data.password) {
    data.password = await bcrypt.hash(data.password, 12);
  }

  const baseAddressGeocode = await resolveBaseAddressGeocode(req);

  try {
    const [user] = await db
      .update(usersTable)
      .set({ ...data, ...baseAddressGeocode, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning(PUBLIC_FIELDS);

    res.json(user);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/users/:id/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(422).json({ error: "currentPassword and newPassword are required strings" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(422).json({ error: "newPassword must be at least 8 characters" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, password: usersTable.password, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, String((req.params.id as string))));

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, existing.password);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 12);

  const [user] = await db
    .update(usersTable)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(usersTable.id, existing.id))
    .returning(PUBLIC_FIELDS);

  res.json(user);
});

router.delete("/users/:id", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const [existing] = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      active: usersTable.active,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
    })
    .from(usersTable)
    .where(eq(usersTable.id, (req.params.id as string)));

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (req.user?.sub === existing.id) {
    res.status(409).json({ error: "Você não pode excluir o próprio usuário." });
    return;
  }

  if (existing.active && isTenantAdministrator(existing)) {
    const hasOtherAdmin = await hasOtherActiveTenantAdministrator(existing.tenantId, existing.id);
    if (!hasOtherAdmin) {
      res.status(409).json({ error: "O tenant precisa manter pelo menos um administrador ativo." });
      return;
    }
  }

  await (db as any)
    .delete(archPromptVariationsTable)
    .where(eq(archPromptVariationsTable.userId, existing.id));

  await db.delete(usersTable).where(eq(usersTable.id, existing.id));

  return res.status(204).send();
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
