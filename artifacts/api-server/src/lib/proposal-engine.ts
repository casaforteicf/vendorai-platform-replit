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
- Use dados e números concretos e plausíveis para o segmento (ex: "lojas que respondem em menos de 5 minutos têm 9x mais chances de fechar"). Invente dados realistas se não houver dados reais — eles precisam soar verdadeiros.
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
        { model: "claude-opus-4-8", maxTokens: 32000, system: PROPOSAL_SYSTEM_PROMPT },
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
    { model: "gpt-4o", maxTokens: 16000 },
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
  refinementNotes?: string | null;
  styleMemory?: ProposalStyleMemory | null;
  templateGuidance?: string | null;
}): string {
  const productsBlock = ctx.products.length
    ? `\nProdutos do cliente:\n${ctx.products.map((p) => `- ${p.nome}`).join("\n")}`
    : "\nNenhum produto cadastrado.";

  const propostasBlock = ctx.propostas.length
    ? `\n[CONTEXTO INTERNO — NÃO referencie estes valores no JSON gerado. Os orçamentos serão exibidos em seção separada.]\nOrçamentos vinculados ao lead:\n${ctx.propostas.map((p) => `- ${p.titulo}: R$ ${p.valorTotal || "?"}`).join("\n")}`
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

  const templateBlock = ctx.templateGuidance?.trim()
    ? `\n━━━ MODELO DE PROPOSTA DA EMPRESA (referência de estrutura e tom) ━━━\nO usuário enviou um modelo de proposta padrão da empresa. Use-o como referência para estrutura, nomenclatura de seções e tom de linguagem. Não copie o conteúdo — adapte-o ao lead atual.\n\n${ctx.templateGuidance.trim().slice(0, 2000)}`
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
2. situation.facts: exatamente 3 fatos com dados numéricos reais e impactantes do segmento "${ctx.mercadoSegmento || "informado"}".
3. problem.cards: exatamente 2 cards, cada um descrevendo um problema real e distinto com linguagem do dia a dia.
4. implication.cascade: exatamente 3 passos em cadeia — cada um piora o anterior logicamente.
5. value.questions: exatamente 2 perguntas retóricas — o cliente deve responder mentalmente "sim" para ambas.
6. solution.agents: exatamente 2 agentes/funcionalidades com tags distintas.
7. modules.mods: exatamente 3 módulos específicos ao segmento${ctx.products.length ? ` (baseie-se nos produtos: ${ctx.products.map((p) => p.nome).join(", ")})` : ""}.
8. Se briefing existir, os problemas e implicações DEVEM refletir as respostas do briefing — não invente problemas que o cliente não mencionou.
9. Cada campo de texto: máximo 2 frases curtas e diretas. Sem padding. Seja objetivo.
10. Retorne APENAS JSON válido. Nada antes ou depois.
11. NUNCA mencione valores monetários (R$, preços, custos, investimento, orçamento, "a partir de", "mensalidade") em NENHUM campo do JSON — nem no hero, nem no subheadline, nem em modules, nem em cta. Os valores financeiros serão exibidos exclusivamente na seção de orçamento, que é gerada separadamente.`;
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
  try {
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveChromiumPath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
    await browser.close();
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn({ err }, "proposal-engine: puppeteer failed, returning HTML fallback");
    return Buffer.from(htmlContent, "utf-8");
  }
}

type ProposalPresentationMode = "completo" | "resumo_etapa" | "preco_medio";

type ProposalPresentationConfig = {
  modoPadrao?: ProposalPresentationMode;
  etapas?: Record<string, ProposalPresentationMode>;
  mostrarTotalGeral?: boolean;
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
};

function normalizeProposalPresentation(
  value?: ProposalPresentationConfig | null,
): Required<ProposalPresentationConfig> {
  return {
    modoPadrao: value?.modoPadrao ?? "completo",
    etapas: value?.etapas ?? {},
    mostrarTotalGeral: value?.mostrarTotalGeral ?? true,
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

  if (rawDescription) {
    const max = 220;
    const concise = rawDescription.length > max
      ? `${rawDescription.slice(0, max - 1).trimEnd()}…`
      : rawDescription;
    return escapeProposalText(concise);
  }

  const itemName = item.nome.trim() || "esta atividade";
  return escapeProposalText(
    `Contempla ${itemName}, conforme especificações, quantitativos, padrões e condições definidos para esta etapa.`,
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
  apresentacao?: ProposalPresentationConfig | null;
} | null, contact?: {
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
} | null): string {
  const d = json as Record<string, any>;
  const hero = d.hero || {};
  const situation = d.situation || {};
  const problem = d.problem || {};
  const implication = d.implication || {};
  const value = d.value || {};
  const solution = d.solution || {};
  const modules = d.modules || {};
  const cta = d.cta || {};
  const meta = d.meta || {};

  const navName = tenantName || "Proposta Comercial";
  const navLogoUrl = tenantLogoUrl || null;
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const visualImages = (imagens || []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
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
    <p class="cover-sub">${hero.subheadline || ""}</p>
    ${pageImage(0) ? `<div class="img-hero-wrap"><img src="${pageImage(0)}" alt="Imagem principal da proposta" loading="eager" onerror="this.style.display='none'" /></div>` : ""}
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

<!-- ══ PAGE 2: SITUAÇÃO + PROBLEMA ══ -->
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
</div>

<!-- ══ PAGE 3: IMPLICAÇÃO + VALOR ══ -->
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
</div>

<!-- ══ PAGE 4: SOLUÇÃO + MÓDULOS + CTA ══ -->
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
  </div>
  ${docFooter()}
</div>

${orcamento ? (() => {
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
  const presentationBlocks = groupProposalPresentationItems(itensValidos).map((group) => {
    const mode = resolveProposalPresentationMode(presentation, group.id);
    const etapaTotal = group.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
    const stageTitle = group.hasStageHeader
      ? `<div class="orc-stage-title"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
      : "";
    const scopeTable = renderProposalScopeTable(group.itens);

    if (mode === "resumo_etapa") {
      const summary = group.hasStageHeader
        ? `<div class="orc-stage-summary"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
        : `<div class="orc-stage-summary"><span>Valor do orçamento</span><strong>${fmtBRL(etapaTotal)}</strong></div>`;
      return `${summary}${scopeTable}`;
    }

    if (mode === "preco_medio") {
      const rows = group.itens.map((i) => `<tr>
        <td>${i.nome}${i.sku ? `<span class="orc-desc">SKU: ${i.sku}</span>` : ""}</td>
        <td class="r">${fmtBRL(i.valorUnitario)}</td>
      </tr>`).join("");
      return `<div class="orc-stage-block">${stageTitle}
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
      <table class="orc-table">
        <thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Valor Unit.</th><th class="r">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${scopeTable}
    </div>`;
  }).join("");
  const metaItems = [
    orcamento.formaPagamento ? `<div class="orc-meta-item"><span>Forma de Pagamento</span><span>${FORMA_LABELS[orcamento.formaPagamento] || orcamento.formaPagamento}</span></div>` : "",
    orcamento.condPagamento ? `<div class="orc-meta-item"><span>Condição</span><span>${orcamento.condPagamento}</span></div>` : "",
    orcamento.prazoEntrega ? `<div class="orc-meta-item"><span>Prazo de Entrega</span><span>${orcamento.prazoEntrega}</span></div>` : "",
  ].filter(Boolean).join("");
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
  ${metaItems ? `<div class="orc-meta">${metaItems}</div>` : ""}
  ${orcamento.observacoes ? `<div class="orc-obs">${orcamento.observacoes}</div>` : ""}
  ${docFooter()}
</div>`;
})() : ""}

