import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, insertUserSchema, updateUserSchema } from "@workspace/db";

const router: IRouter = Router();

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

router.get("/tenants/:tenantId/users", async (req, res) => {
  const users = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.tenantId, req.params.tenantId))
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

  try {
    const [user] = await db
      .insert(usersTable)
      .values(parsed.data)
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

  try {
    const [user] = await db
      .update(usersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.id))
      .returning(PUBLIC_FIELDS);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/users/:id", async (req, res) => {
  const [deleted] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .returning({ id: usersTable.id });

  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }

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
