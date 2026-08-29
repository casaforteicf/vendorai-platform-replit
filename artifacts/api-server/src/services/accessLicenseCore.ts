export const ACCESS_PASS_DAYS = 5;
export const ACCESS_PASS_HOURS = 120;
export const ACCESS_PASS_PRICE = 399;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessLicenseSnapshot = {
  mode: "prepaid" | "annual" | "legacy";
  accessEndsAt: Date | null;
  annualEndsAt: Date | null;
};

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
  return new Date(date.getTime() + days * DAY_MS);
}

export function nextAccessWindow(accessEndsAt: Date | null | undefined, now = new Date(), days = ACCESS_PASS_DAYS) {
  const startsAt = accessEndsAt && accessEndsAt > now ? accessEndsAt : now;
  return { startsAt, endsAt: addAccessDays(startsAt, days) };
}

export function hasActiveAccess(license: AccessLicenseSnapshot | null | undefined, now = new Date()) {
  if (!license) return true;
  if (license.mode === "legacy") return true;
  if (license.mode === "annual" && license.annualEndsAt && license.annualEndsAt > now) return true;
  return Boolean(license.accessEndsAt && license.accessEndsAt > now);
}
