/**
 * Política de agentes especializados por vertical.
 *
 * Regra: agentes genéricos são compartilhados entre verticais. Agentes com
 * especialização de domínio entram aqui e ficam "fail closed": só aparecem
 * quando a vertical efetiva corresponde explicitamente ao domínio permitido.
 *
 * Ao criar um novo agente vertical (ex.: oficina, clínica, seguros), adicione
 * a chave neste mapa. Isso evita que uma ferramenta especializada vaze para
 * tenants de outro segmento.
 */

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const SPECIALIZED_AGENT_DOMAINS: Record<string, string[]> = {
  farmacia: ["farmacia"],
};

function verticalDomains(vertical: string | null | undefined) {
  const normalized = normalize(vertical);
  const domains = new Set<string>();

  if (!normalized) return domains;
  if (normalized.includes("farmac")) domains.add("farmacia");

  return domains;
}

export function isAgentAllowedForVertical(
  agentKey: string,
  vertical: string | null | undefined,
) {
  const requiredDomains = SPECIALIZED_AGENT_DOMAINS[agentKey];
  if (!requiredDomains) return true;

  const domains = verticalDomains(vertical);
  return requiredDomains.some((domain) => domains.has(domain));
}

export const specializedAgentDomains = SPECIALIZED_AGENT_DOMAINS;
