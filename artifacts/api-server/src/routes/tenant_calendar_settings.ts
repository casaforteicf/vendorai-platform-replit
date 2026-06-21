import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  tenantCalendarSettingsTable,
  insertTenantCalendarSettingsSchema,
  updateTenantCalendarSettingsSchema,
} from "@workspace/db";
import type { CommercialDate } from "@workspace/db";

const router: IRouter = Router();

const BOOLEAN_DATE_MAP: Record<string, Omit<CommercialDate, "active">> = {
  pascoaEnabled:        { name: "Páscoa", daysBeforeToSend: 3, movableDate: true },
  diaDasMaesEnabled:    { name: "Dia das Mães", daysBeforeToSend: 3, movableDate: true, targetGender: "feminino" },
  diaDosPaisEnabled:    { name: "Dia dos Pais", daysBeforeToSend: 3, movableDate: true, targetGender: "masculino" },
  diaDasCriancasEnabled:{ name: "Dia das Crianças", daysBeforeToSend: 3, movableDate: true },
  namoradosEnabled:     { name: "Dia dos Namorados", daysBeforeToSend: 3, movableDate: true },
  natalEnabled:         { name: "Natal", daysBeforeToSend: 5, movableDate: true },
  blackFridayEnabled:   { name: "Black Friday", daysBeforeToSend: 1, movableDate: true },
};

function normalizeCalendarBody(body: Record<string, unknown>): { commercialDates?: CommercialDate[]; enableSpouseGiftFlow?: boolean } {
  // If body already has commercialDates array, use it directly
  if (Array.isArray(body.commercialDates)) {
    return { commercialDates: body.commercialDates as CommercialDate[], enableSpouseGiftFlow: body.enableSpouseGiftFlow as boolean | undefined };
  }
  // Convert boolean flags to commercialDates array
  const dates: CommercialDate[] = [];
  for (const [key, meta] of Object.entries(BOOLEAN_DATE_MAP)) {
    if (body[key] === true) {
      dates.push({ ...meta, active: true });
    } else if (body[key] === false) {
      dates.push({ ...meta, active: false });
    }
  }
  return { commercialDates: dates.length > 0 ? dates : undefined, enableSpouseGiftFlow: body.enableSpouseGiftFlow as boolean | undefined };
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

  // Also return boolean flags for backward compatibility with frontend
  const booleanFlags: Record<string, boolean> = {};
  for (const [key, meta] of Object.entries(BOOLEAN_DATE_MAP)) {
    const cd = settings.commercialDates?.find((d) => d.name === meta.name);
    booleanFlags[key] = cd?.active ?? false;
  }

  return res.json({ ...settings, ...booleanFlags });
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
