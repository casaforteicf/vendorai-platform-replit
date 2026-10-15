/**
 * Proposal generation engine — AI-driven SPIN proposal builder
 * Uses Anthropic when available, with automatic OpenAI fallback for provider failures.
 */
import { Router, type IRouter } from "express";
import type { Logger } from "pino";
import { desc, eq, and } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadBriefingsTable,
  leadProposalsTable,
  leadProductsTable,
  propostasTable,
  conversationsTable,
  messagesTable,
  customerIntelligenceTable,
  businessProfilesTable,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI, callAnthropic as gatewayCallAnthropic } from "./ai-gateway.js";
import { logger } from "./logger.js";

export const AI_PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
export const AI_MODEL = process.env.ANTHROPIC_API_KEY ? "claude-opus-4-8" : "gpt-4o";

const PROPOSAL_SYSTEM_PROMPT = `Você é o melhor redator comercial do Brasil — especialista em copywriting B2B de alta conversão, narrativa SPIN e design de propostas comerciais. Você escreve como um consultor sênior que conhece profundamente o segmento do cliente.

Suas regras de ouro:
- Cada frase deve ganhar seu lugar. Sem enchimento, sem clichê.
- Use somente dados concretos fornecidos pelo sistema, tenant, catálogo, briefing ou base de conhecimento. Nunca invente estatísticas, certificações, cases, depoimentos ou números para parecer convincente.
- Escreva headlines que gerem curiosidade e urgência real, não genérica.
- Os problemas e implicações devem causar um "é exatamente isso que acontece comigo" no leitor.
- A solução deve soar inevitável — como se fosse a única escolha racional depois de ler os problemas.
- Tom: adapte ao estilo real do cliente (formal/informal, direto/cuidadoso). Se não houver amostra de conversa, use tom profissional mas acessível.
- Todos os textos em português brasileiro impecável. Sem anglicismos desnecessários.`;

// ── AI caller — routes through gateway (BYOK + quota + logging) ──────────────
export type AiMessage = { role: "user" | "assistant"; content: string };

export async function callProposalAI(
  messages: AiMessage[],
  tenantId: string,
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<{ content: string; provider: string; model: string }> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      log.info({ provider: "anthropic", model: "claude-opus-4-8" }, "Calling Anthropic for proposal generation");
      const userMessages = messages.filter((m) => m.role === "user");
      const result = await gatewayCallAnthropic(
        tenantId,
        "proposal_generator",
        userMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { model: "claude-opus-4-8", maxTokens: 8000, system: PROPOSAL_SYSTEM_PROMPT },
      );
      return { content: result.content, provider: "anthropic", model: "claude-opus-4-8" };
    } catch (anthropicErr: any) {
      // Any Anthropic failure (including billing/credit 402 and rate-limit 429)
      // must fall back to OpenAI before surfacing an error to the user.
      log.error(
        { error: anthropicErr?.message, status: anthropicErr?.status },
        "Anthropic failed for proposal, falling back to OpenAI",
      );
    }
  }

  log.info({ provider: "openai", model: "gpt-4o" }, "Calling OpenAI for proposal generation");
  const result = await gatewayCallOpenAI(
    tenantId,
    "proposal_generator",
    messages as Array<{ role: "user" | "assistant"; content: string }>,
    { model: "gpt-4o", maxTokens: 6000 },
  );
  return { content: result.content, provider: "openai", model: "gpt-4o" };
}

// ── Theme generation from client color ───────────────────────────────────────
function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function generateTheme(primaryHex: string): {
  cream: string; cream2: string; ink: string;
  navyDeep: string; navyMid: string;
  accent: string; accentSoft: string;
  secondary: string; secondarySoft: string;
  concrete: string; concreteLine: string;
  ok: string; warn: string;
} {
  const [h, s, l] = hexToHsl(primaryHex);
  const isLight = l > 0.5;
  const accent = primaryHex;
  const accentSoft = hslToHex(h, Math.max(0.2, s * 0.5), isLight ? 0.88 : 0.25);
  const secondary = hslToHex((h + 0.5) % 1, s, l);
  const secondarySoft = hslToHex((h + 0.5) % 1, Math.max(0.2, s * 0.5), isLight ? 0.88 : 0.25);
  const cream = hslToHex(h, Math.min(0.08, s * 0.15), 0.97);
  const cream2 = hslToHex(h, Math.min(0.1, s * 0.2), 0.93);
  const ink = hslToHex(h, Math.min(0.15, s * 0.3), 0.15);
  const navyDeep = hslToHex(h, Math.min(0.2, s * 0.4), 0.06);
  const navyMid = hslToHex(h, Math.min(0.25, s * 0.5), 0.12);
  const concrete = hslToHex(h, Math.min(0.06, s * 0.1), 0.78);
  const concreteLine = hslToHex(h, Math.min(0.05, s * 0.08), 0.85);
  return { cream, cream2, ink, navyDeep, navyMid, accent, accentSoft, secondary, secondarySoft, concrete, concreteLine, ok: "#3FAE7A", warn: "#E0793C" };
}

function extractProposalBenefitList(maxItems: number, ...sources: unknown[]): string[] {
  const raw: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["title", "label", "name", "text"]) if (typeof record[key] === "string") raw.push(String(record[key]));
      return;
    }
    if (typeof value === "string") raw.push(value);
  };
  sources.forEach(visit);
  return raw
    .flatMap((value) => value.split(/\r?\n|[•·]|\s+[—–-]\s+|;+/g))
    .map((value) => value.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim())
    .filter((value) => value.length >= 4 && value.length <= 160)
    .map((value) => value.replace(/[.]+$/, ""))
    .filter((value, index, list) => list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, Math.max(1, maxItems));
}

function extractProposalBenefits(...sources: unknown[]): string[] {
  return extractProposalBenefitList(4, ...sources);
}

// ── Prompt builder ───────────────────────────────────────────────────────────
export type ProposalStyleMemory = {
  toneNotes?: string;
  structureNotes?: string;
  contentNotes?: string;
  avoidNotes?: string;
  editCount?: number;
  updatedAt?: string;
};

/**
 * Called after the user saves an edited proposal.
 * Compares original vs edited HTML, extracts stylistic learnings, merges with
 * existing tenant memory, and persists the result — non-blocking.
 */
export async function learnFromProposalEdit(
  tenantId: string,
  originalHtml: string,
  editedHtml: string,
  existingMemory: ProposalStyleMemory | null,
  log: Logger,
): Promise<ProposalStyleMemory> {
  const existing = existingMemory || {};
  const editCount = (existing.editCount ?? 0) + 1;

  const systemPrompt = `Você é um assistente de análise de preferências editoriais. Analise as diferenças entre uma proposta comercial gerada por IA e a versão editada manualmente pelo usuário. Extraia padrões de preferência estilística concisos em JSON.`;

  const userPrompt = `Compare os dois HTMLs abaixo e extraia o que o usuário prefere em termos de tom, estrutura e conteúdo.

MEMÓRIA EXISTENTE (pode ser atualizada/refinada):
${JSON.stringify(existing, null, 2)}

HTML ORIGINAL (gerado pela IA):
${originalHtml.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").slice(0, 2000)}

HTML EDITADO (preferências do usuário):
${editedHtml.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").slice(0, 2000)}

Retorne APENAS JSON válido com estas chaves (máx 120 caracteres cada):
{
  "toneNotes": "descrição do tom preferido (formal/informal, direto/cuidadoso, exemplos de vocabulário)",
  "structureNotes": "preferências de estrutura (seções mais curtas/longas, o que costuma remover ou adicionar)",
  "contentNotes": "preferências de conteúdo (tipos de exemplos, nível de detalhe, linguagem do segmento)",
  "avoidNotes": "o que evitar (frases, estilos, abordagens que o usuário remove ou altera consistentemente)"
}`;

  try {
    const result = await callProposalAI(
      [{ role: "user", content: userPrompt }],
      tenantId,
      log,
    );
    const cleaned = result.content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const learned = JSON.parse(cleaned) as Partial<ProposalStyleMemory>;
    const merged: ProposalStyleMemory = {
      toneNotes: learned.toneNotes || existing.toneNotes,
      structureNotes: learned.structureNotes || existing.structureNotes,
      contentNotes: learned.contentNotes || existing.contentNotes,
      avoidNotes: learned.avoidNotes || existing.avoidNotes,
      editCount,
      updatedAt: new Date().toISOString(),
    };
    log.info({ tenantId, editCount }, "proposal style memory updated");
    return merged;
  } catch (err: any) {
    log.warn({ err: err?.message, tenantId }, "learnFromProposalEdit: AI call failed, returning incremented count only");
    return { ...existing, editCount, updatedAt: new Date().toISOString() };
  }
}

export function buildProposalPrompt(ctx: {
  leadName: string;
  empresa?: string | null;
  objetivo?: string | null;
  mercadoSegmento?: string | null;
  logoUrl?: string | null;
  corDestaque?: string | null;
  products: { nome: string; imagemUrl?: string | null }[];
  propostas: { titulo: string; valorTotal?: string | null; itens?: unknown[]; observacoes?: string | null }[];
  briefing: {
    situationAnswers?: { question: string; answer: string }[];
    problemAnswers?: { question: string; answer: string }[];
    implicationAnswers?: { question: string; answer: string }[];
    needAnswers?: { question: string; answer: string }[];
    freeNotes?: string | null;
  } | null;
  intelligence: {
    churnReasons?: string[];
    opportunities?: string[];
    intentAnalysis?: string | null;
  } | null;
  conversationSamples: string;
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantBusinessContext?: string | null;
  refinementNotes?: string | null;
  styleMemory?: ProposalStyleMemory | null;
  templateGuidance?: string | null;
}): string {
  const productsBlock = ctx.products.length
    ? `\nProdutos do cliente:\n${ctx.products.map((p) => `- ${p.nome}`).join("\n")}`
    : "\nNenhum produto cadastrado.";

  const propostasBlock = ctx.propostas.length
    ? (() => {
        const selected = ctx.propostas[0];
        const rawItems = Array.isArray(selected.itens) ? selected.itens : [];
        const scope = rawItems
          .map((item: any) => {
            const stage = item?.etapaNome ? String(item.etapaNome).trim() : "";
            const name = item?.nome ? String(item.nome).trim() : "";
            return [stage, name].filter(Boolean).join(" — ");
          })
          .filter(Boolean)
          .slice(0, 40);
        return `\n━━━ ORÇAMENTO SELECIONADO — FONTE DE VERDADE COMERCIAL ━━━
Orçamento: ${selected.titulo}
${scope.length ? `Escopo cadastrado no sistema:\n${scope.map((item) => `- ${item}`).join("\n")}` : "Use somente o escopo disponível no orçamento selecionado."}
REGRA CRÍTICA: não invente, substitua, amplie ou remova serviços do orçamento. Não calcule preços, quantidades, cronograma ou condições comerciais. Esses dados serão inseridos diretamente pelo sistema a partir do orçamento, sem intervenção da IA.`;
      })()
    : "";

  const briefingBlock = ctx.briefing
    ? `\nBriefing do lead (dados validados no relacionamento):\n- Situação: ${ctx.briefing.situationAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Problemas: ${ctx.briefing.problemAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Implicações: ${ctx.briefing.implicationAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Necessidades: ${ctx.briefing.needAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Notas: ${ctx.briefing.freeNotes || ""}`
    : "\nBriefing ainda não gerado.";

  const intelligenceBlock = ctx.intelligence
    ? `\nInteligência do cliente:\n- Razões de churn: ${(ctx.intelligence.churnReasons || []).join("; ") || "Não identificado"}\n- Oportunidades: ${(ctx.intelligence.opportunities || []).join("; ") || "Não identificado"}\n- Análise de intenção: ${ctx.intelligence.intentAnalysis || "Não identificado"}`
    : "";

  const tenantLabel = ctx.tenantName ? `da empresa "${ctx.tenantName}"` : "da empresa contratada";
  const segmentoBlock = ctx.mercadoSegmento
    ? `\n## Segmento do cliente: "${ctx.mercadoSegmento}"\nIMPORTANTE: toda a proposta DEVE usar terminologia, exemplos, dores e oportunidades específicas deste segmento. Não use linguagem genérica de "empresa". Use jargão real do setor. Os problemas, implicações e módulos devem ser exemplos concretos do dia a dia de ${ctx.mercadoSegmento}. Se for varejo: fale em loja, vendedor, estoque, ticket médio, sazonalidade. Se for construção: obra, engenheiro, orçamento, cliente de obra. Se for saúde: paciente, consulta, agenda. Adapte para o segmento real.`
    : "";

  const tenantBusinessContextBlock = ctx.tenantBusinessContext?.trim()
    ? `\n━━━ CONFIGURAÇÃO OFICIAL DO TENANT — FONTE DE VERDADE DE MARCA E DIFERENCIAIS ━━━
Use este bloco como fonte principal para apresentação institucional, proposta de valor, diferenciais, benefícios, público-alvo, tom e mensagens-chave.
Quando o orçamento selecionado contiver um produto/sistema compatível com estes diferenciais, destaque explicitamente os benefícios relevantes para o cliente.
NÃO substitua estes dados por texto institucional genérico e NÃO invente números, certificações, percentuais ou promessas ausentes.
Se houver divergência entre conhecimento geral e configuração do tenant, prevalece a configuração do tenant.

${ctx.tenantBusinessContext.trim().slice(0, 18000)}`
    : "";

  const templateBlock = ctx.templateGuidance?.trim()
    ? `\n━━━ MODELO DE PROPOSTA DA EMPRESA (referência de estrutura e tom) ━━━\nO usuário enviou um modelo de proposta padrão da empresa. Use-o como referência para estrutura, nomenclatura de seções e tom de linguagem. Não copie o conteúdo — adapte-o ao lead atual.\n\n${ctx.templateGuidance.trim().slice(0, 8000)}`
    : "";

  const refinementBlock = ctx.refinementNotes?.trim()
    ? `\n━━━ INSTRUÇÕES ESPECÍFICAS (PRIORIDADE MÁXIMA) ━━━\n${ctx.refinementNotes.trim()}\nESSAS INSTRUÇÕES DEVEM SER APLICADAS FIELMENTE. Elas sobrepõem qualquer outra diretriz de estilo ou formato.`
    : "";

  const styleMemoryBlock = ctx.styleMemory && (
    ctx.styleMemory.toneNotes ||
    ctx.styleMemory.structureNotes ||
    ctx.styleMemory.contentNotes ||
    ctx.styleMemory.avoidNotes
  ) ? `\n━━━ PREFERÊNCIAS DO USUÁRIO (aprendidas de ${ctx.styleMemory.editCount ?? 0} edição(ões) anterior(es)) ━━━
Essas preferências foram extraídas automaticamente das edições que o usuário fez em propostas anteriores. Aplique-as como padrão — podem ser sobrescritas por instruções específicas acima.
${ctx.styleMemory.toneNotes ? `• Tom/Voz: ${ctx.styleMemory.toneNotes}` : ""}
${ctx.styleMemory.structureNotes ? `• Estrutura: ${ctx.styleMemory.structureNotes}` : ""}
${ctx.styleMemory.contentNotes ? `• Conteúdo: ${ctx.styleMemory.contentNotes}` : ""}
${ctx.styleMemory.avoidNotes ? `• Evitar: ${ctx.styleMemory.avoidNotes}` : ""}` : "";

  return `Gere o conteúdo de uma proposta comercial personalizada em formato JSON estrito ${tenantLabel} para o cliente abaixo.

━━━ DADOS DO CLIENTE ━━━
- Nome: ${ctx.leadName}
- Empresa: ${ctx.empresa || "Não informado"}
- Objetivo declarado: ${ctx.objetivo || "Não informado"}
- Mercado/Segmento: ${ctx.mercadoSegmento || "Não informado"}
- Cor de destaque da marca: ${ctx.corDestaque}
${segmentoBlock}
${productsBlock}
${propostasBlock}
${briefingBlock}
${intelligenceBlock}
${tenantBusinessContextBlock}

━━━ AMOSTRA DE CONVERSA (calibre o tom exato ao estilo do cliente) ━━━
${ctx.conversationSamples || "Sem conversa disponível. Use tom profissional, direto e respeitoso."}
${templateBlock}
${styleMemoryBlock}
${refinementBlock}
━━━ ESTRUTURA JSON OBRIGATÓRIA ━━━
Retorne APENAS JSON válido — sem markdown, sem \`\`\`json, sem texto antes ou depois.

{
  "hero": {
    "tagline": "3-5 palavras do segmento. Ex: 'Para o varejo que quer crescer'",
    "headline": "Título principal — curiosidade e urgência real. Máx 10 palavras. Ex: 'Enquanto você demora 2h para responder, seu concorrente já fechou.'",
    "subheadline": "2 frases máximo explicando o que será entregue e por que agora. Direto, sem buzzwords.",
    "ctaPrimary": "Ação clara. Ex: 'Ver como funciona na prática'",
    "ctaSecondary": "Ação secundária. Ex: 'Tirar dúvidas no WhatsApp'",
    "forTag": "Preparado para [${ctx.empresa || ctx.leadName}] — [segmento específico]"
  },
  "company": {
    "title": "Quem somos",
    "text": "Breve apresentação factual da empresa vendedora/tenant, usando somente dados fornecidos.",
    "highlights": ["Diferencial factual 1", "Diferencial factual 2", "Diferencial factual 3"]
  },
  "offer": {
    "title": "Produto ou serviço",
    "text": "Explicação curta do produto/serviço ofertado e de como ele funciona.",
    "bullets": ["Benefício ou característica factual 1", "Benefício ou característica factual 2", "Benefício ou característica factual 3"]
  },
  "curiosities": {
    "title": "Vale saber",
    "items": [
      { "title": "Curiosidade ou orientação", "text": "Informação educativa útil, sem inventar dados." }
    ]
  },
  "proof": {
    "title": "Experiência e confiança",
    "items": [
      { "title": "Case, prova ou diferencial", "text": "Somente quando houver evidência no contexto do tenant." }
    ]
  },
  "faq": {
    "title": "Perguntas frequentes",
    "items": [
      { "question": "Pergunta frequente", "answer": "Resposta curta e objetiva baseada em informação disponível." }
    ]
  },
  "situation": {
    "title": "Frase que nomeia a situação atual — o cliente deve se reconhecer.",
    "subtitle": "1 frase contextualizando o cenário com dado real do segmento.",
    "facts": [
      { "num": "dado numérico impactante", "label": "o que esse número significa" }
    ],
    "bridge": "1-2 frases conectando a situação aos problemas. Cria antecipação."
  },
  "problem": {
    "title": "Nome o problema central de forma que doa.",
    "subtitle": "1 frase que amplifica o impacto do problema.",
    "cards": [
      { "cod": "Problema 01", "title": "Nome curto do problema", "text": "1-2 frases descrevendo o problema com linguagem do segmento." }
    ]
  },
  "implication": {
    "title": "Título que mostra o custo real de não resolver.",
    "subtitle": "1 frase de urgência.",
    "cascade": [
      { "num": "01", "text": "Implicação encadeada — causa e efeito em 1-2 frases." }
    ],
    "close": "1 frase de fechamento — poética e impactante."
  },
  "value": {
    "title": "Pergunta que planta a semente da solução na mente do cliente",
    "questions": [
      "Pergunta retórica que o cliente responde mentalmente com 'sim, eu quero isso'."
    ],
    "close": "1 frase preparando a revelação da solução."
  },
  "solution": {
    "title": "Nome da solução com clareza e impacto.",
    "subtitle": "2 frases explicando como resolve os problemas.",
    "agents": [
      { "tag": "Nome do agente/feature", "title": "O que ele faz em uma linha", "text": "Como resolve um problema do cliente. Concreto, 1-2 frases." }
    ],
    "ticket": {
      "storeName": "${ctx.empresa || ctx.leadName}",
      "clientBubble": "Mensagem real de cliente do segmento",
      "agentBubble": "Resposta do agente de IA",
      "responseTime": "tempo realista"
    }
  },
  "modules": {
    "title": "Como a solução se encaixa na operação de ${ctx.empresa || ctx.leadName}",
    "subtitle": "1 frase explicando que os módulos foram pensados para o segmento.",
    "mods": [
      { "cod": "01", "title": "Nome do módulo", "text": "O que faz e qual resultado gera. Máx 2 frases." }
    ]
  },
  "cta": {
    "title": "Chamada para ação com urgência real. Ex: 'Enquanto você lê isso, um lead seu pode estar esperando resposta.'",
    "subtitle": "2 frases explicando o próximo passo.",
    "button": "Ação específica. Ex: 'Quero ver funcionando na minha empresa'"
  },
  "meta": {
    "whatsappUrl": "https://wa.me/${ctx.tenantPhone ? ctx.tenantPhone.replace(/\D/g, "") : ""}",
    "clientName": "${ctx.empresa || ctx.leadName}"
  }
}

━━━ REGRAS DE QUALIDADE ━━━
1. NUNCA use clichês como "transforme seu negócio", "leve ao próximo nível", "solução completa", "inovador", "robusto".
2. situation.facts: use até 3 fatos verificáveis a partir do contexto fornecido. Não invente números; quando não houver estatísticas reais, prefira fatos qualitativos e objetivos.
3. problem.cards: exatamente 2 cards, cada um descrevendo um problema real e distinto com linguagem do dia a dia.
4. implication.cascade: exatamente 3 passos em cadeia — cada um piora o anterior logicamente.
5. value.questions: exatamente 2 perguntas retóricas — o cliente deve responder mentalmente "sim" para ambas.
6. solution.agents: exatamente 2 agentes/funcionalidades com tags distintas.
7. modules.mods: exatamente 3 módulos específicos ao segmento${ctx.products.length ? ` (baseie-se nos produtos: ${ctx.products.map((p) => p.nome).join(", ")})` : ""}.
8. Se briefing existir, os problemas e implicações DEVEM refletir as respostas do briefing — não invente problemas que o cliente não mencionou.
9. Cada campo de texto: máximo 2 frases curtas e diretas. Sem padding. Seja objetivo.
10. Retorne APENAS JSON válido. Nada antes ou depois.
10.1. company, offer, curiosities, proof e faq formam o "breve site" comercial da proposta. Preencha somente com informações sustentadas pelo contexto fornecido; se um bloco não tiver dados confiáveis, retorne arrays vazios ou texto vazio em vez de inventar conteúdo.
10.2. A apresentação da empresa e a página de diferenciais DEVEM priorizar a Configuração Oficial do Tenant quando disponível. Não use frases genéricas como "referência no segmento", "equipe altamente qualificada" ou "compromisso com a excelência" se existirem posicionamento, mensagens-chave, diferenciais ou benefícios específicos cadastrados.
10.3. Quando a solução ofertada tiver benefícios técnicos cadastrados (ex.: isolamento térmico, conforto acústico, eficiência energética, velocidade de execução, durabilidade, segurança, sustentabilidade), converta-os em benefícios claros para o cliente e destaque os mais relevantes na capa, em "offer.bullets" e em "company.highlights", sem inventar métricas.
11. NUNCA mencione valores monetários (R$, preços, custos, investimento, orçamento, "a partir de", "mensalidade") em NENHUM campo do JSON — nem no hero, nem no subheadline, nem em modules, nem em cta. Os valores financeiros serão exibidos exclusivamente na seção de orçamento, que é gerada separadamente.\n12. O orçamento selecionado é a FONTE DE VERDADE para escopo e dados comerciais. A IA pode melhorar apenas a narrativa comercial; nunca pode alterar itens, etapas, quantidades, valores, condições, cronograma, total ou especificações cadastradas no sistema.`;
}

// ── HTML renderer from JSON + theme ─────────────────────────────────────────
function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const { execSync } = require("child_process") as typeof import("child_process");
  for (const cmd of ["which chromium", "which chromium-browser", "which google-chrome"]) {
    try { const p = execSync(cmd, { encoding: "utf-8" }).trim(); if (p) return p; } catch {}
  }
  return "/usr/bin/chromium";
}

export async function generateProposalPDF(htmlContent: string): Promise<Buffer> {
  let browser: any = null;
  try {
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveChromiumPath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15_000);
    page.setDefaultTimeout(15_000);
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.emulateMediaType("print");

    // A proposta pode ser visualizada em modo site/híbrido, onde as regras de tela
    // removem as quebras entre páginas. No PDF, porém, a estrutura salva no Studio
    // é a fonte de verdade: cada .studio-page/.page deve voltar a ocupar uma folha A4.
    // O CSS é injetado por último para vencer as regras responsivas do preview.
    await page.addStyleTag({
      content: `
        @page { size: A4; margin: 0; }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .studio-page,
          .studio-web .studio-page,
          .studio-hybrid .studio-page,
          .document-layout .page,
          .web-interactive .page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            break-before: auto !important;
            break-after: page !important;
            page-break-before: auto !important;
            page-break-after: always !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            box-shadow: none !important;
          }

          .studio-page:last-child,
          .studio-web .studio-page:last-child,
          .studio-hybrid .studio-page:last-child,
          .document-layout .page:last-child,
          .web-interactive .page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .studio-web-nav,
          .proposal-web-nav,
          .web-stage-toggle,
          .web-accept {
            display: none !important;
          }

          .studio-web .studio-hdr,
          .studio-web .studio-footer {
            display: flex !important;
          }
        }
      `,
    });

    await page.evaluate(async () => {
      const pending = Array.from(document.images).filter((img) => !img.complete);
      await Promise.all(
        pending.map((img) => new Promise<void>((resolve) => {
          const finish = () => resolve();
          img.addEventListener("load", finish, { once: true });
          img.addEventListener("error", finish, { once: true });
          setTimeout(finish, 3_500);
        })),
      );
    });
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn({ err }, "proposal-engine: puppeteer failed, returning HTML fallback");
    return Buffer.from(htmlContent, "utf-8");
  } finally {
    if (browser) {
      await browser.close().catch((closeErr: unknown) => {
        logger.warn({ err: closeErr }, "proposal-engine: failed to close chromium");
      });
    }
  }
}

type ProposalPresentationMode = "completo" | "resumo_etapa" | "preco_medio";

type ProposalStagePhase = {
  id: string;
  nome: string;
  ordem: number;
  duracaoDias?: number;
  percentualEtapa?: number;
  percentualFisico?: number;
  inicioPrevisto?: string;
  fimPrevisto?: string;
  dependeDeFaseId?: string;
  tipoDependencia?: "FS" | "SS" | "FF" | "SF";
  defasagemDias?: number;
  observacao?: string;
};

type ProposalStageSchedule = {
  duracaoDias?: number;
  percentualFisico?: number;
  inicioPrevisto?: string;
  fimPrevisto?: string;
  dependeDeEtapaId?: string;
  tipoDependencia?: "FS" | "SS" | "FF" | "SF";
  defasagemDias?: number;
  inicioAutomatico?: boolean;
  fases?: ProposalStagePhase[];
  observacao?: string;
  marcoPagamento?: string;
  valorGlobalPrevisto?: number;
  valorReferenciaM2?: number;
  mostrarOrcamentoPrevisto?: boolean;
  reajusteSeAlteracao?: boolean;
};

type ProposalPresentationConfig = {
  formato?: "site_interativo" | "documento" | "hibrido";
  estiloCasa?: "moderna" | "contemporanea" | "minimalista" | "classica" | "industrial";
  padraoCasa?: "medio" | "alto_padrao" | "luxo";
  tipoCasa?: "terrea" | "sobrado";
  elementosVisuais?: string[];
  imagemCapa?: string;
  modoPadrao?: ProposalPresentationMode;
  etapas?: Record<string, ProposalPresentationMode>;
  mostrarTotalGeral?: boolean;
  mostrarDetalhamentoTecnico?: boolean;
  detalhamentoTecnicoEtapas?: Record<string, boolean>;
  previsaoInicio?: string;
  cronogramaEtapas?: Record<string, ProposalStageSchedule>;
  imagensEtapas?: Record<string, string>;
  mostrarCronogramaExecucao?: boolean;
  mostrarFisicoFinanceiro?: boolean;
  entradaPercentual?: number;
  amortizacaoEntradaPercentual?: number;
  mostrarAmortizacaoEntrada?: boolean;
  mostrarPortalCliente?: boolean;
  areaTotalConstruida?: number;
  itensNaoInclusos?: string[];
  descricaoProjeto?: string;
  premissasObra?: string[];
  memorialDescritivo?: string;
  politicaReajuste?: string;
  garantiasContratuais?: string;
  condicoesPagamentoDetalhadas?: string;
};

type PresentableProposalItem = {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  sku?: string | null;
  descricao?: string | null;
  etapaId?: string | null;
  etapaNome?: string | null;
  etapaOrdem?: number | null;
  unidade?: string | null;
};

