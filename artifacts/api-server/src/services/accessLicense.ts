import { and, eq, gt, sql } from "drizzle-orm";
import { accessLicensesTable, db } from "@workspace/db";

export const ACCESS_PASS_DAYS = 5;
export const ACCESS_PASS_HOURS = 120;
export const ACCESS_PASS_PRICE = 399;

export function brazilMonthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function addAccessDays(date: Date, days = ACCESS_PASS_DAYS): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function getAccessLicense(tenantId: string) {
  const [license] = await db.select().from(accessLicensesTable)
    .where(eq(accessLicensesTable.tenantId, tenantId));
  return license;
}

export function hasActiveAccess(license: Awaited<ReturnType<typeof getAccessLicense>>, now = new Date()) {
  if (!license) return true; // Backwards compatibility: existing tenants remain fully active.
  if (license.mode === "legacy") return true;
  if (license.mode === "annual" && license.annualEndsAt && license.annualEndsAt > now) return true;
  return !!license.accessEndsAt && license.accessEndsAt > now;
}

export async function activateMonthlyBenefit(tenantId: string) {
  return db.transaction(async (tx) => {
    const month = brazilMonthKey();
    const [license] = await tx.select().from(accessLicensesTable)
      .where(eq(accessLicensesTable.tenantId, tenantId))
      .for("update");

    if (!license) throw new Error("ACCESS_LICENSE_NOT_ENROLLED");
    if (license.mode === "annual" || license.mode === "legacy") throw new Error("ACCESS_ALREADY_CONTINUOUS");
    if (license.freeBenefitMonth === month) throw new Error("MONTHLY_BENEFIT_ALREADY_USED");

    const now = new Date();
    const start = license.accessEndsAt && license.accessEndsAt > now ? license.accessEndsAt : now;
    const endsAt = addAccessDays(start);

    const [updated] = await tx.update(accessLicensesTable).set({
      status: "active",
      accessEndsAt: endsAt,
      freeBenefitMonth: month,
      freeActivatedAt: now,
      freeEndsAt: endsAt,
      reminderStage: 0,
      reminderSentAt: null,
      updatedAt: now,
    }).where(and(
      eq(accessLicensesTable.id, license.id),
      sql`(${accessLicensesTable.freeBenefitMonth} IS NULL OR ${accessLicensesTable.freeBenefitMonth} <> ${month})`,
    )).returning();

    if (!updated) throw new Error("MONTHLY_BENEFIT_ALREADY_USED");
    return updated;
  });
}

export async function grantPaidPassInTransaction(tx: any, tenantId: string) {
    const [license] = await tx.select().from(accessLicensesTable)
      .where(eq(accessLicensesTable.tenantId, tenantId))
      .for("update");
    if (!license) throw new Error("ACCESS_LICENSE_NOT_ENROLLED");

    const now = new Date();
    const start = license.accessEndsAt && license.accessEndsAt > now ? license.accessEndsAt : now;
    const endsAt = addAccessDays(start);
    const [updated] = await tx.update(accessLicensesTable).set({
      status: "active",
      accessEndsAt: endsAt,
      reminderStage: 0,
      reminderSentAt: null,
      updatedAt: now,
    }).where(eq(accessLicensesTable.id, license.id)).returning();
    return { license: updated!, startsAt: start, endsAt };
}

export async function grantPaidPass(tenantId: string) {
  return db.transaction((tx) => grantPaidPassInTransaction(tx, tenantId));
}
