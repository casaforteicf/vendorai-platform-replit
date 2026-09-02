function normalizeProfession(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/[ao]s?\b/g, "")
    .replace(/s\b/g, "");
}

export function professionMatches(leadProfession: unknown, configuredProfessions: unknown): boolean {
  if (typeof leadProfession !== "string" || !Array.isArray(configuredProfessions)) return false;
  const lead = normalizeProfession(leadProfession);
  if (!lead) return false;

  return configuredProfessions.some((value) => {
    if (typeof value !== "string") return false;
    const configured = normalizeProfession(value);
    return configured.length > 1 && (
      lead === configured ||
      lead.includes(configured) ||
      configured.includes(lead)
    );
  });
}
