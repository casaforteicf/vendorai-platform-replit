import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  tenantCalendarSettingsTable,
  insertTenantCalendarSettingsSchema,
  updateTenantCalendarSettingsSchema,
} from "@workspace/db";
import type { CommercialDate, ProfessionalDate } from "@workspace/db";
import {
  buildRelevantProfessionalDates,
  canonicalizeProfessionalDates,
} from "../lib/professional-calendar-selection.js";
import { mergeCommercialDates } from "../lib/commercial-calendar.js";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed route tenant is consumed only by handlers/middleware that enforce same-tenant or super-admin access before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

function normalizeCalendarBody(body: Record<string, unknown>): { commercialDates?: CommercialDate[]; professionalDates?: ProfessionalDate[]; activityScheduleDefaults?: Array<{ activityType: string; enabled: boolean; weekday: number; agendaId?: string | null }>; enableSpouseGiftFlow?: boolean } {
  // Frontend remains the source of truth for commercialDates.
  // Professional dates are canonicalized by the backend so month/day and
  // profession mappings cannot drift from the VendorAI master catalog.
  return {
    commercialDates: Array.isArray(body.commercialDates) ? (body.commercialDates as CommercialDate[]) : undefined,
    professionalDates: Array.isArray(body.professionalDates) ? (body.professionalDates as ProfessionalDate[]) : undefined,
    activityScheduleDefaults: Array.isArray(body.activityScheduleDefaults)
      ? (body.activityScheduleDefaults as Array<{ activityType: string; enabled: boolean; weekday: number; agendaId?: string | null }>)
      : undefined,
    enableSpouseGiftFlow: body.enableSpouseGiftFlow as boolean | undefined,
  };
}

async function getLeadProfessions(tenantId: string) {
  const professionRows = await db
    .selectDistinct({ profissao: leadsTable.profissao })
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, tenantId));

  return professionRows.map((row) => row.profissao);
}

router.get("/tenants/:tenantId/calendar-settings", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (req.user?.tenantId !== tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const [settings] = await db
    .select()
    .from(tenantCalendarSettingsTable)
    .where(eq(tenantCalendarSettingsTable.tenantId, tenantId))
    .limit(1);

  const leadProfessions = await getLeadProfessions(tenantId);

  // New tenants may reach the calendar before having saved any setting. Return
  // a virtual configuration so relevant professional dates can already be
  // suggested from lead cards. The first PATCH will create the real row.
  if (!settings) {
    return res.json({
      id: "",
      tenantId,
      commercialDates: mergeCommercialDates([]),
      professionalDates: buildRelevantProfessionalDates([], leadProfessions),
      activityScheduleDefaults: [],
      enableSpouseGiftFlow: false,
      createdAt: null,
      updatedAt: null,
    });
  }

  const canonicalStoredDates = canonicalizeProfessionalDates(settings.professionalDates);
  let persistedSettings = settings;

  // Lazy correction for old/free-text records. Only already configured rows are
  // persisted here; the full catalog is never dumped into the tenant settings.
  if (JSON.stringify(canonicalStoredDates) !== JSON.stringify(settings.professionalDates)) {
    const [updated] = await db
      .update(tenantCalendarSettingsTable)
      .set({ professionalDates: canonicalStoredDates, updatedAt: new Date() })
      .where(eq(tenantCalendarSettingsTable.tenantId, tenantId))
      .returning();

    if (updated) persistedSettings = updated;
  }

  // Discover which catalog dates matter to this tenant from the profession
  // actually stored on lead cards. This keeps the current UI compact while
  // removing the need to type profession aliases manually.
  const professionalDates = buildRelevantProfessionalDates(
    canonicalStoredDates,
    leadProfessions,
  );

  return res.json({
    ...persistedSettings,
    commercialDates: mergeCommercialDates(persistedSettings.commercialDates),
    professionalDates,
  });
});

router.post("/tenants/:tenantId/calendar-settings", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (req.user?.tenantId !== tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const normalized = normalizeCalendarBody(req.body);
  const payload = {
    ...normalized,
    tenantId,
    professionalDates: canonicalizeProfessionalDates(normalized.professionalDates),
  };
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
  const tenantId = routeTenantId(req);
  if (req.user?.tenantId !== tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const normalized = normalizeCalendarBody(req.body);
  const payload = {
    ...normalized,
    ...(normalized.professionalDates !== undefined
      ? { professionalDates: canonicalizeProfessionalDates(normalized.professionalDates) }
      : {}),
  };
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