/**
 * Calendário estratégico do Plano de Mídia.
 *
 * O Planejador define o que deve acontecer no período; ele NÃO gera a peça final.
 * Cada linha vira uma tarefa de produção que o Gerador de Conteúdo executará depois.
 */
import {
  db,
  mediaPlansTable,
  contentCalendarItemsTable,
  CONTENT_CALENDAR_TIPOS,
  type ContentCalendarTipo,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const VALID_TYPES = CONTENT_CALENDAR_TIPOS.join(" | ");

const SYSTEM_PROMPT = `Você é o calendário estratégico do Planejador de Mídia do VendorAI.
O plano já definiu campanhas, públicos, canais, frequência e objetivos. Sua função é distribuir AÇÕES planejadas no tempo, sem produzir o material final.

Cada ação precisa ter um tema/título específico, canal, formato, campanha e pilar. Distribua os canais de acordo com a função de cada um no funil; não copie a mesma frase em todas as plataformas.

REGRA DE SUTILEZA GEOGRÁFICA: quando uma campanha tiver região/bairro, isso orienta a segmentação, mas NÃO deve aparecer em todo título. Em geral, mencione a localização explicitamente em apenas 20–30% das ações. Aumente o uso em Google Search, SEO local e Landing Page; reduza em Reels, Feed, YouTube e conteúdo educativo. Nos demais materiais, trabalhe dor, benefício, comparação, prova, aplicação, produto e transformação sem repetir o nome do local.

Mídia paga pode permanecer ativa continuamente; represente no calendário marcos de lançamento, revisão de criativo, otimização e teste A/B, em vez de fingir que o anúncio só existe em um único dia. WhatsApp e e-mail devem ter mensagens próprias de relacionamento/conversão, não cópias de posts sociais.

Tipos válidos: ${VALID_TYPES}.

Retorne APENAS JSON válido (array), sem markdown:
[
  {
    "diaOffset": 0,
    "campanha": "nome da campanha",
    "pilar": "dor | educação | produto | prova | autoridade | oferta | conversão | otimização",
    "temaSugerido": "título/ação específica e natural",
    "canal": "Instagram | Meta Ads | Google Search | WhatsApp | ...",
    "tipo": "um dos tipos válidos"
  }
]`;

export class ContentCalendarError extends Error {}

function normalizeType(value: unknown): ContentCalendarTipo {
  if (typeof value === "string" && (CONTENT_CALENDAR_TIPOS as readonly string[]).includes(value)) {
    return value as ContentCalendarTipo;
  }
  return "feed";
}

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
  const campanhas = plan.conteudo.campanhas ?? [];
  if (pilares.length === 0 && campanhas.length === 0) {
    throw new ContentCalendarError("O plano de mídia não tem campanhas ou pilares definidos.");
  }

  const canaisRelevantes = (plan.conteudo.canais ?? [])
    .filter((c) => c.prioridade !== "baixa")
    .map((c) => c.canal);

  const [ultimoAgendado] = await db
    .select({ dataAgendada: contentCalendarItemsTable.dataAgendada })
    .from(contentCalendarItemsTable)
    .where(and(eq(contentCalendarItemsTable.tenantId, tenantId), eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId)))
    .orderBy(desc(contentCalendarItemsTable.dataAgendada))
    .limit(1);

  const dataBase = ultimoAgendado
    ? (() => {
        const d = new Date(ultimoAgendado.dataAgendada + "T12:00:00");
        d.setDate(d.getDate() + 1);
        return d;
      })()
    : new Date();

  // Planejamento mais completo: ~6 ações estratégicas por semana, incluindo
  // orgânico, mídia paga, relacionamento, LP/site e marcos de otimização.
  const acoesEstimadas = Math.max(12, Math.min(semanas * 6, 90));

  const campanhasResumo = campanhas.length
    ? campanhas.map((campanha) => ({
        nome: campanha.nome,
        objetivo: campanha.objetivo,
        produtoServico: campanha.produtoServico,
        publico: campanha.publico,
        regiao: campanha.regiao,
        oferta: campanha.oferta,
        mensagemCentral: campanha.mensagemCentral,
        fase: campanha.fase,
        intensidadeGeografica: campanha.intensidadeGeografica,
        regraComunicacaoGeografica: campanha.regraComunicacaoGeografica,
        inicioOffsetDias: campanha.inicioOffsetDias,
        duracaoDias: campanha.duracaoDias,
        canais: campanha.canais,
      }))
    : [];

  const userPrompt = JSON.stringify({
    periodoSemanas: semanas,
    periodoDias: plan.conteudo.periodoDias ?? semanas * 7,
    continuarAPartirDoCalendarioExistente: Boolean(ultimoAgendado),
    campanhas: campanhasResumo,
    pilaresGerais: pilares,
    canaisPrioritarios: canaisRelevantes,
    quantidadeAproximadaDeAcoes: acoesEstimadas,
    observacao: "As ações devem cobrir o período e os canais relevantes. Não gerar peça final; apenas título/tema e direção de execução.",
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: semanas >= 12 ? 7000 : 5000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
  if (!raw) throw new ContentCalendarError("IA não retornou o calendário — tente novamente.");

  let parsedItems: Array<{
    diaOffset?: number;
    campanha?: string;
    pilar?: string;
    temaSugerido?: string;
    canal?: string;
    tipo?: string;
  }>;
  try {
    parsedItems = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
  } catch {
    throw new ContentCalendarError("Falha ao interpretar o calendário gerado — tente novamente.");
  }

  const maxOffset = Math.max(1, semanas * 7 - 1);
  const rows = parsedItems
    .filter((item) => item && typeof item.temaSugerido === "string" && item.temaSugerido.trim())
    .map((item) => {
      const data = new Date(dataBase);
      const offset = Math.min(maxOffset, Math.max(0, Math.round(Number(item.diaOffset) || 0)));
      data.setDate(data.getDate() + offset);
      const campanha = typeof item.campanha === "string" && item.campanha.trim() ? item.campanha.trim() : "Campanha do período";
      const pilar = typeof item.pilar === "string" && item.pilar.trim() ? item.pilar.trim() : "conteúdo";
      return {
        tenantId,
        mediaPlanId,
        dataAgendada: data.toISOString().slice(0, 10),
        pilar: `${campanha} · ${pilar}`,
        temaSugerido: item.temaSugerido!.trim(),
        tipo: normalizeType(item.tipo),
        canal: typeof item.canal === "string" && item.canal.trim() ? item.canal.trim() : "Instagram",
      };
    });

  if (rows.length === 0) {
    throw new ContentCalendarError("A IA não gerou nenhuma ação — tente novamente.");
  }

  const items = await db.insert(contentCalendarItemsTable).values(rows).returning();
  return { items };
}