function normalizeProposalPresentation(
  value?: ProposalPresentationConfig | null,
): Required<ProposalPresentationConfig> {
  return {
    formato: value?.formato === "documento" || value?.formato === "hibrido" ? value.formato : "site_interativo",
    estiloCasa: value?.estiloCasa === "moderna" || value?.estiloCasa === "minimalista" || value?.estiloCasa === "classica" || value?.estiloCasa === "industrial"
      ? value.estiloCasa
      : "contemporanea",
    padraoCasa: value?.padraoCasa === "medio" || value?.padraoCasa === "luxo" ? value.padraoCasa : "alto_padrao",
    tipoCasa: value?.tipoCasa === "terrea" ? "terrea" : "sobrado",
    elementosVisuais: Array.isArray(value?.elementosVisuais)
      ? value.elementosVisuais.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12)
      : [],
    imagemCapa: typeof value?.imagemCapa === "string" ? value.imagemCapa : "",
    modoPadrao: value?.modoPadrao ?? "completo",
    etapas: value?.etapas ?? {},
    mostrarTotalGeral: value?.mostrarTotalGeral ?? true,
    mostrarDetalhamentoTecnico: value?.mostrarDetalhamentoTecnico ?? true,
    detalhamentoTecnicoEtapas: value?.detalhamentoTecnicoEtapas ?? {},
    previsaoInicio: value?.previsaoInicio ?? "",
    cronogramaEtapas: value?.cronogramaEtapas ?? {},
    imagensEtapas: value?.imagensEtapas ?? {},
    mostrarCronogramaExecucao: value?.mostrarCronogramaExecucao ?? true,
    mostrarFisicoFinanceiro: value?.mostrarFisicoFinanceiro ?? true,
    entradaPercentual: Math.max(0, Math.min(100, Number(value?.entradaPercentual ?? 0))),
    amortizacaoEntradaPercentual: Math.max(0, Math.min(100, Number(value?.amortizacaoEntradaPercentual ?? value?.entradaPercentual ?? 0))),
    mostrarAmortizacaoEntrada: value?.mostrarAmortizacaoEntrada ?? true,
    mostrarPortalCliente: value?.mostrarPortalCliente ?? true,
    areaTotalConstruida: Number.isFinite(Number(value?.areaTotalConstruida)) && Number(value?.areaTotalConstruida) > 0
      ? Number(value?.areaTotalConstruida)
      : 0,
    itensNaoInclusos: Array.isArray(value?.itensNaoInclusos)
      ? value.itensNaoInclusos.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    descricaoProjeto: typeof value?.descricaoProjeto === "string" ? value.descricaoProjeto.trim() : "",
    premissasObra: Array.isArray(value?.premissasObra)
      ? value.premissasObra.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    memorialDescritivo: typeof value?.memorialDescritivo === "string" ? value.memorialDescritivo.trim() : "",
    politicaReajuste: typeof value?.politicaReajuste === "string" ? value.politicaReajuste.trim() : "",
    garantiasContratuais: typeof value?.garantiasContratuais === "string" ? value.garantiasContratuais.trim() : "",
    condicoesPagamentoDetalhadas: typeof value?.condicoesPagamentoDetalhadas === "string" ? value.condicoesPagamentoDetalhadas.trim() : "",
  };
}

function groupProposalPresentationItems<T extends PresentableProposalItem>(items: T[]) {
  const hasStages = items.some((item) => item.etapaId || item.etapaNome || item.etapaOrdem);
  if (!hasStages) {
    return [{ id: "__all__", ordem: 1, nome: "", hasStageHeader: false, itens: items }];
  }

  return Array.from(
    items.reduce((groups, item, index) => {
      const ordem = item.etapaOrdem ?? index + 1;
      const nome = item.etapaNome ?? `Etapa ${ordem}`;
      const id = item.etapaId ?? `__stage_${ordem}_${nome}`;
      const group = groups.get(id) ?? { id, ordem, nome, hasStageHeader: true, itens: [] as T[] };
      group.itens.push(item);
      groups.set(id, group);
      return groups;
    }, new Map<string, { id: string; ordem: number; nome: string; hasStageHeader: boolean; itens: T[] }>())
  )
    .map(([, group]) => group)
    .sort((a, b) => a.ordem - b.ordem);
}

function resolveProposalPresentationMode(
  presentation: Required<ProposalPresentationConfig>,
  stageId: string,
): ProposalPresentationMode {
  return presentation.etapas[stageId] ?? presentation.modoPadrao;
}

function resolveProposalTechnicalDetail(
  presentation: Required<ProposalPresentationConfig>,
  stageId: string,
): boolean {
  return presentation.detalhamentoTecnicoEtapas[stageId] ?? presentation.mostrarDetalhamentoTecnico;
}

function proposalDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const text = String(value).trim();
  if (!text) return null;
  const plainDate = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00`)
    : new Date(text);
  return Number.isNaN(plainDate.getTime()) ? null : plainDate;
}

function proposalAddDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function proposalDiffDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function proposalFormatDate(value?: string | Date | null): string {
  const date = proposalDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "A definir";
}

function proposalResolveDependencyStart(
  predecessor: { start: Date | null; end: Date | null } | undefined,
  type: "FS" | "SS" | "FF" | "SF",
  lagDays: number,
  durationDays: number,
): Date | null {
  if (!predecessor) return null;
  if (type === "SS" && predecessor.start) return proposalAddDays(predecessor.start, lagDays);
  if (type === "FS" && predecessor.end) return proposalAddDays(predecessor.end, 1 + lagDays);
  if (type === "FF" && predecessor.end) return proposalAddDays(predecessor.end, lagDays - Math.max(0, durationDays - 1));
  if (type === "SF" && predecessor.start) return proposalAddDays(predecessor.start, lagDays - Math.max(0, durationDays - 1));
  return null;
}

function buildProposalScheduleRows<T extends PresentableProposalItem>(
  groups: Array<{ id: string; ordem: number; nome: string; hasStageHeader: boolean; itens: T[] }>,
  presentation: Required<ProposalPresentationConfig>,
  total: number,
) {
  const globalStart = proposalDate(presentation.previsaoInicio);
  const dateByStage = new Map<string, { start: Date | null; end: Date | null }>();
  const rawRows: Array<any> = [];

  groups.forEach((group, index) => {
    const config = presentation.cronogramaEtapas[group.id] ?? {};
    const value = group.itens.reduce(
      (sum, item) => sum + Number(item.quantidade || 0) * Number(item.valorUnitario || 0),
      0,
    );
    const financialPercent = total > 0 ? (value / total) * 100 : 0;
    const explicitStart = proposalDate(config.inicioPrevisto);
    const explicitEnd = proposalDate(config.fimPrevisto);
    const configuredDuration = Number(config.duracaoDias ?? 0);
    const duration = configuredDuration > 0
      ? Math.round(configuredDuration)
      : explicitStart && explicitEnd ? proposalDiffDays(explicitStart, explicitEnd) : 1;
    const defaultDependency = index > 0 ? groups[index - 1]?.id : undefined;
    const dependencyId = config.dependeDeEtapaId ?? defaultDependency;
    const predecessor = dependencyId ? dateByStage.get(dependencyId) : undefined;
    const type = config.tipoDependencia ?? "FS";
    const lagDays = Number(config.defasagemDias ?? 0);
    // A data explicitamente cadastrada no orçamento é soberana.
    // Isso preserva etapas paralelas; dependências só calculam a data quando
    // não existe início definido pelo usuário.
    const start = explicitStart
      ?? (index === 0 ? globalStart : null)
      ?? proposalResolveDependencyStart(predecessor, type, lagDays, duration)
      ?? globalStart;
    const end = config.inicioAutomatico === false && explicitEnd
      ? explicitEnd
      : start ? proposalAddDays(start, duration - 1) : explicitEnd;

    dateByStage.set(group.id, { start, end });
    const configuredPhysical = Number(config.percentualFisico);
    rawRows.push({
      ...group,
      config,
      value,
      financialPercent,
      configuredPhysicalPercent: Number.isFinite(configuredPhysical) ? configuredPhysical : null,
      start,
      end,
      duration,
      observacao: config.observacao?.trim() || "",
      marcoPagamento: config.marcoPagamento?.trim() || "",
    });
  });

  const totalDuration = rawRows.reduce((sum, row) => sum + Number(row.duration ?? 0), 0);
  const missingPhysical = rawRows.filter((row) => row.configuredPhysicalPercent === null);
  const configuredPhysicalTotal = rawRows.reduce(
    (sum, row) => sum + Number(row.configuredPhysicalPercent ?? 0),
    0,
  );
  const remainingPhysical = Math.max(0, 100 - configuredPhysicalTotal);
  const missingDurationTotal = missingPhysical.reduce(
    (sum, row) => sum + Number(row.duration ?? 0),
    0,
  );

  const resolvedRows = rawRows.map((row) => {
    const automaticPhysical = row.configuredPhysicalPercent !== null
      ? row.configuredPhysicalPercent
      : missingPhysical.length === 0
        ? 0
        : missingDurationTotal > 0 && row.duration
          ? (Number(row.duration) / missingDurationTotal) * remainingPhysical
          : totalDuration > 0 && row.duration
            ? (Number(row.duration) / totalDuration) * 100
            : remainingPhysical / missingPhysical.length;
    const physicalPercent = Math.max(0, automaticPhysical);

    const phaseDateMap = new Map<string, { start: Date | null; end: Date | null }>();
    const phases = (row.config.fases ?? []).map((phase: ProposalStagePhase, index: number, all: ProposalStagePhase[]) => {
      const configuredShare = Number(phase.percentualEtapa ?? 0);
      const totalConfiguredShare = all.reduce((sum, item) => sum + Number(item.percentualEtapa ?? 0), 0);
      const share = configuredShare > 0
        ? (totalConfiguredShare > 100 ? configuredShare / totalConfiguredShare : configuredShare / 100)
        : all.length ? 1 / all.length : 1;
      const explicitStart = proposalDate(phase.inicioPrevisto);
      const explicitEnd = proposalDate(phase.fimPrevisto);
      const duration = Number(phase.duracaoDias ?? 0) > 0
        ? Math.round(Number(phase.duracaoDias))
        : explicitStart && explicitEnd ? proposalDiffDays(explicitStart, explicitEnd) : Math.max(1, Math.round((row.duration ?? 1) * share));
      const defaultDependency = index > 0 ? all[index - 1]?.id : undefined;
      const dependencyId = phase.dependeDeFaseId ?? defaultDependency;
      const predecessor = dependencyId ? phaseDateMap.get(dependencyId) : undefined;
      const start = explicitStart
        ?? (index === 0 ? row.start : null)
        ?? proposalResolveDependencyStart(predecessor, phase.tipoDependencia ?? "FS", Number(phase.defasagemDias ?? 0), duration)
        ?? row.start;
      const end = explicitEnd ?? (start ? proposalAddDays(start, duration - 1) : row.end);
      phaseDateMap.set(phase.id, { start, end });
      return {
        id: `${row.id}::${phase.id}`,
        ordem: phase.ordem ?? index + 1,
        nome: `${row.nome} · ${phase.nome}`,
        value: row.value * share,
        physicalPercent: Number.isFinite(Number(phase.percentualFisico))
          ? Math.max(0, Math.min(100, Number(phase.percentualFisico)))
          : physicalPercent * share,
        start,
        end,
        duration,
      };
    });

    return {
      ...row,
      physicalPercent,
      phases,
    };
  });

  const rawPhysicalTotal = resolvedRows.reduce((sum, row) => sum + Number(row.physicalPercent || 0), 0);
  if (resolvedRows.length && rawPhysicalTotal > 0) {
    let accumulated = 0;
    return resolvedRows.map((row, index) => {
      const normalized = index === resolvedRows.length - 1
        ? Math.max(0, 100 - accumulated)
        : (Number(row.physicalPercent || 0) / rawPhysicalTotal) * 100;
      accumulated += normalized;
      const phaseTotal = (row.phases ?? []).reduce((sum: number, phase: ProposalScheduleRow) => sum + Number(phase.physicalPercent || 0), 0);
      const normalizedPhases = phaseTotal > 0
        ? (row.phases ?? []).map((phase: ProposalScheduleRow) => ({
            ...phase,
            physicalPercent: normalized * (Number(phase.physicalPercent || 0) / phaseTotal),
          }))
        : row.phases;
      return { ...row, physicalPercent: normalized, phases: normalizedPhases };
    });
  }

  return resolvedRows;
}

type ProposalScheduleRow = {
  id: string;
  ordem: number;
  nome: string;
  value: number;
  physicalPercent: number;
  financialPercent?: number;
  start: Date | null;
  end: Date | null;
  duration?: number;
  phases?: ProposalScheduleRow[];
};

function proposalMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function proposalMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, Math.max(0, month - 1), 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function proposalMonthBounds(key: string): { start: Date; end: Date } {
  const [year, month] = key.split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1, 12, 0, 0),
    end: new Date(year, month, 0, 12, 0, 0),
  };
}

function proposalOverlapDays(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number {
  const from = start.getTime() > rangeStart.getTime() ? start : rangeStart;
  const to = end.getTime() < rangeEnd.getTime() ? end : rangeEnd;
  if (to.getTime() < from.getTime()) return 0;
  return proposalDiffDays(from, to);
}

function proposalExpandedScheduleRows(rows: ProposalScheduleRow[]) {
  return rows.flatMap((row) => row.phases?.length ? row.phases : [row]);
}

function buildProposalMonthlyMatrix(
  rows: ProposalScheduleRow[],
  presentation: Required<ProposalPresentationConfig>,
  total: number,
) {
  const expandedRows = proposalExpandedScheduleRows(rows);
  const scheduled = expandedRows.filter(
    (row) => row.start && row.end && Number(row.duration ?? 0) > 0,
  );
  if (!scheduled.length) return [];

  const firstStart = scheduled.reduce(
    (min, row) => row.start!.getTime() < min.getTime() ? row.start! : min,
    scheduled[0].start!,
  );
  const lastEnd = scheduled.reduce(
    (max, row) => row.end!.getTime() > max.getTime() ? row.end! : max,
    scheduled[0].end!,
  );

  const periods: string[] = [];
  const cursor = new Date(firstStart.getFullYear(), firstStart.getMonth(), 1, 12, 0, 0);
  const limit = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1, 12, 0, 0);
  while (cursor.getTime() <= limit.getTime() && periods.length < 48) {
    periods.push(proposalMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  let remainingAdvance = total * presentation.entradaPercentual / 100;
  let accumulatedPhysical = 0;
  return periods.map((period) => {
    const bounds = proposalMonthBounds(period);
    const stages = scheduled.map((row) => {
      const overlapDays = proposalOverlapDays(row.start!, row.end!, bounds.start, bounds.end);
      const share = row.duration && overlapDays > 0 ? overlapDays / row.duration : 0;
      return {
        id: row.id,
        ordem: row.ordem,
        nome: row.nome,
        amount: row.value * share,
        physical: row.physicalPercent * share,
        share,
      };
    });
    const amount = stages.reduce((sum, stage) => sum + stage.amount, 0);
    const physical = stages.reduce((sum, stage) => sum + stage.physical, 0);
    const amortization = presentation.mostrarAmortizacaoEntrada
      ? Math.min(remainingAdvance, amount * presentation.amortizacaoEntradaPercentual / 100)
      : 0;
    remainingAdvance = Math.max(0, remainingAdvance - amortization);
    accumulatedPhysical = Math.min(100, accumulatedPhysical + physical);

    return {
      key: period,
      label: proposalMonthLabel(period),
      stages,
      amount,
      physical,
      accumulatedPhysical,
      amortization,
      netAmount: Math.max(0, amount - amortization),
      remainingAdvance,
    };
  });
}

function renderProposalMonthlyMatrix(
  rows: ProposalScheduleRow[],
  presentation: Required<ProposalPresentationConfig>,
  total: number,
  fmtMoney: (value: number) => string,
): string {
  const periods = buildProposalMonthlyMatrix(rows, presentation, total);
  if (!periods.length) return "";
  const displayRows = proposalExpandedScheduleRows(rows);

  const chunks: typeof periods[] = [];
  for (let index = 0; index < periods.length; index += 6) {
    chunks.push(periods.slice(index, index + 6));
  }

  return chunks.map((chunk, chunkIndex) => {
    const body = displayRows.map((row) => {
      const cells = chunk.map((period) => {
        const stage = period.stages.find((item) => item.id === row.id);
        if (!stage || stage.share <= 0) return '<td class="period-empty">—</td>';
        return `<td class="period-cell"><strong>${fmtMoney(stage.amount)}</strong></td>`;
      }).join("");
      return `<tr>
        <td class="period-stage"><strong>${escapeProposalText(row.nome || "Execução")}</strong></td>
        ${cells}
      </tr>`;
    }).join("");

    const totalFooter = chunk.map((period) => `<td class="r"><strong>${fmtMoney(period.amount)}</strong></td>`).join("");
    const hasAdvance = presentation.entradaPercentual > 0 && presentation.mostrarAmortizacaoEntrada;
    const amortFooter = hasAdvance
      ? chunk.map((period) => `<td class="r"><strong>-${fmtMoney(period.amortization)}</strong></td>`).join("")
      : "";
    const netFooter = hasAdvance
      ? chunk.map((period) => `<td class="r"><strong>${fmtMoney(period.netAmount)}</strong></td>`).join("")
      : "";

    const firstPeriodNumber = chunkIndex * 6 + 1;
    const lastPeriodNumber = firstPeriodNumber + chunk.length - 1;

    return `<div class="period-matrix-group">
      <div class="period-matrix-caption">${chunks.length > 1 ? `Períodos ${firstPeriodNumber}–${lastPeriodNumber}` : "Fluxo mensal previsto"}</div>
      <table class="period-matrix">
        <thead>
          <tr><th>Etapa / fase</th>${chunk.map((period) => `<th class="r">${period.label}</th>`).join("")}</tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr><td>Total previsto no período</td>${totalFooter}</tr>
          ${hasAdvance ? `<tr><td>Amortização da entrada</td>${amortFooter}</tr><tr><td>Total líquido previsto</td>${netFooter}</tr>` : ""}
        </tfoot>
      </table>
    </div>`;
  }).join("");
}

function escapeProposalText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function proposalScopeDescription(item: PresentableProposalItem): string {
  const rawDescription = (item.descricao ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const boilerplate = /composi[cç][aã]o detalhada importada|planilha de custos original|refer[eê]ncia \d{2}\/\d{4}|^etapa \d+\s*[•·-]/i;
  if (rawDescription && !boilerplate.test(rawDescription)) {
    const max = 220;
    const concise = rawDescription.length > max
      ? `${rawDescription.slice(0, max - 1).trimEnd()}…`
      : rawDescription;
    return escapeProposalText(concise);
  }

  const itemName = item.nome.trim() || "esta atividade";
  const normalized = itemName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const descriptions: Array<[RegExp, string]> = [
    [/projeto|legaliza|arquitet|interiores|instalacoes/, "Desenvolvimento, compatibilização e documentação técnica conforme o escopo contratado e as exigências aplicáveis à obra."],
    [/sondagem|spt/, "Investigação do solo para apoio às definições de fundação e às decisões técnicas do projeto."],
    [/limpeza do terreno|preparacao do canteiro|canteiro/, "Preparação inicial do terreno e organização do canteiro para início seguro e ordenado dos serviços."],
    [/movimentacao de terra|terraplen/, "Movimentação, regularização e conformação do terreno conforme cotas e necessidades do projeto."],
    [/radier|fundacao/, "Execução da fundação prevista, incluindo preparação, armação, passagens e concretagem conforme projeto estrutural."],
    [/icf|formas icf|armadura|colunas|vigas|vergas|contravergas/, "Execução da estrutura em sistema ICF, com montagem, armações, alinhamento e concretagem conforme projeto estrutural."],
    [/laje/, "Execução das lajes previstas, incluindo elementos estruturais, armações, concretagem e acabamentos técnicos da etapa."],
    [/cobertura|telha|rufo|calha/, "Execução da cobertura e seus arremates, incluindo estrutura, telhamento, rufos, calhas e estanqueidade prevista."],
    [/hidraul|tubo|esgoto|cisterna|boiler|pressur|vaso|chuveiro|registro/, "Fornecimento e execução dos componentes hidrossanitários previstos, com tubulações, conexões, pontos e equipamentos definidos em projeto."],
    [/eletric|quadro|cabo|eletroduto|carro eletrico|frigorigena/, "Execução da infraestrutura elétrica prevista, incluindo eletrodutos, cabeamento, quadros, pontos e preparações técnicas."],
    [/esquadria|porta pvc|janela pvc/, "Fornecimento e instalação das esquadrias previstas, com perfis, ferragens, vidros e vedações conforme especificação."],
    [/porcelanato|revestimento/, "Fornecimento e assentamento dos revestimentos previstos, com preparação de base, paginação, rejuntamento e acabamento."],
    [/forro|gesso/, "Execução de forro em gesso conforme projeto, incluindo estrutura, fechamento, tratamento de juntas e preparação para acabamento."],
    [/massa corrida|pintura/, "Preparação das superfícies e execução do sistema de pintura previsto, com acabamento uniforme e compatível com o padrão definido."],
    [/plafon|iluminacao|luminaria/, "Instalação dos pontos e elementos de iluminação previstos conforme projeto elétrico e padrão de acabamento."],
    [/limpeza final|limpeza.*obra|entrega/, "Limpeza final, revisão de arremates, checklist e preparação da obra para entrega ao cliente."],
  ];

  const matched = descriptions.find(([pattern]) => pattern.test(normalized));
  return escapeProposalText(
    matched?.[1] ?? `Contempla ${itemName}, conforme especificações, quantitativos, padrões e condições definidos para esta etapa.`,
  );
}

function renderProposalScopeTable<T extends PresentableProposalItem>(items: T[]): string {
  if (!items.length) return "";
  const rows = items.map((item) => `
    <tr>
      <td class="scope-item">${escapeProposalText(item.nome)}</td>
      <td class="scope-description">${proposalScopeDescription(item)}</td>
    </tr>`
  ).join("");

  return `
  <div class="scope-block">
    <div class="scope-heading">
      <span>O que está contemplado nesta etapa</span>
      <span class="scope-count">${items.length} ${items.length === 1 ? "atividade" : "atividades"}</span>
    </div>
    <table class="scope-table">
      <thead>
        <tr><th>Previsto</th><th>Breve descrição da atividade</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderProposalStageImage(
  presentation: Required<ProposalPresentationConfig>,
  stageId: string,
  stageName: string,
): string {
  const url = presentation.imagensEtapas[stageId];
  if (!url) return "";
  return `
    <figure class="proposal-stage-visual">
      <img src="${escapeProposalText(url)}" alt="Imagem representativa da etapa ${escapeProposalText(stageName)}" loading="lazy" onerror="this.parentElement.style.display='none'" />
    </figure>`;
}

