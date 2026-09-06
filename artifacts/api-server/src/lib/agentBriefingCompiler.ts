// Compila as informações reais da empresa (business_profiles + catálogo)
// num texto de "## INSTRUÇÕES DA EMPRESA" pronto pra usar em TODOS os
// agentes do tenant — mesmo padrão aditivo já suportado nativamente por
// agent-engine.ts (parâmetro `customPrompt`), só que agora preenchido
// automaticamente em vez de depender do tenant escrever isso à mão.
//
// Regra de fonte única: quando existe Catálogo ativo, ele é a fonte oficial de
// produtos/serviços. A lista legada de business_profiles.produtos só é usada
// como fallback para tenants que ainda não possuem itens ativos no Catálogo.
import { and, eq } from "drizzle-orm";
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
    .limit(15);

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
      const descricao = p.descricao?.trim() ? ` — ${p.descricao.trim()}` : "";
      const preco = p.precoBase != null ? ` — preço base R$ ${p.precoBase}` : "";
      return `${tipo}: ${p.nome.trim()}${descricao}${preco}`;
    });

  const produtosLegados = (profile?.produtos ?? [])
    .map((p) => p.nome?.trim())
    .filter((nome): nome is string => Boolean(nome))
    .slice(0, 15);

  const produtosContexto = produtosOficiais.length > 0
    ? `Catálogo oficial ativo:\n${produtosOficiais.map((item) => `- ${item}`).join("\n")}`
    : produtosLegados.length > 0
      ? `Produtos/serviços (referência legada, usada apenas porque o Catálogo ainda está vazio): ${produtosLegados.join(", ")}`
      : "";

  const raw = [
    profile?.nomeFantasia ? `Nome: ${profile.nomeFantasia}` : "",
    profile?.vertical ? `Segmento: ${profile.vertical}` : "",
    profile?.publicoAlvo ? `Público-alvo: ${profile.publicoAlvo}` : "",
    profile?.diferenciais ? `Diferenciais declarados: ${profile.diferenciais}` : "",
    profile?.metodoVendas ? `Método de vendas: ${profile.metodoVendas}` : "",
    profile?.concorrentes?.length ? `Concorrentes conhecidos: ${profile.concorrentes.join(", ")}` : "",
    profile?.canaisVenda?.length ? `Canais de venda: ${profile.canaisVenda.join(", ")}` : "",
    produtosContexto,
    extraNotes ? `Observações adicionais informadas pelo usuário: ${extraNotes}` : "",
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
