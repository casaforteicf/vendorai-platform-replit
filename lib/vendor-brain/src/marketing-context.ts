import type { ContextSource } from "./engines/context-engine";
import type { BrainContext } from "./types";
import type { MarketingAgentRuntimeContext } from "./marketing-agent";

export interface MarketingPageContext {
  verticalId?: string | null;
  page?: string | null;
  campaignId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  objective?: string | null;
  audience?: string | null;
  productId?: string | null;
}

export class MarketingPageContextSource implements ContextSource {
  name = "marketing-page-context";
  priority = 9;

  constructor(private readonly getCurrent: (tenantId: string, userId: string) => MarketingPageContext | null) {}

  provide(tenantId: string, userId: string): Partial<BrainContext> {
    const current = this.getCurrent(tenantId, userId);
    if (!current) return {};

    return {
      vertical: current.verticalId ?? undefined,
      workspace: current.page ? `marketing:${current.page}` : undefined,
    };
  }
}

export function toMarketingAgentRuntimeContext(
  tenantId: string,
  userId: string | null | undefined,
  pageContext: MarketingPageContext,
): MarketingAgentRuntimeContext {
  return {
    tenantId,
    userId: userId ?? null,
    verticalId: pageContext.verticalId ?? null,
    page: pageContext.page ?? null,
    campaignId: pageContext.campaignId ?? null,
    entityType: pageContext.entityType ?? null,
    entityId: pageContext.entityId ?? null,
    objective: pageContext.objective ?? null,
    audience: pageContext.audience ?? null,
    productId: pageContext.productId ?? null,
  };
}
