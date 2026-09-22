import { getOpenAIForTenant } from "../lib/agent-engine.js";

export type ConstructionWorkSignal = {
  id: string;
  obra: string;
  categoria: string | null;
  local: string;
  endereco: string | null;
  proprietario: string | null;
  proprietarioTipo: "pessoa" | "empresa" | "orgao_publico" | "nao_informado";
  responsavelTecnico: string | null;
  construtora: string | null;
  incorporadora: string | null;
  fase: string | null;
  evidencia: string;
  dataReferencia: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  confidence: number;
};

export type ConstructionWorkSearchResult = {
  query: string;
  works: ConstructionWorkSignal[];
  sources: Array<{ url: string; title: string }>;
  retrievedAt: string;
};

function extractSources(response: any): Array<{ url: string; title: string }> {
  const sources: Array<{ url: string; title: string }> = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type !== "output_text") continue;
      for (const annotation of content?.annotations ?? []) {
        if (annotation?.type !== "url_citation" || !annotation?.url) continue;
        sources.push({
          url: String(annotation.url),
          title: String(annotation.title || annotation.url),
        });
      }
    }
  }

  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 16);
}

function cleanJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function nullableHttpUrl(value: unknown): string | null {
  const normalized = nullableString(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function makeId(input: {
  obra: string;
  local: string;
  sourceUrl: string | null;
  index: number;
}): string {
  const raw = [input.obra, input.local, input.sourceUrl ?? "", String(input.index)]
    .join("|")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9à-ú]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return raw || `obra-${input.index + 1}`;
}

export async function searchConstructionWorkSignals(input: {
  tenantId: string;
  category: string;
  model: string;
  locality: string;
  intervention?: string;
  standard?: string;
  phase?: string;
  productInterest?: string;
  maxResults?: number;
}): Promise<ConstructionWorkSearchResult> {
  const retrievedAt = new Date().toISOString();
  const maxResults = Math.max(1, Math.min(15, input.maxResults ?? 10));
  const query = [
    input.category,
    input.model,
    input.intervention,
    input.standard,
    input.phase,
    input.productInterest,
    input.locality,
  ].filter(Boolean).join(" · ");

  const openai = await getOpenAIForTenant(input.tenantId);
  const response = await (openai.responses.create as any)({
    model:
      process.env.PROSPECTOR_WORKS_WEB_MODEL?.trim() ||
      process.env.JARVIS_WEB_SEARCH_MODEL?.trim() ||
      "gpt-5.6-luna",
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    input: [
      {
        role: "system",
        content: [
          "Você é o Radar de Obras Privadas da VendorAI.",
          "Pesquise a web agora e identifique obras/empreendimentos reais, individualizados e compatíveis com os filtros.",
          "Priorize fontes públicas e rastreáveis: prefeitura/alvarás/diários oficiais, portais imobiliários e de incorporadoras, notícias locais, páginas de construtoras/arquitetos, redes sociais públicas e anúncios do empreendimento.",
          "NÃO retorne apenas empresas genéricas. Cada item deve representar uma obra, endereço/empreendimento ou projeto específico.",
          "O campo proprietario/contratante só pode ser preenchido quando o nome estiver explicitamente publicado em fonte pública ligada à obra. Nunca deduza, adivinhe ou complete por similaridade.",
          "Não inclua telefone, e-mail, CPF, documento pessoal ou endereço residencial do proprietário. Nome de pessoa só quando publicado no contexto profissional/cadastral da obra.",
          "Se não houver proprietário público, use null e mantenha a obra se houver evidência suficiente.",
          "Não invente endereço, fase, responsável técnico, construtora, incorporadora, data ou fonte.",
          "Retorne APENAS JSON válido, sem markdown e sem texto fora do JSON.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Localidade alvo: ${input.locality}`,
          `Categoria: ${input.category}`,
          `Modelo/tipo: ${input.model}`,
          `Intervenção: ${input.intervention || "não especificada"}`,
          `Padrão: ${input.standard || "não especificado"}`,
          `Fase desejada: ${input.phase || "não especificada"}`,
          `Produto/serviço de interesse: ${input.productInterest || "não especificado"}`,
          `Máximo de resultados: ${maxResults}`,
          "",
          "Formato exato:",
          JSON.stringify({
            works: [
              {
                obra: "Nome ou descrição curta da obra",
                categoria: "residencial|comercial|empreendimento|industrial|outro",
                local: "Cidade/UF ou bairro/cidade",
                endereco: "Endereço da obra quando publicado, ou null",
                proprietario: "Proprietário/contratante quando explicitamente público, ou null",
                proprietarioTipo: "pessoa|empresa|orgao_publico|nao_informado",
                responsavelTecnico: "Arquiteto/engenheiro quando publicado, ou null",
                construtora: "Construtora quando publicada, ou null",
                incorporadora: "Incorporadora quando publicada, ou null",
                fase: "projeto|aprovação|fundação|estrutura|fechamento|acabamento|concluída|a validar",
                evidencia: "Resumo factual de até 220 caracteres explicando por que é uma obra real e atual/relevante",
                dataReferencia: "YYYY-MM-DD quando houver data verificável, ou null",
                sourceUrl: "URL pública principal que comprova o item, ou null",
                sourceTitle: "Título/nome da fonte, ou null",
                confidence: 0
              }
            ]
          }),
        ].join("\n"),
      },
    ],
    max_output_tokens: 4200,
  });

  const outputText = String(response?.output_text ?? "").trim();
  const sources = extractSources(response);
  if (!outputText) {
    return { query, works: [], sources, retrievedAt };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJsonText(outputText));
  } catch {
    return { query, works: [], sources, retrievedAt };
  }

  const rawWorks = Array.isArray(parsed?.works) ? parsed.works.slice(0, maxResults) : [];
  const works = rawWorks
    .map((raw: any, index: number): ConstructionWorkSignal | null => {
      const obra = nullableString(raw?.obra);
      const local = nullableString(raw?.local) ?? input.locality.trim();
      const evidencia = nullableString(raw?.evidencia);
      if (!obra || !evidencia) return null;

      const sourceUrl = nullableHttpUrl(raw?.sourceUrl);
      const ownerTypeRaw = nullableString(raw?.proprietarioTipo);
      const proprietarioTipo: ConstructionWorkSignal["proprietarioTipo"] =
        ownerTypeRaw === "pessoa" ||
        ownerTypeRaw === "empresa" ||
        ownerTypeRaw === "orgao_publico"
          ? ownerTypeRaw
          : "nao_informado";

      return {
        id: makeId({ obra, local, sourceUrl, index }),
        obra,
        categoria: nullableString(raw?.categoria),
        local,
        endereco: nullableString(raw?.endereco),
        proprietario: nullableString(raw?.proprietario),
        proprietarioTipo,
        responsavelTecnico: nullableString(raw?.responsavelTecnico),
        construtora: nullableString(raw?.construtora),
        incorporadora: nullableString(raw?.incorporadora),
        fase: nullableString(raw?.fase),
        evidencia,
        dataReferencia: nullableString(raw?.dataReferencia),
        sourceUrl,
        sourceTitle: nullableString(raw?.sourceTitle),
        confidence: normalizeConfidence(raw?.confidence),
      };
    })
    .filter((item: ConstructionWorkSignal | null): item is ConstructionWorkSignal => item !== null);

  return { query, works, sources, retrievedAt };
}
