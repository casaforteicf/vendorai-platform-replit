import { and, eq, inArray } from "drizzle-orm";
import { atrCommissionAllocationsTable, atrCommissionAdjustmentsTable, atrIdentityOriginsTable, atrOriginAgreementsTable, atrOriginAgreementCategoriesTable, db } from "@workspace/db";
import { calculateAtrOriginShareCents, resolveAtrOriginParticipation } from "./atr-origin-rules.js";

/** Must be called only after verifying a platform commission receipt is reconciled. */
export async function allocateAtrReceipt(input: {
  identityKind: "person"|"organization";
  identityId: string;
  sourceTenantId: string;
  sourceType: string;
  sourceId: string;
  receiptId: string;
  categoryCode: string;
  occurredAt: Date;
  platformNetReceivedCents: number;
  reconciliationConfirmed: boolean;
}) {
  if (!input.reconciliationConfirmed) throw new Error("ATR receipt not reconciled");
  if (!input.identityId || !input.receiptId || !input.sourceTenantId || !input.sourceId || !input.categoryCode) throw new Error("ATR missing reference");
  const [origin] = await db.select().from(atrIdentityOriginsTable).where(and(
    eq(atrIdentityOriginsTable.identityKind,input.identityKind),
    eq(atrIdentityOriginsTable.identityId,input.identityId))).limit(1);
  if (!origin) return null;

  const agreements = await db.select().from(atrOriginAgreementsTable)
    .where(eq(atrOriginAgreementsTable.originTenantId,origin.originTenantId));
  if (agreements.length === 0) return null;
  // Disabled partner overrides must reach the resolver; filtering enabled=true
  // would incorrectly fall back to a generic agreement. Scope the read to
  // agreements belonging to the origin instead of loading other tenants.
  const categories = await db.select().from(atrOriginAgreementCategoriesTable)
    .where(inArray(atrOriginAgreementCategoriesTable.agreementId, agreements.map(a => a.id)));
  const resolution = resolveAtrOriginParticipation({
    originTenantId:origin.originTenantId, originPartnerId:origin.originPartnerId,
    categoryCode:input.categoryCode, occurredAt:input.occurredAt,
    agreements:agreements.map(a=>({...a,effectiveFrom:a.effectiveFrom.toISOString(),effectiveUntil:a.effectiveUntil?.toISOString()??null})),
    categories:categories.map(c=>({...c,sharePercent:c.sharePercent})),
  });
  if (!resolution || resolution.sharePercent===0) return null;
  const amount=calculateAtrOriginShareCents(input.platformNetReceivedCents,resolution.sharePercent);
  const inserted=await db.insert(atrCommissionAllocationsTable).values({
    originId:origin.id,agreementId:resolution.agreementId,
    beneficiaryTenantId:origin.originTenantId,sourceTenantId:input.sourceTenantId,
    sourceType:input.sourceType,sourceId:input.sourceId,receiptId:input.receiptId,
    categoryCode:input.categoryCode,agreementVersion:resolution.agreementVersion,
    receivedPlatformCommissionCents:input.platformNetReceivedCents,
    sharePercent:String(resolution.sharePercent),allocatedCents:amount,
  }).onConflictDoNothing().returning();
  if (inserted[0]) return {allocation:inserted[0],idempotent:false};
  const [existing]=await db.select().from(atrCommissionAllocationsTable).where(and(
    eq(atrCommissionAllocationsTable.sourceTenantId,input.sourceTenantId),
    eq(atrCommissionAllocationsTable.receiptId,input.receiptId),
    eq(atrCommissionAllocationsTable.originId,origin.id),
    eq(atrCommissionAllocationsTable.agreementId,resolution.agreementId),
  )).limit(1);
  if (!existing) throw new Error("ATR conflict without allocation");
  if (existing.receivedPlatformCommissionCents!==input.platformNetReceivedCents ||
      Number(existing.sharePercent)!==resolution.sharePercent ||
      existing.allocatedCents!==amount ||
      existing.categoryCode!==input.categoryCode ||
      existing.sourceId!==input.sourceId ||
      existing.sourceType!==input.sourceType) throw new Error("ATR conflicting retry");
  return {allocation:existing,idempotent:true};
}

/** Adjustments never overwrite original allocations; negative amounts reverse accruals. */
export async function recordAtrAdjustment(input: {
 allocationId:string; type:"refund"|"chargeback"|"manual_correction";
 externalReference:string; deltaCents:number; reason:string;
}) {
 if (!input.allocationId?.trim() || !input.externalReference?.trim() ||
     !input.reason?.trim() || !Number.isSafeInteger(input.deltaCents) || input.deltaCents === 0 ||
     !["refund", "chargeback", "manual_correction"].includes(input.type)) {
   throw new Error("Invalid ATR adjustment");
 }
 if (input.type !== "manual_correction" && input.deltaCents > 0) throw new Error("Reversal must be negative");
 // Serialize adjustments on the allocation, including retries and concurrent reversals.
 return db.transaction(async tx => {
   const [allocation] = await tx.select().from(atrCommissionAllocationsTable)
     .where(eq(atrCommissionAllocationsTable.id, input.allocationId)).limit(1).for("update");
   if (!allocation) throw new Error("ATR allocation missing");
   const adjustments = await tx.select().from(atrCommissionAdjustmentsTable)
     .where(eq(atrCommissionAdjustmentsTable.allocationId, input.allocationId));
   const existing = adjustments.find(a => a.adjustmentType === input.type && a.externalReference === input.externalReference);
   if (existing) {
     if (existing.deltaCents !== input.deltaCents || existing.reason !== input.reason) throw new Error("ATR conflicting adjustment retry");
     return { adjustment: existing, idempotent: true };
   }
   if (!Number.isSafeInteger(allocation.allocatedCents) || adjustments.some(a => !Number.isSafeInteger(a.deltaCents))) {
     throw new Error("Invalid ATR adjustment balance");
   }
   const balance = adjustments.reduce((total, a) => total + BigInt(a.deltaCents), BigInt(allocation.allocatedCents));
   if (balance + BigInt(input.deltaCents) < 0n) throw new Error("ATR adjustment exceeds available allocation");
   const [result] = await tx.insert(atrCommissionAdjustmentsTable).values({
     allocationId: input.allocationId, adjustmentType: input.type, externalReference: input.externalReference,
     deltaCents: input.deltaCents, reason: input.reason,
   }).returning();
   if (!result) throw new Error("ATR adjustment insert missing");
   return { adjustment: result, idempotent: false };
 });
}