function renderConstructionProposalLayout(args: {
  json: Record<string, any>;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  clientName?: string;
  imagens?: string[] | null;
  orcamento: {
    titulo: string;
    numero?: string | null;
    itens: Array<{
      nome: string;
      quantidade: number;
      valorUnitario: number;
      sku?: string | null;
      descricao?: string | null;
      etapaId?: string | null;
      etapaNome?: string | null;
      etapaOrdem?: number | null;
      unidade?: string | null;
    }>;
    valorTotal?: string | null;
    observacoes?: string | null;
    formaPagamento?: string | null;
    condPagamento?: string | null;
    prazoEntrega?: string | null;
    validadeAte?: Date | string | null;
    paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
    apresentacao?: ProposalPresentationConfig | null;
  };
  builderModuleEnabled: (key: string, fallback?: boolean) => boolean;
  builderVisualStyle?: Record<string, unknown> | null;
  builderModules?: Array<Record<string, unknown>> | null;
}): string {
  const { json, tenantName, tenantLogoUrl, clientName, imagens, orcamento, builderModuleEnabled, builderVisualStyle, builderModules } = args;
  const hero = json.hero || {};
  const meta = json.meta || {};
  const companyInfo = json.company || {};
  const offerInfo = json.offer || {};
  const curiositiesInfo = json.curiosities || {};
  const proofInfo = json.proof || {};
  const faqInfo = json.faq || {};
  const presentation = normalizeProposalPresentation(orcamento.apresentacao);
  const builderModuleConfig = (key: string) =>
    Array.isArray(builderModules)
      ? builderModules.find((item) => String(item?.key ?? "") === key) ?? null
      : null;
  const builderModuleTitle = (key: string, fallback: string) => {
    const value = builderModuleConfig(key)?.title;
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  };
  const builderModuleDescription = (key: string) => {
    const value = builderModuleConfig(key)?.description;
    return typeof value === "string" && value.trim() ? value.trim() : "";
  };
  const builderModuleContent = (key: string) => {
    const value = builderModuleConfig(key)?.contentPrompt;
    return typeof value === "string" && value.trim() ? value.trim() : "";
  };
  const builderModuleImage = (key: string) => {
    const raw = builderModuleConfig(key)?.image;
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    return record.mode !== "none" && typeof record.url === "string" && record.url.trim()
      ? record.url.trim()
      : null;
  };
  const visualPreset = String(builderVisualStyle?.preset ?? "premium_arquitetonico");
  const heroVariant = String(builderVisualStyle?.heroVariant ?? "fotografico");
  const stageVariant = String(builderVisualStyle?.stageVariant ?? "cards");
  const investmentVariant = String(builderVisualStyle?.investmentVariant ?? "por_etapa");
  const density = String(builderVisualStyle?.density ?? "arejado");
  const imageEmphasis = String(builderVisualStyle?.imageEmphasis ?? "alta");
  const interactive = presentation.formato === "site_interativo" || presentation.formato === "hibrido";
  const hybrid = presentation.formato === "hibrido";
  const groupedItems = groupProposalPresentationItems(orcamento.itens);
  const calculatedTotal = orcamento.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const total = orcamento.valorTotal ? Number(orcamento.valorTotal) : calculatedTotal;
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v || 0);
  const visualImages = (imagens || []).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  // Precedência visual: override específico da proposta > padrão do modelo > biblioteca visual > etapa.
  const coverImage = presentation.imagemCapa || builderModuleImage("capa") || visualImages[0] || Object.values(presentation.imagensEtapas).find(Boolean) || null;
  const scheduleRows = buildProposalScheduleRows(groupedItems, presentation, total);
  const latestEnd = scheduleRows
    .map((row) => row.end)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const earliestStart = scheduleRows
    .map((row) => row.start)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const estimatedDays = earliestStart && latestEnd
    ? Math.max(1, Math.ceil((latestEnd.getTime() - earliestStart.getTime()) / 86400000) + 1)
    : scheduleRows.reduce((sum, row) => sum + (row.duration || 0), 0);
  const commercialDeadline = String(orcamento.prazoEntrega ?? "").trim();
  // Quando existe cronograma executivo calculável, ele é a fonte de verdade do prazo da proposta.
  // O prazo comercial informado no orçamento é usado somente quando o cronograma não permite cálculo.
  const deadlineLabel = estimatedDays > 0 ? `${estimatedDays} dias` : (commercialDeadline || "A definir");
  const company = tenantName || "Construtora";
  const client = clientName || meta.clientName || "Cliente";
  const title = orcamento.titulo || hero.title || "Construção residencial";
  const proposalContext = `${company} ${title} ${groupedItems.map((group) => group.nome).join(" ")}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const coverBenefits = extractProposalBenefits(
    builderModuleContent("diferenciais"),
    builderModuleDescription("diferenciais"),
    companyInfo.highlights,
    offerInfo.bullets,
    json.solution?.agents,
  );
  const coverValueStatement =
    builderModuleDescription("produto_servico")
    || builderModuleDescription("diferenciais")
    || String(offerInfo.text || hero.subheadline || "").trim()
    || "Uma proposta estruturada para apresentar solução, benefícios, investimento e próximos passos com clareza.";

  const accent = "#f26b21";
  const ink = "#111827";
  const muted = "#6b7280";
  const line = "#d9dde4";
  const soft = "#f5f6f8";
  const logo = tenantLogoUrl
    ? `<img src="${escapeProposalText(tenantLogoUrl)}" alt="${escapeProposalText(company)}" class="brand-logo" onerror="this.style.display='none'" />`
    : `<span class="brand-name">${escapeProposalText(company)}</span>`;

  const header = (label: string, sub?: string) => `
    <div class="topbar">
      <div class="brand">${logo}<span class="brand-line"></span></div>
      <div class="topbar-right"><strong>${escapeProposalText(label)}</strong>${sub ? `<span>${escapeProposalText(sub)}</span>` : ""}</div>
    </div>`;

  const footer = () => `
    <div class="footer">
      <span>Proposta comercial</span>
      <span>${orcamento.numero ? escapeProposalText(orcamento.numero) : escapeProposalText(company)}</span>
    </div>`;

  const totalPhases = scheduleRows.reduce((sum, row) => sum + (row.phases?.length ?? 0), 0);
  const inferredBuiltArea = groupedItems
    .flatMap((group) => group.itens)
    .find((item) => {
      const name = String(item.nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const unit = String(item.unidade ?? "").toLowerCase().replace("²", "2");
      return unit === "m2" && /(limpeza final|limpeza.*pos.?obra|area total construida)/.test(name);
    });
  const areaTotalConstruida = presentation.areaTotalConstruida > 0
    ? presentation.areaTotalConstruida
    : Number(inferredBuiltArea?.quantidade ?? 0);
  const entryValue = total * (presentation.entradaPercentual / 100);
  const contractBalanceAfterEntry = Math.max(0, total - entryValue);

  const summaryCards = [
    { label: "Valor global", value: fmtBRL(total) },
    { label: "Prazo estimado", value: deadlineLabel },
    ...(areaTotalConstruida > 0 ? [{ label: "Área total construída", value: `${areaTotalConstruida.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` }] : []),
    { label: "Etapas / fases", value: totalPhases > 0 ? `${groupedItems.length} / ${totalPhases}` : String(groupedItems.length) },
    ...(presentation.entradaPercentual > 0 ? [{ label: "Entrada / adiantamento", value: `${presentation.entradaPercentual.toFixed(2)}% · ${fmtBRL(entryValue)}` }] : []),
    ...(presentation.entradaPercentual > 0 ? [{ label: "Saldo contratual após entrada", value: fmtBRL(contractBalanceAfterEntry) }] : []),
    ...(presentation.previsaoInicio ? [{ label: "Início previsto", value: proposalFormatDate(presentation.previsaoInicio) }] : []),
  ];

  const summaryCardsHtml = summaryCards.map((item) => `
    <div class="metric">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>`).join("");

  const institutionalCards = [
    ...(builderModuleEnabled("apresentacao_empresa") && (companyInfo.title || companyInfo.text)
      ? [{ label: "EMPRESA", title: companyInfo.title || company, text: companyInfo.text || "", items: companyInfo.highlights || [] }]
      : []),
    ...(builderModuleEnabled("produto_servico") && (offerInfo.title || offerInfo.text)
      ? [{ label: "PRODUTO / SERVIÇO", title: offerInfo.title || "O que estamos propondo", text: offerInfo.text || "", items: offerInfo.bullets || [] }]
      : []),
  ];
  const institutionalPageHtml =
    institutionalCards.length
    || (builderModuleEnabled("curiosidades_conteudo") && Array.isArray(curiositiesInfo.items) && curiositiesInfo.items.length)
    || (builderModuleEnabled("cases_provas") && Array.isArray(proofInfo.items) && proofInfo.items.length)
    || (builderModuleEnabled("faq") && Array.isArray(faqInfo.items) && faqInfo.items.length)
      ? `
<section class="page">
  ${header("CONHEÇA A EMPRESA", "Informação institucional e educativa")}
  <h1 class="summary-heading">Antes do orçamento, conheça melhor a proposta</h1>
  <p class="summary-lead">Uma visão rápida da empresa, da solução e de informações úteis para apoiar sua decisão.</p>
  <div class="organize-grid" style="margin-top:7mm;">
    ${institutionalCards.map((card) => `<div class="organize-item"><span class="value-kicker">${escapeProposalText(String(card.label))}</span><b>${escapeProposalText(String(card.title))}</b><p>${escapeProposalText(String(card.text))}</p>${Array.isArray(card.items) && card.items.length ? `<p style="margin-top:2mm;">${card.items.map((item: unknown) => "• " + escapeProposalText(String(item))).join("<br>")}</p>` : ""}</div>`).join("")}
    ${builderModuleEnabled("curiosidades_conteudo") ? (curiositiesInfo.items || []).map((item: any) => `<div class="organize-item"><span class="value-kicker">VALE SABER</span><b>${escapeProposalText(String(item?.title || ""))}</b><p>${escapeProposalText(String(item?.text || ""))}</p></div>`).join("") : ""}
    ${builderModuleEnabled("cases_provas") ? (proofInfo.items || []).map((item: any) => `<div class="organize-item"><span class="value-kicker">EXPERIÊNCIA</span><b>${escapeProposalText(String(item?.title || ""))}</b><p>${escapeProposalText(String(item?.text || ""))}</p></div>`).join("") : ""}
    ${builderModuleEnabled("faq") ? (faqInfo.items || []).map((item: any) => `<div class="organize-item"><span class="value-kicker">PERGUNTA FREQUENTE</span><b>${escapeProposalText(String(item?.question || ""))}</b><p>${escapeProposalText(String(item?.answer || ""))}</p></div>`).join("") : ""}
  </div>
  ${footer()}
</section>`
      : "";

  const valuePropositionHtml = builderModuleEnabled("diferenciais") ? `
      <div class="value-proposition">
        <span class="value-kicker">${escapeProposalText(builderModuleTitle("diferenciais", "DIFERENCIAIS DA SOLUÇÃO"))}</span>
        <h2>${escapeProposalText(builderModuleDescription("diferenciais") || "Benefícios que ajudam a decidir com mais clareza")}</h2>
        <p>${escapeProposalText(builderModuleContent("diferenciais") || coverValueStatement)}</p>
        ${coverBenefits.length ? `<div class="value-grid">${coverBenefits.map((benefit) => `<div><strong>${escapeProposalText(benefit)}</strong></div>`).join("")}</div>` : ""}
      </div>`
    : "";

  const stagePages = groupedItems.map((group) => {
    const row = scheduleRows.find((item) => item.id === group.id);
    const stageTotal = group.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
    const weight = total > 0 ? (stageTotal / total) * 100 : 0;
    const imageUrl = presentation.imagensEtapas[group.id] || null;
    const financialMode = resolveProposalPresentationMode(presentation, group.id);
    const showTechnicalDetail = resolveProposalTechnicalDetail(presentation, group.id);
    const scopeRows = group.itens.map((item) => `
      <tr>
        <td class="scope-name">${escapeProposalText(item.nome)}</td>
        <td>${proposalScopeDescription(item)}</td>
      </tr>`).join("");

    const phaseTable = row?.phases?.length
      ? `
        <div class="phase-block">
          <h2 class="scope-title">Fases de execução e medição</h2>
          <table class="phase-table">
            <thead><tr><th>Fase</th><th>Início</th><th>Término</th><th class="r">% da execução</th><th class="r">Valor</th></tr></thead>
            <tbody>${row.phases.map((phase) => `
              <tr>
                <td><strong>${escapeProposalText(phase.nome.replace(`${row.nome} · `, ""))}</strong></td>
                <td>${phase.start ? proposalFormatDate(phase.start) : "A definir"}</td>
                <td>${phase.end ? proposalFormatDate(phase.end) : "A definir"}</td>
                <td class="r">${phase.physicalPercent.toFixed(1)}%</td>
                <td class="r">${fmtBRL(phase.value)}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>`
      : "";

    const detailTable = builderModuleEnabled("tabela_itens", false) && financialMode !== "resumo_etapa"
      ? financialMode === "preco_medio"
        ? `
        <table class="detail-table">
          <thead><tr><th>Item</th><th class="r">Valor por item</th></tr></thead>
          <tbody>${group.itens.map((item) => `
            <tr>
              <td>${escapeProposalText(item.nome)}</td>
              <td class="r">${fmtBRL(item.valorUnitario)}</td>
            </tr>`).join("")}</tbody>
        </table>`
        : `
        <table class="detail-table">
          <thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Valor unit.</th><th class="r">Subtotal</th></tr></thead>
          <tbody>${group.itens.map((item) => `
            <tr>
              <td>${escapeProposalText(item.nome)}</td>
              <td class="r">${item.quantidade}</td>
              <td class="r">${fmtBRL(item.valorUnitario)}</td>
              <td class="r">${fmtBRL(item.quantidade * item.valorUnitario)}</td>
            </tr>`).join("")}</tbody>
        </table>`
      : "";

    return `
    <section class="page stage-page">
      ${header("ORÇAMENTO POR ETAPAS", `Etapa ${group.ordem} · ${group.nome}`)}
      <h1 class="stage-heading">Etapa ${group.ordem} · ${escapeProposalText(group.nome)}</h1>
      ${imageUrl
        ? `<div class="stage-image"><img src="${escapeProposalText(imageUrl)}" alt="${escapeProposalText(group.nome)}" onerror="this.parentElement.innerHTML='<div class=&quot;stage-image-missing&quot;>Imagem desta etapa indisponível</div>'" /></div>`
        : `<div class="stage-image stage-image-missing">Imagem desta etapa pendente de geração específica</div>`}
      <div class="stage-metrics">
        <div><span>VALOR DA ETAPA</span><strong>${fmtBRL(stageTotal)}</strong></div>
        <div><span>DURAÇÃO</span><strong>${row?.duration ? `${row.duration} dias` : "A definir"}</strong></div>
        <div><span>PESO FÍSICO</span><strong>${weight.toFixed(0)}%</strong></div>
      </div>
      ${interactive ? `<button type="button" class="web-stage-toggle" onclick="this.closest('.stage-page').classList.toggle('web-open');this.textContent=this.closest('.stage-page').classList.contains('web-open')?'Ocultar detalhes':'Ver detalhes';">Ver detalhes</button>` : ""}
      ${builderModuleEnabled("escopo") && showTechnicalDetail ? `
        <h2 class="scope-title">O que está contemplado nesta etapa</h2>
        <table class="scope-table-demo">
          <thead><tr><th>Previsto</th><th>Breve descrição da atividade</th></tr></thead>
          <tbody>${scopeRows}</tbody>
        </table>` : ""}
      ${phaseTable}
      ${detailTable}
      ${footer()}
    </section>`;
  }).join("\n");

  const executionRows = scheduleRows.map((row) => {
    const stage = `
      <tr>
        <td><strong>${escapeProposalText(row.nome)}</strong></td>
        <td>${row.start ? proposalFormatDate(row.start) : "A definir"}</td>
        <td>${row.duration ? `${row.duration} dias` : "A definir"}</td>
        <td>${row.end ? proposalFormatDate(row.end) : "A definir"}</td>
        <td class="r">${row.physicalPercent.toFixed(1)}%</td>
        <td class="r">${fmtBRL(row.value)}</td>
      </tr>`;
    const phases = (row.phases ?? []).map((phase) => `
      <tr>
        <td style="padding-left:8mm;">↳ ${escapeProposalText(phase.nome.replace(`${row.nome} · `, ""))}</td>
        <td>${phase.start ? proposalFormatDate(phase.start) : "A definir"}</td>
        <td>${phase.duration ? `${phase.duration} dias` : "A definir"}</td>
        <td>${phase.end ? proposalFormatDate(phase.end) : "A definir"}</td>
        <td class="r">${phase.physicalPercent.toFixed(1)}%</td>
        <td class="r">${fmtBRL(phase.value)}</td>
      </tr>`).join("");
    return stage + phases;
  }).join("");

  const paymentRows = (orcamento.paymentCompositions ?? [])
    .filter((item) => item?.forma && Number(item.valor ?? 0) > 0)
    .map((item) => `
      <tr>
        <td>${escapeProposalText(String(item.forma))}</td>
        <td class="r">${fmtBRL(Number(item.valor))}</td>
      </tr>`).join("");

  const exclusionsHtml = presentation.itensNaoInclusos.length
    ? `
      <div class="exclusions-block">
        <span class="exclusions-kicker">ESCOPO CONTRATUAL</span>
        <h2>O que não está incluso nesta proposta</h2>
        <div class="exclusions-grid">
          ${presentation.itensNaoInclusos.map((item) => `<div class="exclusion-item"><span>—</span><strong>${escapeProposalText(item)}</strong></div>`).join("")}
        </div>
      </div>`
    : "";

  const conditions = [
    ["VALOR GLOBAL", fmtBRL(total)],
    ...(presentation.entradaPercentual > 0 ? [["ENTRADA / ADIANTAMENTO", `${presentation.entradaPercentual.toFixed(2)}% · ${fmtBRL(entryValue)}`]] : []),
    ...(presentation.entradaPercentual > 0 ? [["AMORTIZAÇÃO DA ENTRADA", `${presentation.amortizacaoEntradaPercentual.toFixed(2)}% sobre cada medição bruta até quitação do saldo`]] : []),
    ["FORMA DE PAGAMENTO", orcamento.condPagamento || orcamento.formaPagamento || "Conforme cronograma físico-financeiro"],
    ...(orcamento.validadeAte ? [["VALIDADE DA PROPOSTA", proposalFormatDate(orcamento.validadeAte)]] : []),
    ...(presentation.previsaoInicio ? [["PREVISÃO DE INÍCIO", proposalFormatDate(presentation.previsaoInicio)]] : []),
    ["PRAZO ESTIMADO", deadlineLabel],
    ["REFERÊNCIA DE CONTRATO", "Linha de base contratada após aceite"],
  ];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposta — ${escapeProposalText(client)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${ink}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:210mm; min-height:297mm; padding:12mm 15mm 11mm; page-break-after:always; display:flex; flex-direction:column; background:#fff; }
  .page:last-child { page-break-after:auto; }
  .topbar { display:flex; justify-content:space-between; align-items:flex-start; min-height:16mm; padding-bottom:5mm; border-bottom:1px solid ${line}; margin-bottom:8mm; }
  .brand { display:flex; flex-direction:column; align-items:flex-start; gap:2.2mm; }
  .brand-logo { height:8mm; max-width:52mm; object-fit:contain; object-position:left center; }
  .brand-name { font-size:11pt; font-weight:800; letter-spacing:.01em; }
  .brand-line { display:block; width:33mm; height:1.4mm; background:${accent}; }
  .topbar-right { display:flex; flex-direction:column; text-align:right; color:${muted}; font-size:6.5pt; line-height:1.5; letter-spacing:.04em; text-transform:uppercase; }
  .topbar-right strong { font-weight:500; }
  .topbar-right span { font-size:6pt; text-transform:none; letter-spacing:0; margin-top:.8mm; }
  .footer { margin-top:auto; border-top:1px solid ${line}; padding-top:3mm; display:flex; justify-content:space-between; color:#9ca3af; font-size:6pt; }

  .cover { padding:0; position:relative; overflow:hidden; background:#111; color:#fff; }
  .cover-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:brightness(.58); }
  .cover-shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.18) 0%,rgba(0,0,0,.12) 45%,rgba(0,0,0,.58) 100%); }
  .cover-content { position:relative; z-index:2; padding:16mm 15mm 14mm; min-height:297mm; display:flex; flex-direction:column; }
  .cover-top { display:flex; align-items:center; justify-content:space-between; font-size:7pt; letter-spacing:.04em; text-transform:uppercase; }
  .cover-brand { font-size:12pt; font-weight:800; }
  .cover-brand img { max-height:9mm; max-width:55mm; object-fit:contain; filter:brightness(0) invert(1); }
  .cover-main { margin-top:28mm; }
  .cover-title { font-size:27pt; line-height:1.04; font-weight:800; max-width:150mm; margin-bottom:4mm; }
  .cover-subtitle { font-size:12pt; font-weight:400; }
  .cover-benefits { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2.5mm; margin-top:8mm; max-width:150mm; }
  .cover-benefit { border:1px solid rgba(255,255,255,.35); background:rgba(0,0,0,.25); padding:3.2mm 3.5mm; border-radius:2.5mm; font-size:7.3pt; font-weight:700; line-height:1.3; }
  .cover-info { margin-top:auto; border:1px solid rgba(255,255,255,.75); border-radius:5mm; padding:7mm 7mm; backdrop-filter:blur(2px); background:rgba(0,0,0,.08); }
  .cover-info strong { display:block; font-size:8.8pt; margin-bottom:4mm; }
  .cover-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:2.5mm 8mm; font-size:7.2pt; }
  .cover-info-grid span:nth-child(even) { text-align:right; }

  .summary-heading { font-size:20pt; margin-bottom:4mm; }
  .summary-lead { color:#4b5563; font-size:9.5pt; line-height:1.55; max-width:165mm; margin-bottom:7mm; }
  .metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:4mm; margin:2mm 0 8mm; }
  .metric { border-top:2px solid ${accent}; padding-top:4mm; }
  .metric span { display:block; color:${muted}; font-size:6.4pt; letter-spacing:.06em; text-transform:uppercase; margin-bottom:2mm; }
  .metric strong { font-size:16pt; line-height:1.1; }
  .organize-title { font-size:12pt; margin:6mm 0 4mm; }
  .organize-grid { display:grid; grid-template-columns:1fr 1fr; gap:4mm; }
  .organize-item { border:1px solid ${line}; border-radius:2mm; padding:4mm; }
  .organize-item b { display:block; font-size:8pt; margin-bottom:1.2mm; }
  .organize-item p { color:${muted}; font-size:7.6pt; line-height:1.45; }

  .value-proposition { margin-top:7mm; padding:6mm; border:1px solid ${line}; border-radius:3mm; background:#fff; }
  .value-kicker { display:block; color:${accent}; font-size:6.2pt; letter-spacing:.10em; font-weight:700; margin-bottom:2mm; }
  .value-proposition h2 { font-size:14pt; line-height:1.15; margin-bottom:2.5mm; }
  .value-proposition > p { color:#4b5563; font-size:8pt; line-height:1.55; max-width:160mm; }
  .value-grid { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-top:4.5mm; }
  .value-grid > div { padding:3.8mm; background:${soft}; border-radius:2mm; }
  .value-grid strong { display:block; font-size:7.8pt; margin-bottom:1mm; }
  .value-grid span { display:block; color:${muted}; font-size:6.8pt; line-height:1.45; }

  .stage-heading { font-size:19pt; margin:1mm 0 8mm; }
  .stage-image { width:100%; height:50mm; overflow:hidden; border-radius:0; background:${soft}; }
  .stage-image img { width:100%; height:100%; object-fit:cover; display:block; }
  .stage-metrics { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid ${line}; border-top:0; border-radius:0 0 4mm 4mm; overflow:hidden; margin-bottom:9mm; }
  .stage-metrics > div { padding:6mm 6mm; }
  .stage-metrics span { display:block; color:${muted}; font-size:6pt; letter-spacing:.04em; margin-bottom:2mm; }
  .stage-metrics strong { display:block; font-size:12pt; }
  .stage-period { display:grid; grid-template-columns:1fr 1fr 1fr; gap:3mm; margin:-4mm 0 7mm; padding:3.5mm 5mm; border-radius:2.5mm; background:${soft}; }
  .stage-period span { display:block; color:${muted}; font-size:5.7pt; letter-spacing:.04em; margin-bottom:1mm; }
  .stage-period strong { font-size:8pt; }
  .phase-block { margin:6mm 0 2mm; }
  .phase-table { width:100%; border-collapse:collapse; font-size:7pt; margin-bottom:5mm; }
  .phase-table th { background:#f3f4f6; color:#6b7280; text-align:left; font-weight:600; padding:2.5mm; border:1px solid ${line}; }
  .phase-table td { padding:3mm 2.5mm; border:1px solid ${line}; vertical-align:top; }
  .scope-title { font-size:12pt; margin-bottom:2.5mm; }
  .scope-table-demo, .detail-table, .schedule-demo, .payment-demo { width:100%; border-collapse:collapse; font-size:7.3pt; }
  .scope-table-demo th, .detail-table th, .schedule-demo th, .payment-demo th { background:#f3f4f6; color:#6b7280; text-align:left; font-weight:600; padding:3mm 2.5mm; border:1px solid ${line}; }
  .scope-table-demo td, .detail-table td, .schedule-demo td, .payment-demo td { padding:4mm 2.5mm; border:1px solid ${line}; vertical-align:top; }
  .scope-table-demo th:first-child { width:30%; }
  .scope-name { font-weight:600; }
  .r { text-align:right !important; }
  .detail-table { margin-top:5mm; }

  .schedule-title { font-size:19pt; margin:1mm 0 2mm; }
  .schedule-sub { color:${muted}; font-size:8pt; margin-bottom:8mm; }
  .schedule-block-title { font-size:12pt; margin:7mm 0 3mm; }
  .schedule-demo td { padding:3mm 2.5mm; }
  .advance-summary { margin:4mm 0 3mm; padding:3mm; border:1px solid ${line}; background:${soft}; font-size:7.5pt; line-height:1.45; }
  .matrix-wrap { margin-top:3mm; }
  .period-matrix-group { margin-top:3mm; }
  .period-matrix-caption { font-size:6pt; color:${muted}; text-transform:uppercase; letter-spacing:.05em; margin-bottom:1.5mm; }
  table.period-matrix { width:100%; border-collapse:collapse; table-layout:fixed; font-size:6.5pt; }
  table.period-matrix th { background:#f3f4f6; color:${muted}; border:1px solid ${line}; padding:2.2mm 1.8mm; text-align:left; font-weight:600; }
  table.period-matrix td { border:1px solid ${line}; padding:2.5mm 1.8mm; vertical-align:top; }
  table.period-matrix .period-stage { width:32mm; }
  table.period-matrix .period-stage span, table.period-matrix .period-cell span { display:block; color:#7b8190; font-size:5.6pt; margin-top:.7mm; }
  table.period-matrix .period-cell strong { display:block; font-size:6.6pt; }
  table.period-matrix .period-empty { color:#c0c4cc; text-align:center; }
  table.period-matrix tfoot td { background:#fff7ed; font-weight:600; }

  .conditions-title { font-size:19pt; margin:1mm 0 8mm; }
  .conditions-list { border-top:1px solid ${line}; }
  .condition-row { display:grid; grid-template-columns:55mm 1fr; gap:5mm; padding:4mm 0; border-bottom:1px solid ${line}; }
  .condition-row span { font-size:6.6pt; color:${muted}; letter-spacing:.05em; }
  .condition-row strong { font-size:9pt; }
  .next-title { font-size:12pt; margin:10mm 0 3mm; }
  .next-copy { font-size:8.5pt; line-height:1.55; color:#4b5563; }
  .accept-title { font-size:12pt; margin:10mm 0 5mm; }
  .signature { display:grid; grid-template-columns:1fr 55mm; gap:12mm; margin-top:11mm; }
  .signature div { border-top:1px solid #9ca3af; padding-top:2mm; font-size:7pt; color:${muted}; }

  /* ── CasaForte premium editorial layer ───────────────────────────── */
  :root {
    --cf-orange: ${accent};
    --cf-dark: #121212;
    --cf-dark-2: #1c1c1c;
    --cf-soft: #f7f6f3;
    --cf-soft-2: #fbfaf8;
    --cf-border: #e7e3df;
    --cf-muted: #6f6f6f;
  }
  body {
    color: var(--cf-dark);
    font-family: Inter, "Aptos", "Segoe UI", Arial, Helvetica, sans-serif;
    letter-spacing: -.005em;
  }
  .page {
    padding: 13mm 15mm 12mm;
  }
  .topbar {
    min-height: 15mm;
    border-bottom: 2px solid var(--cf-dark);
    padding-bottom: 4.5mm;
    margin-bottom: 9mm;
  }
  .brand-line {
    width: 42mm;
    height: 1.5mm;
    background: var(--cf-orange);
  }
  .topbar-right {
    color: var(--cf-dark);
    font-weight: 700;
    letter-spacing: .085em;
  }
  .topbar-right span {
    color: var(--cf-muted);
    font-weight: 400;
  }
  .footer {
    border-top: 1px solid var(--cf-border);
    color: #8b8b8b;
  }

  /* Cover: architectural editorial, image-led */
  .cover {
    background: #111;
  }
  .cover-bg {
    object-position: center;
    filter: brightness(.62) saturate(.88) contrast(1.04);
  }
  .cover-shade {
    background:
      linear-gradient(110deg, rgba(0,0,0,.84) 0%, rgba(0,0,0,.64) 45%, rgba(0,0,0,.18) 78%, rgba(242,107,33,.14) 100%);
  }
  .cover-content {
    padding: 17mm 16mm 15mm;
  }
  .cover-top {
    padding-bottom: 5mm;
    border-bottom: 1px solid rgba(255,255,255,.42);
    font-weight: 700;
    letter-spacing: .1em;
  }
  .cover-brand {
    background: rgba(255,255,255,.96);
    color: #111;
    padding: 3mm 4mm;
    border-radius: 2.5mm;
    box-shadow: 0 4mm 10mm rgba(0,0,0,.18);
  }
  .cover-brand img {
    max-height: 12mm;
    max-width: 60mm;
    filter: none;
  }
  .cover-main {
    margin-top: 38mm;
    max-width: 150mm;
  }
  .cover-title {
    font-size: 32pt;
    line-height: 1.01;
    letter-spacing: -.035em;
    max-width: 142mm;
  }
  .cover-subtitle {
    margin-top: 4mm;
    max-width: 118mm;
    font-size: 10.5pt;
    line-height: 1.5;
    color: rgba(255,255,255,.88);
  }
  .cover-info {
    width: min(160mm, 100%);
    margin-top: auto;
    border: 0;
    border-left: 2.4mm solid var(--cf-orange);
    border-radius: 0;
    padding: 6mm 7mm;
    background: rgba(12,12,12,.58);
    backdrop-filter: blur(5px);
  }
  .cover-info strong {
    font-size: 9.2pt;
    letter-spacing: .01em;
  }
  .cover-info-grid {
    row-gap: 2.7mm;
    color: rgba(255,255,255,.86);
  }

  /* Summary: quiet white space + strong numbers */
  .summary-heading,
  .stage-heading,
  .schedule-title,
  .conditions-title {
    letter-spacing: -.03em;
    color: var(--cf-dark);
  }
  .summary-heading:after,
  .stage-heading:after,
  .schedule-title:after,
  .conditions-title:after {
    content: "";
    display: block;
    width: 18mm;
    height: 1.25mm;
    background: var(--cf-orange);
    margin-top: 3mm;
  }
  .summary-lead {
    font-size: 9.8pt;
    line-height: 1.68;
    color: #4d4d4d;
    max-width: 170mm;
  }
  .metrics {
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 4mm;
    margin-top: 4mm;
  }
  .metric {
    border: 0;
    border-left: 1.35mm solid var(--cf-orange);
    background: var(--cf-soft);
    padding: 5mm;
    min-height: 25mm;
  }
  .metric span {
    color: var(--cf-muted);
    font-size: 6pt;
    letter-spacing: .08em;
  }
  .metric strong {
    font-size: 14.2pt;
    letter-spacing: -.025em;
  }
  .organize-title {
    margin-top: 8mm;
    font-size: 12.5pt;
  }
  .organize-grid {
    gap: 4.5mm;
  }
  .organize-item {
    border: 1px solid var(--cf-border);
    border-radius: 2mm;
    padding: 5mm;
    background: #fff;
    box-shadow: 0 2mm 6mm rgba(0,0,0,.025);
  }
  .organize-item b {
    font-size: 8.5pt;
  }
  .organize-item p {
    color: #656565;
    line-height: 1.55;
  }

  /* Stage pages: image first, investment band second, detail third */
  .stage-heading {
    margin-bottom: 7mm;
    font-size: 20pt;
  }
  .stage-image {
    height: 61mm;
    margin-bottom: 0;
    border-radius: 3mm 3mm 0 0;
    overflow: hidden;
    background: #efefed;
    box-shadow: 0 3mm 8mm rgba(0,0,0,.07);
  }
  .stage-image img {
    height: 61mm;
    object-fit: cover;
    object-position: center;
  }
  .stage-metrics {
    grid-template-columns: repeat(3, 1fr);
    border: 0;
    border-radius: 0 0 3mm 3mm;
    overflow: hidden;
    margin-bottom: 8mm;
    background: var(--cf-dark);
    color: #fff;
    box-shadow: 0 3mm 8mm rgba(0,0,0,.07);
  }
  .stage-metrics > div {
    padding: 5mm 5.5mm;
    border-right: 1px solid rgba(255,255,255,.10);
  }
  .stage-metrics > div:last-child {
    border-right: 0;
  }
  .stage-metrics span {
    color: #efad84;
    font-size: 6pt;
    letter-spacing: .1em;
  }
  .stage-metrics strong {
    color: #fff;
    font-size: 13pt;
  }
  .stage-period {
    margin: -2mm 0 7mm;
    padding: 3.6mm 5mm;
    border: 1px solid var(--cf-border);
    background: var(--cf-soft-2);
  }
  .scope-title {
    font-size: 11.8pt;
    margin-bottom: 3mm;
  }
  .scope-table-demo,
  .detail-table,
  .phase-table,
  .schedule-demo,
  .payment-demo {
    border-collapse: separate;
    border-spacing: 0;
  }
  .scope-table-demo th,
  .detail-table th,
  .phase-table th,
  .schedule-demo th,
  .payment-demo th {
    background: var(--cf-dark);
    color: #fff;
    border-color: var(--cf-dark);
    padding: 3.1mm 2.8mm;
  }
  .scope-table-demo td,
  .detail-table td,
  .phase-table td,
  .schedule-demo td,
  .payment-demo td {
    border-color: var(--cf-border);
    line-height: 1.45;
  }
  .scope-table-demo tbody tr:nth-child(even) td,
  .detail-table tbody tr:nth-child(even) td,
  .phase-table tbody tr:nth-child(even) td {
    background: #faf9f7;
  }

  /* Schedule: executive / architectural tone */
  .schedule-sub {
    font-size: 8.2pt;
    line-height: 1.6;
    max-width: 165mm;
  }
  .schedule-demo {
    border: 1px solid var(--cf-border);
    border-radius: 2mm;
    overflow: hidden;
  }
  .schedule-demo th {
    font-size: 6.2pt;
    letter-spacing: .04em;
  }
  .schedule-demo td {
    padding: 3mm 2.5mm;
  }
  .schedule-block-title {
    margin-top: 8mm;
  }
  .advance-summary {
    padding: 4mm 4.5mm;
    border: 0;
    border-left: 2mm solid var(--cf-orange);
    background: var(--cf-soft);
    line-height: 1.55;
  }
  table.period-matrix {
    border: 1px solid var(--cf-border);
  }
  table.period-matrix th {
    background: var(--cf-dark);
    color: #fff;
    border-color: #2a2a2a;
  }
  table.period-matrix tfoot td {
    background: #fff3e9;
    color: #2a2a2a;
  }

  /* Conditions: restrained, premium document */
  .conditions-list {
    border-top: 2px solid var(--cf-dark);
  }
  .condition-row {
    grid-template-columns: 52mm 1fr;
    padding: 4.7mm 0;
    border-bottom: 1px solid var(--cf-border);
  }
  .condition-row span {
    color: var(--cf-muted);
    font-size: 6.3pt;
    letter-spacing: .09em;
  }
  .condition-row strong {
    font-size: 9.3pt;
    line-height: 1.4;
  }
  .next-title {
    margin-top: 10mm;
  }
  .next-copy {
    max-width: 168mm;
    line-height: 1.65;
  }
  .signature {
    margin-top: 14mm;
  }
  .exclusions-block {
    margin: 2mm 0 9mm;
    padding: 6mm;
    border: 1px solid var(--cf-border);
    border-left: 2.2mm solid var(--cf-orange);
    background: var(--cf-soft-2);
    border-radius: 2mm;
  }
  .exclusions-kicker {
    display: block;
    margin-bottom: 2mm;
    color: var(--cf-orange);
    font-size: 6.2pt;
    font-weight: 800;
    letter-spacing: .11em;
  }
  .exclusions-block h2 {
    margin-bottom: 4mm;
    font-size: 13pt;
  }
  .exclusions-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2.5mm 6mm;
  }
  .exclusion-item {
    display: grid;
    grid-template-columns: 5mm 1fr;
    gap: 2mm;
    align-items: start;
    padding: 2.2mm 0;
    border-bottom: 1px solid var(--cf-border);
  }
  .exclusion-item span {
    color: var(--cf-orange);
    font-weight: 800;
  }
  .exclusion-item strong {
    font-size: 8pt;
    font-weight: 600;
    line-height: 1.45;
  }

  /* Web presentation mode: same proposal, better viewing outside PDF */
  @media screen {
    html { background: #ecebe8; }
    body {
      background: #ecebe8;
      padding: 22px 0 40px;
    }
    .page {
      margin: 0 auto 22px;
      box-shadow: 0 16px 50px rgba(0,0,0,.10);
      border-radius: 2px;
      overflow: hidden;
    }
    .cover {
      box-shadow: 0 20px 60px rgba(0,0,0,.17);
    }
  }
  @media screen and (max-width: 860px) {
    body { padding: 0; }
    .page {
      width: 100%;
      min-height: auto;
      margin: 0;
      padding: 26px 22px;
      box-shadow: none;
      page-break-after: auto;
    }
    .cover {
      min-height: 100vh;
      padding: 0;
    }
    .cover-content {
      min-height: 100vh;
      padding: 26px 22px;
    }
    .cover-main { margin-top: 22vh; }
    .cover-title { font-size: clamp(34px, 10vw, 54px); }
    .cover-info { width: 100%; }
    .metrics { grid-template-columns: 1fr 1fr; }
    .organize-grid { grid-template-columns: 1fr; }
    .stage-metrics { grid-template-columns: 1fr; }
    .stage-metrics > div { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); }
    .stage-period { grid-template-columns: 1fr; }
    .scope-table-demo,
    .detail-table,
    .phase-table,
    .schedule-demo,
    .payment-demo,
    table.period-matrix {
      display: block;
      width: 100%;
      overflow-x: auto;
      white-space: nowrap;
    }
    .condition-row { grid-template-columns: 1fr; gap: 7px; }
  }

  ${interactive ? `
  .proposal-web-nav { position:sticky; top:0; z-index:100; background:rgba(255,255,255,.94); backdrop-filter:blur(14px); border-bottom:1px solid #e7e3df; }
  .proposal-web-nav-inner { max-width:1180px; height:70px; margin:0 auto; padding:0 26px; display:flex; align-items:center; gap:22px; }
  .proposal-web-brand { display:flex; align-items:center; min-width:130px; color:#121212; text-decoration:none; }
  .proposal-web-brand img { height:38px; max-width:170px; object-fit:contain; }
  .proposal-brand-fallback { display:none; font-size:16px; font-weight:800; color:#121212; white-space:nowrap; }
  .cover-brand .proposal-brand-fallback { color:#111; }
  .proposal-web-links { display:flex; gap:18px; margin-left:auto; font-size:13px; color:#535862; }
  .proposal-web-links a { color:inherit; text-decoration:none; }
  .proposal-web-actions { display:flex; gap:8px; }
  .proposal-web-actions button,.proposal-web-actions a { border:0; border-radius:999px; padding:10px 14px; font:inherit; font-size:12px; font-weight:750; cursor:pointer; text-decoration:none; }
  .proposal-web-actions button { background:#f2f4f7; color:#344054; }
  .proposal-web-actions .approve-link { background:#0b2a55; color:#fff; }
  .web-interactive { background:#fff; padding:0; }
  .web-interactive .page { width:100%; min-height:auto; page-break-after:auto; margin:0; padding:78px max(24px,calc((100vw - 1120px)/2)); box-shadow:none; border-radius:0; overflow:visible; }
  .web-interactive .cover { min-height:78vh; padding:0; }
  .web-interactive .cover-content { min-height:78vh; padding:70px max(24px,calc((100vw - 1120px)/2)) 54px; }
  .web-interactive .cover-main { margin-top:10vh; max-width:850px; }
  .web-interactive .cover-title { max-width:850px; font-size:clamp(42px,6vw,76px); }
  .web-interactive .cover-subtitle { max-width:720px; font-size:17px; }
  .web-interactive .cover-info { width:min(820px,100%); }
  .web-interactive .topbar,.web-interactive .footer { display:none; }
  .web-interactive .summary-heading,.web-interactive .schedule-title,.web-interactive .conditions-title { font-size:clamp(32px,4vw,50px); }
  .web-interactive .summary-lead,.web-interactive .schedule-sub,.web-interactive .next-copy { max-width:820px; font-size:16px; line-height:1.65; }
  .web-interactive .metrics { grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:30px 0 0; }
  .web-interactive .metric { min-height:auto; border:1px solid #e7e3df; border-left:5px solid var(--cf-orange); border-radius:16px; padding:20px; }
  .web-interactive .metric strong { font-size:24px; }
  .web-interactive .value-proposition { margin-top:28px; padding:28px; border-radius:18px; }
  .web-interactive .value-grid { grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
  .web-interactive .value-grid > div { border-radius:14px; padding:18px; }
  .web-interactive .stage-page { border-top:1px solid #ece8e3; }
  .web-interactive .stage-heading { font-size:clamp(28px,3vw,42px); margin:0 0 24px; }
  .web-interactive .stage-image { height:min(420px,48vw); border-radius:18px 18px 0 0; }
  .web-interactive .stage-image img { height:100%; }
  .stage-image-missing { display:flex; align-items:center; justify-content:center; min-height:220px; padding:24px; background:#f4f5f7; color:#667085; text-align:center; font-size:14px; border:1px dashed #cfd4dc; }
  .web-interactive .stage-metrics { border-radius:0 0 18px 18px; margin-bottom:18px; }
  .web-interactive .stage-metrics > div { padding:18px 20px; }
  .web-interactive .stage-metrics strong { font-size:20px; }
  .web-stage-toggle { display:block; margin:0 0 18px auto; border:0; border-radius:999px; background:#0b2a55; color:white; padding:10px 14px; font:inherit; font-size:12px; font-weight:750; cursor:pointer; }
  .web-interactive .scope-title,.web-interactive .scope-table-demo,.web-interactive .phase-block,.web-interactive .detail-table { display:none; }
  .web-interactive .stage-page.web-open .scope-title,.web-interactive .stage-page.web-open .scope-table-demo,.web-interactive .stage-page.web-open .phase-block,.web-interactive .stage-page.web-open .detail-table { display:table; }
  .web-interactive .stage-page.web-open .scope-title,.web-interactive .stage-page.web-open .phase-block { display:block; }
  .web-interactive .scope-table-demo,.web-interactive .detail-table,.web-interactive .phase-table { font-size:13px; border-radius:14px; overflow:hidden; }
  .web-interactive .schedule-demo,.web-interactive table.period-matrix { font-size:12px; border-radius:14px; overflow:hidden; }
  .web-interactive .period-matrix-group { margin-top:22px; }
  .section-model-image { width:100%; max-height:360px; object-fit:cover; border-radius:16px; margin:22px 0; border:1px solid #e7e3df; }
  .web-interactive .exclusions-block { border-radius:16px; padding:22px; }
  .web-section-anchor { scroll-margin-top:80px; height:0; }
  .web-accept { padding:78px max(24px,calc((100vw - 1120px)/2)); background:#07162d; color:#fff; }
  .web-accept h2 { font-size:clamp(32px,4vw,50px); margin:0 0 12px; }
  .web-accept p { max-width:760px; color:rgba(255,255,255,.72); line-height:1.65; }
  .web-accept-card { max-width:820px; margin-top:24px; padding:26px; border:1px solid rgba(255,255,255,.14); border-radius:18px; background:rgba(255,255,255,.05); }
  .web-signature-row { display:grid; grid-template-columns:minmax(0,1fr) 210px; gap:26px; margin-bottom:22px; }
  .web-signature-field { padding-top:18px; border-bottom:1px solid rgba(255,255,255,.5); min-height:64px; }
  .web-signature-field span { display:block; margin-top:28px; padding-bottom:7px; font-size:11px; color:rgba(255,255,255,.62); }
  .web-accept-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .web-accept input { width:100%; padding:12px 13px; border-radius:11px; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.08); color:#fff; font:inherit; }
  .web-accept button { display:block; margin-top:16px; border:0; border-radius:999px; background:var(--cf-orange); color:#fff; padding:12px 18px; font:inherit; font-weight:750; cursor:pointer; }
  #web-accept-message { min-height:20px; margin-top:10px; font-size:13px; }
  @media(max-width:860px){ .proposal-web-links{display:none}.proposal-web-nav-inner{padding:0 18px;height:62px}.proposal-web-brand img{height:31px}.proposal-web-actions button{display:none}.web-interactive .page{padding:60px 20px}.web-interactive .cover-content{padding:60px 20px 42px;min-height:76vh}.web-interactive .metrics,.web-interactive .value-grid{grid-template-columns:1fr 1fr}.web-interactive .stage-image{height:260px}.web-accept{padding:60px 20px}.web-accept-grid,.web-signature-row{grid-template-columns:1fr} }
  @media(max-width:560px){ .web-interactive .metrics,.web-interactive .value-grid{grid-template-columns:1fr}.web-interactive .stage-metrics{grid-template-columns:1fr}.web-interactive .stage-metrics>div{border-right:0!important;border-bottom:1px solid #ece8e3}.web-interactive .cover-title{font-size:42px} }

  .proposal-preset-minimalista.web-interactive .value-proposition,
  .proposal-preset-minimalista.web-interactive .metric { box-shadow:none; background:#fff; }
  .proposal-preset-minimalista.web-interactive .page { border-top:0; }
  .proposal-preset-corporativo.web-interactive .cover:after { background:linear-gradient(90deg,rgba(6,23,48,.86),rgba(6,23,48,.45)); }
  .proposal-preset-corporativo.web-interactive .metric { border-radius:8px; }
  .proposal-preset-tecnico.web-interactive .stage-image { height:280px; }
  .proposal-preset-tecnico.web-interactive .scope-title,
  .proposal-preset-tecnico.web-interactive .scope-table-demo,
  .proposal-preset-tecnico.web-interactive .phase-block,
  .proposal-preset-tecnico.web-interactive .detail-table { display:table; }
  .proposal-preset-tecnico.web-interactive .scope-title,
  .proposal-preset-tecnico.web-interactive .phase-block { display:block; }
  .proposal-density-compacto.web-interactive .page { padding-top:48px; padding-bottom:48px; }
  .proposal-density-equilibrado.web-interactive .page { padding-top:64px; padding-bottom:64px; }
  .proposal-images-baixa.web-interactive .stage-image { height:220px; }
  .proposal-images-media.web-interactive .stage-image { height:min(340px,42vw); }
  .proposal-stage-accordion.web-interactive .stage-page { padding-top:42px; padding-bottom:42px; }
  .proposal-stage-lista_tecnica.web-interactive .stage-image { display:none; }
  .proposal-stage-lista_tecnica.web-interactive .scope-title,
  .proposal-stage-lista_tecnica.web-interactive .scope-table-demo,
  .proposal-stage-lista_tecnica.web-interactive .detail-table { display:table; }
  .proposal-stage-lista_tecnica.web-interactive .scope-title { display:block; }
  .proposal-investment-valor_global.web-interactive .stage-metrics > div:first-child { opacity:.7; }
  .proposal-hero-minimalista.web-interactive .cover-bg { filter:saturate(.25) brightness(.45); }
  .proposal-hero-institucional.web-interactive .cover-bg { filter:saturate(.6) brightness(.5); }
  @media print { .proposal-web-nav,.web-stage-toggle,.web-accept { display:none!important; } .web-interactive .page{width:210mm;min-height:297mm;padding:13mm 15mm 12mm;page-break-after:always}.web-interactive .topbar,.web-interactive .footer{display:flex}.web-interactive .scope-title,.web-interactive .scope-table-demo,.web-interactive .phase-block,.web-interactive .detail-table{display:table}.web-interactive .scope-title,.web-interactive .phase-block{display:block} }
  ` : ""}
</style>
</head>
<body class="${interactive ? "web-interactive" : "document-layout"} proposal-preset-${escapeProposalText(visualPreset)} proposal-hero-${escapeProposalText(heroVariant)} proposal-stage-${escapeProposalText(stageVariant)} proposal-investment-${escapeProposalText(investmentVariant)} proposal-density-${escapeProposalText(density)} proposal-images-${escapeProposalText(imageEmphasis)}">
${interactive ? `
<nav class="proposal-web-nav">
  <div class="proposal-web-nav-inner">
    <a class="proposal-web-brand" href="#inicio">${tenantLogoUrl ? `<img src="${escapeProposalText(tenantLogoUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'" /><span class="proposal-brand-fallback">${escapeProposalText(company)}</span>` : `<strong>${escapeProposalText(company)}</strong>`}</a>
    <div class="proposal-web-links">
      <a href="#visao-geral">Visão geral</a><a href="#etapas-obra">Etapas</a><a href="#cronograma-obra">Cronograma</a><a href="#condicoes-comerciais">Condições</a>
    </div>
    <div class="proposal-web-actions">${hybrid ? `<button type="button" onclick="window.print()">PDF / imprimir</button>` : ""}<a class="approve-link" href="#aceite-proposta">Aprovar proposta</a></div>
  </div>
</nav>` : ""}
<section id="inicio" class="page cover">
  ${coverImage ? `<img class="cover-bg" src="${escapeProposalText(coverImage)}" alt="Projeto" onerror="this.style.display='none'" />` : ""}
  <div class="cover-shade"></div>
  <div class="cover-content">
    <div class="cover-top">
      <div class="cover-brand">${tenantLogoUrl ? `<img src="${escapeProposalText(tenantLogoUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'" /><span class="proposal-brand-fallback">${escapeProposalText(company)}</span>` : escapeProposalText(company)}</div>
      <div>PROPOSTA COMERCIAL</div>
    </div>
    <div class="cover-main">
      <h1 class="cover-title">${escapeProposalText(title)}</h1>
      <div class="cover-subtitle">${escapeProposalText(coverValueStatement)}</div>
      ${coverBenefits.length ? `<div class="cover-benefits">${coverBenefits.map((benefit) => `<div class="cover-benefit">${escapeProposalText(benefit)}</div>`).join("")}</div>` : ""}
    </div>
    <div class="cover-info">
      <strong>Cliente: ${escapeProposalText(client)}</strong>
      <div class="cover-info-grid">
        <span>Obra: ${escapeProposalText(title)}</span>
        <span>${orcamento.validadeAte ? `Validade: ${proposalFormatDate(orcamento.validadeAte)}` : "Proposta comercial"}</span>
        <span>${orcamento.numero ? `Proposta: ${escapeProposalText(orcamento.numero)}` : escapeProposalText(company)}</span>
        <span>${presentation.previsaoInicio ? `Início previsto: ${proposalFormatDate(presentation.previsaoInicio)}` : ""}</span>
      </div>
    </div>
  </div>
</section>

<section id="visao-geral" class="page">
  ${header("RESUMO EXECUTIVO", "Proposta integrada ao orçamento")}
  <h1 class="summary-heading">${escapeProposalText(builderModuleTitle("resumo_executivo", "Visão geral da proposta"))}</h1>
  <p class="summary-lead">Esta proposta reúne o investimento, o escopo contratado, o planejamento executivo e as condições comerciais em uma apresentação objetiva. O orçamento selecionado permanece como fonte de verdade para valores e serviços.</p>
  ${builderModuleImage("resumo_executivo") ? `<img class="section-model-image" src="${escapeProposalText(builderModuleImage("resumo_executivo")!)}" alt="" />` : ""}
  <div class="metrics">${summaryCardsHtml}</div>
  ${valuePropositionHtml}
  ${footer()}
</section>

${institutionalPageHtml}
${interactive ? `<div id="etapas-obra" class="web-section-anchor"></div>` : ""}
${stagePages}

${(builderModuleEnabled("cronograma") || builderModuleEnabled("fisico_financeiro")) ? `
<section id="cronograma-obra" class="page">
  ${header("CRONOGRAMA", "Execução e físico-financeiro")}
  <h1 class="schedule-title">${escapeProposalText(builderModuleTitle("cronograma", "Cronograma de execução"))}</h1>
  <p class="schedule-sub">Modelo com etapas independentes, dependências configuráveis e possibilidade de execução simultânea.</p>
  ${builderModuleImage("cronograma") ? `<img class="section-model-image" src="${escapeProposalText(builderModuleImage("cronograma")!)}" alt="" />` : ""}
  ${builderModuleEnabled("cronograma") ? `
  <table class="schedule-demo">
    <thead><tr><th>Etapa</th><th>Início</th><th>Duração</th><th>Término</th><th class="r">% da execução</th><th class="r">Valor</th></tr></thead>
    <tbody>${executionRows}</tbody>
  </table>` : ""}
  ${builderModuleEnabled("fisico_financeiro") ? `
    <h2 class="schedule-block-title">Cronograma físico-financeiro</h2>
    ${presentation.entradaPercentual > 0 ? `<div class="advance-summary"><strong>Entrada / adiantamento:</strong> ${presentation.entradaPercentual.toFixed(2)}% (${fmtBRL(total * presentation.entradaPercentual / 100)}) · <strong>Amortização:</strong> ${presentation.amortizacaoEntradaPercentual.toFixed(2)}% sobre cada medição até quitação do adiantamento.</div>` : ""}
    <div class="matrix-wrap">${renderProposalMonthlyMatrix(scheduleRows, presentation, total, fmtBRL)}</div>
  ` : ""}
  ${footer()}
</section>` : ""}

<section id="condicoes-comerciais" class="page">
  ${header("CONDIÇÕES COMERCIAIS", "Modelo final")}
  <h1 class="conditions-title">${escapeProposalText(builderModuleTitle("condicoes_comerciais", "Condições comerciais"))}</h1>
  ${builderModuleImage("condicoes_comerciais") ? `<img class="section-model-image" src="${escapeProposalText(builderModuleImage("condicoes_comerciais")!)}" alt="" />` : ""}
  ${exclusionsHtml}
  <div class="conditions-list">
    ${conditions.map(([label, value]) => `<div class="condition-row"><span>${escapeProposalText(label)}</span><strong>${escapeProposalText(String(value))}</strong></div>`).join("")}
  </div>
  ${paymentRows && builderModuleEnabled("condicoes_comerciais") ? `
    <h2 class="next-title">Composição de pagamento</h2>
    <table class="payment-demo"><thead><tr><th>Forma / parcela</th><th class="r">Valor</th></tr></thead><tbody>${paymentRows}</tbody></table>
  ` : ""}
  <h2 class="next-title">Próximos passos após o aceite</h2>
  <p class="next-copy">A proposta aceita torna-se a referência contratada da obra. A execução passa a utilizar as mesmas etapas, fases, valores e cronograma como linha de base. As medições consideram apenas o avanço adicional executado e, quando houver entrada/adiantamento, aplicam a amortização prevista até sua quitação.</p>
  ${presentation.mostrarPortalCliente ? `<p class="next-copy" style="margin-top:4mm;"><strong>Acompanhamento pelo Portal do Cliente:</strong> após a contratação, o cliente poderá acompanhar a linha-base, cronograma executivo, fases, previsto × executado, medições e informações financeiras publicadas pela construtora.</p>` : ""}
  ${orcamento.observacoes ? `<p class="next-copy" style="margin-top:4mm;">${escapeProposalText(orcamento.observacoes)}</p>` : ""}
  ${builderModuleEnabled("aceite") && !interactive ? `
    <h2 class="accept-title">Aceite do cliente</h2>
    <div class="signature"><div>Nome / assinatura</div><div>Data</div></div>
  ` : ""}
  ${footer()}
</section>
${interactive ? `
<section id="aceite-proposta" class="web-accept">
  <h2>Aceite da proposta</h2>
  <p>Revise as condições acima. A assinatura e a aprovação abaixo registram esta versão como referência comercial da contratação.</p>
  <div class="web-accept-card">
    <div class="web-signature-row">
      <div class="web-signature-field"><span>Nome / assinatura</span></div>
      <div class="web-signature-field"><span>Data</span></div>
    </div>
    <div class="web-accept-grid">
      <input id="web-accept-name" placeholder="Nome completo para aceite digital" autocomplete="name" />
      <input id="web-accept-doc" placeholder="CPF / CNPJ" />
    </div>
    <button id="web-accept-btn" type="button">Aprovar proposta</button>
    <div id="web-accept-message"></div>
  </div>
</section>
<script>
(function(){
  var btn=document.getElementById("web-accept-btn");
  if(!btn)return;
  btn.addEventListener("click",async function(){
    var match=window.location.pathname.match(/\\/public\\/generated-proposals\\/([^/]+)\\/html/);
    if(!match){document.getElementById("web-accept-message").textContent="Abra pelo link público exclusivo para registrar o aceite.";return;}
    var id=decodeURIComponent(match[1]);
    var nome=document.getElementById("web-accept-name").value.trim();
    var documento=document.getElementById("web-accept-doc").value.trim();
    btn.disabled=true;btn.textContent="Processando...";
    try{
      var response=await fetch("/api/public/proposals/"+encodeURIComponent(id)+"/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nome:nome||undefined,documento:documento||undefined})});
      var data=await response.json().catch(function(){return {}});
      if(response.status===409){document.getElementById("web-accept-message").textContent="Esta proposta já foi aceita.";btn.textContent="Proposta já aceita";return;}
      if(!response.ok)throw new Error(data.error||"Não foi possível registrar o aceite.");
      document.getElementById("web-accept-message").textContent="Proposta aprovada com sucesso.";
      btn.textContent="✓ Proposta aprovada";
    }catch(error){
      document.getElementById("web-accept-message").textContent=error&&error.message?error.message:"Não foi possível registrar o aceite.";
      btn.disabled=false;btn.textContent="Aprovar proposta";
    }
  });
})();
</script>` : ""}
</body>
</html>`;
}


function renderStudioOrderedProposal(args: {
  json: Record<string, any>;
  theme: {
    cream: string; cream2: string; ink: string;
    navyDeep: string; navyMid: string;
    accent: string; accentSoft: string;
    secondary: string; secondarySoft: string;
    concrete: string; concreteLine: string;
    ok: string; warn: string;
  };
  logoUrl?: string | null;
  clientName?: string;
  tenantName?: string;
  websiteUrl?: string | null;
  tenantLogoUrl?: string | null;
  imagens?: string[] | null;
  orcamento?: {
    titulo: string;
    numero?: string | null;
    itens: Array<{
      nome: string;
      quantidade: number;
      valorUnitario: number;
      sku?: string | null;
      descricao?: string | null;
      etapaId?: string | null;
      etapaNome?: string | null;
      etapaOrdem?: number | null;
      unidade?: string | null;
    }>;
    valorTotal?: string | null;
    observacoes?: string | null;
    formaPagamento?: string | null;
    condPagamento?: string | null;
    prazoEntrega?: string | null;
    validadeAte?: Date | string | null;
    paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
    apresentacao?: ProposalPresentationConfig | null;
  } | null;
  contact?: {
    phone?: string | null;
    email?: string | null;
    instagram?: string | null;
  } | null;
  builder: {
    enabledModules?: string[] | null;
    moduleOrder?: string[] | null;
    proposalKind?: string | null;
    visualStyle?: Record<string, unknown> | null;
    modules?: Array<Record<string, unknown>> | null;
  };
}): string {
  const { json, theme, logoUrl, clientName, tenantName, websiteUrl, tenantLogoUrl, imagens, orcamento, contact, builder } = args;
  const modules = Array.isArray(builder.modules)
    ? builder.modules
        .filter((item) => item && item.enabled !== false && typeof item.key === "string")
        .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
    : [];
  if (!modules.length) return "";

  const esc = (value: unknown) => escapeProposalText(String(value ?? ""));
  const company = tenantName || json.company?.title || "Empresa";
  const client = clientName || json.meta?.clientName || "Cliente";
  const hero = json.hero || {};
  const companyInfo = json.company || {};
  const offerInfo = json.offer || {};
  const solutionInfo = json.solution || {};
  const curiositiesInfo = json.curiosities || {};
  const proofInfo = json.proof || {};
  const faqInfo = json.faq || {};
  const presentation = normalizeProposalPresentation(orcamento?.apresentacao);
  const interactive = presentation.formato === "site_interativo";
  const hybrid = presentation.formato === "hibrido";
  const items = (orcamento?.itens ?? []).filter((item) => item && item.nome);
  const groups = groupProposalPresentationItems(items);
  const calculatedTotal = items.reduce((sum, item) => sum + Number(item.quantidade || 0) * Number(item.valorUnitario || 0), 0);
  const total = orcamento?.valorTotal ? Number(orcamento.valorTotal) : calculatedTotal;
  const fmtMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  const scheduleRows = orcamento ? buildProposalScheduleRows(groups, presentation, total) : [];
  const earliestScheduleStart = scheduleRows
    .map((row) => row.start)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const latestScheduleEnd = scheduleRows
    .map((row) => row.end)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const effectiveDeadlineDays = earliestScheduleStart && latestScheduleEnd
    ? Math.max(1, Math.ceil((latestScheduleEnd.getTime() - earliestScheduleStart.getTime()) / 86_400_000) + 1)
    : 0;
  const effectiveDeadlineLabel = effectiveDeadlineDays > 0
    ? `${effectiveDeadlineDays} dias`
    : String(orcamento?.prazoEntrega ?? "").trim() || "A definir";
  const monthlyPeriods = orcamento ? buildProposalMonthlyMatrix(scheduleRows, presentation, total) : [];
  const visualImages = (imagens ?? []).filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const moduleByKey = (key: string) => modules.find((item) => String(item.key) === key) ?? null;
  const studioModuleLabels: Record<string, string> = {
    capa: "Capa",
    apresentacao_empresa: "Apresentação da empresa",
    produto_servico: "Produto / serviço",
    curiosidades_conteudo: "Curiosidades e conteúdo",
    cases_provas: "Cases e provas",
    faq: "Perguntas frequentes",
    diferenciais: "Diferenciais",
    resumo_executivo: "Resumo executivo",
    escopo: "Escopo da proposta",
    etapas_orcamento: "Etapas do orçamento",
    imagem_por_etapa: "Imagens das etapas",
    tabela_itens: "Tabela de itens",
    cronograma: "Cronograma executivo",
    fisico_financeiro: "Cronograma físico-financeiro",
    condicoes_comerciais: "Condições comerciais",
    validade_inicio: "Validade e previsão de início",
    aceite: "Aceite e próximos passos",
    anexos: "Anexos",
    portal_cliente: "Portal do Cliente",
  };
  const moduleText = (module: Record<string, unknown>, field: "title" | "description" | "contentPrompt", fallback = "") => {
    const value = module[field];
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  };
  const moduleDataSource = (module: Record<string, unknown>) =>
    typeof module.dataSource === "string" ? module.dataSource : "mixed";
  const moduleManualContent = (module: Record<string, unknown>) =>
    moduleDataSource(module) === "manual" ? moduleText(module, "contentPrompt") : "";
  const moduleDisplayTitle = (module: Record<string, unknown>) => {
    const key = String(module.key ?? "");
    const raw = moduleText(module, "title");
    const normalizedRaw = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const normalizedKey = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!raw || normalizedRaw === normalizedKey) return studioModuleLabels[key] || raw || "Página";
    return raw;
  };
  const moduleImage = (module: Record<string, unknown>) => {
    const raw = module.image && typeof module.image === "object" ? module.image as Record<string, unknown> : {};
    const url = raw.mode !== "none" && typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : "";
    const fit = raw.fit === "contain" ? "contain" : "cover";
    const position = ["top", "bottom", "left", "right"].includes(String(raw.position)) ? String(raw.position) : "center";
    const overlay = Number.isFinite(Number(raw.overlay)) ? Math.max(0, Math.min(80, Number(raw.overlay))) : 45;
    return { url, fit, position, overlay };
  };
  // Imagens de páginas nunca devem ser escolhidas por posição numa lista genérica:
  // isso fazia uma página institucional receber foto de etapa sem relação semântica.
  // Fora da capa e das imagens de etapa, só usamos mídia explicitamente vinculada ao módulo.
  const modelImageUrl = (module: Record<string, unknown>, _index: number) =>
    moduleImage(module).url || "";
  const benefits = extractProposalBenefitList(
    6,
    companyInfo.highlights,
    offerInfo.bullets,
    solutionInfo.agents,
    proofInfo.items,
    moduleManualContent(moduleByKey("diferenciais") ?? {}),
  );

  const header = (label: string) =>
    '<div class="studio-hdr"><div class="studio-brand">' +
    (tenantLogoUrl
      ? '<img src="' + esc(tenantLogoUrl) + '" alt="' + esc(company) + '" />'
      : '<strong>' + esc(company) + '</strong>') +
    '</div><span>' + esc(label) + '</span></div>';

  const footer = () =>
    '<div class="studio-footer"><span>' + esc(company) + '</span><span>' +
    esc(websiteUrl || "Proposta comercial") + '</span></div>';

  const pageVisual = (module: Record<string, unknown>, index: number, className = "studio-visual") => {
    const image = moduleImage(module);
    const url = image.url || modelImageUrl(module, index);
    if (!url) return "";
    return '<div class="' + className + '"><img src="' + esc(url) + '" alt="" style="object-fit:' +
      image.fit + ';object-position:' + image.position + ';" /></div>';
  };

  const benefitsHtml = (itemsToRender: string[]) => itemsToRender.length
    ? '<div class="studio-benefits">' +
      itemsToRender.map((item) => '<div class="studio-benefit"><strong>' + esc(item) + '</strong></div>').join("") +
      '</div>'
    : "";

  const chunk = <T,>(values: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
    return result;
  };

  // Remove metadados operacionais/importados que ajudam o orçamento internamente,
  // mas não pertencem à apresentação comercial ao cliente.
  const clientFacingItemDescription = (raw: unknown) => {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    const parts = text
      .split(/\s*[•|]\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^etapa\s+\d+$/i.test(part))
      .filter((part) => !/^composi[cç][aã]o\s+detalhada\s+importada/i.test(part))
      .filter((part) => !/^(sc|pr|rs|sp|rj|mg|go|df|ba|pe|ce|es|mt|ms|pa|am|ro|rr|ac|ap|to|ma|pi|pb|rn|al|se)$/i.test(part))
      .filter((part) => !/^refer[eê]ncia\s+\d{1,2}\/\d{4}$/i.test(part));
    const cleaned = parts.join(" • ").trim();
    return /composi[cç][aã]o\s+detalhada\s+importada/i.test(cleaned) ? "" : cleaned;
  };

  const stageHeader = (group: typeof groups[number], value: number, suffix = "") => {
    const commercial = presentation.cronogramaEtapas[group.id] ?? {};
    return '<div class="studio-stage-title"><span>Etapa ' + esc(group.ordem) + ' · ' + esc(group.nome || "Entrega") +
      (suffix ? ' <small>' + esc(suffix) + '</small>' : '') +
      '</span><div class="studio-stage-value">' +
      (commercial.mostrarOrcamentoPrevisto ? '<small>Orçamento previsto</small>' : '') +
      '<strong>' + fmtMoney(value) + '</strong></div></div>';
  };

  const stageCommercialNote = (group: typeof groups[number]) => {
    const commercial = presentation.cronogramaEtapas[group.id] ?? {};
    const notes: string[] = [];
    const stageName = String(group.nome ?? "");
    const isWindows = /esquadr/i.test(stageName);
    const isFinishes = /(revest|porcelanat|cer[aâ]mic)/i.test(stageName);

    if (isWindows && Number(commercial.valorGlobalPrevisto ?? 0) > 0) {
      notes.push('<strong>Valor global previsto das esquadrias:</strong> ' + fmtMoney(Number(commercial.valorGlobalPrevisto)) + '.');
    } else if (isFinishes && Number(commercial.valorReferenciaM2 ?? 0) > 0) {
      notes.push('<strong>Valor considerado dos revestimentos:</strong> ' + fmtMoney(Number(commercial.valorReferenciaM2)) + ' / m².');
    }

    if ((isWindows || isFinishes) && commercial.reajusteSeAlteracao) {
      notes.push('Alterações de medidas, quantitativos, materiais ou especificações serão recalculadas e poderão gerar reajuste.');
    }
    return notes.length
      ? '<div class="studio-commercial-note">' + notes.map((item) => '<p>' + item + '</p>').join("") + '</div>'
      : '';
  };

  const scopeBlock = (group: typeof groups[number], groupItems = group.itens) => {
    const showDetail = resolveProposalTechnicalDetail(presentation, group.id);
    if (!showDetail) {
      return '<div class="studio-scope-hidden"><strong>Etapa ' + esc(group.ordem) + ' · ' + esc(group.nome || "Entrega") +
        '</strong><span>Detalhamento técnico oculto conforme configuração desta etapa.</span></div>';
    }
    return stageHeader(
      group,
      group.itens.reduce((sum, item) => sum + Number(item.quantidade || 0) * Number(item.valorUnitario || 0), 0),
    ) +
      '<div class="studio-scope-list">' +
      groupItems.map((item) =>
        '<div><strong>' + esc(item.nome) + '</strong>' +
        (item.descricao ? '<span>' + esc(item.descricao) + '</span>' : '') +
        '</div>'
      ).join("") +
      '</div>';
  };

  const scopePageBodies = () => {
    if (!groups.length) return ['<p class="studio-muted">Nenhum escopo estruturado disponível.</p>'];
    // Escopo explica o que está incluído. Valores ficam exclusivamente em "Etapas e investimento".
    // Isso evita repetir 14 etapas em 14-16 páginas antes de mostrá-las novamente com preços.
    return chunk(groups, 7).map((stageGroup) =>
      '<div class="studio-stage-grid">' +
      stageGroup.map((group) => {
        const showDetail = resolveProposalTechnicalDetail(presentation, group.id);
        const names = showDetail
          ? group.itens.map((item) => esc(item.nome)).filter(Boolean).slice(0, 6)
          : [];
        return '<div class="studio-stage-card"><span>Etapa ' + esc(group.ordem) + '</span><strong>' +
          esc(group.nome || "Entrega") + '</strong>' +
          (names.length ? '<small>' + names.join(' · ') + (group.itens.length > names.length ? ' · …' : '') + '</small>' : '') +
          '</div>';
      }).join("") +
      '</div>'
    );
  };

  const financialBlock = (group: typeof groups[number], groupItems = group.itens, continuation = "") => {
    const stageName = String(group.nome ?? "");
    const isWindowsStage = /esquadr/i.test(stageName);
    const isFinishesStage = /(revest|porcelanat|cer[aâ]mic)/i.test(stageName);
    const specialCommercialStage = isWindowsStage || isFinishesStage;
    const mode = specialCommercialStage ? "resumo_etapa" : resolveProposalPresentationMode(presentation, group.id);
    const value = group.itens.reduce((sum, item) => sum + Number(item.quantidade || 0) * Number(item.valorUnitario || 0), 0);
    if (mode === "resumo_etapa") {
      if (isWindowsStage || isFinishesStage) {
        const configuredGlobal = Number(presentation.cronogramaEtapas[group.id]?.valorGlobalPrevisto ?? 0);
        const configuredM2 = Number(presentation.cronogramaEtapas[group.id]?.valorReferenciaM2 ?? 0);
        const headerValue = isWindowsStage
          ? fmtMoney(configuredGlobal > 0 ? configuredGlobal : value)
          : fmtMoney(value);

        const itemRows = groupItems.map((item) => {
          const unit = String(item.unidade ?? "").trim().toLowerCase();
          const isFloorItem = isFinishesStage && /(piso|porcelanat|cer[aâ]mic)/i.test(String(item.nome ?? ""));
          const perM2 = unit === "m2" || unit === "m²" || isFloorItem;
          const unitLabel = perM2 ? " / m²" : "";
          const itemValue = fmtMoney(Number(item.valorUnitario || 0)) + unitLabel;
          const desc = clientFacingItemDescription(item.descricao);
          return '<tr><td><strong>' + esc(item.nome) + '</strong>' +
            (desc ? '<small>' + esc(desc) + '</small>' : '') +
            '</td><td class="r">' + itemValue + '</td></tr>';
        }).join("");

        const reference = isFinishesStage
          ? (() => {
              const floorItem = groupItems.find((item) => {
                const unit = String(item.unidade ?? "").trim().toLowerCase();
                return unit === "m2" || unit === "m²" || /(piso|porcelanat|cer[aâ]mic)/i.test(String(item.nome ?? ""));
              });
              const valueM2 = configuredM2 > 0 ? configuredM2 : Number(floorItem?.valorUnitario ?? 0);
              return valueM2 > 0
                ? '<div class="studio-commercial-note"><p><strong>Valor do piso/revestimento considerado:</strong> ' + fmtMoney(valueM2) + ' / m².</p></div>'
                : '';
            })()
          : '';

        return '<div class="studio-stage-summary"><span><strong>Etapa ' + esc(group.ordem) + '</strong> · ' +
          esc(group.nome || (isWindowsStage ? "Esquadrias" : "Revestimentos")) + '</span><strong>' +
          headerValue + '</strong></div>' +
          reference +
          '<table class="studio-table"><thead><tr><th>Item</th><th class="r">Valor definido no orçamento</th></tr></thead><tbody>' +
          itemRows + '</tbody></table>' +
          (presentation.cronogramaEtapas[group.id]?.reajusteSeAlteracao
            ? '<div class="studio-commercial-note"><p>Alterações de medidas, quantitativos, materiais ou especificações serão recalculadas e poderão gerar reajuste.</p></div>'
            : '');
      }
      return '<div class="studio-stage-summary"><span><strong>Etapa ' + esc(group.ordem) + '</strong> · ' +
        esc(group.nome || "Entrega") + '</span><strong>' + fmtMoney(value) + '</strong></div>' +
        stageCommercialNote(group);
    }
    if (mode === "preco_medio") {
      return stageHeader(group, value, continuation) +
        stageCommercialNote(group) +
        '<table class="studio-table"><thead><tr><th>Item</th><th class="r">Valor por item</th></tr></thead><tbody>' +
        groupItems.map((item) => {
          const desc = clientFacingItemDescription(item.descricao);
          return '<tr><td><strong>' + esc(item.nome) + '</strong>' +
            (desc ? '<small>' + esc(desc) + '</small>' : '') +
            '</td><td class="r">' + fmtMoney(Number(item.valorUnitario || 0)) + '</td></tr>';
        }).join("") +
        '</tbody></table>';
    }
    return stageHeader(group, value, continuation) +
      stageCommercialNote(group) +
      '<table class="studio-table"><thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Valor unit.</th><th class="r">Subtotal</th></tr></thead><tbody>' +
      groupItems.map((item) => {
        const desc = clientFacingItemDescription(item.descricao);
        return '<tr><td><strong>' + esc(item.nome) + '</strong>' +
          (desc ? '<small>' + esc(desc) + '</small>' : '') +
          '</td><td class="r">' + esc(item.quantidade) + '</td><td class="r">' +
          fmtMoney(Number(item.valorUnitario || 0)) + '</td><td class="r">' +
          fmtMoney(Number(item.quantidade || 0) * Number(item.valorUnitario || 0)) + '</td></tr>';
      }).join("") + '</tbody></table>';
  };

  const financialPageBodies = () => {
    if (!groups.length) return ['<p class="studio-muted">Nenhuma etapa estruturada disponível.</p>'];
    const bodies: string[] = [];
    let summaries: string[] = [];
    const flushSummaries = () => {
      if (summaries.length) {
        bodies.push('<div class="studio-stage-summary-list">' + summaries.join("") + '</div>');
        summaries = [];
      }
    };
    for (const group of groups) {
      const stageName = String(group.nome ?? "");
      const specialCommercialStage = /esquadr/i.test(stageName) || /(revest|porcelanat|cer[aâ]mic)/i.test(stageName);
      const mode = specialCommercialStage ? "resumo_etapa" : resolveProposalPresentationMode(presentation, group.id);
      if (mode === "resumo_etapa") {
        summaries.push(financialBlock(group));
        if (summaries.length >= 8) flushSummaries();
        continue;
      }
      flushSummaries();
      const parts = chunk(group.itens, 11);
      parts.forEach((part, partIndex) => {
        bodies.push(financialBlock(
          group,
          part,
          parts.length > 1 ? `Parte ${partIndex + 1}/${parts.length}` : "",
        ));
      });
    }
    flushSummaries();
    return bodies;
  };

  const schedulePageBodies = () => {
    if (!scheduleRows.length) return ['<p class="studio-muted">Cronograma não configurado para esta proposta.</p>'];
    return chunk(scheduleRows, 12).map((rows) =>
      '<table class="studio-table"><thead><tr><th>Etapa</th><th>Início</th><th>Duração</th><th>Término</th><th class="r">Avanço físico</th><th class="r">Peso financeiro</th></tr></thead><tbody>' +
      rows.map((row) => '<tr><td><strong>Etapa ' + esc(row.ordem) + '</strong> · ' + esc(row.nome) + '</td><td>' +
        proposalFormatDate(row.start) + '</td><td>' + esc(row.duration ? row.duration + " dias" : "A definir") +
        '</td><td>' + proposalFormatDate(row.end) + '</td><td class="r">' + Number(row.physicalPercent || 0).toFixed(2) +
        '%</td><td class="r">' + Number(row.financialPercent || 0).toFixed(2) + '%</td></tr>').join("") + '</tbody></table>'
    );
  };

  const monthlyFinancialPageBodies = () => {
    if (!monthlyPeriods.length) return ['<p class="studio-muted">Cronograma físico-financeiro não configurado para esta proposta.</p>'];
    return chunk(monthlyPeriods, 3).map((periods) =>
      '<p class="studio-monthly-help">Previsão de execução e pagamento por mês. O desconto da entrada reduz o valor a pagar na medição.</p>' +
      periods.map((period) => {
        const hasAdvance = presentation.entradaPercentual > 0 && presentation.mostrarAmortizacaoEntrada;
        const activeStages = period.stages.filter((stage) => stage.share > 0).map((stage) => stage.nome);
        return '<section class="studio-month-card"><div class="studio-month-head"><strong>' + esc(period.label) +
          '</strong><span>Avanço físico no mês: ' + Number(period.physical || 0).toFixed(2) +
          '% · Acumulado: ' + Number(period.accumulatedPhysical || 0).toFixed(2) + '%</span></div>' +
          '<div class="studio-month-stages"><b>Etapas / fases previstas</b><p>' + esc(activeStages.join(" · ") || "—") + '</p></div>' +
          '<div class="studio-month-money"><div><span>Serviços previstos no mês</span><strong>' + fmtMoney(period.amount) + '</strong></div>' +
          (hasAdvance ? '<div><span>Desconto da entrada</span><strong>−' + fmtMoney(period.amortization) + '</strong></div>' : '') +
          '<div class="studio-month-pay"><span>Valor a pagar no mês</span><strong>' + fmtMoney(period.netAmount) + '</strong></div></div>' +
          (hasAdvance ? '<p class="studio-month-balance">Saldo da entrada a descontar nas próximas medições: <strong>' + fmtMoney(period.remainingAdvance) + '</strong></p>' : '') +
          '</section>';
      }).join("")
    );
  };

  const genericPage = (
    module: Record<string, unknown>,
    index: number,
    body: string,
    partIndex = 0,
    partCount = 1,
    options?: { includeVisual?: boolean },
  ) => {
    const displayTitle = moduleDisplayTitle(module);
    const title = partCount > 1 ? displayTitle + ' · ' + (partIndex + 1) + '/' + partCount : displayTitle;
    const visual = options?.includeVisual === true ? pageVisual(module, index) : "";
    return '<section class="studio-page" data-studio-key="' + esc(module.key) + '" id="sec-' + esc(module.key) + '-' + partIndex + '">' +
      header(title) +
      '<div class="studio-page-body">' +
        '<span class="studio-kicker">' + (interactive ? esc(displayTitle) : 'Página ' + (index + 1) + (partCount > 1 ? ' · continuação ' + (partIndex + 1) + '/' + partCount : '')) + '</span>' +
        '<h1>' + esc(title) + '</h1>' +
        (moduleText(module, "description") && partIndex === 0 ? '<p class="studio-lead">' + esc(moduleText(module, "description")) + '</p>' : '') +
        visual + body +
      '</div>' + footer() +
    '</section>';
  };

  const genericPages = (
    module: Record<string, unknown>,
    index: number,
    bodies: string[],
    options?: { includeVisual?: boolean },
  ) => bodies.map((body, partIndex) =>
    genericPage(module, index, body, partIndex, bodies.length, {
      includeVisual: partIndex === 0 && options?.includeVisual !== false,
    })
  ).join("\n");

  const renderModule = (module: Record<string, unknown>, index: number): string => {
    const key = String(module.key ?? "");
    const img = moduleImage(module);

    if (key === "capa") {
      const coverUrl = presentation.imagemCapa || img.url || visualImages[0] || "";
      const valueStatement = moduleText(moduleByKey("produto_servico") ?? {}, "description")
        || moduleText(moduleByKey("diferenciais") ?? {}, "description")
        || String(offerInfo.text || hero.subheadline || "").trim()
        || "Uma proposta comercial clara, orientada ao valor e aos próximos passos.";
      const summary = [
        presentation.mostrarTotalGeral && total > 0 ? '<div><span>Investimento</span><strong>' + fmtMoney(total) + '</strong></div>' : '',
        '<div><span>Prazo</span><strong>' + esc(effectiveDeadlineLabel) + '</strong></div>',
        groups.length ? '<div><span>Etapas / grupos</span><strong>' + groups.length + '</strong></div>' : '',
        presentation.areaTotalConstruida > 0 ? '<div><span>Área</span><strong>' + esc(presentation.areaTotalConstruida.toLocaleString("pt-BR")) + ' m²</strong></div>' : '',
      ].filter(Boolean).join("");
      return '<section class="studio-page studio-cover" data-studio-key="capa">' +
        (coverUrl ? '<img class="studio-cover-backdrop" src="' + esc(coverUrl) + '" alt="" /><img class="studio-cover-bg" src="' + esc(coverUrl) + '" alt="" />' : '') +
        '<div class="studio-cover-overlay" style="background:rgba(0,0,0,' + (img.overlay / 100).toFixed(2) + ');"></div>' +
        '<div class="studio-cover-content"><div class="studio-cover-top">' +
          (tenantLogoUrl ? '<img src="' + esc(tenantLogoUrl) + '" alt="' + esc(company) + '" />' : '<strong>' + esc(company) + '</strong>') +
          '<span>PROPOSTA COMERCIAL</span></div>' +
          '<div class="studio-cover-main"><span class="studio-kicker">Proposta de valor</span>' +
          '<h1>' + esc(orcamento?.titulo || hero.headline || moduleText(module, "title", "Proposta comercial")) + '</h1>' +
          '<p>' + esc(valueStatement) + '</p>' +
          '</div>' +
          '<div class="studio-cover-bottom"><strong>Cliente: ' + esc(client) + '</strong>' +
          (summary ? '<div class="studio-cover-summary">' + summary + '</div>' : '') +
          '</div></div></section>';
    }

    if (key === "apresentacao_empresa") {
      const manual = moduleManualContent(module);
      const text = manual || companyInfo.text || "Apresentação institucional da empresa.";
      // Empresa fala somente da empresa. Benefícios da solução ficam no bloco da solução.
      const highlights = extractProposalBenefits(companyInfo.highlights);
      return genericPage(module, index, pageVisual(module, index) + '<p class="studio-copy">' + esc(text) + '</p>' + benefitsHtml(highlights));
    }

    if (key === "diferenciais") {
      // Quando já existe "Solução proposta", um segundo bloco automático de diferenciais
      // tende a repetir exatamente os mesmos argumentos. Só preservamos este módulo
      // quando houver conteúdo manual exclusivo.
      const manual = moduleManualContent(module);
      if (moduleByKey("produto_servico") && !manual) return "";
      const solutionBenefits = moduleByKey("produto_servico") ? [] : extractProposalBenefits(solutionInfo.agents, proofInfo.items);
      if (!manual && !solutionBenefits.length) return "";
      return genericPage(module, index,
        (manual ? '<p class="studio-copy">' + esc(manual) + '</p>' : '') +
        benefitsHtml(solutionBenefits));
    }

    if (key === "produto_servico") {
      const manual = moduleManualContent(module);
      const text = manual || offerInfo.text || "Descrição da solução ofertada.";
      const bullets = extractProposalBenefits(offerInfo.bullets);
      return genericPage(module, index, pageVisual(module, index) + '<p class="studio-copy">' + esc(text) + '</p>' + benefitsHtml(bullets));
    }

    if (key === "resumo_executivo") {
      // Em obra completa, investimento/prazo/área já estão na capa e o escopo vem logo depois.
      // Não gerar uma segunda página apenas para repetir esses mesmos números.
      if (String(builder.proposalKind ?? "") === "construction_project") return "";
      const cards = [
        presentation.mostrarTotalGeral && total > 0 ? ['Investimento', fmtMoney(total)] : null,
        ['Prazo', effectiveDeadlineLabel],
        groups.length ? ['Etapas / grupos', String(groups.length)] : null,
        presentation.previsaoInicio ? ['Início previsto', proposalFormatDate(presentation.previsaoInicio)] : null,
      ].filter(Boolean) as Array<[string, string]>;
      const metrics = '<div class="studio-metrics">' + cards.map(([label, value]) =>
        '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'
      ).join("") + '</div>';
      const manual = moduleManualContent(module);
      return genericPage(module, index, pageVisual(module, index) + metrics + (manual ? '<p class="studio-copy">' + esc(manual) + '</p>' : ''));
    }

    if (key === "escopo") {
      const intro: string[] = [];
      if (presentation.descricaoProjeto) {
        intro.push('<div class="studio-callout"><strong>Entendimento do projeto</strong><p>' + esc(presentation.descricaoProjeto) + '</p></div>');
      }
      if (presentation.premissasObra.length) {
        intro.push('<div class="studio-exclusions studio-premises"><h2>Premissas consideradas</h2><ul>' +
          presentation.premissasObra.map((item) => '<li>' + esc(item) + '</li>').join("") +
          '</ul></div>');
      }
      if (presentation.memorialDescritivo) {
        intro.push('<div class="studio-callout"><strong>Memorial descritivo</strong><p>' + esc(presentation.memorialDescritivo) + '</p></div>');
      }
      const bodies = [...(intro.length ? [intro.join("")] : []), ...scopePageBodies()];
      return genericPages(module, index, bodies, { includeVisual: false });
    }
    if (key === "etapas_orcamento") return genericPages(module, index, financialPageBodies(), { includeVisual: false });
    if (key === "imagem_por_etapa") return "";
    if (key === "tabela_itens") return genericPages(module, index, financialPageBodies(), { includeVisual: false });
    if (key === "cronograma") {
      if (!presentation.mostrarCronogramaExecucao) return "";
      return genericPages(module, index, schedulePageBodies(), { includeVisual: false });
    }
    if (key === "fisico_financeiro") {
      if (!presentation.mostrarFisicoFinanceiro) return "";
      return genericPages(module, index, monthlyFinancialPageBodies(), { includeVisual: false });
    }

    if (key === "condicoes_comerciais") {
      const conditions = [
        presentation.mostrarTotalGeral && total > 0 ? ['Valor da proposta', fmtMoney(total)] : null,
        !presentation.condicoesPagamentoDetalhadas && orcamento?.condPagamento ? ['Condição de pagamento', orcamento.condPagamento] : null,
        presentation.entradaPercentual > 0 ? ['Entrada · ' + presentation.entradaPercentual.toLocaleString("pt-BR") + '%', fmtMoney(total * presentation.entradaPercentual / 100)] : null,
        presentation.entradaPercentual > 0 ? ['Saldo após a entrada · conforme medições', fmtMoney(total * (1 - presentation.entradaPercentual / 100))] : null,
        orcamento?.formaPagamento ? ['Forma de pagamento', ({ pix: "PIX", boleto: "Boleto", transferencia: "Transferência", dinheiro: "Dinheiro", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito", a_combinar: "A combinar" } as Record<string, string>)[orcamento.formaPagamento] ?? orcamento.formaPagamento] : null,
        ['Prazo / entrega', effectiveDeadlineLabel],
      ].filter(Boolean) as Array<[string, string]>;
      const list = '<div class="studio-conditions">' + conditions.map(([label, value]) =>
        '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'
      ).join("") + '</div>';
      const exclusions = presentation.itensNaoInclusos.length
        ? '<div class="studio-exclusions"><h2>Não inclusos nesta proposta</h2><ul>' +
          presentation.itensNaoInclusos.map((item) => '<li>' + esc(item) + '</li>').join("") +
          '</ul></div>'
        : '';
      const commercialDetails = [
        presentation.condicoesPagamentoDetalhadas
          ? '<div class="studio-callout"><strong>Condições e marcos de pagamento</strong><p>' + esc(presentation.condicoesPagamentoDetalhadas) + '</p></div>'
          : '',
        presentation.politicaReajuste
          ? '<div class="studio-callout"><strong>Reajuste</strong><p>' + esc(presentation.politicaReajuste) + '</p></div>'
          : '',
        presentation.garantiasContratuais
          ? '<div class="studio-callout"><strong>Garantias e assistência</strong><p>' + esc(presentation.garantiasContratuais) + '</p></div>'
          : '',
      ].filter(Boolean).join("");
      return genericPage(module, index, list +
        commercialDetails +
        (orcamento?.observacoes ? '<p class="studio-copy">' + esc(orcamento.observacoes) + '</p>' : '') +
        exclusions, 0, 1, { includeVisual: false });
    }

    if (key === "validade_inicio") {
      if (moduleByKey("aceite")) return "";
      const values = [
        ['Validade', orcamento?.validadeAte ? proposalFormatDate(orcamento.validadeAte) : 'A definir'],
        ['Início previsto', presentation.previsaoInicio ? proposalFormatDate(presentation.previsaoInicio) : 'A definir'],
      ];
      return genericPage(module, index, '<div class="studio-conditions">' +
        values.map(([label, value]) => '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join("") +
        '</div>');
    }

    if (key === "aceite") {
      const acceptanceValues = [
        ['Validade da proposta', orcamento?.validadeAte ? proposalFormatDate(orcamento.validadeAte) : 'A definir'],
        ['Início previsto', presentation.previsaoInicio ? proposalFormatDate(presentation.previsaoInicio) : 'A definir'],
      ];
      const portalModule = moduleByKey("portal_cliente");
      const portalBlock = presentation.mostrarPortalCliente
        ? '<div class="studio-callout" style="margin-top:5mm;"><strong>Portal do Cliente</strong><p>' +
          esc(moduleManualContent(portalModule ?? {}) || "Após a contratação, o cliente poderá acompanhar documentos, cronograma, atualizações e informações disponibilizadas pela empresa.") +
          '</p></div>'
        : '';
      return genericPage(module, index,
        '<div class="studio-conditions">' +
          acceptanceValues.map(([label, value]) => '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join("") +
        '</div>' +
        '<div class="studio-accept"><h2>Aceite digital</h2><p>' +
        esc(moduleManualContent(module) || "O aceite desta proposta é feito digitalmente pelo botão Aceitar proposta no link enviado ao cliente. Os dados confirmados ficam vinculados ao lead e iniciam o fluxo de contratação.") +
        '</p><div class="studio-digital-accept-note"><strong>Sem assinatura física nesta página.</strong><span>O registro eletrônico do aceite fica associado à proposta, ao cliente e ao histórico comercial.</span></div></div>' +
        portalBlock);
    }

    if (key === "portal_cliente") {
      // O portal é apresentado junto dos próximos passos/aceite para não ocupar uma página isolada.
      return "";
    }

    if (key === "curiosidades_conteudo") {
      const cards = Array.isArray(curiositiesInfo.items) ? curiositiesInfo.items : [];
      const bodies = cards.length
        ? chunk(cards, 6).map((part) => '<div class="studio-card-grid">' +
            part.map((item: any) => '<div><strong>' + esc(item?.title) + '</strong><p>' + esc(item?.text) + '</p></div>').join("") +
            '</div>')
        : ['<p class="studio-muted">Nenhum conteúdo adicional cadastrado.</p>'];
      return genericPages(module, index, bodies, { includeVisual: true });
    }

    if (key === "cases_provas") {
      const cards = Array.isArray(proofInfo.items) ? proofInfo.items : [];
      const bodies = cards.length
        ? chunk(cards, 6).map((part) => '<div class="studio-card-grid">' +
            part.map((item: any) => '<div><strong>' + esc(item?.title) + '</strong><p>' + esc(item?.text) + '</p></div>').join("") +
            '</div>')
        : ['<p class="studio-muted">Nenhuma prova ou case cadastrado para esta proposta.</p>'];
      return genericPages(module, index, bodies, { includeVisual: true });
    }

    if (key === "faq") {
      const cards = Array.isArray(faqInfo.items) ? faqInfo.items : [];
      const bodies = cards.length
        ? chunk(cards, 7).map((part) => '<div class="studio-faq">' +
            part.map((item: any) => '<div><strong>' + esc(item?.question) + '</strong><p>' + esc(item?.answer) + '</p></div>').join("") +
            '</div>')
        : ['<p class="studio-muted">Nenhuma pergunta frequente cadastrada.</p>'];
      return genericPages(module, index, bodies, { includeVisual: false });
    }

    if (key === "anexos") {
      return genericPage(module, index,
        '<div class="studio-callout"><strong>Anexos</strong><p>Documentos vinculados a esta versão da proposta.</p></div><!-- STUDIO_ATTACHMENTS -->');
    }

    return genericPage(module, index, pageVisual(module, index) +
      '<p class="studio-copy">' + esc(moduleManualContent(module) || moduleText(module, "description") || "Conteúdo desta página definido pelo modelo do tenant.") + '</p>');
  };

  const renderedModules = modules
    .map((module, index) => ({ module, html: renderModule(module, index) }))
    .filter((entry) => entry.html.trim().length > 0);
  const pages = renderedModules.map((entry) => entry.html).join("\n");
  const preset = String(builder.visualStyle?.preset ?? "corporativo");
  const webNav = interactive
    ? '<nav class="studio-web-nav"><div class="studio-web-nav-inner"><div class="studio-web-brand">' +
        (tenantLogoUrl ? '<img src="' + esc(tenantLogoUrl) + '" alt="' + esc(company) + '" />' : '<strong>' + esc(company) + '</strong>') +
        '</div><div class="studio-web-links">' +
        renderedModules
          .map((entry) => entry.module)
          .filter((module) => !["capa","validade_inicio","imagem_por_etapa"].includes(String(module.key ?? "")))
          .slice(0, 6)
          .map((module) => '<a href="#sec-' + esc(module.key) + '-0">' + esc(moduleDisplayTitle(module)) + '</a>')
          .join("") +
        '</div></div></nav>'
    : "";

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<title>Proposta — ' + esc(client) + '</title><style>' +
    '@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Inter,Arial,sans-serif;background:#eef0f3;color:' + theme.ink + ';-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.studio-page{width:210mm;height:297mm;min-height:297mm;margin:0 auto 12px;background:#fff;padding:13mm 15mm 11mm;page-break-after:always;display:flex;flex-direction:column;overflow:hidden;position:relative}.studio-page:last-child{page-break-after:auto}' +
    '.studio-hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + theme.concreteLine + ';padding-bottom:4mm;margin-bottom:7mm;font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:' + theme.navyMid + '}.studio-brand img{height:8mm;max-width:50mm;object-fit:contain}.studio-footer{margin-top:auto;border-top:1px solid ' + theme.concreteLine + ';padding-top:3mm;display:flex;justify-content:space-between;font-size:6pt;color:#8b849a}' +
    '.studio-page-body{min-height:0;overflow:visible}.studio-kicker{font-size:6.5pt;text-transform:uppercase;letter-spacing:.12em;color:' + theme.accent + ';font-weight:700}.studio-page h1{font-size:24pt;line-height:1.05;margin:2.5mm 0 3mm;color:' + theme.navyDeep + ';letter-spacing:-.03em}.studio-lead{font-size:10pt;line-height:1.55;color:#5b556d;margin:0 0 6mm;max-width:165mm}.studio-copy{font-size:9pt;line-height:1.6;color:#49425d;margin:4mm 0}.studio-muted,.studio-note{font-size:8pt;color:#777083}.studio-note{margin-top:2mm}' +
    '.studio-visual{height:58mm;width:100%;overflow:hidden;border-radius:3mm;margin:4mm 0 6mm;background:' + theme.cream2 + '}.studio-visual img{width:100%;height:100%;display:block}' +
    '.studio-benefits{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:5mm}.studio-benefit{border:1px solid ' + theme.concreteLine + ';border-left:1.5mm solid ' + theme.accent + ';border-radius:2.5mm;padding:4mm;background:#fff}.studio-benefit strong{font-size:9pt;line-height:1.35;color:' + theme.navyDeep + '}' +
    '.studio-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;margin:4mm 0}.studio-metrics>div{background:' + theme.cream2 + ';border-left:1.5mm solid ' + theme.accent + ';padding:5mm}.studio-metrics span,.studio-conditions span{display:block;font-size:6pt;text-transform:uppercase;letter-spacing:.08em;color:#777083;margin-bottom:1.5mm}.studio-metrics strong{font-size:16pt;color:' + theme.navyDeep + '}' +
    '.studio-table{width:100%;border-collapse:collapse;margin-top:4mm;font-size:7.2pt}.studio-table th{background:' + theme.navyDeep + ';color:#fff;text-align:left;padding:2.6mm;border:1px solid ' + theme.navyDeep + '}.studio-table td{padding:2.5mm;border:1px solid ' + theme.concreteLine + ';vertical-align:top}.studio-table td small{display:block;color:#777083;margin-top:.8mm}.r{text-align:right!important}' +
    '.studio-stage-grid,.studio-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:5mm}.studio-stage-card,.studio-card-grid>div{border:1px solid ' + theme.concreteLine + ';border-radius:2.5mm;padding:4mm;background:#fff}.studio-stage-card span{display:block;font-size:6pt;color:' + theme.accent + ';text-transform:uppercase;letter-spacing:.08em}.studio-stage-card strong{display:block;font-size:9pt;margin:1.3mm 0}.studio-stage-card b{font-size:11pt;color:' + theme.navyDeep + '}.studio-stage-card small{display:block;font-size:6pt;color:#777083;margin-top:1.2mm}.studio-card-grid p{font-size:7.5pt;line-height:1.45;color:#5d566d}' +
    '.studio-monthly-help{font-size:9pt;line-height:1.5;margin:0 0 5mm;color:#514a61}.studio-month-card{margin:0 0 5mm;border:1px solid #d8d6df;border-radius:2mm;break-inside:avoid;overflow:hidden}.studio-month-head{display:flex;justify-content:space-between;align-items:center;gap:3mm;padding:3mm 4mm;background:#f2f1f5}.studio-month-head strong{font-size:11pt}.studio-month-head span{font-size:8pt}.studio-month-stages{padding:3mm 4mm}.studio-month-stages b{font-size:8pt}.studio-month-stages p{font-size:9pt;line-height:1.5;white-space:normal;overflow-wrap:anywhere;margin:1mm 0}.studio-month-money{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm;padding:3mm 4mm;border-top:1px solid #e2e0e7}.studio-month-money span{display:block;font-size:8pt;color:#514a61}.studio-month-money strong{display:block;font-size:11pt;white-space:normal;margin-top:1.5mm}.studio-month-pay{background:#f2f1f5;padding:2mm;border-radius:1mm}.studio-month-balance{padding:2mm 4mm 3mm;font-size:8pt;color:#514a61}.studio-page[data-studio-key="condicoes_comerciais"] .studio-conditions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm;margin:4mm 0}.studio-page[data-studio-key="condicoes_comerciais"] .studio-conditions>div{padding:3mm;border:1px solid #e2e0e7;border-radius:2mm}.studio-page[data-studio-key="condicoes_comerciais"] .studio-conditions span{font-size:8pt;line-height:1.4}.studio-page[data-studio-key="condicoes_comerciais"] .studio-conditions strong{font-size:12pt;line-height:1.4}.studio-page[data-studio-key="condicoes_comerciais"] .studio-callout{padding:4mm;margin:3mm 0}.studio-page[data-studio-key="condicoes_comerciais"] .studio-callout strong{font-size:10pt}.studio-page[data-studio-key="condicoes_comerciais"] .studio-callout p,.studio-page[data-studio-key="condicoes_comerciais"] .studio-exclusions ul{font-size:9pt;line-height:1.5}.studio-page[data-studio-key="condicoes_comerciais"] .studio-exclusions{padding:4mm;margin-top:3mm}' +
    '.studio-stage-title{display:flex;justify-content:space-between;align-items:flex-start;gap:5mm;border-bottom:2px solid ' + theme.navyDeep + ';padding:2mm 0 3mm;margin:3mm 0}.studio-stage-title span{font-size:9pt;font-weight:700;color:' + theme.navyDeep + '}.studio-stage-title small{font-size:6pt;color:#777083;font-weight:400}.studio-stage-title strong{font-size:10pt;color:' + theme.navyDeep + '}.studio-stage-value{display:flex;flex-direction:column;align-items:flex-end;gap:.6mm}.studio-stage-value small{font-size:5.8pt;text-transform:uppercase;letter-spacing:.06em;color:#777083}.studio-commercial-note{margin:2mm 0 4mm;padding:3.5mm 4mm;border-left:1.3mm solid ' + theme.accent + ';background:' + theme.cream2 + ';border-radius:1.5mm}.studio-commercial-note p{font-size:7.2pt;line-height:1.45;color:#514a61;margin:.7mm 0}.studio-stage-summary-list{display:grid;gap:3mm;margin-top:4mm}.studio-stage-summary{display:flex;justify-content:space-between;gap:5mm;padding:4mm;border:1px solid ' + theme.concreteLine + ';border-radius:2mm;background:#fff;font-size:8.5pt}.studio-scope-list{display:grid;gap:2.5mm}.studio-scope-list>div{border-bottom:1px solid ' + theme.concreteLine + ';padding:2.5mm 0}.studio-scope-list strong{display:block;font-size:8pt;color:' + theme.navyDeep + '}.studio-scope-list span{display:block;font-size:7pt;line-height:1.4;color:#625b70;margin-top:.7mm}.studio-scope-hidden{padding:5mm;border:1px dashed ' + theme.concreteLine + ';border-radius:2mm}.studio-scope-hidden strong,.studio-scope-hidden span{display:block}.studio-scope-hidden span{font-size:7pt;color:#777083;margin-top:1mm}.studio-exclusions{margin-top:5mm;padding:5mm;border:1px solid ' + theme.concreteLine + ';border-left:1.5mm solid ' + theme.warn + ';border-radius:2mm}.studio-exclusions h2{font-size:11pt;margin:0 0 2mm}.studio-exclusions ul{margin:0;padding-left:5mm;font-size:7.5pt;line-height:1.5}.studio-monthly td:nth-child(2){max-width:62mm;font-size:6.6pt}' +
    '.studio-gallery{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}.studio-gallery figure{margin:0}.studio-gallery img{width:100%;height:55mm;object-fit:cover;border-radius:2.5mm}.studio-gallery figcaption{font-size:6.5pt;color:#686176;margin-top:1.5mm}' +
    '.studio-conditions{border-top:2px solid ' + theme.navyDeep + ';margin-top:5mm}.studio-conditions>div{display:grid;grid-template-columns:55mm 1fr;gap:5mm;padding:4.5mm 0;border-bottom:1px solid ' + theme.concreteLine + '}.studio-conditions strong{font-size:9pt;color:' + theme.navyDeep + '}' +
    '.studio-callout{margin-top:8mm;padding:7mm;border-left:2mm solid ' + theme.accent + ';background:' + theme.cream2 + ';border-radius:2mm}.studio-callout strong{font-size:14pt}.studio-callout p{font-size:9pt;line-height:1.6;color:#514a61}' +
    '.studio-accept{margin-top:10mm}.studio-accept h2{font-size:18pt}.studio-accept p{font-size:9pt;line-height:1.6;max-width:165mm}.studio-digital-accept-note{margin-top:8mm;padding:5mm;border-radius:2mm;background:' + theme.cream2 + ';border-left:1.5mm solid ' + theme.accent + '}.studio-digital-accept-note strong,.studio-digital-accept-note span{display:block}.studio-digital-accept-note strong{font-size:9pt;color:' + theme.navyDeep + '}.studio-digital-accept-note span{font-size:7.5pt;line-height:1.45;color:#655e72;margin-top:1.5mm}' +
    '.studio-faq{display:grid;gap:3mm;margin-top:5mm}.studio-faq>div{border:1px solid ' + theme.concreteLine + ';border-radius:2mm;padding:4mm}.studio-faq strong{font-size:9pt}.studio-faq p{font-size:7.5pt;color:#5d566d;line-height:1.45}' +
    '.studio-cover{padding:0;color:#fff;background:#111;position:relative;overflow:hidden}.studio-cover-backdrop{position:absolute;inset:-24px;width:calc(100% + 48px);height:calc(100% + 48px);object-fit:cover;filter:blur(18px) brightness(.48);transform:scale(1.03)}.studio-cover-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center}.studio-cover-overlay{position:absolute;inset:0}.studio-cover-content{position:relative;z-index:2;height:100%;padding:16mm 15mm 14mm;display:flex;flex-direction:column}.studio-cover-top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.35);padding-bottom:5mm;font-size:7pt;letter-spacing:.1em}.studio-cover-top img{height:10mm;max-width:55mm;object-fit:contain;background:#fff;border-radius:2mm;padding:1.5mm}.studio-cover-main{margin-top:24mm;max-width:155mm}.studio-cover-main h1{font-size:31pt;color:#fff;margin:3mm 0 4mm}.studio-cover-main p{font-size:10.5pt;line-height:1.55;color:rgba(255,255,255,.9);max-width:125mm}.studio-cover .studio-kicker{color:#fff;opacity:.7}.studio-cover .studio-benefits{max-width:145mm}.studio-cover .studio-benefit{border-color:rgba(255,255,255,.3);background:rgba(0,0,0,.23)}.studio-cover .studio-benefit strong{color:#fff}.studio-cover-bottom{margin-top:auto;border-left:2mm solid ' + theme.accent + ';background:rgba(0,0,0,.32);padding:5mm 6mm}.studio-cover-bottom>strong{font-size:9pt}.studio-cover-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm 7mm;margin-top:4mm}.studio-cover-summary span{display:block;font-size:5.8pt;text-transform:uppercase;letter-spacing:.07em;opacity:.7}.studio-cover-summary strong{font-size:10pt}' +
    '.proposal-preset-minimalista .studio-benefit,.proposal-preset-minimalista .studio-stage-card{box-shadow:none}.proposal-preset-catalogo_comercial .studio-page h1{font-size:22pt}.proposal-preset-tecnico .studio-table{font-size:6.8pt}' +
    '@media screen{.studio-page{box-shadow:0 12px 36px rgba(15,23,42,.12)}}@media print{body{background:#fff}.studio-page{margin:0;box-shadow:none}}' +
    (interactive ? [
      '.studio-web{background:#fff}',
      '.studio-web-nav{position:sticky;top:0;z-index:90;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-bottom:1px solid #e5e7eb}',
      '.studio-web-nav-inner{max-width:1180px;margin:0 auto;min-height:68px;padding:10px 24px;display:flex;align-items:center;gap:28px}',
      '.studio-web-brand{min-width:140px;display:flex;align-items:center}.studio-web-brand img{height:38px;max-width:160px;object-fit:contain}',
      '.studio-web-links{margin-left:auto;display:flex;gap:18px;align-items:center;overflow-x:auto;white-space:nowrap}.studio-web-links a{font-size:13px;color:#4b5563;text-decoration:none;font-weight:600}',
      '.studio-web .studio-page{width:100%;height:auto;min-height:0;margin:0;padding:72px max(24px,calc((100vw - 1120px)/2));page-break-after:auto;overflow:visible;box-shadow:none;border-radius:0}',
      '.studio-web .studio-page:not(.studio-cover){border-top:1px solid #eceff3}',
      '.studio-web .studio-hdr,.studio-web .studio-footer{display:none}',
      '.studio-web .studio-page-body{max-width:1120px;margin:0 auto}',
      '.studio-web .studio-page h1{font-size:clamp(34px,4vw,54px);line-height:1.03;margin:8px 0 18px}',
      '.studio-web .studio-kicker{font-size:12px;letter-spacing:.14em}',
      '.studio-web .studio-lead,.studio-web .studio-copy{font-size:16px;line-height:1.7;max-width:860px}',
      '.studio-web .studio-cover{min-height:76vh;padding:0}',
      '.studio-web .studio-cover-content{min-height:76vh;height:auto;padding:78px max(24px,calc((100vw - 1120px)/2)) 56px}',
      '.studio-web .studio-cover-main{margin-top:9vh;max-width:900px}',
      '.studio-web .studio-cover-main h1{font-size:clamp(44px,6vw,78px);max-width:900px}',
      '.studio-web .studio-cover-main p{font-size:18px;max-width:760px}',
      '.studio-web .studio-cover-bottom{max-width:860px}',
      '.studio-web .studio-benefits{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}',
      '.studio-web .studio-benefit{padding:20px;border-radius:16px}.studio-web .studio-benefit strong{font-size:15px}',
      '.studio-web .studio-metrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.studio-web .studio-metrics>div{padding:20px;border-radius:16px}.studio-web .studio-metrics strong{font-size:24px}',
      '.studio-web .studio-stage-summary-list{grid-template-columns:1fr 1fr;gap:14px}.studio-web .studio-stage-summary{padding:18px;border-radius:14px;font-size:14px}',
      '.studio-web .studio-stage-title{margin:18px 0}.studio-web .studio-stage-title span,.studio-web .studio-stage-title strong{font-size:16px}',
      '.studio-web .studio-table{font-size:13px;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:14px}.studio-web .studio-table th,.studio-web .studio-table td{padding:12px}',
      '.studio-web .studio-card-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.studio-web .studio-card-grid>div{padding:20px;border-radius:16px}.studio-web .studio-card-grid p{font-size:14px}',
      '.studio-web .studio-conditions>div{grid-template-columns:220px 1fr;padding:16px 0}.studio-web .studio-conditions strong{font-size:16px}',
      '.studio-web .studio-callout,.studio-web .studio-digital-accept-note,.studio-web .studio-exclusions{border-radius:16px;padding:22px}',
      '.studio-web .studio-visual{height:min(420px,44vw);border-radius:18px}',
      '@media(max-width:820px){.studio-web-nav-inner{padding:8px 14px}.studio-web-links{display:none}.studio-web .studio-page{padding:46px 20px}.studio-web .studio-cover-content{padding:54px 20px 36px}.studio-web .studio-benefits,.studio-web .studio-metrics,.studio-web .studio-card-grid,.studio-web .studio-stage-summary-list{grid-template-columns:1fr}.studio-web .studio-conditions>div{grid-template-columns:1fr;gap:6px}.studio-web .studio-table{display:block;width:100%;overflow-x:auto;white-space:nowrap}}'
    ].join('') : '') +
    '</style></head><body class="proposal-preset-' + esc(preset) + (interactive ? ' studio-web' : hybrid ? ' studio-hybrid' : '') + '">' + webNav + pages + '</body></html>';
}

export function renderProposalHtml(json: unknown, theme: {
  cream: string; cream2: string; ink: string;
  navyDeep: string; navyMid: string;
  accent: string; accentSoft: string;
  secondary: string; secondarySoft: string;
  concrete: string; concreteLine: string;
  ok: string; warn: string;
}, logoUrl?: string | null, clientName?: string, tenantName?: string, websiteUrl?: string | null, tenantLogoUrl?: string | null, imagens?: string[] | null, orcamento?: {
  titulo: string;
  numero?: string | null;
  itens: Array<{
    nome: string;
    quantidade: number;
    valorUnitario: number;
    sku?: string | null;
    descricao?: string | null;
    etapaId?: string | null;
    etapaNome?: string | null;
    etapaOrdem?: number | null;
  }>;
  valorTotal?: string | null;
  observacoes?: string | null;
  formaPagamento?: string | null;
  condPagamento?: string | null;
  prazoEntrega?: string | null;
  validadeAte?: Date | string | null;
  paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
  apresentacao?: ProposalPresentationConfig | null;
} | null, contact?: {
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
} | null, builder?: {
  enabledModules?: string[] | null;
  moduleOrder?: string[] | null;
  proposalKind?: string | null;
  visualStyle?: Record<string, unknown> | null;
  modules?: Array<Record<string, unknown>> | null;
} | null): string {
  const d = json as Record<string, any>;
  const hero = d.hero || {};
  const companyInfo = d.company || {};
  const offerInfo = d.offer || {};
  const curiositiesInfo = d.curiosities || {};
  const proofInfo = d.proof || {};
  const faqInfo = d.faq || {};
  const situation = d.situation || {};
  const problem = d.problem || {};
  const implication = d.implication || {};
  const value = d.value || {};
  const solution = d.solution || {};
  const modules = d.modules || {};
  const cta = d.cta || {};
  const meta = d.meta || {};

  const builderModuleSet = Array.isArray(builder?.enabledModules)
    ? new Set(builder!.enabledModules!.filter((value): value is string => typeof value === "string"))
    : null;
  const builderModuleEnabled = (key: string, fallback = true) =>
    builderModuleSet ? builderModuleSet.has(key) : fallback;
  const genericBuilderModule = (key: string) =>
    Array.isArray(builder?.modules)
      ? builder.modules.find((item) => String(item?.key ?? "") === key) ?? null
      : null;
  const genericBuilderText = (key: string, field: "title" | "description" | "contentPrompt") => {
    const value = genericBuilderModule(key)?.[field];
    return typeof value === "string" && value.trim() ? value.trim() : "";
  };
  const genericCoverBenefits = extractProposalBenefits(
    genericBuilderText("diferenciais", "contentPrompt"),
    genericBuilderText("diferenciais", "description"),
    companyInfo.highlights,
    offerInfo.bullets,
    solution.agents,
  );
  const genericCoverValue = genericBuilderText("produto_servico", "description")
    || genericBuilderText("diferenciais", "description")
    || String(offerInfo.text || hero.subheadline || "").trim()
    || "Uma proposta clara para apresentar solução, benefícios e condições comerciais.";

  const navName = tenantName || "Proposta Comercial";
  const navLogoUrl = tenantLogoUrl || null;
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const builderVisualImages = Array.isArray(builder?.modules)
    ? builder.modules
        .map((module) => {
          const raw = module?.image;
          if (!raw || typeof raw !== "object") return null;
          const record = raw as Record<string, unknown>;
          return record.mode !== "none" && typeof record.url === "string" && record.url.trim() ? record.url.trim() : null;
        })
        .filter((url): url is string => Boolean(url))
    : [];
  const visualImages = [
    ...builderVisualImages,
    ...(imagens || []).filter((url): url is string => typeof url === "string" && url.trim().length > 0),
  ];

  // Studio de Propostas é a fonte de verdade quando existe um modelo modular.
  // Cada módulo ativo gera exatamente uma página, na mesma ordem salva no Studio.
  if (builder && Array.isArray(builder.modules) && builder.modules.length > 0) {
    const studioHtml = renderStudioOrderedProposal({
      json: d,
      theme,
      logoUrl,
      clientName,
      tenantName,
      websiteUrl,
      tenantLogoUrl,
      imagens: visualImages,
      orcamento,
      contact,
      builder,
    });
    if (studioHtml) return studioHtml;
  }

  // Compatibilidade para tenants antigos sem Studio configurado.
  if (builder?.proposalKind === "construction_project" && orcamento) {
    return renderConstructionProposalLayout({
      json: d,
      tenantName,
      tenantLogoUrl,
      clientName,
      imagens: visualImages,
      orcamento,
      builderModuleEnabled,
      builderVisualStyle: builder?.visualStyle ?? null,
      builderModules: builder?.modules ?? null,
    });
  }
  const pageImage = (index: number) => {
    if (visualImages.length === 0) return null;
    return visualImages[index] || visualImages[index % visualImages.length] || null;
  };
  const renderPageVisual = (index: number, alt: string, className = "") => {
    const url = pageImage(index);
    return url
      ? `<div class="page-visual ${className}"><img src="${url}" alt="${alt}" loading="lazy" onerror="this.style.display='none'" /></div>`
      : "";
  };

  const companyHighlights = (companyInfo.highlights || []).filter(Boolean).map((item: string) =>
    `<li>${escapeProposalText(String(item))}</li>`
  ).join("");
  const offerBullets = (offerInfo.bullets || []).filter(Boolean).map((item: string) =>
    `<li>${escapeProposalText(String(item))}</li>`
  ).join("");
  const curiosityCards = (curiositiesInfo.items || []).map((item: any) =>
    `<div class="site-card"><h3>${escapeProposalText(String(item?.title || ""))}</h3><p>${escapeProposalText(String(item?.text || ""))}</p></div>`
  ).join("");
  const proofCards = (proofInfo.items || []).map((item: any) =>
    `<div class="site-card"><h3>${escapeProposalText(String(item?.title || ""))}</h3><p>${escapeProposalText(String(item?.text || ""))}</p></div>`
  ).join("");
  const faqCards = (faqInfo.items || []).map((item: any) =>
    `<div class="faq-card"><h3>${escapeProposalText(String(item?.question || ""))}</h3><p>${escapeProposalText(String(item?.answer || ""))}</p></div>`
  ).join("");

  const facts = (situation.facts || []).map((f: any) =>
    `<div class="fact"><span class="num">${f.num}</span><span class="lbl">${f.label}</span></div>`
  ).join("");

  const problemCards = (problem.cards || []).map((c: any) =>
    `<div class="card"><div class="card-lbl">${c.cod}</div><h3>${c.title}</h3><p>${c.text}</p></div>`
  ).join("");

  const cascade = (implication.cascade || []).map((s: any) =>
    `<div class="cas-step"><span class="cas-num">${s.num}</span><p class="cas-text">${s.text}</p></div>`
  ).join("");

  const questions = (value.questions || []).map((q: string) =>
    `<blockquote class="need-q">"${q}"</blockquote>`
  ).join("");

  const agents = (solution.agents || []).map((a: any) =>
    `<div class="agent"><span class="agent-tag">${a.tag}</span><h3>${a.title}</h3><p>${a.text}</p></div>`
  ).join("");

  const mods = (modules.mods || []).map((m: any) =>
    `<div class="mod"><div class="mod-cod">${m.cod}</div><h3>${m.title}</h3><p>${m.text}</p></div>`
  ).join("");

  const docHdr = (label: string) => `
  <div class="doc-hdr">
    <div class="doc-hdr-left">
      ${navLogoUrl
        ? `<img src="${navLogoUrl}" alt="${navName}" class="doc-hdr-logo" onerror="this.style.display='none'" />`
        : `<span class="doc-hdr-name">${navName}</span>`}
    </div>
    <span class="doc-hdr-right">${label}</span>
  </div>`;

  const docFooter = () => `
  <div class="doc-footer">
    <div class="doc-footer-brand">
      ${navLogoUrl
        ? `<img src="${navLogoUrl}" alt="${navName}" class="doc-footer-logo" onerror="this.style.display='none'" />`
        : `<span class="doc-footer-name">${navName}</span>`}
    </div>
    <span class="doc-footer-meta">${websiteUrl || "Proposta Comercial"}</span>
  </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposta — ${clientName || meta.clientName || "Cliente"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Inter", sans-serif;
    font-size: 9.5pt;
    line-height: 1.55;
    color: ${theme.ink};
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── pages ── */
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 16mm 12mm;
    page-break-after: always;
    display: flex;
    flex-direction: column;
  }
  .page:last-child { page-break-after: auto; }

  /* ── doc header (every non-cover page) ── */
  .doc-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 5mm;
    margin-bottom: 6mm;
    border-bottom: 1.5px solid ${theme.accent};
  }
  .doc-hdr-left { display: flex; align-items: center; gap: 5px; }
  .doc-hdr-logo { height: 20px; object-fit: contain; max-width: 120px; }
  .doc-hdr-name { font-weight: 700; font-size: 8.5pt; color: ${theme.navyDeep}; }
  .doc-hdr-right { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; letter-spacing: .08em; text-transform: uppercase; color: ${theme.navyMid}; opacity: .65; }
  .doc-footer {
    margin-top: auto;
    padding-top: 4mm;
    border-top: 1px solid ${theme.concreteLine};
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 5mm;
    min-height: 11mm;
  }
  .doc-footer-brand { display: flex; align-items: center; min-width: 0; }
  .doc-footer-logo { height: 16px; max-width: 105px; object-fit: contain; display: block; }
  .doc-footer-name { font-size: 7pt; font-weight: 700; color: ${theme.navyDeep}; }
  .doc-footer-meta {
    font-family: "JetBrains Mono", monospace;
    font-size: 6pt;
    color: ${theme.navyMid};
    opacity: .55;
    text-align: right;
  }

  /* ── cover page ── */
  .cover {
    background: linear-gradient(148deg, ${theme.cream} 55%, ${theme.accentSoft} 100%);
    min-height: 297mm;
  }
  .cover-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20mm;
  }
  .cover-logo-wrap { display: flex; align-items: center; gap: 8px; }
  .cover-logo-img { height: 34px; object-fit: contain; max-width: 165px; }
  .cover-company { font-weight: 800; font-size: 11pt; color: ${theme.navyDeep}; }
  .cover-date { font-family: "JetBrains Mono", monospace; font-size: 7pt; color: ${theme.navyMid}; opacity: .6; text-transform: uppercase; letter-spacing: .07em; padding-top: 5px; }
  .cover-body { flex: 1; display: flex; flex-direction: column; gap: 5mm; }
  .cover-tagline { font-family: "JetBrains Mono", monospace; font-size: 7pt; text-transform: uppercase; letter-spacing: .12em; color: ${theme.navyMid}; opacity: .7; }
  .cover-client { display: flex; align-items: center; gap: 8px; margin-bottom: 2mm; }
  .cover-client-img { height: 30px; width: 30px; object-fit: contain; border-radius: 50%; border: 1px solid ${theme.concreteLine}; background: #fff; flex-shrink: 0; }
  .cover-prepared { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .08em; color: ${theme.navyMid}; opacity: .65; display: block; margin-bottom: 1px; }
  .cover-client-name { font-weight: 700; font-size: 10pt; color: ${theme.navyDeep}; }
  h1 { font-family: "Instrument Serif", serif; font-weight: 400; font-size: 27pt; line-height: 1.08; max-width: 18ch; color: ${theme.navyDeep}; }
  .cover-sub { font-size: 10pt; color: #3a3358; max-width: 56ch; }
  .cover-fortag { margin-top: 3mm; border-left: 3px solid ${theme.accent}; padding-left: 8px; font-family: "JetBrains Mono", monospace; font-size: 7pt; color: ${theme.navyMid}; opacity: .7; letter-spacing: .04em; }
  .cover-benefits-grid { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin:4mm 0 2mm; }
  .cover-benefits-grid > div { border:1px solid ${theme.concreteLine}; border-left:2px solid ${theme.accent}; border-radius:6px; padding:3mm 3.5mm; background:rgba(255,255,255,.76); font-size:8pt; font-weight:700; color:${theme.navyDeep}; }
  .cover-footer {
    margin-top: auto;
    padding-top: 5mm;
    border-top: 1px solid ${theme.concreteLine};
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6mm;
    font-family: "JetBrains Mono", monospace;
    font-size: 6.5pt;
    color: ${theme.navyMid};
  }
  .cover-footer-brand { display: flex; align-items: center; min-width: 0; }
  .cover-footer-logo { height: 18px; max-width: 110px; object-fit: contain; display: block; }
  .cover-footer-name { font-weight: 700; color: ${theme.navyDeep}; }
  .cover-footer-meta { opacity: .55; text-align: right; }

  /* ── typography ── */
  h2 { font-family: "Instrument Serif", serif; font-weight: 400; font-size: 14.5pt; line-height: 1.15; color: ${theme.navyDeep}; margin-bottom: 2.5mm; }
  h3 { font-size: 9pt; font-weight: 700; color: ${theme.navyDeep}; margin-bottom: 1.5mm; }
  p { color: #3a3358; }
  .sec-label { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; letter-spacing: .1em; text-transform: uppercase; color: ${theme.accent}; margin-bottom: 2mm; }
  .lead-text { font-size: 9.5pt; color: #3a3358; max-width: 68ch; margin-bottom: 2mm; }
  .sec-divider { border: none; border-top: 1px solid ${theme.concreteLine}; margin: 5.5mm 0; }

  /* ── microsite institucional ── */
  .site-grid { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin:3mm 0 5mm; }
  .site-panel { border:1px solid ${theme.concreteLine}; border-radius:9px; padding:5mm; background:${theme.cream2}; }
  .site-panel h2 { margin-bottom:2mm; }
  .site-panel ul { padding-left:5mm; margin-top:3mm; color:#4a4368; }
  .site-panel li { margin:1.2mm 0; }
  .site-cards { display:grid; grid-template-columns:repeat(2,1fr); gap:3mm; margin-top:3mm; }
  .site-card,.faq-card { border:1px solid ${theme.concreteLine}; border-radius:8px; padding:4mm; background:#fff; }
  .site-card p,.faq-card p { font-size:8pt; color:#4a4368; }
  .faq-list { display:grid; gap:2.5mm; margin-top:3mm; }

  /* ── facts ── */
  .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 3.5mm 0; }
  .fact { border: 1px solid ${theme.concreteLine}; border-radius: 7px; padding: 3.5mm 4mm; }
  .fact .num { font-family: "Instrument Serif", serif; font-size: 17pt; display: block; color: ${theme.navyDeep}; }
  .fact .lbl { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6b6485; margin-top: 1mm; display: block; line-height: 1.4; }
  .bridge { margin-top: 3.5mm; padding-left: 7px; border-left: 2px solid ${theme.accent}; font-size: 8.5pt; color: #4a4368; max-width: 68ch; }

  /* ── problem cards ── */
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 3mm 0; }
  .card { border: 1px solid ${theme.concreteLine}; border-left: 3px solid ${theme.accent}; border-radius: 7px; padding: 4mm; }
  .card-lbl { font-family: "JetBrains Mono", monospace; font-size: 6pt; text-transform: uppercase; letter-spacing: .08em; color: #8b84a8; margin-bottom: 1.5mm; }
  .card h3 { font-size: 9pt; }
  .card p { font-size: 8.5pt; color: #4a4368; }

  /* ── implication cascade ── */
  .cascade { margin: 3mm 0; max-width: 68ch; }
  .cas-step { display: flex; gap: 4mm; padding: 3mm 0; border-bottom: 1px solid ${theme.concreteLine}; }
  .cas-step:last-child { border-bottom: none; }
  .cas-num { font-family: "JetBrains Mono", monospace; font-size: 7.5pt; color: ${theme.accent}; width: 6mm; flex-shrink: 0; padding-top: 1px; }
  .cas-text { font-size: 8.5pt; color: #3a3358; }
  .cascade-close { margin-top: 3mm; font-family: "Instrument Serif", serif; font-style: italic; font-size: 11pt; color: ${theme.navyDeep}; max-width: 32ch; }

  /* ── value questions ── */
  .questions { margin: 3mm 0; }
  .need-q { border-left: 3px solid ${theme.accent}; padding: 2mm 0 2mm 4mm; margin-bottom: 3mm; font-family: "Instrument Serif", serif; font-style: italic; font-size: 11pt; line-height: 1.3; color: ${theme.navyDeep}; max-width: 46ch; }
  .need-close { font-size: 8.5pt; color: #3a3358; margin-top: 1mm; }

  /* ── agents ── */
  .agents { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 3mm 0; }
  .agent { border: 1px solid ${theme.concreteLine}; border-radius: 7px; padding: 4mm; }
  .agent-tag { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .06em; background: ${theme.accentSoft}; color: ${theme.navyDeep}; padding: 2px 7px; border-radius: 4px; display: inline-block; margin-bottom: 2mm; }
  .agent h3 { font-size: 9pt; }
  .agent p { font-size: 8.5pt; color: #4a4368; }

  /* ── modules ── */
  .mods { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 3mm 0; }
  .mod { border: 1px solid ${theme.concreteLine}; border-radius: 7px; padding: 4mm; background: ${theme.cream2}; }
  .mod-cod { font-family: "JetBrains Mono", monospace; font-size: 6pt; text-transform: uppercase; letter-spacing: .08em; color: #8b84a8; margin-bottom: 1.5mm; }
  .mod h3 { font-size: 9pt; }
  .mod p { font-size: 8pt; color: #4a4368; }

  /* ── CTA box ── */
  .cta-box { background: ${theme.navyDeep}; border-radius: 10px; padding: 6mm 7mm; margin-top: 4mm; }
  .cta-box h2 { color: #fff; font-size: 13.5pt; }
  .cta-box .lead-text { color: #cfc9e6; margin-top: 1.5mm; }
  .cta-link { display: inline-block; margin-top: 4mm; background: linear-gradient(90deg, ${theme.accent}, ${theme.secondary}); color: ${theme.navyDeep}; padding: 2.5mm 7mm; border-radius: 100px; font-weight: 700; font-size: 9pt; text-decoration: none; }
  .contact-strip { display: flex; gap: 4mm; flex-wrap: wrap; margin-top: 3.5mm; padding-top: 3mm; border-top: 1px solid rgba(255,255,255,0.12); }
  .contact-item { display: flex; align-items: center; gap: 2mm; color: #cfc9e6; font-size: 8pt; text-decoration: none; }
  .contact-item svg { flex-shrink: 0; opacity: .75; }
  .contact-item:hover { color: #fff; }
  .contact-wa-hint { font-size: 7pt; opacity: 0.55; }

  /* ── orçamento ── */
  .orc-table { width: 100%; border-collapse: collapse; margin: 3.5mm 0; font-size: 8.5pt; }
  .orc-table th { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .07em; color: #8b84a8; border-bottom: 1.5px solid ${theme.concreteLine}; padding: 2mm 3mm; text-align: left; }
  .orc-table th.r, .orc-table td.r { text-align: right; }
  .orc-table td { padding: 2.5mm 3mm; border-bottom: 1px solid ${theme.concrete}; vertical-align: top; }
  .orc-table tr:last-child td { border-bottom: none; }
  .orc-stage-row td {
    background: ${theme.cream2};
    border-top: 1px solid ${theme.concreteLine} !important;
    border-bottom: 1px solid ${theme.concreteLine} !important;
    color: ${theme.navyDeep};
    font-size: 8pt;
    padding-top: 2.5mm !important;
    padding-bottom: 2.5mm !important;
  }
  .orc-desc { font-size: 7pt; color: #8b84a8; display: block; margin-top: 1px; }
  .orc-stage-block { margin: 3.5mm 0 5mm; }
  .orc-stage-title, .orc-stage-summary { display: flex; align-items: center; justify-content: space-between; gap: 5mm; padding: 2.8mm 3mm; background: ${theme.cream2}; border: 1px solid ${theme.concreteLine}; border-radius: 6px; color: ${theme.navyDeep}; font-size: 8.5pt; }
  .orc-stage-block .orc-table { margin-top: 1.5mm; margin-bottom: 0; }
  .orc-stage-summary { margin: 3.5mm 0; font-size: 9pt; }
  .proposal-stage-visual { margin: 2mm 0 3mm; break-inside: avoid; }
  .proposal-stage-visual img { width: 100%; height: 38mm; object-fit: cover; display: block; border-radius: 7px; border: 1px solid ${theme.concreteLine}; }
  .orc-total-row { display: flex; justify-content: flex-end; margin-top: 3mm; }
  .orc-total-box { border: 1px solid ${theme.accentSoft}; border-radius: 7px; padding: 3mm 5mm; text-align: right; background: ${theme.cream2}; }
  .orc-total-label { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .07em; color: #8b84a8; display: block; margin-bottom: 1mm; }
  .orc-total-value { font-family: "Instrument Serif", serif; font-size: 18pt; color: ${theme.navyDeep}; }
  .orc-meta { display: flex; flex-wrap: wrap; gap: 5mm; margin-top: 4mm; padding-top: 3mm; border-top: 1px solid ${theme.concreteLine}; }
  .orc-meta-item span:first-child { font-family: "JetBrains Mono", monospace; font-size: 6pt; text-transform: uppercase; letter-spacing: .07em; color: #8b84a8; display: block; margin-bottom: 1px; }
  .orc-meta-item span:last-child { font-size: 9pt; font-weight: 600; color: ${theme.navyDeep}; }
  .orc-obs { margin-top: 3mm; padding: 3mm 4mm; background: ${theme.cream2}; border-radius: 6px; border: 1px solid ${theme.concreteLine}; font-size: 8pt; color: #4a4368; line-height: 1.55; }
  .scope-block { margin: 2mm 0 4mm; break-inside: avoid; }
  .scope-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4mm;
    padding: 2.2mm 2.5mm;
    background: ${theme.cream2};
    border: 1px solid ${theme.concreteLine};
    border-bottom: 0;
    border-radius: 6px 6px 0 0;
    font-size: 7.5pt;
    font-weight: 700;
    color: ${theme.navyDeep};
  }
  .scope-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: ${theme.navyMid};
    opacity: .65;
    white-space: nowrap;
  }
  table.scope-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  table.scope-table th {
    padding: 1.8mm 2.3mm;
    background: #fff;
    border: 1px solid ${theme.concreteLine};
    color: ${theme.navyMid};
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .05em;
    text-align: left;
  }
  table.scope-table th:first-child { width: 34%; }
  table.scope-table td {
    padding: 2mm 2.3mm;
    border: 1px solid ${theme.concreteLine};
    vertical-align: top;
    line-height: 1.4;
  }
  .scope-item { font-weight: 600; color: ${theme.navyDeep}; }
  .scope-description { color: #5f5874; }
  .commercial-section { margin-top: 4mm; }
  .commercial-title {
    font-family: "JetBrains Mono", monospace;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: .09em;
    color: ${theme.accent};
    margin-bottom: 2mm;
    font-weight: 700;
  }
  .payment-table, .schedule-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5pt;
    margin-top: 2mm;
  }
  .payment-table th, .schedule-table th {
    padding: 1.8mm 2.2mm;
    border: 1px solid ${theme.concreteLine};
    background: ${theme.cream2};
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: ${theme.navyMid};
    text-align: left;
  }
  .payment-table td, .schedule-table td {
    padding: 2mm 2.2mm;
    border: 1px solid ${theme.concreteLine};
    vertical-align: top;
    line-height: 1.35;
  }
  .payment-table .r, .schedule-table .r { text-align: right; }
  .schedule-intro {
    margin: 1mm 0 4mm;
    padding: 3mm 3.5mm;
    background: ${theme.cream2};
    border: 1px solid ${theme.concreteLine};
    border-radius: 7px;
    font-size: 8pt;
    color: #5f5874;
  }
  .schedule-intro strong { color: ${theme.navyDeep}; }
  .schedule-note { color: #7b7591; font-size: 6.8pt; display: block; margin-top: .8mm; }
  .period-matrix-group { margin-top: 4mm; break-inside: avoid; }
  .period-matrix-caption {
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: ${theme.navyMid};
    margin-bottom: 1.5mm;
  }
  table.period-matrix { width: 100%; border-collapse: collapse; font-size: 6.8pt; table-layout: fixed; }
  table.period-matrix th {
    padding: 1.8mm 2mm;
    border: 1px solid ${theme.concreteLine};
    background: ${theme.cream2};
    color: ${theme.navyMid};
    font-family: "JetBrains Mono", monospace;
    font-size: 5.6pt;
    text-transform: uppercase;
    letter-spacing: .04em;
    text-align: left;
  }
  table.period-matrix th:first-child { width: 33%; }
  table.period-matrix td { padding: 1.8mm 2mm; border: 1px solid ${theme.concreteLine}; vertical-align: top; }
  table.period-matrix .r { text-align: right; }
  .period-stage strong { display: block; color: ${theme.navyDeep}; }
  .period-stage span { display: block; color: #6f6885; margin-top: .5mm; }
  .period-cell strong { display: block; color: ${theme.navyDeep}; font-size: 7pt; }
  .period-cell span { display: block; color: #7b7591; font-size: 5.8pt; margin-top: .5mm; }
  .period-empty { text-align: center; color: #b8b4c5; }
  table.period-matrix tfoot td { background: ${theme.cream2}; font-weight: 700; color: ${theme.navyDeep}; }

  /* ── proposal visuals ── */
  .img-hero-wrap {
    margin: 5mm 0 4mm;
    height: 88mm;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid ${theme.concreteLine};
    background: ${theme.cream2};
  }
  .img-hero-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .page-visual {
    width: 100%;
    height: 46mm;
    margin: 4mm 0 5mm;
    border-radius: 9px;
    overflow: hidden;
    border: 1px solid ${theme.concreteLine};
    background: ${theme.cream2};
  }
  .page-visual img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .page-visual.compact { height: 34mm; margin: 3.5mm 0 4mm; }
  .page-visual.budget { height: 27mm; margin: 2.5mm 0 3mm; border-radius: 7px; }

  /* ── gallery ── */
  .gallery { display: grid; gap: 3mm; margin: 3.5mm 0; }
  .gallery.gallery-1 { grid-template-columns: 1fr; }
  .gallery.gallery-2 { grid-template-columns: 1fr 1fr; }
  .gallery.gallery-3, .gallery.gallery-many { grid-template-columns: repeat(3, 1fr); }
  .gallery img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 6px; border: 1px solid ${theme.concreteLine}; display: block; }
  .gallery img.landscape { aspect-ratio: 16/9; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- ══ PAGE 1: COVER ══ -->
<div class="page cover">
  <div class="cover-top">
    <div class="cover-logo-wrap">
      ${navLogoUrl
        ? `<img src="${navLogoUrl}" alt="${navName}" class="cover-logo-img" onerror="this.style.display='none'" />`
        : `<span class="cover-company">${navName}</span>`}
    </div>
    <span class="cover-date">${today}</span>
  </div>

  <div class="cover-body">
    <div class="cover-tagline">${hero.tagline || ""}</div>
    ${logoUrl
      ? `<div class="cover-client"><img src="${logoUrl}" alt="${clientName || "Cliente"}" class="cover-client-img" onerror="this.style.display='none'" /><div><span class="cover-prepared">Preparado para</span><span class="cover-client-name">${clientName || "Cliente"}</span></div></div>`
      : clientName
        ? `<div class="cover-client"><div><span class="cover-prepared">Preparado para</span><span class="cover-client-name">${clientName}</span></div></div>`
        : ""}
    <h1>${hero.headline || ""}</h1>
    <p class="cover-sub">${escapeProposalText(genericCoverValue)}</p>
    ${genericCoverBenefits.length ? `<div class="cover-benefits-grid">${genericCoverBenefits.map((benefit) => `<div>${escapeProposalText(benefit)}</div>`).join("")}</div>` : ""}
    ${pageImage(0) ? `<div class="img-hero-wrap"><img src="${pageImage(0)}" alt="Imagem principal da proposta" loading="eager" onerror="this.style.display=\'none\'" /></div>` : ""}
    <div class="cover-fortag">${hero.forTag || ""}</div>
  </div>

  <div class="cover-footer">
    <div class="cover-footer-brand">
      ${navLogoUrl
        ? `<img src="${navLogoUrl}" alt="${navName}" class="cover-footer-logo" onerror="this.style.display='none'" />`
        : `<span class="cover-footer-name">${navName}</span>`}
    </div>
    <span class="cover-footer-meta">Proposta Comercial · ${clientName || meta.clientName || "Cliente"}${websiteUrl ? ` · ${websiteUrl}` : ""}</span>
  </div>
</div>

${builderModuleEnabled("apresentacao_empresa") || builderModuleEnabled("produto_servico") || builderModuleEnabled("curiosidades_conteudo") || builderModuleEnabled("cases_provas") || builderModuleEnabled("faq") ? `<!-- ══ MICROSITE INSTITUCIONAL ══ -->
<div class="page">
  ${docHdr(`Conheça ${navName}`)}
  <div class="sec-label">Conheça a empresa e a solução</div>
  <h2>Uma visão rápida antes da proposta</h2>
  <p class="lead-text">Informações institucionais e educativas vinculadas à empresa e ao que está sendo oferecido.</p>
  <div class="site-grid">
    ${builderModuleEnabled("apresentacao_empresa") && (companyInfo.title || companyInfo.text || companyHighlights) ? `<section class="site-panel"><div class="sec-label">Empresa</div><h2>${escapeProposalText(String(companyInfo.title || navName))}</h2><p>${escapeProposalText(String(companyInfo.text || ""))}</p>${companyHighlights ? `<ul>${companyHighlights}</ul>` : ""}</section>` : ""}
    ${builderModuleEnabled("produto_servico") && (offerInfo.title || offerInfo.text || offerBullets) ? `<section class="site-panel"><div class="sec-label">Produto / serviço</div><h2>${escapeProposalText(String(offerInfo.title || "O que estamos propondo"))}</h2><p>${escapeProposalText(String(offerInfo.text || ""))}</p>${offerBullets ? `<ul>${offerBullets}</ul>` : ""}</section>` : ""}
  </div>
  ${builderModuleEnabled("curiosidades_conteudo") && curiosityCards ? `<div class="sec-label">Curiosidades e conteúdo útil</div><div class="site-cards">${curiosityCards}</div>` : ""}
  ${builderModuleEnabled("cases_provas") && proofCards ? `<hr class="sec-divider" /><div class="sec-label">Experiência e confiança</div><div class="site-cards">${proofCards}</div>` : ""}
  ${builderModuleEnabled("faq") && faqCards ? `<hr class="sec-divider" /><div class="sec-label">Perguntas frequentes</div><div class="faq-list">${faqCards}</div>` : ""}
  ${docFooter()}
</div>` : ""}

${builderModuleEnabled("apresentacao_empresa") || builderModuleEnabled("resumo_executivo") ? `<!-- ══ PAGE 2: SITUAÇÃO + PROBLEMA ══ -->
<div class="page">
  ${docHdr(`Proposta para ${clientName || meta.clientName || "Cliente"}`)}

  <div class="sec-label">01 — A Situação</div>
  <h2>${situation.title || ""}</h2>
  <p class="lead-text">${situation.subtitle || ""}</p>
  <div class="facts">${facts}</div>
  ${situation.bridge ? `<p class="bridge">${situation.bridge}</p>` : ""}
  ${renderPageVisual(1, `Imagem de contexto para ${clientName || meta.clientName || "cliente"}`)}

  <hr class="sec-divider" />

  <div class="sec-label">02 — O Problema</div>
  <h2>${problem.title || ""}</h2>
  <p class="lead-text">${problem.subtitle || ""}</p>
  <div class="cards">${problemCards}</div>
  ${docFooter()}
</div>` : ""}



${builderModuleEnabled("resumo_executivo") ? `<!-- ══ PAGE 3: IMPLICAÇÃO + VALOR ══ -->
<div class="page">
  ${docHdr(`Proposta para ${clientName || meta.clientName || "Cliente"}`)}

  <div class="sec-label">03 — A Implicação</div>
  <h2>${implication.title || ""}</h2>
  <p class="lead-text">${implication.subtitle || ""}</p>
  <div class="cascade">${cascade}</div>
  ${implication.close ? `<p class="cascade-close">${implication.close}</p>` : ""}

  <hr class="sec-divider" />

  <div class="sec-label">04 — O Valor</div>
  <h2>${value.title || ""}</h2>
  <div class="questions">${questions}</div>
  ${value.close ? `<p class="need-close">${value.close}</p>` : ""}
  ${renderPageVisual(2, `Imagem de valor para ${clientName || meta.clientName || "cliente"}`)}
  ${docFooter()}
</div>` : ""}



${builderModuleEnabled("diferenciais") || builderModuleEnabled("aceite") ? `<!-- ══ PAGE 4: SOLUÇÃO + MÓDULOS + CTA ══ -->
<div class="page">
  ${docHdr(`Proposta para ${clientName || meta.clientName || "Cliente"}`)}

  <div class="sec-label">05 — A Solução</div>
  <h2>${solution.title || ""}</h2>
  <p class="lead-text">${solution.subtitle || ""}</p>
  <div class="agents">${agents}</div>
  ${renderPageVisual(3, `Imagem da solução para ${clientName || meta.clientName || "cliente"}`, "compact")}

  <hr class="sec-divider" />

  <div class="sec-label">06 — Como se encaixa em ${clientName || meta.clientName || "sua operação"}</div>
  <h2>${modules.title || ""}</h2>
  <p class="lead-text">${modules.subtitle || ""}</p>
  <div class="mods">${mods}</div>

  ${builderModuleEnabled("aceite") ? `
  <hr class="sec-divider" />

  <div class="cta-box">
    <h2>${cta.title || ""}</h2>
    <p class="lead-text">${cta.subtitle || ""}</p>
    <a class="cta-link" href="${meta.whatsappUrl || "#"}">${cta.button || "Falar no WhatsApp"}</a>
    ${(() => {
      const items: string[] = [];
      if (contact?.phone) {
        const clean = contact.phone.replace(/\D/g, "");
        items.push(`<a class="contact-item" href="https://wa.me/${clean}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.4 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6.72 6.72l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>${contact.phone}</span><span class="contact-wa-hint">&nbsp;· wa.me/${clean}</span></a>`);
      }
      if (contact?.email) {
        items.push(`<a class="contact-item" href="mailto:${contact.email}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>${contact.email}</a>`);
      }
      if (contact?.instagram) {
        const handle = contact.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\/?/, "").replace(/^@/, "").replace(/\/$/, "");
        const url = handle.startsWith("http") ? handle : `https://instagram.com/${handle}`;
        const label = handle.startsWith("http") ? handle : `@${handle}`;
        items.push(`<a class="contact-item" href="${url}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>${label}</a>`);
      }
      return items.length > 0 ? `<div class="contact-strip">${items.join("")}</div>` : "";
    })()}
  </div>` : ""}
  ${docFooter()}
</div>

` : ""}

${orcamento && (builderModuleEnabled("etapas_orcamento") || builderModuleEnabled("tabela_itens") || builderModuleEnabled("escopo") || builderModuleEnabled("condicoes_comerciais") || builderModuleEnabled("cronograma") || builderModuleEnabled("fisico_financeiro")) ? (() => {
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const FORMA_LABELS: Record<string, string> = {
    pix: "PIX", boleto: "Boleto", cartao_credito: "Cartão de Crédito",
    cartao_debito: "Cartão de Débito", transferencia: "Transferência",
    dinheiro: "Dinheiro", a_combinar: "A Combinar",
  };
  const itensValidos = (orcamento.itens || []).filter((i) => i.nome);
  const calculatedTotal = itensValidos.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const totalExibido = orcamento.valorTotal ? parseFloat(orcamento.valorTotal) : calculatedTotal;
  const presentation = normalizeProposalPresentation(orcamento.apresentacao);
  const groupedItems = groupProposalPresentationItems(itensValidos);
  const presentationBlocks = groupedItems.map((group) => {
    const configuredMode = resolveProposalPresentationMode(presentation, group.id);
    const mode = builderModuleEnabled("tabela_itens")
      ? configuredMode
      : "resumo_etapa";
    const etapaTotal = group.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
    const stageTitle = group.hasStageHeader
      ? `<div class="orc-stage-title"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
      : "";
    const scopeTable = builderModuleEnabled("escopo") && resolveProposalTechnicalDetail(presentation, group.id)
      ? renderProposalScopeTable(group.itens)
      : "";
    const stageVisual = group.hasStageHeader && builderModuleEnabled("imagem_por_etapa")
      ? renderProposalStageImage(presentation, group.id, group.nome)
      : "";

    if (mode === "resumo_etapa") {
      const summary = group.hasStageHeader
        ? `<div class="orc-stage-summary"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
        : `<div class="orc-stage-summary"><span>Valor do orçamento</span><strong>${fmtBRL(etapaTotal)}</strong></div>`;
      return `${summary}${stageVisual}${scopeTable}`;
    }

    if (mode === "preco_medio") {
      const rows = group.itens.map((i) => `<tr>
        <td>${i.nome}${i.sku ? `<span class="orc-desc">SKU: ${i.sku}</span>` : ""}</td>
        <td class="r">${fmtBRL(i.valorUnitario)}</td>
      </tr>`).join("");
      return `<div class="orc-stage-block">${stageTitle}
        ${stageVisual}
        <table class="orc-table orc-table-compact">
          <thead><tr><th>Item</th><th class="r">Valor por item</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${scopeTable}
      </div>`;
    }

    const rows = group.itens.map((i) => {
      const subtotal = i.quantidade * i.valorUnitario;
      return `<tr>
        <td>${i.nome}${i.sku ? `<span class="orc-desc">SKU: ${i.sku}</span>` : ""}</td>
        <td class="r">${i.quantidade}</td>
        <td class="r">${fmtBRL(i.valorUnitario)}</td>
        <td class="r">${fmtBRL(subtotal)}</td>
      </tr>`;
    }).join("");
    return `<div class="orc-stage-block">${stageTitle}
      ${stageVisual}
      <table class="orc-table">
        <thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Valor Unit.</th><th class="r">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${scopeTable}
    </div>`;
  }).join("");
  const metaItems = [
    orcamento.formaPagamento ? `<div class="orc-meta-item"><span>Forma de Pagamento</span><span>${FORMA_LABELS[orcamento.formaPagamento] || orcamento.formaPagamento}</span></div>` : "",
    orcamento.condPagamento ? `<div class="orc-meta-item"><span>Condição de Pagamento</span><span>${escapeProposalText(orcamento.condPagamento)}</span></div>` : "",
    orcamento.prazoEntrega ? `<div class="orc-meta-item"><span>Prazo / Entrega</span><span>${escapeProposalText(orcamento.prazoEntrega)}</span></div>` : "",
    builderModuleEnabled("validade_inicio") && orcamento.validadeAte ? `<div class="orc-meta-item"><span>Validade da Proposta</span><span>${proposalFormatDate(orcamento.validadeAte)}</span></div>` : "",
    builderModuleEnabled("validade_inicio") && presentation.previsaoInicio ? `<div class="orc-meta-item"><span>Previsão de Início</span><span>${proposalFormatDate(presentation.previsaoInicio)}</span></div>` : "",
  ].filter(Boolean).join("");

  const paymentRows = (orcamento.paymentCompositions ?? [])
    .filter((item) => item?.forma && Number(item?.valor ?? 0) > 0)
    .map((item) => `<tr>
      <td>${FORMA_LABELS[item.forma] || escapeProposalText(item.forma)}</td>
      <td class="r">${fmtBRL(Number(item.valor))}</td>
    </tr>`)
    .join("");
  const paymentCompositionHtml = paymentRows
    ? `<div class="commercial-section">
        <div class="commercial-title">Composição de pagamento</div>
        <table class="payment-table">
          <thead><tr><th>Forma / parcela</th><th class="r">Valor</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </div>`
    : "";

  const scheduleRows = buildProposalScheduleRows(groupedItems, presentation, totalExibido);
  const executionScheduleRows = scheduleRows.map((row) => `<tr>
    <td><strong>Etapa ${row.ordem}</strong> · ${escapeProposalText(row.nome || "Execução")}</td>
    <td>${row.start ? proposalFormatDate(row.start) : "A definir"}</td>
    <td>${row.duration ? `${row.duration} dias` : "A definir"}</td>
    <td>${row.end ? proposalFormatDate(row.end) : "A definir"}</td>
  </tr>`).join("");
  const physicalFinancialRows = scheduleRows.map((row) => `<tr>
    <td><strong>Etapa ${row.ordem}</strong> · ${escapeProposalText(row.nome || "Execução")}</td>
    <td class="r">${row.physicalPercent.toFixed(2)}%</td>
    <td class="r">${row.financialPercent.toFixed(2)}%</td>
    <td class="r">${fmtBRL(row.value)}</td>
    <td>${row.marcoPagamento ? escapeProposalText(row.marcoPagamento) : "Conforme condição comercial"}${row.observacao ? `<span class="schedule-note">${escapeProposalText(row.observacao)}</span>` : ""}</td>
  </tr>`).join("");

  const showExecutionSchedule = builderModuleEnabled("cronograma") && presentation.mostrarCronogramaExecucao;
  const showPhysicalFinancial = builderModuleEnabled("fisico_financeiro") && presentation.mostrarFisicoFinanceiro;
  const schedulePage = scheduleRows.length && (showExecutionSchedule || showPhysicalFinancial)
    ? `
<div class="page">
  ${docHdr(`Cronograma · ${clientName || meta.clientName || "Cliente"}`)}
  <div class="sec-label">Planejamento da execução</div>
  <h2>Planejamento da obra</h2>
  <div class="schedule-intro">
    ${presentation.previsaoInicio ? `<strong>Previsão de início:</strong> ${proposalFormatDate(presentation.previsaoInicio)}.` : "<strong>Previsão de início:</strong> a definir."}
    Cada etapa possui sua própria data de início e duração. Etapas podem ocorrer em paralelo e as cobranças do mesmo mês são somadas automaticamente.
  </div>
  ${showExecutionSchedule ? `
    <div class="commercial-section">
      <div class="commercial-title">Cronograma de execução</div>
      <table class="schedule-table">
        <thead><tr><th>Etapa</th><th>Início</th><th>Duração</th><th>Término</th></tr></thead>
        <tbody>${executionScheduleRows}</tbody>
      </table>
    </div>` : ""}
  ${showPhysicalFinancial ? `
    <div class="commercial-section">
      <div class="commercial-title">Cronograma físico-financeiro</div>
      <table class="schedule-table">
        <thead><tr><th>Etapa</th><th>Período</th><th class="r">% da execução</th><th class="r">% financeiro</th><th class="r">Valor</th><th>Marco / pagamento</th></tr></thead>
        <tbody>${physicalFinancialRows}</tbody>
      </table>
      <div class="commercial-title" style="margin-top:4mm;">Modelo por colunas · cobrança mensal</div>
      ${renderProposalMonthlyMatrix(scheduleRows, presentation, totalExibido, fmtBRL)}
    </div>` : ""}
  ${docFooter()}
</div>`
    : "";

  return `
<div class="page">
  ${docHdr(`Orçamento para ${clientName || meta.clientName || "Cliente"}`)}
  <div class="sec-label">Orçamento${orcamento.numero ? " · " + orcamento.numero : ""}</div>
  <h2>${orcamento.titulo}</h2>
  ${renderPageVisual(4, `Imagem do projeto para ${clientName || meta.clientName || "cliente"}`, "budget")}
  ${itensValidos.length > 0 ? `
  ${presentationBlocks}
  ${presentation.mostrarTotalGeral ? `<div class="orc-total-row">
    <div class="orc-total-box">
      <span class="orc-total-label">Total</span>
      <span class="orc-total-value">${fmtBRL(totalExibido)}</span>
    </div>
  </div>` : ""}` : ""}
  ${builderModuleEnabled("condicoes_comerciais") && metaItems ? `<div class="commercial-section"><div class="commercial-title">Condições comerciais</div><div class="orc-meta">${metaItems}</div></div>` : ""}
  ${builderModuleEnabled("condicoes_comerciais") ? paymentCompositionHtml : ""}
  ${builderModuleEnabled("condicoes_comerciais") && orcamento.observacoes ? `<div class="orc-obs">${escapeProposalText(orcamento.observacoes)}</div>` : ""}
  ${docFooter()}
</div>
${schedulePage}`;
})() : ""}

${builderModuleEnabled("anexos") && visualImages.length > (orcamento ? 5 : 4) ? visualImages.slice(orcamento ? 5 : 4).map((url, idx) => `
<div class="page">
  ${docHdr(`Visualizações · ${clientName || meta.clientName || "Cliente"}`)}
  <div class="sec-label">Visualização adicional${visualImages.length > (orcamento ? 6 : 5) ? ` · ${idx + 1}` : ""}</div>
  <div style="flex:1;display:flex;align-items:center;justify-content:center;margin:4mm 0;">
    <img src="${url}" alt="Visualização adicional do projeto" style="max-width:100%;max-height:205mm;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;" onerror="this.style.display='none'" />
  </div>
  ${docFooter()}
</div>`).join("\n") : ""}

</body>
</html>`;
}

// ── Standalone orçamento PDF (capa + tabela) ─────────────────────────────────
export function renderOrcamentoPdf(args: {
  proposta: {
    titulo: string;
    numero?: string | null;
    itens: Array<{
    nome: string;
    quantidade: number;
    valorUnitario: number;
    sku?: string | null;
    descricao?: string | null;
    etapaId?: string | null;
    etapaNome?: string | null;
    etapaOrdem?: number | null;
  }>;
    valorTotal?: string | null;
    observacoes?: string | null;
    formaPagamento?: string | null;
    condPagamento?: string | null;
    prazoEntrega?: string | null;
    apresentacao?: ProposalPresentationConfig | null;
    validadeAte?: Date | string | null;
    paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
    createdAt?: Date | string;
  };
  profile: {
    nomeFantasia?: string | null;
    razaoSocial: string;
    logoUrl?: string | null;
    diferenciais?: string | null;
    produtos?: Array<{ nome: string; descricao?: string; preco?: number }> | null;
    telefone?: string | null;
    email?: string | null;
    endereco?: string | null;
    cnpj?: string | null;
    publicoAlvo?: string | null;
  } | null;
  catalogItems: Array<{
    nome: string;
    descricao?: string | null;
    categoria?: string | null;
    precoBase: string;
    unidade: string;
    imagemUrl?: string | null;
  }>;
  lead: { nome: string; empresa?: string | null; telefone?: string | null; email?: string | null } | null;
}): string {
  const { proposta, profile, catalogItems, lead } = args;

  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtDate = (d?: Date | string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "";

  const companyName = profile?.nomeFantasia || profile?.razaoSocial || "Empresa";
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  // Parse differentials — split by newlines and bullet chars
  const difItems: string[] = (profile?.diferenciais ?? "")
    .split(/\n|•|;/)
    .map((s) => s.replace(/^[\s\-\*\•]+/, "").trim())
    .filter((s) => s.length > 3)
    .slice(0, 9);

  // Products to show — prefer catalog, fallback to profile products
  const showProducts = catalogItems.slice(0, 6);

  // Items table
  const itens = proposta.itens;
  const calculatedTotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const totalExibido = proposta.valorTotal ? parseFloat(proposta.valorTotal) : calculatedTotal;

  const FORMA_LABELS: Record<string, string> = {
    pix: "PIX", boleto: "Boleto", cartao_credito: "Cartão de Crédito",
    cartao_debito: "Cartão de Débito", transferencia: "Transferência",
    dinheiro: "Dinheiro", a_combinar: "A Combinar",
  };

  const difHtml = difItems.length > 0
    ? difItems.map((d) => `<div class="dif-item"><span class="dif-bullet">✓</span><span>${d}</span></div>`).join("")
    : `<div class="dif-item"><span class="dif-bullet">✓</span><span>Atendimento personalizado e ágil</span></div>
       <div class="dif-item"><span class="dif-bullet">✓</span><span>Qualidade garantida em todos os produtos</span></div>
       <div class="dif-item"><span class="dif-bullet">✓</span><span>Equipe especializada e experiente</span></div>`;

  const prodHtml = showProducts.length > 0
    ? showProducts.map((p) => `
      <div class="prod-card">
        ${p.categoria ? `<div class="prod-cat">${p.categoria}</div>` : ""}
        <div class="prod-name">${p.nome}</div>
        ${p.descricao ? `<div class="prod-desc">${p.descricao}</div>` : ""}
        <div class="prod-price">${fmtBRL(parseFloat(p.precoBase))} <span class="prod-unit">/ ${p.unidade}</span></div>
      </div>`).join("")
    : "";

  const presentation = normalizeProposalPresentation(proposta.apresentacao);
  const groupedItems = groupProposalPresentationItems(itens);
  const presentationBlocksHtml = groupedItems.map((group) => {
    const mode = resolveProposalPresentationMode(presentation, group.id);
    const etapaTotal = group.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
    const stageTitle = group.hasStageHeader
      ? `<div class="stage-title"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
      : "";
    const scopeTable = resolveProposalTechnicalDetail(presentation, group.id)
      ? renderProposalScopeTable(group.itens)
      : "";
    const stageVisual = group.hasStageHeader
      ? renderProposalStageImage(presentation, group.id, group.nome)
      : "";

    if (mode === "resumo_etapa") {
      const summary = group.hasStageHeader
        ? `<div class="stage-summary"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
        : `<div class="stage-summary"><span>Valor do orçamento</span><strong>${fmtBRL(etapaTotal)}</strong></div>`;
      return `${summary}${stageVisual}${scopeTable}`;
    }

    if (mode === "preco_medio") {
      const rows = group.itens.map((i) => `<tr>
        <td>${i.nome}${i.sku ? `<br><span class="row-desc">SKU: ${i.sku}</span>` : ""}</td>
        <td class="r fw">${fmtBRL(i.valorUnitario)}</td>
      </tr>`).join("");
      return `<div class="stage-block">${stageTitle}
        ${stageVisual}
        <table class="items compact">
          <thead><tr><th>Descrição</th><th class="r">Valor por item</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${scopeTable}
      </div>`;
    }

    const rows = group.itens.map((i) => {
      const sub = i.quantidade * i.valorUnitario;
      return `<tr>
        <td>${i.nome}${i.sku ? `<br><span class="row-desc">SKU: ${i.sku}</span>` : ""}</td>
        <td class="r">${i.quantidade}</td>
        <td class="r">${fmtBRL(i.valorUnitario)}</td>
        <td class="r fw">${fmtBRL(sub)}</td>
      </tr>`;
    }).join("");
    return `<div class="stage-block">${stageTitle}
      ${stageVisual}
      <table class="items">
        <thead><tr><th>Descrição</th><th class="r">Qtd.</th><th class="r">Valor Unit.</th><th class="r">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${scopeTable}
    </div>`;
  }).join("");
  const metaRows = [
    proposta.formaPagamento ? `<div class="meta-item"><span>Forma de Pagamento</span><strong>${FORMA_LABELS[proposta.formaPagamento] ?? proposta.formaPagamento}</strong></div>` : "",
    proposta.condPagamento  ? `<div class="meta-item"><span>Condição de Pagamento</span><strong>${escapeProposalText(proposta.condPagamento)}</strong></div>` : "",
    proposta.prazoEntrega   ? `<div class="meta-item"><span>Prazo / Entrega</span><strong>${escapeProposalText(proposta.prazoEntrega)}</strong></div>` : "",
    proposta.validadeAte    ? `<div class="meta-item"><span>Validade da Proposta</span><strong>${proposalFormatDate(proposta.validadeAte)}</strong></div>` : "",
    presentation.previsaoInicio ? `<div class="meta-item"><span>Previsão de Início</span><strong>${proposalFormatDate(presentation.previsaoInicio)}</strong></div>` : "",
  ].filter(Boolean).join("");

  const paymentRowsHtml = (proposta.paymentCompositions ?? [])
    .filter((item) => item?.forma && Number(item?.valor ?? 0) > 0)
    .map((item) => `<tr>
      <td>${FORMA_LABELS[item.forma] ?? escapeProposalText(item.forma)}</td>
      <td class="r fw">${fmtBRL(Number(item.valor))}</td>
    </tr>`)
    .join("");

  const scheduleRows = buildProposalScheduleRows(groupedItems, presentation, totalExibido);
  const showExecutionSchedule = presentation.mostrarCronogramaExecucao;
  const showPhysicalFinancial = presentation.mostrarFisicoFinanceiro;
  const monthlyPeriods = buildProposalMonthlyMatrix(scheduleRows, presentation, totalExibido);
  const monthlyLedgerHtml = monthlyPeriods.length ? `
    <div class="commercial-section">
      <div class="commercial-title">Previsão mensal · físico-financeiro</div>
      <p>Valor contratado: ${fmtBRL(totalExibido)} · Entrada: ${presentation.entradaPercentual.toFixed(2)}%
        (${fmtBRL(totalExibido * presentation.entradaPercentual / 100)}) · Amortização: ${presentation.amortizacaoEntradaPercentual.toFixed(2)}% por medição.</p>
      <table class="schedule-table monthly-ledger">
        <thead><tr><th>Mês</th><th>Etapas / fases previstas</th><th class="r">% físico</th><th class="r">% acum.</th><th class="r">Bruto previsto</th><th class="r">Amortização</th><th class="r">Líquido previsto</th><th class="r">Saldo entrada</th></tr></thead>
        <tbody>${monthlyPeriods.map((period) => `<tr>
          <td>${escapeProposalText(period.label)}</td>
          <td>${period.stages.filter((stage) => stage.share > 0).map((stage) => escapeProposalText(stage.nome)).join(" + ")}</td>
          <td class="r">${period.physical.toFixed(2)}%</td>
          <td class="r">${period.accumulatedPhysical.toFixed(2)}%</td>
          <td class="r">${fmtBRL(period.amount)}</td>
          <td class="r">-${fmtBRL(period.amortization)}</td>
          <td class="r fw">${fmtBRL(period.netAmount)}</td>
          <td class="r">${fmtBRL(period.remainingAdvance)}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>` : "";
  const generatedTextSections: Array<[string, string | string[]]> = [
    ["Descrição do projeto", presentation.descricaoProjeto],
    ["Premissas da obra", presentation.premissasObra],
    ["Memorial descritivo", presentation.memorialDescritivo],
    ["Condições detalhadas de pagamento", presentation.condicoesPagamentoDetalhadas],
    ["Política de reajuste", presentation.politicaReajuste],
    ["Garantias contratuais", presentation.garantiasContratuais],
    ["Itens não inclusos", presentation.itensNaoInclusos],
  ];
  const generatedDetailsHtml = generatedTextSections.map(([title, value]) => {
    if (Array.isArray(value)) {
      if (!value.length) return "";
      return `<section class="commercial-section"><h2 class="commercial-title">${title}</h2><ul>${value.map((line) => `<li>${escapeProposalText(line)}</li>`).join("")}</ul></section>`;
    }
    return value ? `<section class="commercial-section"><h2 class="commercial-title">${title}</h2><p style="white-space:pre-wrap">${escapeProposalText(value)}</p></section>` : "";
  }).join("");

  function scheduleDependencyLabel(rowId: string): string {
    const [stageId, phaseId] = rowId.split("::");
    const stage = presentation.cronogramaEtapas[stageId];
    const config = phaseId ? stage?.fases?.find((phase) => phase.id === phaseId) : stage;
    const predecessorId = phaseId ? (config as ProposalStagePhase | undefined)?.dependeDeFaseId : (config as ProposalStageSchedule | undefined)?.dependeDeEtapaId;
    const predecessor = phaseId
      ? stage?.fases?.find((phase) => phase.id === predecessorId)?.nome
      : groupedItems.find((group) => group.id === predecessorId)?.nome;
    return predecessorId
      ? `${escapeProposalText(predecessor || predecessorId)} · ${config?.tipoDependencia ?? "FS"} · ${Number(config?.defasagemDias ?? 0)} dias`
      : "Sequência automática / início cadastrado";
  }
  const datedRows = proposalExpandedScheduleRows(scheduleRows).filter((row) => row.start && row.end);
  const effectiveDays = datedRows.length ? proposalDiffDays(
    new Date(Math.min(...datedRows.map((row) => row.start!.getTime()))),
    new Date(Math.max(...datedRows.map((row) => row.end!.getTime()))),
  ) : null;
  const executionScheduleRows = scheduleRows.flatMap((row) => [row, ...(row.phases ?? [])]).map((row) => `<tr>
    <td><strong>Etapa ${row.ordem}</strong> · ${escapeProposalText(row.nome || "Execução")}</td>
    <td>${row.start ? proposalFormatDate(row.start) : "A definir"}</td>
    <td>${row.duration ? `${row.duration} dias` : "A definir"}</td>
    <td>${row.end ? proposalFormatDate(row.end) : "A definir"}</td>
    <td>${scheduleDependencyLabel(row.id)}</td>
  </tr>`).join("");
  const physicalFinancialRows = scheduleRows.map((row) => `<tr>
    <td><strong>Etapa ${row.ordem}</strong> · ${escapeProposalText(row.nome || "Execução")}</td>
    <td>${row.start && row.end ? `${proposalFormatDate(row.start)} a ${proposalFormatDate(row.end)}` : row.duration ? `${row.duration} dias` : "A definir"}</td>
    <td class="r">${row.physicalPercent.toFixed(2)}%</td>
    <td class="r">${row.financialPercent.toFixed(2)}%</td>
    <td class="r fw">${fmtBRL(row.value)}</td>
    <td>${row.marcoPagamento ? escapeProposalText(row.marcoPagamento) : "Conforme condição comercial"}${row.observacao ? `<span class="schedule-note">${escapeProposalText(row.observacao)}</span>` : ""}</td>
  </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${proposta.titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Inter", sans-serif;
    font-size: 9.5pt;
    line-height: 1.55;
    color: #1e2a3b;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .monthly-ledger { table-layout: fixed; width: 100%; font-size: 6pt; }
  .monthly-ledger th, .monthly-ledger td { overflow-wrap: anywhere; padding: 2mm 1mm; }
  .monthly-ledger th:nth-child(2) { width: 26%; }
  .commercial-section ul { padding-left: 5mm; }
  @media print {
    .page.orc-page { height: auto !important; max-height: none !important; overflow: visible !important; }
    .commercial-section, .stage-block { break-inside: auto; }
  }
  /* ── pages ── */
  .page {
    width: 210mm;
    min-height: 297mm;
    page-break-after: always;
    display: flex;
    flex-direction: column;
  }
  .page:last-child { page-break-after: auto; }

  /* ─── COVER PAGE ─── */
  .cover {
    background: linear-gradient(160deg, #0f1f35 60%, #1a3a5c 100%);
    color: #fff;
    padding: 14mm 16mm 12mm;
  }
  .cover-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10mm;
  }
  .cover-logo-wrap { display: flex; align-items: center; gap: 8px; }
  .cover-logo { height: 32px; object-fit: contain; max-width: 150px; filter: brightness(0) invert(1); }
  .cover-company-name { font-weight: 800; font-size: 13pt; color: #fff; }
  .cover-date { font-family: "JetBrains Mono", monospace; font-size: 7pt; color: rgba(255,255,255,.5); letter-spacing: .07em; text-transform: uppercase; }

  .cover-hero { flex: 1; margin-bottom: 8mm; }
  .cover-tagline { font-family: "JetBrains Mono", monospace; font-size: 7pt; text-transform: uppercase; letter-spacing: .12em; color: #7eb8ff; margin-bottom: 3mm; }
  .cover-titulo { font-family: "Instrument Serif", serif; font-weight: 400; font-size: 24pt; line-height: 1.1; color: #fff; margin-bottom: 4mm; max-width: 22ch; }
  .cover-prepared-label { font-size: 7.5pt; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 1mm; }
  .cover-prepared-name { font-weight: 700; font-size: 11pt; color: #fff; }
  .cover-prepared-empresa { font-size: 9pt; color: rgba(255,255,255,.7); }

  /* ── diferenciais ── */
  .dif-section { margin: 6mm 0; }
  .section-label {
    font-family: "JetBrains Mono", monospace;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #7eb8ff;
    margin-bottom: 3mm;
  }
  .dif-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; }
  .dif-item {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 6px;
    padding: 3mm 3.5mm;
    font-size: 8pt;
    color: rgba(255,255,255,.88);
    line-height: 1.4;
  }
  .dif-bullet { color: #7eb8ff; font-size: 10pt; line-height: 1.2; flex-shrink: 0; }

  /* ── produtos ── */
  .prod-section { margin-top: 6mm; }
  .prod-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-top: 2mm; }
  .prod-card {
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 7px;
    padding: 3.5mm 4mm;
  }
  .prod-cat { font-family: "JetBrains Mono", monospace; font-size: 6pt; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.45); margin-bottom: 1.5mm; }
  .prod-name { font-weight: 700; font-size: 8.5pt; color: #fff; margin-bottom: 1mm; }
  .prod-desc { font-size: 7.5pt; color: rgba(255,255,255,.65); margin-bottom: 1.5mm; line-height: 1.4; }
  .prod-price { font-family: "Instrument Serif", serif; font-size: 11pt; color: #7eb8ff; }
  .prod-unit { font-family: "Inter", sans-serif; font-size: 7pt; color: rgba(255,255,255,.45); }

  /* ── cover footer ── */
  .cover-footer {
    margin-top: auto;
    padding-top: 5mm;
    border-top: 1px solid rgba(255,255,255,.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 6.5pt;
    color: rgba(255,255,255,.4);
  }
  .cover-contact { display: flex; gap: 5mm; }

  /* ─── ORC PAGE ─── */
  .orc-page { padding: 14mm 16mm 12mm; }
  .doc-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 4mm;
    margin-bottom: 6mm;
    border-bottom: 1.5px solid #2563eb;
  }
  .doc-hdr-left { display: flex; align-items: center; gap: 5px; }
  .doc-hdr-logo { height: 20px; object-fit: contain; max-width: 110px; }
  .doc-hdr-name { font-weight: 700; font-size: 8.5pt; color: #1e2a3b; }
  .doc-hdr-right { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }

  .orc-title { font-family: "Instrument Serif", serif; font-weight: 400; font-size: 16pt; color: #1e2a3b; margin-bottom: 1mm; }
  .orc-num { font-family: "JetBrains Mono", monospace; font-size: 7.5pt; color: #6b7280; }
  .orc-dates { font-size: 8pt; color: #6b7280; margin-top: 1mm; }

  .client-box {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5mm;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 4mm 5mm;
    margin: 4mm 0;
    font-size: 8.5pt;
  }
  .client-lbl { font-family: "JetBrains Mono", monospace; font-size: 6pt; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; margin-bottom: 1.5mm; }
  .client-name { font-weight: 700; font-size: 9.5pt; color: #1e2a3b; }
  .client-detail { color: #6b7280; margin-top: 1px; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 8.5pt; }
  table.items th { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; border-bottom: 1.5px solid #e2e8f0; padding: 2mm 2.5mm; text-align: left; }
  table.items th.r, table.items td.r { text-align: right; }
  table.items td { padding: 2.5mm 2.5mm; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  table.items tr:last-child td { border-bottom: none; }
  .stage-row td {
    background: #f1f5f9;
    color: #334155;
    border-top: 1px solid #cbd5e1 !important;
    border-bottom: 1px solid #cbd5e1 !important;
    padding-top: 2.5mm !important;
    padding-bottom: 2.5mm !important;
    font-size: 8.5pt;
  }
  .row-desc { font-size: 7pt; color: #9ca3af; }
  .fw { font-weight: 600; }
  .stage-block { margin: 3mm 0 5mm; }
  .stage-title, .stage-summary { display: flex; align-items: center; justify-content: space-between; gap: 5mm; padding: 3mm 3.5mm; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; color: #334155; font-size: 8.5pt; }
  .stage-block table.items { margin-top: 1.5mm; }
  .stage-summary { margin: 3mm 0 1.5mm; font-size: 9pt; }
  .proposal-stage-visual { margin: 2mm 0 3mm; break-inside: avoid; }
  .proposal-stage-visual img { width: 100%; height: 42mm; object-fit: cover; display: block; border-radius: 7px; border: 1px solid #e2e8f0; }
  .scope-block { margin: 1.5mm 0 4mm; break-inside: avoid; }
  .scope-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4mm;
    padding: 2.2mm 2.5mm;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-bottom: 0;
    border-radius: 6px 6px 0 0;
    font-size: 7.5pt;
    font-weight: 700;
    color: #334155;
  }
  .scope-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #94a3b8;
    white-space: nowrap;
  }
  table.scope-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  table.scope-table th {
    padding: 1.8mm 2.3mm;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #94a3b8;
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .05em;
    text-align: left;
  }
  table.scope-table th:first-child { width: 34%; }
  table.scope-table td {
    padding: 2mm 2.3mm;
    border: 1px solid #e2e8f0;
    vertical-align: top;
    line-height: 1.4;
  }
  .scope-item { font-weight: 600; color: #334155; }
  .scope-description { color: #64748b; }

  .total-row { display: flex; justify-content: flex-end; margin-top: 3mm; }
  .total-box { border: 1px solid #bfdbfe; border-radius: 7px; padding: 3mm 5mm; text-align: right; background: #eff6ff; }
  .total-lbl { font-family: "JetBrains Mono", monospace; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .07em; color: #93c5fd; display: block; margin-bottom: 1mm; }
  .total-val { font-family: "Instrument Serif", serif; font-size: 20pt; color: #1e3a5f; }

  .meta-grid { display: flex; flex-wrap: wrap; gap: 5mm; margin-top: 4mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; }
  .meta-item { display: flex; flex-direction: column; gap: 1px; }
  .meta-item span { font-family: "JetBrains Mono", monospace; font-size: 6pt; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; }
  .meta-item strong { font-size: 9pt; color: #1e2a3b; }

  .obs-box { margin-top: 4mm; padding: 3mm 4mm; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 8pt; color: #4b5563; line-height: 1.6; }
  .commercial-section { margin-top: 4mm; }
  .commercial-title {
    font-family: "JetBrains Mono", monospace;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: .09em;
    color: #2563eb;
    margin-bottom: 2mm;
    font-weight: 700;
  }
  table.payment-table, table.schedule-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-top: 2mm; }
  table.payment-table th, table.schedule-table th {
    padding: 1.8mm 2.2mm;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    font-family: "JetBrains Mono", monospace;
    font-size: 5.8pt;
    text-transform: uppercase;
    letter-spacing: .05em;
    text-align: left;
  }
  table.payment-table td, table.schedule-table td { padding: 2mm 2.2mm; border: 1px solid #e2e8f0; vertical-align: top; line-height: 1.35; }
  table.payment-table .r, table.schedule-table .r { text-align: right; }
  .schedule-intro { margin: 2mm 0 4mm; padding: 3mm 3.5mm; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 8pt; color: #64748b; }
  .schedule-intro strong { color: #334155; }
  .schedule-note { color: #94a3b8; font-size: 6.8pt; display: block; margin-top: .8mm; }
  .period-matrix-group { margin-top: 4mm; break-inside: avoid; }
  .period-matrix-caption { font-family: "JetBrains Mono", monospace; font-size: 5.8pt; text-transform: uppercase; letter-spacing: .07em; color: #64748b; margin-bottom: 1.5mm; }
  table.period-matrix { width: 100%; border-collapse: collapse; font-size: 6.8pt; table-layout: fixed; }
  table.period-matrix th { padding: 1.8mm 2mm; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; font-family: "JetBrains Mono", monospace; font-size: 5.6pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
  table.period-matrix th:first-child { width: 33%; }
  table.period-matrix td { padding: 1.8mm 2mm; border: 1px solid #e2e8f0; vertical-align: top; }
  table.period-matrix .r { text-align: right; }
  .period-stage strong { display: block; color: #1e2a3b; }
  .period-stage span { display: block; color: #64748b; margin-top: .5mm; }
  .period-cell strong { display: block; color: #1e2a3b; font-size: 7pt; }
  .period-cell span { display: block; color: #94a3b8; font-size: 5.8pt; margin-top: .5mm; }
  .period-empty { text-align: center; color: #cbd5e1; }
  table.period-matrix tfoot td { background: #f8fafc; font-weight: 700; color: #1e2a3b; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  /* Approved CasaForte commercial proposal refinements */
  .stage-metrics {
    border:1px solid var(--cf-border) !important;
    border-top:0 !important;
    background:#fff !important;
    color:var(--cf-dark) !important;
    box-shadow:0 2mm 6mm rgba(0,0,0,.035) !important;
  }
  .stage-metrics > div { border-right:1px solid var(--cf-border) !important; }
  .stage-metrics > div:last-child { border-right:0 !important; }
  .stage-metrics span { color:var(--cf-muted) !important; letter-spacing:.08em !important; }
  .stage-metrics strong { color:var(--cf-dark) !important; }
  table.period-matrix .period-stage { width:36mm; }
  table.period-matrix .period-stage strong { display:block; font-size:6.2pt; }
  table.period-matrix .period-cell strong { display:block; font-size:6.2pt; white-space:nowrap; }
</style>
</head>
<body>

<!-- ══ PAGE 1: CAPA ══ -->
<div class="page cover">
  <div class="cover-top">
    <div class="cover-logo-wrap">
      ${profile?.logoUrl ? `<img src="${profile.logoUrl}" alt="${companyName}" class="cover-logo" onerror="this.style.display='none'">` : ""}
      <span class="cover-company-name">${companyName}</span>
    </div>
    <span class="cover-date">${today}</span>
  </div>

  <div class="cover-hero">
    <div class="cover-tagline">Orçamento Comercial</div>
    <h1 class="cover-titulo">${proposta.titulo}</h1>
    ${lead ? `
    <div style="margin-top:4mm;">
      <div class="cover-prepared-label">Preparado para</div>
      <div class="cover-prepared-name">${lead.nome}</div>
      ${lead.empresa ? `<div class="cover-prepared-empresa">${lead.empresa}</div>` : ""}
    </div>` : ""}
  </div>

  ${difItems.length > 0 || !profile?.diferenciais ? `
  <div class="dif-section">
    <div class="section-label">Nossos Diferenciais</div>
    <div class="dif-grid">${difHtml}</div>
  </div>` : ""}

  ${showProducts.length > 0 ? `
  <div class="prod-section">
    <div class="section-label">Principais Produtos &amp; Serviços</div>
    <div class="prod-grid">${prodHtml}</div>
  </div>` : ""}

  <div class="cover-footer">
    <span>${companyName}${profile?.cnpj ? ` · CNPJ ${profile.cnpj}` : ""}</span>
    <div class="cover-contact">
      ${profile?.telefone ? `<span>${profile.telefone}</span>` : ""}
      ${profile?.email ? `<span>${profile.email}</span>` : ""}
      ${profile?.endereco ? `<span>${profile.endereco}</span>` : ""}
    </div>
  </div>
</div>

<!-- ══ PAGE 2: ORÇAMENTO ══ -->
<div class="page orc-page">
  <div class="doc-hdr">
    <div class="doc-hdr-left">
      ${profile?.logoUrl ? `<img src="${profile.logoUrl}" alt="${companyName}" class="doc-hdr-logo" onerror="this.style.display='none'">` : ""}
      <span class="doc-hdr-name">${companyName}</span>
    </div>
    <span class="doc-hdr-right">Orçamento${proposta.numero ? ` · ${proposta.numero}` : ""}</span>
  </div>

  <div class="orc-title">${proposta.titulo}</div>
  ${proposta.numero ? `<div class="orc-num">${proposta.numero}</div>` : ""}
  <div class="orc-dates">
    Emitido em ${fmtDate(proposta.createdAt ?? new Date())}
    ${proposta.validadeAte ? ` · Válido até ${fmtDate(proposta.validadeAte)}` : ""}
  </div>

  ${lead ? `
  <div class="client-box">
    <div>
      <div class="client-lbl">Cliente</div>
      <div class="client-name">${lead.nome}</div>
      ${lead.empresa ? `<div class="client-detail">${lead.empresa}</div>` : ""}
      ${lead.telefone ? `<div class="client-detail">${lead.telefone}</div>` : ""}
      ${lead.email ? `<div class="client-detail">${lead.email}</div>` : ""}
    </div>
    <div>
      <div class="client-lbl">Empresa Emissora</div>
      <div class="client-name">${companyName}</div>
      ${profile?.telefone ? `<div class="client-detail">${profile.telefone}</div>` : ""}
      ${profile?.email ? `<div class="client-detail">${profile.email}</div>` : ""}
    </div>
  </div>` : ""}

  ${itens.length > 0 ? `
  ${presentationBlocksHtml}
  ${presentation.mostrarTotalGeral ? `<div class="total-row">
    <div class="total-box">
      <span class="total-lbl">Total</span>
      <span class="total-val">${fmtBRL(totalExibido)}</span>
    </div>
  </div>` : ""}` : ""}

  ${presentation.areaTotalConstruida > 0 ? `<div class="commercial-section"><strong>Área total construída:</strong> ${presentation.areaTotalConstruida.toLocaleString("pt-BR")} m²</div>` : ""}
  ${generatedDetailsHtml}
  ${metaRows ? `<div class="commercial-section"><div class="commercial-title">Condições comerciais</div><div class="meta-grid">${metaRows}</div></div>` : ""}
  ${paymentRowsHtml ? `
    <div class="commercial-section">
      <div class="commercial-title">Composição de pagamento</div>
      <table class="payment-table">
        <thead><tr><th>Forma / parcela</th><th class="r">Valor</th></tr></thead>
        <tbody>${paymentRowsHtml}</tbody>
      </table>
    </div>` : ""}
  ${proposta.observacoes ? `<div class="obs-box">${escapeProposalText(proposta.observacoes)}</div>` : ""}
</div>

${scheduleRows.length && (presentation.mostrarCronogramaExecucao || presentation.mostrarFisicoFinanceiro) ? `
<!-- ══ PAGE 3: CRONOGRAMA ══ -->
<div class="page orc-page">
  <div class="doc-hdr">
    <div class="doc-hdr-left">
      ${profile?.logoUrl ? `<img src="${profile.logoUrl}" alt="${companyName}" class="doc-hdr-logo" onerror="this.style.display='none'">` : ""}
      <span class="doc-hdr-name">${companyName}</span>
    </div>
    <span class="doc-hdr-right">Cronograma${proposta.numero ? ` · ${proposta.numero}` : ""}</span>
  </div>

  <div class="orc-title">Cronograma de execução e físico-financeiro</div>
  <p>Avanço físico total: ${scheduleRows.reduce((sum, row) => sum + row.physicalPercent, 0).toFixed(2)}% · Peso financeiro total: ${scheduleRows.reduce((sum, row) => sum + Number(row.financialPercent ?? 0), 0).toFixed(2)}%${effectiveDays ? ` · Prazo efetivo: ${effectiveDays} dias` : ""}</p>
  <div class="schedule-intro">
    ${presentation.previsaoInicio ? `<strong>Previsão de início:</strong> ${proposalFormatDate(presentation.previsaoInicio)}.` : "<strong>Previsão de início:</strong> a definir."}
    Cada etapa possui sua própria data de início e duração. Etapas simultâneas aparecem na mesma coluna mensal e suas cobranças são somadas no período.
  </div>

  ${showExecutionSchedule ? `
    <div class="commercial-section">
      <div class="commercial-title">Cronograma de execução</div>
      <table class="schedule-table">
        <thead><tr><th>Etapa / fase</th><th>Início</th><th>Duração</th><th>Término</th><th>Dependência / defasagem</th></tr></thead>
        <tbody>${executionScheduleRows}</tbody>
      </table>
    </div>` : ""}

  ${showPhysicalFinancial ? `
    <div class="commercial-section">
      <div class="commercial-title">Cronograma físico-financeiro</div>
      <table class="schedule-table">
        <thead><tr><th>Etapa</th><th>Período</th><th class="r">% da execução</th><th class="r">% financeiro</th><th class="r">Valor</th><th>Marco / pagamento</th></tr></thead>
        <tbody>${physicalFinancialRows}</tbody>
      </table>
      <div class="commercial-title" style="margin-top:4mm;">Modelo por colunas · cobrança mensal</div>
      ${monthlyLedgerHtml}
      ${renderProposalMonthlyMatrix(scheduleRows, presentation, totalExibido, fmtBRL)}
    </div>` : ""}
</div>` : ""}

</body>
</html>`;
}
