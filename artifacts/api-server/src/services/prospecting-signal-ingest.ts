import { eq, and } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";

function stableSignalKey(source: string, externalKey: string) {
  return `prospecting:${source}:${externalKey}`.slice(0, 220);
}

export async function upsertProspectingSignal(input: {
  tenantId: string;
  source: string;
  externalKey: string;
  category: string;
  title: string;
  detail: string;
  confidence: number;
  impact?: number;
  href?: string | null;
  evidence?: Record<string, unknown> | null;
  recommendedAction?: string | null;
}) {
  const signalKey = stableSignalKey(input.source, input.externalKey);
  const [existing] = await db
    .select({ id: jarvisCasesTable.id })
    .from(jarvisCasesTable)
    .where(and(
      eq(jarvisCasesTable.tenantId, input.tenantId),
      eq(jarvisCasesTable.signalKey, signalKey),
    ))
    .limit(1);

  const now = new Date();
  const values = {
    source: `prospecting:${input.source}`,
    category: input.category,
    severity: "opportunity",
    title: input.title,
    detail: input.detail,
    confidence: Math.min(Math.max(Math.round(input.confidence), 0), 100),
    impact: Math.min(Math.max(Math.round(input.impact ?? 60), 0), 100),
    href: input.href ?? null,
    evidence: input.evidence ?? null,
    recommendedAction: input.recommendedAction ?? "Pesquisar contexto, validar decisor e qualificar antes de abordar.",
    status: "open",
    lastDetectedAt: now,
    updatedAt: now,
  } as const;

  if (existing) {
    await db.update(jarvisCasesTable)
      .set(values)
      .where(eq(jarvisCasesTable.id, existing.id));
    return { created: false, id: existing.id, signalKey };
  }

  const [created] = await db.insert(jarvisCasesTable).values({
    tenantId: input.tenantId,
    signalKey,
    ...values,
    firstDetectedAt: now,
  }).returning({ id: jarvisCasesTable.id });

  return { created: true, id: created?.id ?? null, signalKey };
}
