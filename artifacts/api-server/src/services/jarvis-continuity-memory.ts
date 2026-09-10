import { and, eq } from "drizzle-orm";
import { db, jarvisContinuityTable } from "@workspace/db";

const MAX_SUBJECT = 180;
const MAX_USER_MESSAGE = 900;
const MAX_ASSISTANT_RESPONSE = 1400;
const MAX_ROUTE = 320;

function compact(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const SENSITIVE_PERSONAL_CONTEXT = /\b(senha|password|token secreto|chave privada|private key|numero do cartao|cvv|conta bancaria pessoal|diagnostico medico|doenca que tenho|minha religiao|sou (catolico|evangelico|judeu|muculmano)|minha orientacao sexual|minha vida sexual|meu partido politico|sou de (direita|esquerda)|antecedente criminal)\b/i;

export function isJarvisContinuityRecall(text: string): boolean {
  const value = normalize(text).replace(/[!?.,]/g, " ").replace(/\s+/g, " ").trim();
  return /^(continua|continue|retoma|retome)( de onde paramos| o assunto| aquilo)?$/.test(value)
    || /^(o que|sobre o que) (falamos|estavamos falando)( mesmo)?$/.test(value)
    || /^(qual era|lembra) (o assunto|o que falamos)( mesmo)?$/.test(value);
}

export function shouldPersistJarvisContinuity(text: string): boolean {
  const value = text.trim();
  if (value.length < 12) return false;
  if (SENSITIVE_PERSONAL_CONTEXT.test(normalize(value))) return false;
  if (isJarvisContinuityRecall(value)) return false;

  const normalized = normalize(value).replace(/\b(jarvis|jade)\b/g, "").replace(/[!,.?]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(bom dia|boa tarde|boa noite|oi|ola|opa|e ai|fala|salve)$/.test(normalized)) return false;
  return true;
}

export function deriveJarvisContinuitySubject(text: string): string {
  const cleaned = compact(text, MAX_SUBJECT);
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() ?? cleaned;
  return compact(firstSentence, MAX_SUBJECT);
}

export async function loadJarvisContinuityContext(tenantId: string, userId?: string | null): Promise<string> {
  if (!userId) return "";

  const rows = await db
    .select({
      subject: jarvisContinuityTable.subject,
      lastUserMessage: jarvisContinuityTable.lastUserMessage,
      lastAssistantResponse: jarvisContinuityTable.lastAssistantResponse,
      route: jarvisContinuityTable.route,
      conversationId: jarvisContinuityTable.conversationId,
      updatedAt: jarvisContinuityTable.updatedAt,
    })
    .from(jarvisContinuityTable)
    .where(and(
      eq(jarvisContinuityTable.tenantId, tenantId),
      eq(jarvisContinuityTable.userId, userId),
    ))
    .limit(1);

  const memory = rows[0];
  if (!memory) return "";

  return [
    "## Continuidade persistente do JARVIS",
    "Este bloco pertence exclusivamente ao usuário autenticado dentro deste tenant. Use-o para retomar contexto entre sessões; não trate como fato atual se dados operacionais mais novos o contradisserem.",
    `- assunto_recente=${compact(memory.subject, MAX_SUBJECT)}`,
    `- última_interação=${memory.updatedAt.toISOString()}`,
    memory.route ? `- rota_anterior=${compact(memory.route, MAX_ROUTE)}` : null,
    memory.conversationId ? `- conversa_anterior=${memory.conversationId}` : null,
    `- usuário_disse=${compact(memory.lastUserMessage, MAX_USER_MESSAGE)}`,
    memory.lastAssistantResponse ? `- jarvis_respondeu=${compact(memory.lastAssistantResponse, MAX_ASSISTANT_RESPONSE)}` : null,
    "Se a mensagem atual pedir para continuar/retomar, responda a partir deste assunto sem pedir ao usuário que repita o contexto, salvo quando houver ambiguidade real.",
  ].filter(Boolean).join("\n");
}

export async function saveJarvisContinuity(input: {
  tenantId: string;
  userId?: string | null;
  conversationId?: string | null;
  userMessage: string;
  assistantResponse: string;
  route?: string | null;
}): Promise<boolean> {
  const { tenantId, userId, conversationId, userMessage, assistantResponse, route } = input;
  if (!userId || !shouldPersistJarvisContinuity(userMessage)) return false;

  const values = {
    tenantId,
    userId,
    conversationId: conversationId ?? null,
    subject: deriveJarvisContinuitySubject(userMessage),
    lastUserMessage: compact(userMessage, MAX_USER_MESSAGE),
    lastAssistantResponse: compact(assistantResponse, MAX_ASSISTANT_RESPONSE) || null,
    route: route ? compact(route, MAX_ROUTE) : null,
    updatedAt: new Date(),
  };

  await db
    .insert(jarvisContinuityTable)
    .values(values)
    .onConflictDoUpdate({
      target: [jarvisContinuityTable.tenantId, jarvisContinuityTable.userId],
      set: values,
    });

  return true;
}
