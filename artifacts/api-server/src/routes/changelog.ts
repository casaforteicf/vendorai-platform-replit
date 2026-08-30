import { Router, type IRouter } from "express";
import { eq, and, desc, isNotNull, gt, count } from "drizzle-orm";
import {
  db,
  changelogEntriesTable,
  usersTable,
  insertChangelogEntrySchema,
  updateChangelogEntrySchema,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { automaticChangelogEntries } from "../data/automatic-changelog.js";

const router: IRouter = Router();

function automaticEntries() {
  return automaticChangelogEntries.map((entry) => ({
    ...entry,
    publicadoEm: new Date(entry.publicadoEm),
    createdAt: new Date(entry.publicadoEm),
    updatedAt: new Date(entry.publicadoEm),
    automatico: true,
  }));
}

router.get("/changelog", async (_req, res) => {
  const rows = await db.select()
    .from(changelogEntriesTable)
    .where(isNotNull(changelogEntriesTable.publicadoEm))
    .orderBy(desc(changelogEntriesTable.publicadoEm));

  const combined = [
    ...rows.map((row) => ({ ...row, automatico: false })),
    ...automaticEntries(),
  ].sort((a, b) => (b.publicadoEm?.getTime() ?? 0) - (a.publicadoEm?.getTime() ?? 0));

  return res.json(combined);
});

router.get("/changelog/unread-count", async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [user] = await db.select({ changelogLidoEm: usersTable.changelogLidoEm })
    .from(usersTable).where(eq(usersTable.id, userId));

  const cutoff = user?.changelogLidoEm ?? new Date(0);
  const [row] = await db.select({ total: count() })
    .from(changelogEntriesTable)
    .where(and(isNotNull(changelogEntriesTable.publicadoEm), gt(changelogEntriesTable.publicadoEm, cutoff)));

  const automaticUnread = automaticChangelogEntries.filter(
    (entry) => new Date(entry.publicadoEm) > cutoff,
  ).length;

  return res.json({ count: (row?.total ?? 0) + automaticUnread });
});

router.post("/changelog/marcar-lido", async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await db.update(usersTable).set({ changelogLidoEm: new Date() }).where(eq(usersTable.id, userId));
  return res.json({ ok: true });
});

router.get("/admin/changelog", requireRole("super_admin"), async (_req, res) => {
  const rows = await db.select().from(changelogEntriesTable).orderBy(desc(changelogEntriesTable.createdAt));
  const combined = [
    ...rows.map((row) => ({ ...row, automatico: false })),
    ...automaticEntries(),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return res.json(combined);
});

router.post("/admin/changelog", requireRole("super_admin"), async (req, res) => {
  const parsed = insertChangelogEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.insert(changelogEntriesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.patch("/admin/changelog/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = updateChangelogEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.update(changelogEntriesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(changelogEntriesTable.id, req.params.id as string))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.post("/admin/changelog/:id/publicar", requireRole("super_admin"), async (req, res) => {
  const [row] = await db.update(changelogEntriesTable)
    .set({ publicadoEm: new Date(), updatedAt: new Date() })
    .where(eq(changelogEntriesTable.id, req.params.id as string))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/admin/changelog/:id", requireRole("super_admin"), async (req, res) => {
  await db.delete(changelogEntriesTable).where(eq(changelogEntriesTable.id, req.params.id as string));
  return res.status(204).send();
});

export default router;