${visualImages.length > (orcamento ? 5 : 4) ? visualImages.slice(orcamento ? 5 : 4).map((url, idx) => `
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
  const presentationBlocksHtml = groupProposalPresentationItems(itens).map((group) => {
    const mode = resolveProposalPresentationMode(presentation, group.id);
    const etapaTotal = group.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
    const stageTitle = group.hasStageHeader
      ? `<div class="stage-title"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
      : "";
    const scopeTable = renderProposalScopeTable(group.itens);

    if (mode === "resumo_etapa") {
      const summary = group.hasStageHeader
        ? `<div class="stage-summary"><span><strong>Etapa ${group.ordem}</strong> · ${group.nome}</span><strong>${fmtBRL(etapaTotal)}</strong></div>`
        : `<div class="stage-summary"><span>Valor do orçamento</span><strong>${fmtBRL(etapaTotal)}</strong></div>`;
      return `${summary}${scopeTable}`;
    }

    if (mode === "preco_medio") {
      const rows = group.itens.map((i) => `<tr>
        <td>${i.nome}${i.sku ? `<br><span class="row-desc">SKU: ${i.sku}</span>` : ""}</td>
        <td class="r fw">${fmtBRL(i.valorUnitario)}</td>
      </tr>`).join("");
      return `<div class="stage-block">${stageTitle}
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
      <table class="items">
        <thead><tr><th>Descrição</th><th class="r">Qtd.</th><th class="r">Valor Unit.</th><th class="r">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${scopeTable}
    </div>`;
  }).join("");
  const metaRows = [
    proposta.formaPagamento ? `<div class="meta-item"><span>Forma de Pagamento</span><strong>${FORMA_LABELS[proposta.formaPagamento] ?? proposta.formaPagamento}</strong></div>` : "",
    proposta.condPagamento  ? `<div class="meta-item"><span>Condição</span><strong>${proposta.condPagamento}</strong></div>` : "",
    proposta.prazoEntrega   ? `<div class="meta-item"><span>Prazo de Entrega</span><strong>${proposta.prazoEntrega}</strong></div>` : "",
    proposta.validadeAte    ? `<div class="meta-item"><span>Válida até</span><strong>${fmtDate(proposta.validadeAte)}</strong></div>` : "",
  ].filter(Boolean).join("");

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

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
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

  ${metaRows ? `<div class="meta-grid">${metaRows}</div>` : ""}
  ${proposta.observacoes ? `<div class="obs-box">${proposta.observacoes}</div>` : ""}
</div>

</body>
</html>`;
}
