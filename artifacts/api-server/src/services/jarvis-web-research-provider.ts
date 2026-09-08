import { getOpenAIForTenant } from "../lib/agent-engine.js";
import type { JarvisCapabilityFamily } from "./jarvis-capability-profile.js";

export type JarvisWebResearchResult = {
  status: "executed" | "failed";
  text: string;
  sources: Array<{ url: string; title: string }>;
  retrievedAt: string;
};

const WEB_FAMILIES = new Set<JarvisCapabilityFamily>([
  "tax",
  "trade",
  "credit",
  "legal_regulatory",
  "recommendations_lifestyle",
]);

export function shouldUseJarvisWebResearch(family: JarvisCapabilityFamily): boolean {
  return WEB_FAMILIES.has(family);
}

function researchInstruction(family: JarvisCapabilityFamily): string {
  if (family === "tax") {
    return "Priorize fontes oficiais brasileiras: Receita Federal, CONFAZ, Secretarias de Fazenda, Planalto, gov.br e legislação oficial. Diferencie regra vigente, proposta, interpretação e hipótese. Não trate blog como fonte primária quando houver norma oficial.";
  }
  if (family === "legal_regulatory") {
    return "Priorize Planalto, Diário Oficial, órgãos reguladores, tribunais e portais governamentais. Informe vigência/data quando disponível. Não apresente pesquisa como parecer jurídico formal.";
  }
  if (family === "trade") {
    return "Priorize Receita Federal, Siscomex, MDIC, Camex, Banco Central, órgãos aduaneiros e fontes institucionais. Para tarifas, câmbio ou regras, deixe claro o momento da consulta.";
  }
  if (family === "credit") {
    return "Priorize Banco Central, BNDES, bancos e instituições oficiais para condições atuais. Diferencie taxa nominal, CET, prazo e condições; não prometa aprovação de crédito.";
  }
  return "Pesquise fontes atuais e confiáveis. Para livros, filmes, sites, cursos e referências, considere atualidade, disponibilidade e reputação quando isso for relevante.";
}

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
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 8);
}

export async function researchJarvisWeb(input: {
  tenantId: string;
  family: JarvisCapabilityFamily;
  query: string;
}): Promise<JarvisWebResearchResult> {
  const retrievedAt = new Date().toISOString();
  try {
    const openai = await getOpenAIForTenant(input.tenantId);
    const response = await (openai.responses.create as any)({
      model: process.env.JARVIS_WEB_SEARCH_MODEL?.trim() || "gpt-5.6-luna",
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      input: [
        {
          role: "system",
          content: [
            "Você é a camada de pesquisa externa do JARVIS/VendorAI.",
            "Pesquise a web agora e entregue apenas fatos úteis para responder ao pedido, em português brasileiro.",
            "Não invente norma, cotação, taxa, data, disponibilidade ou fonte.",
            "Quando fontes divergirem, diga que existe divergência em vez de escolher silenciosamente uma versão.",
            researchInstruction(input.family),
          ].join("\n"),
        },
        {
          role: "user",
          content: input.query,
        },
      ],
      max_output_tokens: 2200,
    });

    const text = String(response?.output_text ?? "").trim();
    const sources = extractSources(response);
    if (!text) throw new Error("Pesquisa web não retornou conteúdo");

    return { status: "executed", text, sources, retrievedAt };
  } catch (error) {
    return {
      status: "failed",
      text: `Pesquisa web indisponível nesta solicitação: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      sources: [],
      retrievedAt,
    };
  }
}

export function formatJarvisWebResearchContext(result: JarvisWebResearchResult): string {
  if (result.status === "failed") {
    return [
      "## Pesquisa web atual",
      `- Status: falhou em ${result.retrievedAt}.`,
      `- ${result.text}`,
      "- Não invente informação atual para preencher a lacuna. Se a atualidade for essencial, informe a indisponibilidade.",
    ].join("\n");
  }

  return [
    "## Pesquisa web atual executada pelo JARVIS",
    `- Consulta executada em: ${result.retrievedAt}.`,
    "### Síntese recuperada",
    result.text,
    result.sources.length ? "### Fontes recuperadas" : null,
    ...result.sources.map((source, index) => `${index + 1}. ${source.title} — ${source.url}`),
    "- Trate o conteúdo acima como evidência externa recuperada nesta solicitação. Preserve incertezas e divergências.",
  ].filter(Boolean).join("\n");
}
