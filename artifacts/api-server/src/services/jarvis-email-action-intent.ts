import { z } from "zod/v4";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

const emailIntentSchema = z.object({
  isEmailRequest: z.boolean(),
  leadQuery: z.string().trim().min(1).max(200).nullable(),
  subject: z.string().trim().min(1).max(240).nullable(),
  body: z.string().trim().min(1).max(8000).nullable(),
});

export type JarvisEmailIntent = z.infer<typeof emailIntentSchema>;

function looksLikeEmailRequest(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(email|e-mail)\b/.test(normalized)
    && /\b(envie|enviar|manda|mande|mandar|escreva|escrever|redija|redigir)\b/.test(normalized);
}

export async function parseJarvisEmailIntent(tenantId: string, text: string): Promise<JarvisEmailIntent | null> {
  if (!looksLikeEmailRequest(text)) return null;
  const openai = await getOpenAIForTenant(tenantId);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Você extrai pedidos de envio de e-mail do JARVIS/VendorAI.",
          "Retorne somente JSON válido com isEmailRequest, leadQuery, subject e body.",
          "leadQuery é nome, e-mail ou telefone da pessoa citada.",
          "Não invente destinatário. Se ele não estiver claro, leadQuery=null.",
          "Se o usuário fornecer a mensagem, preserve fielmente a intenção e os fatos; apenas organize a redação profissionalmente.",
          "Você pode criar um assunto curto e coerente quando o destinatário e a mensagem estiverem claros.",
          "Não invente preço, prazo, compromisso, desconto ou informação empresarial que não esteja no pedido.",
        ].join("\n"),
      },
      { role: "user", content: text },
    ],
    max_tokens: 1400,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return null;
  try {
    const parsed = emailIntentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function emailIntentMissingFields(intent: JarvisEmailIntent): string[] {
  const missing: string[] = [];
  if (!intent.leadQuery) missing.push("destinatário");
  if (!intent.subject) missing.push("assunto");
  if (!intent.body) missing.push("conteúdo");
  return missing;
}
