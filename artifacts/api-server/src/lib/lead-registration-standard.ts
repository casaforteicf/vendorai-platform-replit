export const LEAD_REGISTRATION_STANDARD_VERSION = "2026-10";

export type LeadEntryChannel =
  | "manual"
  | "whatsapp"
  | "instagram"
  | "email"
  | "site"
  | "importacao"
  | "prospeccao"
  | "parceiro"
  | "ia"
  | "outro";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Marca qualquer porta de entrada com o mesmo contrato de cadastro do CRM.
 * Mantemos o source detalhado (ex.: instagram_comment, construction_radar)
 * para não perder atribuição, enquanto entryChannel informa a família canônica.
 */
export function leadRegistrationMetadata(
  existing: unknown,
  input: {
    entryChannel: LeadEntryChannel;
    entrySource: string;
    capturedAt?: string;
    details?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const current = asRecord(existing);
  const currentRegistration = asRecord(current["leadRegistration"]);
  return {
    ...current,
    leadRegistration: {
      ...currentRegistration,
      version: LEAD_REGISTRATION_STANDARD_VERSION,
      entryChannel: input.entryChannel,
      entrySource: input.entrySource,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      ...(input.details ?? {}),
    },
  };
}

export function normalizeLeadEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("pt-BR");
  return normalized || null;
}

export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().replace(/^@/, "").split(/[/?#]/)[0]?.trim();
  return normalized || null;
}

export function normalizeLeadName(value: string | null | undefined, fallback: string): string {
  return String(value ?? "").trim() || fallback;
}
