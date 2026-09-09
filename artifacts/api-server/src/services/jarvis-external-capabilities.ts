import { and, eq, isNotNull } from "drizzle-orm";
import { db, agendasTable } from "@workspace/db";

export type JarvisCapabilityMode = "backend_execute" | "device_open" | "unavailable";

export type JarvisExternalCapability = {
  key: "calendar" | "email" | "spotify";
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
  ];
}
