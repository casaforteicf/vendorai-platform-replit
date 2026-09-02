import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  tenantCalendarSettingsTable,
  insertTenantCalendarSettingsSchema,
  updateTenantCalendarSettingsSchema,
} from "@workspace/db";
import type { CommercialDate, ProfessionalDate } from "@workspace/db";

const router: IRouter = Router();

function normalizeCalendarBody(body: Record<string, unknown>): { commercialDates?: CommercialDate[]; professionalDates?: ProfessionalDate[]; enableSpouseGiftFlow?: boolean } {
  // Frontend is the single source of truth for commercialDates array
  return {
    commercialDates: Array.isArray(body.commercialDates) ? (body.commercialDates as CommercialDate[]) : undefined,
    professionalDates: Array.isArray(body.professionalDates) ? (body.professionalDates as ProfessionalDate[]) : undefined,
    enableSpouseGiftFlow: body.enableSpouseGiftFlow as boolean | undefined,
  };
}

router.get("/tenants/:tenantId/calendar-settings", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.tenantId !== tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const [settings] = await db
    .select()
    .from(tenantCalendarSettingsTable)
    .where(eq(tenantCalendarSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!settings) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.json(settings);
});

router.post("/tenants/:tenantId/calendar-settings", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.tenantId !== tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const normalized = normalizeCalendarBody(req.body);
  const payload = { ...normalized, tenantId };
  const parsed = insertTenantCalendarSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  try {
    const [settings] = await db
      .insert(tenantCalendarSettingsTable)
      .values({ ...parsed.data, tenantId })
      .returning();
    return res.status(201).json(settings);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("23505")) {
      return res.status(409).json({ error: "Tenant already has calendar settings" });
    }
    throw err;
  }
});

router.patch("/tenants/:tenantId/calendar-settings", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.tenantId !== tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const normalized = normalizeCalendarBody(req.body);
  const payload = { ...normalized };
  const parsed = updateTenantCalendarSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const [existing] = await db
    .select()
    .from(tenantCalendarSettingsTable)
    .where(eq(tenantCalendarSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(tenantCalendarSettingsTable)
      .values({ tenantId, ...parsed.data, updatedAt: new Date() })
      .returning();
    return res.status(201).json(created);
  }

  const [updated] = await db
    .update(tenantCalendarSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(tenantCalendarSettingsTable.tenantId, tenantId))
    .returning();

  return res.json(updated);
});

export default router;
