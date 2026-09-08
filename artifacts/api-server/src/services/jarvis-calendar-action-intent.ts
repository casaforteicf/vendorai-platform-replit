import { z } from "zod/v4";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

const parsedCalendarSchema = z.object({
  isSchedulingRequest: z.boolean(),
  leadQuery: z.string().trim().min(1).max(200).nullable(),
  title: z.string().trim().min(1).max(240).nullable(),
  startIso: z.string().datetime({ offset: true }).nullable(),
  endIso: z.string().datetime({ offset: true }).nullable(),
  modality: z.enum(["meet", "presencial", "ligacao"]).nullable(),
  location: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export type JarvisCalendarIntent = z.infer<typeof parsedCalendarSchema>;

function looksLikeSchedulingRequest(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(agende|agendar|agenda|marque|marcar|marca|crie|criar)\b/.test(normalized)
    && /\b(reuniao|visita|consulta|ligacao|meet|compromisso|horario)\b/.test(normalized);
}

export async function parseJarvisCalendarIntent(
  tenantId: string,
  text: string,
  now = new Date(),
): Promise<JarvisCalendarIntent | null> {
  if (!looksLikeSchedulingRequest(text)) return null;

  const openai = await getOpenAIForTenant(tenantId);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Você extrai pedidos de agendamento do JARVIS/VendorAI.",
          "Retorne apenas JSON válido, sem markdown.",
          `Agora é ${now.toISOString()}. Interprete datas relativas no fuso America/Sao_Paulo e devolva ISO 8601 com offset -03:00 quando aplicável.`,
          "Não invente pessoa, data ou horário ausente.",
          "Se houver horário inicial mas nenhuma duração, use 60 minutos para reunião/visita/consulta e 30 minutos para ligação.",
          "modality deve ser meet, presencial ou ligacao. Se o usuário disser reunião sem modalidade, use meet.",
          "leadQuery é o nome, email ou telefone da pessoa citada; não inclua palavras como cliente/com/com o.",
          "Campos: isSchedulingRequest, leadQuery, title, startIso, endIso, modality, location, notes.",
        ].join("\n"),
      },
      { role: "user", content: text },
    ],
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    const parsed = parsedCalendarSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function calendarIntentMissingFields(intent: JarvisCalendarIntent): string[] {
  const missing: string[] = [];
  if (!intent.leadQuery) missing.push("pessoa/cliente");
  if (!intent.startIso) missing.push("data e horário");
  if (!intent.endIso) missing.push("horário final/duração");
  return missing;
}
