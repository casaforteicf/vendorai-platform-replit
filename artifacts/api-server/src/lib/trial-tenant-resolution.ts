export type TrialClientTenantResolution = {
  tenantId: string | null;
  fromTrial: boolean;
  valid: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/**
 * Resolve qual tenant do CLIENTE deve receber o plano ao fechar um deal.
 *
 * Em deals normais, mantém o tenant do próprio deal. Em trials VendorAI, o
 * deal pertence ao tenant vendedor e por isso o único destino aceitável é o
 * `trialTenantId` persistido no lead. Se essa referência faltar, falha seguro:
 * nunca faz fallback para o tenant vendedor.
 */
export function resolveClientTenantForDeal(input: {
  dealTenantId: string | null | undefined;
  leadSource: string | null | undefined;
  discoveryData: unknown;
}): TrialClientTenantResolution {
  if (input.leadSource !== "trial_signup") {
    return {
      tenantId: input.dealTenantId ?? null,
      fromTrial: false,
      valid: true,
    };
  }

  const candidate = asRecord(input.discoveryData)["trialTenantId"];
  if (typeof candidate !== "string" || !candidate.trim()) {
    return { tenantId: null, fromTrial: true, valid: false };
  }

  return { tenantId: candidate.trim(), fromTrial: true, valid: true };
}
