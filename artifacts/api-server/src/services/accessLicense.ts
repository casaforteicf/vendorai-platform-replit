import { and, eq, gt, sql } from "drizzle-orm";
import { accessLicensesTable, db } from "@workspace/db";
import {
  ACCESS_PASS_DAYS,
  ACCESS_PASS_HOURS,
  ACCESS_PASS_PRICE,
  addAccessDays,
  brazilMonthKey,
  hasActiveAccess as evaluateActiveAccess,
  nextAccessWindow,
} from "./accessLicenseCore.js";

export {
  ACCESS_PASS_DAYS,
  ACCESS_PASS_HOURS,
  ACCESS_PASS_PRICE,
  addAccessDays,
  brazilMonthKey,
} from "./accessLicenseCore.js";

export async function getAccessLicense(tenantId: string) {
  const [license] = await db.select().from(accessLicensesTable)
    .where(eq(accessLicensesTable.tenantId, tenantId));
  return license;
}

export function hasActiveAccess(license: Awaited<ReturnType<typeof getAccessLicense>>, now = new Date()) {
  return evaluateActiveAccess(license, now);
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
    const { startsAt: start, endsAt } = nextAccessWindow(license.accessEndsAt, now);

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
    const { startsAt: start, endsAt } = nextAccessWindow(license.accessEndsAt, now);
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
