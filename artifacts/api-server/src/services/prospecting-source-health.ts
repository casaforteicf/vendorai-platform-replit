import { listProspectingSources } from "./prospecting-source-catalog.js";

export type ProspectingSourceHealth = {
  id: string;
  label: string;
  status: "operational" | "missing_configuration" | "connector_required" | "planned";
  configured: boolean;
  detail: string;
};

function envConfigured(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getProspectingSourceHealth(): ProspectingSourceHealth[] {
  return listProspectingSources().map((source) => {
    if (source.status === "connector_required") {
      return {
        id: source.id,
        label: source.label,
        status: "connector_required" as const,
        configured: false,
        detail: "Adaptador específico ainda não implementado para esta fonte.",
      };
    }

    if (source.status === "planned") {
      return {
        id: source.id,
        label: source.label,
        status: "planned" as const,
        configured: false,
        detail: "Fonte planejada, ainda não executável.",
      };
    }

    const missing = source.requirements.filter((requirement) => /^[A-Z0-9_]+$/.test(requirement) && !envConfigured(requirement));
    if (missing.length) {
      return {
        id: source.id,
        label: source.label,
        status: "missing_configuration" as const,
        configured: false,
        detail: `Configuração ausente: ${missing.join(", ")}`,
      };
    }

    return {
      id: source.id,
      label: source.label,
      status: "operational" as const,
      configured: true,
      detail: source.requirements.length ? "Credenciais/configuração disponíveis." : "Sem credencial externa obrigatória.",
    };
  });
}

export function summarizeProspectingSourceHealth() {
  const sources = getProspectingSourceHealth();
  return {
    sources,
    total: sources.length,
    operational: sources.filter((item) => item.status === "operational").length,
    missingConfiguration: sources.filter((item) => item.status === "missing_configuration").length,
    connectorRequired: sources.filter((item) => item.status === "connector_required").length,
    planned: sources.filter((item) => item.status === "planned").length,
  };
}
