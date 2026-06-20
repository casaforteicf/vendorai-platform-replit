/**
 * Lead deduplication utilities
 *
 * Provides normalization and lookup helpers used at all lead-creation
 * entry points (webhooks, intake, import, manual cadastro, agents).
 */

import { and, eq, ilike } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";

/** Strip everything but digits, then prepend DDI 55 if missing. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return "55" + digits;
}

/** Remove dots, dashes, slashes from CPF/CNPJ. */
export function normalizeDocument(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[.-\/]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

export type MatchResult =
  | { found: true; lead: typeof leadsTable.$inferSelect; matchBy: "telefone" | "documento" | "nome" }
  | { found: false; similar: typeof leadsTable.$inferSelect | null };

/**
 * Search for an existing lead in the same tenant by:
 * 1. normalized phone (most reliable for WhatsApp / messages)
 * 2. normalized document (CPF/CNPJ — unique when available)
 * 3. exact name (fallback — only returns "similar", never auto-merges)
 */
export async function findLeadByDedup(
  tenantId: string,
  rawPhone: string | null | undefined,
  rawDocument: string | null | undefined,
  rawName: string | null | undefined,
): Promise<MatchResult> {
  const phone = normalizePhone(rawPhone);
  const doc = normalizeDocument(rawDocument);
  const name = rawName?.trim() ?? null;

  // 1. Match by normalized phone
  if (phone) {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.telefone, phone)))
      .limit(1);
    if (lead) return { found: true, lead, matchBy: "telefone" };
  }

  // 2. Match by normalized document
  if (doc) {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.documento, doc)))
      .limit(1);
    if (lead) return { found: true, lead, matchBy: "documento" };
  }

  // 3. Name-only match — never auto-merge; return as similar
  if (name) {
    const [similar] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), ilike(leadsTable.nome, name)))
      .limit(1);
    if (similar) return { found: false, similar };
  }

  return { found: false, similar: null };
}

/**
 * Build a normalized phone for storage. Every phone stored in the DB
 * should pass through this function so the lookup above is consistent.
 */
export function storePhone(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
}

/**
 * Build a normalized document for storage.
 */
export function storeDocument(raw: string | null | undefined): string | null {
  return normalizeDocument(raw);
}
