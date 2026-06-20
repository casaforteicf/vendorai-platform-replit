import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, insertUserSchema, updateUserSchema } from "@workspace/db";

const router: IRouter = Router();

const PUBLIC_FIELDS = {
  id: usersTable.id,
  tenantId: usersTable.tenantId,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  platformRole: usersTable.platformRole,
  userFunction: usersTable.userFunction,
  telefone: usersTable.telefone,
  active: usersTable.active,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

router.get("/tenants/:tenantId/users", async (req, res) => {
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

router.get("/users", async (req, res) => {
  const users = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", async (req, res) => {
  const parsed = insertUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
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

router.get("/users/:id", async (req, res) => {
  const [user] = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.patch("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data: typeof parsed.data = { ...parsed.data };
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
    .where(eq(usersTable.id, String(req.params.id)));

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

router.delete("/users/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, existing.id));

  res.status(204).send();
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
