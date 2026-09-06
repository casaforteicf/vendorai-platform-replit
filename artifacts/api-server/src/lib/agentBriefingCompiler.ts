// Compila as informações reais da empresa (business_profiles + catálogo)
// num texto de "## INSTRUÇÕES DA EMPRESA" pronto pra usar em TODOS os
// agentes do tenant — mesmo padrão aditivo já suportado nativamente por
// agent-engine.ts (parâmetro `customPrompt`), só que agora preenchido
// automaticamente em vez de depender do tenant escrever isso à mão.
//
// Regra de fonte única: quando existe Catálogo ativo, ele é a fonte oficial de
// produtos/serviços. A lista legada de business_profiles.produtos só é usada
// como fallback para tenants que ainda não possuem itens ativos no Catálogo.
import { and, asc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  businessProfilesTable,
  produtosCatalogoTable,
  agentConfigsTable,
  AGENT_TYPES,
  type AgentsMap,
} from "@workspace/db";
import { callOpenAI } from "./ai-gateway.js";

const MAX_CATALOG_ITEMS = 15;
const MAX_DESCRIPTION_CHARS = 220;
const MAX_PROFILE_FIELD_CHARS = 900;
const MAX_EXTRA_NOTES_CHARS = 1_200;

function compactText(value: string | null | undefined, maxChars: number): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function formatBrl(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function compileAgentBusinessBriefing(
  tenantId: string,
  extraNotes: string | undefined = undefined,
  log?: Logger,
): Promise<{ briefing: string; agentsUpdated: string[] }> {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const produtos = await db
    .select({
      nome: produtosCatalogoTable.nome,
      descricao: produtosCatalogoTable.descricao,
      precoBase: produtosCatalogoTable.precoBase,
      productType: produtosCatalogoTable.productType,
    })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.tenantId, tenantId),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .orderBy(asc(produtosCatalogoTable.nome))
    .limit(MAX_CATALOG_ITEMS);

  const produtosOficiais = produtos
    .filter((p) => p.nome?.trim())
    .map((p) => {
      const tipo = p.productType === "service"
        ? "Serviço"
        : p.productType === "saas_plan"
          ? "Plano SaaS"
          : p.productType === "saas_addon"
            ? "Adicional SaaS"
            : "Produto";
      const nome = compactText(p.nome, 160);
      const descricaoTexto = compactText(p.descricao, MAX_DESCRIPTION_CHARS);
      const descricao = descricaoTexto ? ` — ${descricaoTexto}` : "";
      const precoFormatado = formatBrl(p.precoBase);
      const preco = precoFormatado ? ` — preço base ${precoFormatado}` : "";
      return `${tipo}: ${nome}${descricao}${preco}`;
    });

  const produtosLegados = (profile?.produtos ?? [])
    .map((p) => compactText(p.nome, 160))
    .filter((nome): nome is string => Boolean(nome))
    .slice(0, MAX_CATALOG_ITEMS);

  const produtosContexto = produtosOficiais.length > 0
    ? `Catálogo oficial ativo:\n${produtosOficiais.map((item) => `- ${item}`).join("\n")}`
    : produtosLegados.length > 0
      ? `Produtos/serviços (referência legada, usada apenas porque o Catálogo ainda está vazio): ${produtosLegados.join(", ")}`
      : "";

  const raw = [
    profile?.nomeFantasia ? `Nome: ${compactText(profile.nomeFantasia, 220)}` : "",
    profile?.vertical ? `Segmento: ${compactText(profile.vertical, 220)}` : "",
    profile?.publicoAlvo ? `Público-alvo: ${compactText(profile.publicoAlvo, MAX_PROFILE_FIELD_CHARS)}` : "",
    profile?.diferenciais ? `Diferenciais declarados: ${compactText(profile.diferenciais, MAX_PROFILE_FIELD_CHARS)}` : "",
    profile?.metodoVendas ? `Método de vendas: ${compactText(profile.metodoVendas, MAX_PROFILE_FIELD_CHARS)}` : "",
    profile?.concorrentes?.length ? `Concorrentes conhecidos: ${profile.concorrentes.map((item) => compactText(item, 180)).filter(Boolean).slice(0, 20).join(", ")}` : "",
    profile?.canaisVenda?.length ? `Canais de venda: ${profile.canaisVenda.map((item) => compactText(item, 120)).filter(Boolean).slice(0, 20).join(", ")}` : "",
    produtosContexto,
    extraNotes ? `Observações adicionais informadas pelo usuário: ${compactText(extraNotes, MAX_EXTRA_NOTES_CHARS)}` : "",
  ].filter(Boolean).join("\n");

  if (!raw.trim()) {
    return { briefing: "", agentsUpdated: [] };
  }

  const prompt = [
    "Compile as informações abaixo num texto curto (120-200 palavras) de instruções pra um agente de IA de atendimento/vendas usar como contexto fixo da empresa.",
    "O texto deve: descrever o que a empresa vende/oferece, pra quem, o principal diferencial, e uma orientação de tom.",
    "Quando houver 'Catálogo oficial ativo', trate esse catálogo como fonte de verdade para produtos, serviços e preços e não use informações conflitantes de outras fontes.",
    "Escreva em português brasileiro, direto, sem enrolação, em parágrafo corrido (não lista). Não invente nenhuma informação que não esteja nos dados abaixo.",
    "",
    "DADOS DA EMPRESA:",
    raw,
  ].join("\n");

  const result = await callOpenAI(tenantId, "agent_onboarding", [
    { role: "system", content: "Você compila briefings de negócio concisos e factuais, sem inventar dados." },
    { role: "user", content: prompt },
  ], { temperature: 0.4, maxTokens: 400, log });

  const briefing = result.content.trim();
  if (!briefing) return { briefing: "", agentsUpdated: [] };

  const [existingConfig] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  const currentAgents: AgentsMap = (existingConfig?.agents as AgentsMap) ?? {};
  const updatedAgents: AgentsMap = { ...currentAgents };
  for (const agentKey of AGENT_TYPES) {
    updatedAgents[agentKey] = { ...(currentAgents[agentKey] ?? { enabled: false }), prompt: briefing };
  }

  if (existingConfig) {
    await db.update(agentConfigsTable).set({ agents: updatedAgents, updatedAt: new Date() }).where(eq(agentConfigsTable.id, existingConfig.id));
  } else {
    await db.insert(agentConfigsTable).values({ tenantId, agents: updatedAgents });
  }

  return { briefing, agentsUpdated: [...AGENT_TYPES] };
}
