import type { ProfessionalDate } from "@workspace/db";
import { DEFAULT_PROFESSIONAL_DATES } from "./professional-calendar.js";
import { professionMatches } from "./professional-date.js";

function normalizeDateName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function publicProfessionalDate(item: (typeof DEFAULT_PROFESSIONAL_DATES)[number]): ProfessionalDate {
  return {
    name: item.name,
    active: item.active,
    month: item.month,
    day: item.day,
    professions: [...item.professions],
  };
}

function findMasterDate(name: string) {
  const normalized = normalizeDateName(name);
  return DEFAULT_PROFESSIONAL_DATES.find((master) =>
    [master.name, ...(master.aliases ?? [])]
      .map(normalizeDateName)
      .includes(normalized),
  );
}

/**
 * Corrige somente as datas que já fazem parte da configuração do tenant.
 * Não injeta o catálogo inteiro no banco.
 */
export function canonicalizeProfessionalDates(
  configuredDates: ProfessionalDate[] | null | undefined,
): ProfessionalDate[] {
  const configured = Array.isArray(configuredDates) ? configuredDates : [];
  const result: ProfessionalDate[] = [];
  const seen = new Set<string>();

  for (const configuredDate of configured) {
    if (!configuredDate || typeof configuredDate.name !== "string") continue;

    const master = findMasterDate(configuredDate.name);
    const canonical = master
      ? { ...publicProfessionalDate(master), active: configuredDate.active }
      : configuredDate;
    const key = normalizeDateName(canonical.name);

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }

  return result.sort((a, b) =>
    a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, "pt-BR"),
  );
}

/**
 * Monta a lista exibida em Configurações sem despejar centenas de cards.
 * Além do que já foi configurado, mostra apenas datas do catálogo que tenham
 * correspondência com profissões atualmente encontradas nos cards de leads.
 * As sugestões novas sempre entram desativadas.
 */
export function buildRelevantProfessionalDates(
  configuredDates: ProfessionalDate[] | null | undefined,
  leadProfessions: Array<string | null | undefined>,
): ProfessionalDate[] {
  const result = canonicalizeProfessionalDates(configuredDates);
  const seen = new Set(result.map((item) => normalizeDateName(item.name)));
  const professions = leadProfessions.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  for (const master of DEFAULT_PROFESSIONAL_DATES) {
    const key = normalizeDateName(master.name);
    if (seen.has(key)) continue;

    if (professions.some((profession) => professionMatches(profession, master.professions))) {
      result.push(publicProfessionalDate(master));
      seen.add(key);
    }
  }

  return result.sort((a, b) =>
    a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, "pt-BR"),
  );
}
