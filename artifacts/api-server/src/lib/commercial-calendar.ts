import type { CommercialDate } from "@workspace/db";

export const DEFAULT_COMMERCIAL_DATES: CommercialDate[] = [
  { name: "Ano Novo", active: true, daysBeforeToSend: 2, month: 1, day: 1 },
  { name: "Carnaval", active: false, daysBeforeToSend: 3, movableDate: true },
  { name: "Dia do Consumidor", active: true, daysBeforeToSend: 2, month: 3, day: 15 },
  { name: "Páscoa", active: true, daysBeforeToSend: 3, movableDate: true },
  { name: "Dia das Mães", active: true, daysBeforeToSend: 3, movableDate: true, targetGender: "feminino" },
  { name: "Dia dos Namorados", active: true, daysBeforeToSend: 3, month: 6, day: 12 },
  { name: "Dia dos Pais", active: true, daysBeforeToSend: 3, movableDate: true, targetGender: "masculino" },
  { name: "Dia do Cliente", active: true, daysBeforeToSend: 2, month: 9, day: 15 },
  { name: "Dia das Crianças", active: true, daysBeforeToSend: 3, month: 10, day: 12 },
  { name: "Black Friday", active: true, daysBeforeToSend: 2, movableDate: true },
  { name: "Natal", active: true, daysBeforeToSend: 5, month: 12, day: 25 },
];

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Preserves tenant choices while ensuring the master relationship calendar
 * is always present for old and new tenants.
 */
export function mergeCommercialDates(
  configuredDates: CommercialDate[] | null | undefined,
): CommercialDate[] {
  const configured = Array.isArray(configuredDates) ? configuredDates : [];
  const byName = new Map(configured.map((item) => [normalizeName(item.name), item]));

  const merged = DEFAULT_COMMERCIAL_DATES.map((master) => {
    const existing = byName.get(normalizeName(master.name));
    return existing ? { ...master, ...existing, name: master.name } : { ...master };
  });

  const masterNames = new Set(DEFAULT_COMMERCIAL_DATES.map((item) => normalizeName(item.name)));
  for (const custom of configured) {
    if (!masterNames.has(normalizeName(custom.name))) merged.push(custom);
  }

  return merged;
}
