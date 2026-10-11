/** UI-01.9 — financial relationships belong to a transaction, not user roles.
 * Presentation/planning only: NO payment, transfer, invoice or split is executed.
 * All amounts use integer minor units (BRL cents); backend authorization required.
 */
export type MoneyRole = "payer" | "seller" | "commission_recipient" | "intermediary" | "insurer";
export type ObligationStatus = "draft" | "approved" | "cancelled";
export interface FinancialBeneficiary {
  subjectId: string;
  role: MoneyRole;
  amountCents: number;
}
export interface FinancialArrangement {
  transactionId: string;
  currency: "BRL";
  totalCents: number;
  participants: readonly FinancialBeneficiary[];
  status: ObligationStatus;
}
/** Validates an allocation snapshot but NEVER authorizes or initiates a payment. */
export function validateFinancialArrangement(arrangement: FinancialArrangement): string[] {
  const errors: string[] = [];
  if (!arrangement.transactionId.trim()) errors.push("missing_transaction");
  if (!Number.isSafeInteger(arrangement.totalCents) || arrangement.totalCents < 0) errors.push("invalid_total");
  const ids = new Set<string>();
  let allocated = 0;
  for (const participant of arrangement.participants) {
    if (!participant.subjectId.trim()) errors.push("missing_subject");
    if (!Number.isSafeInteger(participant.amountCents) || participant.amountCents < 0) {
      errors.push("invalid_allocation");
      continue;
    }
    allocated += participant.amountCents;
    const key = participant.subjectId + ":" + participant.role;
    if (ids.has(key)) errors.push("duplicate_role_allocation");
    ids.add(key);
  }
  if (!Number.isSafeInteger(allocated) || allocated !== arrangement.totalCents) errors.push("allocation_mismatch");
  if (!arrangement.participants.some(item => item.role === "seller")) errors.push("missing_seller");
  return [...new Set(errors)];
}
/** A seller, broker or architect may have multiple positions in separate deals. */
export function amountsBySubject(arrangement: FinancialArrangement): Record<string, number> {
  const result: Record<string, number> = Object.create(null);
  for (const participant of arrangement.participants) {
    if (!Number.isSafeInteger(participant.amountCents) || participant.amountCents < 0) continue;
    result[participant.subjectId] = (result[participant.subjectId] ?? 0) + participant.amountCents;
  }
  return result;
}
