/**
 * UI-01 — Contextual experience catalog.
 *
 * This catalog is presentation metadata ONLY. Never use it to authorize API,
 * storage or database access: server-side policy remains authoritative.
 * No existing navigation is replaced until a separately homologated rollout.
 */
export type ExperienceKey =
  | "consumer" | "professional" | "commerce" | "business" | "execution" | "finance";
export type ContextKind = "personal" | "organization" | "project";
export type MembershipRole =
  | "customer" | "co_owner" | "architect" | "engineer" | "designer"
  | "broker" | "supplier" | "sales" | "manager" | "field" | "tenant_admin" | "member";

export interface ExperienceContext {
  id: string;
  kind: ContextKind;
  label: string;
  tenantId?: string;
  projectId?: string;
  roles: readonly MembershipRole[];
  enabledExperiences: readonly ExperienceKey[];
}

export interface ExperienceDefinition {
  key: ExperienceKey;
  title: string;
  description: string;
  entryPath: string;
  contexts: readonly ContextKind[];
}

export const EXPERIENCE_CATALOG: readonly ExperienceDefinition[] = [
  { key: "consumer", title: "Minha Jornada", description: "Projetos, compras e acompanhamento", entryPath: "/portal", contexts: ["personal", "project"] },
  { key: "professional", title: "Arqdor Studio", description: "Projetos técnicos e colaboração", entryPath: "/arch", contexts: ["personal", "organization", "project"] },
  { key: "commerce", title: "Marketplace", description: "Produtos, serviços e propostas", entryPath: "/marketplace", contexts: ["personal", "organization", "project"] },
  { key: "business", title: "Gestão", description: "CRM e operação empresarial", entryPath: "/dashboard", contexts: ["organization"] },
  { key: "execution", title: "Execução", description: "Obras, serviços e assistência", entryPath: "/pipeline-operacional", contexts: ["organization", "project"] },
  { key: "finance", title: "Financeiro", description: "Comissões e pagamentos autorizados", entryPath: "/admin/financeiro", contexts: ["organization"] },
] as const;

/** Prevents duplicate or cross-context entries in the presentation catalog. */
export function visibleExperiences(context: ExperienceContext): ExperienceDefinition[] {
  const keys = new Set(context.enabledExperiences);
  return EXPERIENCE_CATALOG.filter(item =>
    keys.has(item.key) && item.contexts.includes(context.kind)
  );
}

/**
 * Non-authoritative context switch guard for UI presentation.
 * An active tenant/project must match the chosen context; on the backend,
 * every operation MUST independently re-check user membership and scope.
 */
export function canPresentContext(
  context: ExperienceContext,
  scope: { tenantId?: string; projectId?: string },
): boolean {
  if (!context.id || !context.label || context.roles.length === 0) return false;
  if (context.kind === "organization") {
    return !!context.tenantId && context.tenantId === scope.tenantId;
  }
  if (context.kind === "project") {
    return !!context.projectId && context.projectId === scope.projectId
      && (!context.tenantId || context.tenantId === scope.tenantId);
  }
  return !context.tenantId && !context.projectId;
}

/** Financial positions are scoped to a transaction, NEVER inferred from a user's role. */
export type FinancialPosition = "payer" | "payee" | "commission_recipient" | "intermediary";
export interface TransactionParticipant {
  subjectId: string;
  transactionId: string;
  positions: readonly FinancialPosition[];
}
