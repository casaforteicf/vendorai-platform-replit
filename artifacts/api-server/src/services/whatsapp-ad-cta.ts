import { and, desc, eq } from "drizzle-orm";
import { db, businessProfilesTable, whatsappConnectionsTable } from "@workspace/db";
import type { AdCampaign } from "@workspace/db";

/**
 * Shared CTA for VendorAI ad campaigns that send clicks to WhatsApp.
 * The visitor must still review and send the prefilled message themselves.
 */
export async function resolveWhatsappAdCtaCopy(tenantId: string): Promise<string> {
  const [profile] = await db
    .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);
  const companyName = profile?.nomeFantasia?.trim() || profile?.razaoSocial?.trim();
  if (!companyName) {
    throw new Error("Cadastre o nome da empresa em Configurações → Perfil do Negócio.");
  }
  return `WhatsApp da ${companyName}: envie sua mensagem para autorizar o atendimento deste pedido.`;
}

export async function resolveWhatsappAdCtaUrl(
  tenantId: string,
  campaign: Pick<AdCampaign, "utmCode" | "itemLabel">,
): Promise<string> {
  const [connection] = await db
    .select({
      phone: whatsappConnectionsTable.displayPhoneNumber,
      status: whatsappConnectionsTable.status,
    })
    .from(whatsappConnectionsTable)
    .where(and(
      eq(whatsappConnectionsTable.tenantId, tenantId),
      eq(whatsappConnectionsTable.label, "ads_inbound"),
      eq(whatsappConnectionsTable.status, "active"),
    ))
    .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
    .limit(1);

  const phone = connection?.phone?.replace(/\D/g, "");
  if (!phone) {
    throw new Error("Defina em Configurações → WhatsApp um número ativo com a finalidade “Anúncios / entrada” antes de publicar.");
  }

  const [profile] = await db
    .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);
  const companyName = profile?.nomeFantasia?.trim() || profile?.razaoSocial?.trim();
  if (!companyName) {
    throw new Error("Cadastre o nome da empresa em Configurações → Perfil do Negócio para identificar o atendimento no WhatsApp.");
  }

  const subject = campaign.itemLabel?.trim() || "este anúncio";
  const source = campaign.utmCode ? ` (referência ${campaign.utmCode})` : "";
  const text = `Olá, vi o anúncio da ${companyName} sobre ${subject}${source}. Quero atendimento e acompanhamento deste pedido pelo WhatsApp.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
