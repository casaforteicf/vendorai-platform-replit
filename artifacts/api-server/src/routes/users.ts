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
  createTenantUserFunctionSchema,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

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
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

function canManageTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
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

    const permissions = [...new Set(parsed.data.permissions)];
    const invalidPermission = permissions.find((permission) => !USER_MODULE_KEYS.has(permission));
    if (invalidPermission) {
      res.status(422).json({ error: `Invalid module permission: ${invalidPermission}` });
      return;
    }

    try {
      const [created] = await db
        .insert(tenantUserFunctionsTable)
        .values({
          tenantId,
          name: parsed.data.name.trim(),
          permissions,
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
  };

  try {
    const [user] = await db
      .insert(usersTable)
      .values(data)
      .returning(PUBLIC_FIELDS);
    res.status(201).json(user);
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

  res.json(user);
});

router.patch("/users/:id", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
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

  if (data.password) {
    data.password = await bcrypt.hash(data.password, 12);
  }

  try {
    const [user] = await db
      .update(usersTable)
      .set({ ...data, updatedAt: new Date() })
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
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
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
