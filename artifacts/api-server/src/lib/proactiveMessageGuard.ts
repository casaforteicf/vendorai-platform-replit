/**
 * Guardas compartilhadas pra qualquer envio PROATIVO de mensagem (campanhas
 * de reativação, follow-up automático, Revenue Scout). Duas responsabilidades:
 *
 * 1. isWithinBusinessHours — nunca dispara mensagem espontânea fora do
 *    horário comercial do tenant. Isso NÃO se aplica a respostas: um cliente
 *    que chamou o agente deve ser respondido a qualquer hora — só o disparo
 *    que o sistema inicia sozinho é bloqueado aqui.
 *
 * 2. renderTemplate — substitui placeholders (aceita {nome}, {{nome}} e
 *    variações de maiúscula/minúscula) e, criticamente, RECUSA enviar se
 *    sobrar qualquer coisa entre chaves depois da substituição — em vez de
 *    mandar um template quebrado pro cliente (ex: "Olá {Marcos Marido
 *    Amado}," saindo literal por um placeholder mal escrito na regra).
 */

export interface Tenant {
  horarioComercialInicio: number;
  horarioComercialFim: number;
}

const TENANT_TIMEZONE = "America/Sao_Paulo";

export function isWithinBusinessHours(tenant: Tenant, now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TENANT_TIMEZONE,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";

  if (weekday === "Sun") return false;
  return hour >= tenant.horarioComercialInicio && hour < tenant.horarioComercialFim;
}

export interface TemplateRenderResult {
  ok: boolean;
  mensagem: string;
  motivoFalha?: string;
}

export function renderTemplate(template: string, values: Record<string, string>): TemplateRenderResult {
  let mensagem = template;
  for (const [key, value] of Object.entries(values)) {
    const patterns = [
      new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"),
      new RegExp(`\\{\\s*${key}\\s*\\}`, "gi"),
    ];
    for (const pattern of patterns) {
      mensagem = mensagem.replace(pattern, value);
    }
  }

  // Sobrou algo tipo {qualquercoisa}? O template tinha um placeholder que a
  // gente não sabia preencher (ou o texto foi escrito errado, colando um
  // valor real dentro de chaves em vez de usar {nome}) — não manda.
  const leftoverMatch = mensagem.match(/\{[^{}]*\}/);
  if (leftoverMatch) {
    return {
      ok: false,
      mensagem,
      motivoFalha: `Template com placeholder não resolvido: "${leftoverMatch[0]}"`,
    };
  }

  return { ok: true, mensagem };
}

// Versão auto-contida (faz a própria consulta) pra usar em loops de job que
// já iteram tenants mas não selecionaram os campos de horário — evita ter
// que alterar cada SELECT existente só pra essa checagem.
export async function tenantIsWithinBusinessHours(tenantId: string): Promise<boolean> {
  const { db, tenantsTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const [tenant] = await db
    .select({ horarioComercialInicio: tenantsTable.horarioComercialInicio, horarioComercialFim: tenantsTable.horarioComercialFim })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return false;
  return isWithinBusinessHours(tenant);
}
