/**
 * UI-01.7 — Public preproject entry and handoff metadata.
 * These are navigation hints, NOT identities, invitations or access grants.
 * A project can only be claimed by a logged-in account after a separately
 * authenticated server-side ownership challenge.
 */
export interface PublicPreprojectLink {
  slug: string;
  headline: string;
  tenantName: string;
  marketEnabled: boolean;
}
export type PreprojectJourneyStage =
  | "public_entry" | "guest_draft" | "account_link_pending" | "account_linked"
  | "professional_studio" | "quotations" | "execution" | "aftercare";

export function normalizePublicPreprojectLink(raw: unknown): PublicPreprojectLink | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const slug = item.slug;
  if (typeof slug !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(slug)) return null;
  if (typeof item.headline !== "string" || typeof item.tenantName !== "string") return null;
  return {
    slug, headline: item.headline.trim().slice(0, 180),
    tenantName: item.tenantName.trim().slice(0, 120),
    marketEnabled: item.marketEnabled === true,
  };
}

/** Public paths are limited to the established /projeto/:slug route. */
export function publicPreprojectPath(slug: string): string | null {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(slug)) return null;
  return `/projeto/${encodeURIComponent(slug)}`;
}

export function preprojectNextAction(stage: PreprojectJourneyStage): {
  title: string;
  requiresVerifiedSession: boolean;
} {
  switch (stage) {
    case "public_entry": return { title: "Começar pré-projeto", requiresVerifiedSession: false };
    case "guest_draft": return { title: "Salvar e vincular à minha conta", requiresVerifiedSession: true };
    case "account_link_pending": return { title: "Concluir verificação de titularidade", requiresVerifiedSession: true };
    case "account_linked": return { title: "Continuar meu projeto", requiresVerifiedSession: true };
    case "professional_studio": return { title: "Abrir ferramentas profissionais", requiresVerifiedSession: true };
    case "quotations": return { title: "Solicitar orçamentos", requiresVerifiedSession: true };
    case "execution": return { title: "Acompanhar execução", requiresVerifiedSession: true };
    case "aftercare": return { title: "Avaliar ou solicitar assistência", requiresVerifiedSession: true };
  }
}
