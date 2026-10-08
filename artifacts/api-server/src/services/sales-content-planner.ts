import { and, eq } from "drizzle-orm";
import { contentLibraryTable, db, type Prospect } from "@workspace/db";
import { resolveColdProspectingConfig } from "./cold-prospecting-config.js";

export type SalesContentContext = {
  segment?: string | null;
  persona?: string | null;
  pains?: string[];
  objective?: string | null;
  channel?: string | null;
};

export type SalesContentPlan = {
  action: "reuse" | "generate";
  selectedAssetId?: string;
  reason: string;
  generationBrief?: {
    product: "vendorai" | "arqdor";
    segment?: string | null;
    persona?: string | null;
    pains: string[];
    prospectStage: string;
    objective: string;
    channel: string;
    titleDirection: string;
    factPolicy: "approved_sources_only";
    brandPolicy: "tenant_brand_kit";
    saveToLibrary: true;
    approvalRequired: true;
  };
};

function overlapScore(target: string[], source: string[]): number {
  if (!target.length || !source.length) return 0;
  const normalized = new Set(source.map((v) => v.trim().toLowerCase()));
  return target.reduce((score, v) => score + (normalized.has(v.trim().toLowerCase()) ? 1 : 0), 0);
}

export async function planSalesContent(input: {
  tenantId: string;
  prospect: Prospect;
  context: SalesContentContext;
}): Promise<SalesContentPlan> {
  const { tenantId, prospect, context } = input;
  const runtime = await resolveColdProspectingConfig(tenantId);
  const requestedProduct: "vendorai" | "arqdor" =
    prospect.primaryHook === "arqdor" ? "arqdor" : "vendorai";
  const primaryProduct: "vendorai" | "arqdor" =
    runtime.allowedSolutions.includes(requestedProduct)
      ? requestedProduct
      : runtime.allowedSolutions[0] ?? "vendorai";

  if (runtime.mode === "off") {
    return {
      action: "generate",
      reason: "A prospecção fria está desativada para este tenant. O material pode ser preparado, mas não deve ser enviado automaticamente.",
      generationBrief: {
        product: primaryProduct,
        segment: context.segment,
        persona: context.persona,
        pains: context.pains ?? [],
        prospectStage: prospect.stage,
        objective: context.objective || prospect.currentObjective || "preparar material para revisão",
        channel: runtime.allowedChannels.includes((context.channel ?? "") as any)
          ? (context.channel ?? "whatsapp")
          : runtime.allowedChannels[0] ?? "whatsapp",
        titleDirection: "Preparar conteúdo comercial contextual para revisão, sem envio automático",
        factPolicy: "approved_sources_only",
        brandPolicy: "tenant_brand_kit",
        saveToLibrary: true,
        approvalRequired: true,
      },
    };
  }

  const items = await db
    .select()
    .from(contentLibraryTable)
    .where(and(
      eq(contentLibraryTable.tenantId, tenantId),
      eq(contentLibraryTable.commercialUse, true),
      eq(contentLibraryTable.approvalStatus, "approved"),
    ));

  const now = new Date();
  const eligible = items.filter((item) => {
    if (item.validFrom && item.validFrom > now) return false;
    if (item.validUntil && item.validUntil < now) return false;
    if (item.products.length && !item.products.includes(primaryProduct)) return false;
    return true;
  });

  const ranked = eligible
    .map((item) => {
      let score = 0;
      if (item.products.includes(primaryProduct)) score += 6;
      if (context.segment && item.segments.map((v) => v.toLowerCase()).includes(context.segment.toLowerCase())) score += 4;
      if (context.persona && item.personas.map((v) => v.toLowerCase()).includes(context.persona.toLowerCase())) score += 4;
      score += overlapScore(context.pains ?? [], item.pains) * 3;
      if (item.prospectStages.includes(prospect.stage)) score += 3;
      if (context.objective && item.objectives.map((v) => v.toLowerCase()).includes(context.objective.toLowerCase())) score += 2;
      if (context.channel && item.channels.map((v) => v.toLowerCase()).includes(context.channel.toLowerCase())) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score >= 8) {
    return {
      action: "reuse",
      selectedAssetId: best.item.id,
      reason: `Material aprovado encontrado com aderência suficiente (score interno ${best.score}).`,
    };
  }

  const pains = context.pains?.length
    ? context.pains
    : prospect.qualification?.confirmedPains ?? prospect.qualification?.inferredPains ?? [];

  const objective = context.objective || prospect.currentObjective || "gerar interesse para avançar a conversa";
  const requestedChannel = context.channel || runtime.allowedChannels[0] || "whatsapp";
  const channel = runtime.allowedChannels.includes(requestedChannel as any)
    ? requestedChannel
    : runtime.allowedChannels[0] || "whatsapp";

  return {
    action: "generate",
    reason: "Nenhum material aprovado na Biblioteca Comercial atende suficientemente ao contexto atual.",
    generationBrief: {
      product: primaryProduct,
      segment: context.segment,
      persona: context.persona,
      pains,
      prospectStage: prospect.stage,
      objective,
      channel,
      titleDirection: primaryProduct === "arqdor"
        ? "Mostrar a aplicação prática do Arqdor na dor confirmada, sem apresentação genérica de funcionalidades"
        : "Mostrar a aplicação prática do Vendor.ai na dor confirmada, sem apresentação genérica de funcionalidades",
      factPolicy: "approved_sources_only",
      brandPolicy: "tenant_brand_kit",
      saveToLibrary: true,
      approvalRequired: true,
    },
  };
}
