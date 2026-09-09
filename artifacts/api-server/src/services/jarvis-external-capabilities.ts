import { and, eq, isNotNull } from "drizzle-orm";
import { db, agendasTable } from "@workspace/db";

export type JarvisCapabilityMode = "backend_execute" | "device_open" | "unavailable";

export type JarvisExternalCapability = {
  key: "calendar" | "email" | "spotify" | "phone" | "whatsapp_open" | "maps" | "vendorai_navigation";
  label: string;
  mode: JarvisCapabilityMode;
  available: boolean;
  approvalRequired: boolean;
  provider: string;
  executionClaim: string;
  limitation: string | null;
};

export async function loadJarvisExternalCapabilities(tenantId: string): Promise<JarvisExternalCapability[]> {
  const [connectedAgenda] = await db
    .select({ id: agendasTable.id })
    .from(agendasTable)
    .where(and(eq(agendasTable.tenantId, tenantId), isNotNull(agendasTable.googleRefreshToken)))
    .limit(1);

  const calendarAvailable = Boolean(connectedAgenda);
  const emailAvailable = Boolean(process.env.RESEND_API_KEY?.trim());

  return [
    {
      key: "calendar",
      label: "Google Calendar / Meet",
      mode: calendarAvailable ? "backend_execute" : "unavailable",
      available: calendarAvailable,
      approvalRequired: true,
      provider: "Google Calendar",
      executionClaim: calendarAvailable
        ? "Posso criar o compromisso real depois da aprovação e informar o resultado retornado pela integração."
        : "Não posso afirmar que criei um evento Google enquanto não houver agenda conectada.",
      limitation: calendarAvailable ? null : "Nenhuma agenda Google conectada neste tenant.",
    },
    {
      key: "email",
      label: "E-mail",
      mode: emailAvailable ? "backend_execute" : "unavailable",
      available: emailAvailable,
      approvalRequired: true,
      provider: "Resend",
      executionClaim: emailAvailable
        ? "Posso enviar e-mail real depois da aprovação e só afirmar sucesso com ID retornado pelo Resend."
        : "Não posso afirmar que enviei e-mail sem o provedor configurado.",
      limitation: emailAvailable ? null : "RESEND_API_KEY não configurada no backend.",
    },
    {
      key: "spotify",
      label: "Spotify",
      mode: "device_open",
      available: true,
      approvalRequired: false,
      provider: "Spotify app/web",
      executionClaim: "Posso abrir uma busca no Spotify no dispositivo que está usando o JARVIS.",
      limitation: "Sem Spotify Connect/OAuth, abrir o Spotify não confirma que a faixa começou a tocar.",
    },
    {
      key: "phone",
      label: "Ligação telefônica",
      mode: "device_open",
      available: true,
      approvalRequired: false,
      provider: "Discador do dispositivo",
      executionClaim: "Posso abrir o discador com o telefone de um contato do próprio tenant.",
      limitation: "Abrir o discador não confirma que a ligação foi realizada ou atendida.",
    },
    {
      key: "whatsapp_open",
      label: "Abrir conversa no WhatsApp",
      mode: "device_open",
      available: true,
      approvalRequired: false,
      provider: "WhatsApp app/web",
      executionClaim: "Posso abrir a conversa de um contato do tenant no WhatsApp.",
      limitation: "Esta capacidade apenas abre a conversa; envio de mensagem continua sujeito ao fluxo de ação/aprovação do VendorAI.",
    },
    {
      key: "maps",
      label: "Mapa e rota",
      mode: "device_open",
      available: true,
      approvalRequired: false,
      provider: "Mapas do dispositivo / Google Maps",
      executionClaim: "Posso abrir uma rota para o endereço cadastrado de um contato do tenant.",
      limitation: "A rota depende do endereço cadastrado e do aplicativo de mapas disponível no dispositivo.",
    },
    {
      key: "vendorai_navigation",
      label: "Navegação no VendorAI",
      mode: "device_open",
      available: true,
      approvalRequired: false,
      provider: "VendorAI app/web",
      executionClaim: "Posso abrir áreas conhecidas do VendorAI por comando natural.",
      limitation: "A navegação respeita autenticação, tenant e permissões já aplicadas pela plataforma.",
    },
  ];
}
