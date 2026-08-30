/**
 * Gera um calendário de conteúdo a partir de um Plano de Mídia já gerado --
 * pega os pilares de conteúdo e os canais recomendados e distribui posts
 * ao longo de N semanas, com tema específico por post (não genérico tipo
 * "post sobre o pilar X" -- a IA propõe um ângulo concreto pra cada data).
 *
 * A peça que faltava pra ligar o Plano de Mídia (estratégia) às
 * ferramentas que já existiam soltas: gerar legenda+criativo
 * (/content/generate, já usa o perfil da marca automaticamente),
 * publicar (/content/:id/publish-instagram) e revisar performance
 * (content-performance.ts).
 */
import { db, mediaPlansTable, contentCalendarItemsTable, type ContentCalendarTipo } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const SYSTEM_PROMPT = `Você é um planejador de conteúdo para redes sociais de pequenas e médias empresas brasileiras.
Recebe os pilares de conteúdo e canais de um plano de mídia já definido, e monta um calendário de posts concreto.

Cada post precisa de um TEMA ESPECÍFICO (um ângulo real, não genérico) -- ex: em vez de "post sobre qualidade",
algo como "Antes e depois de uma reforma feita com nosso material" ou "3 erros comuns na hora de escolher X".
Varie os pilares ao longo do calendário, não repita o mesmo pilar em posts consecutivos.

Retorne APENAS um JSON válido (array, sem texto fora dele), no formato:
[
  { "diaOffset": 0, "pilar": "nome do pilar", "temaSugerido": "tema específico do post", "tipo": "feed" | "stories" | "reels" }
]

diaOffset é quantos dias a partir de hoje (0 = hoje, 3 = daqui 3 dias, etc). Distribua os posts de forma realista
pro volume pedido (não public todo santo dia se o negócio é pequeno) -- geralmente 2-4 posts por semana é razoável.`;

export class ContentCalendarError extends Error {}

export async function generateContentCalendar(
  tenantId: string,
  mediaPlanId: string,
  semanas: number,
): Promise<{ items: (typeof contentCalendarItemsTable.$inferSelect)[] }> {
  const [plan] = await db.select().from(mediaPlansTable).where(eq(mediaPlansTable.id, mediaPlanId));
  if (!plan || plan.tenantId !== tenantId) {
    throw new ContentCalendarError("Plano de mídia não encontrado.");
  }

  const pilares = plan.conteudo.pilaresConteudo ?? [];
  if (pilares.length === 0) {
    throw new ContentCalendarError("O plano de mídia não tem pilares de conteúdo definidos.");
  }

  const canaisRelevantes = (plan.conteudo.canais ?? [])
    .filter((c) => c.prioridade !== "baixa")
    .map((c) => c.canal)
    .join(", ") || "Instagram";

  const postsEstimados = Math.max(4, Math.min(semanas * 3, 40));

  const userPrompt = `Pilares de conteúdo: ${pilares.join(", ")}
Canais prioritários: ${canaisRelevantes}
Período: ${semanas} semana(s) a partir de hoje
Gere aproximadamente ${postsEstimados} posts distribuídos nesse período.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
  if (!raw) throw new ContentCalendarError("IA não retornou o calendário — tente novamente.");

  let parsedItems: Array<{ diaOffset: number; pilar: string; temaSugerido: string; tipo: string }>;
  try {
    parsedItems = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
  } catch {
    throw new ContentCalendarError("Falha ao interpretar o calendário gerado — tente novamente.");
  }

  const hoje = new Date();
  const rows = parsedItems.map((item) => {
    const data = new Date(hoje);
    data.setDate(data.getDate() + Math.max(0, item.diaOffset ?? 0));
    const tipo: ContentCalendarTipo = ["feed", "stories", "reels"].includes(item.tipo) ? (item.tipo as ContentCalendarTipo) : "feed";
    return {
      tenantId,
      mediaPlanId,
      dataAgendada: data.toISOString().slice(0, 10),
      pilar: item.pilar,
      temaSugerido: item.temaSugerido,
      tipo,
      canal: "instagram",
    };
  });

  if (rows.length === 0) {
    throw new ContentCalendarError("A IA não gerou nenhum post — tente novamente.");
  }

  const items = await db.insert(contentCalendarItemsTable).values(rows).returning();
  return { items };
}
