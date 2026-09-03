import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  userFunctionsTable,
  insertUserSchema,
  updateUserSchema,
  insertUserFunctionSchema,
  updateUserFunctionSchema,
  archPromptVariationsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

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

function canManageTenant(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

async function findFunctionForTenant(functionId: string, tenantId: string) {
  const [definition] = await db
    .select()
    .from(userFunctionsTable)
    .where(
      and(
        eq(userFunctionsTable.id, functionId),
        eq(userFunctionsTable.tenantId, tenantId),
      ),
    );
  return definition;
}

router.get("/tenants/:tenantId/users", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (!canManageTenant(req, tenantId)) {
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

router.get(
  "/tenants/:tenantId/user-functions",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    if (!canManageTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const definitions = await db
      .select()
      .from(userFunctionsTable)
      .where(eq(userFunctionsTable.tenantId, tenantId))
      .orderBy(userFunctionsTable.name);

    res.json(definitions);
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

    const parsed = insertUserFunctionSchema.safeParse({ ...req.body, tenantId });
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    try {
      const [definition] = await db
        .insert(userFunctionsTable)
        .values(parsed.data)
        .returning();
      res.status(201).json(definition);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Já existe uma função com este nome" });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/user-functions/:id",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const id = String(req.params["id"]);
    const [existing] = await db
      .select()
      .from(userFunctionsTable)
      .where(eq(userFunctionsTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Função não encontrada" });
      return;
    }
    if (!canManageTenant(req, existing.tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const parsed = updateUserFunctionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    try {
      const [definition] = await db
        .update(userFunctionsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(userFunctionsTable.id, id))
        .returning();
      res.json(definition);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Já existe uma função com este nome" });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/user-functions/:id",
  requireRole("super_admin", "tenant_admin"),
  async (req, res) => {
    const id = String(req.params["id"]);
    const [existing] = await db
      .select({ id: userFunctionsTable.id, tenantId: userFunctionsTable.tenantId })
      .from(userFunctionsTable)
      .where(eq(userFunctionsTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Função não encontrada" });
      return;
    }
    if (!canManageTenant(req, existing.tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    await db.delete(userFunctionsTable).where(eq(userFunctionsTable.id, id));
    res.status(204).send();
  },
);

router.get("/users", requireRole("super_admin"), async (_req, res) => {
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

  if (!canManageTenant(req, parsed.data.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (parsed.data.customFunctionId) {
    const definition = await findFunctionForTenant(parsed.data.customFunctionId, parsed.data.tenantId);
    if (!definition || !definition.active) {
      res.status(422).json({ error: "A função personalizada selecionada não está disponível" });
      return;
    }
    parsed.data.userFunction = "outro";
  }

  const data = {
    ...parsed.data,
    password: await bcrypt.hash(parsed.data.password, 12),
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
  if (!canManageTenant(req, user.tenantId)) {
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
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, (req.params.id as string)));

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!canManageTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data: typeof parsed.data = { ...parsed.data };
  if (data.customFunctionId) {
    const definition = await findFunctionForTenant(data.customFunctionId, existing.tenantId);
    if (!definition || !definition.active) {
      res.status(422).json({ error: "A função personalizada selecionada não está disponível" });
      return;
    }
    data.userFunction = "outro";
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

  if (!canManageTenant(req, existing.tenantId)) {
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

  if (!canManageTenant(req, existing.tenantId)) {
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
