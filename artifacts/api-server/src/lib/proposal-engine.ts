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
};

type ProposalPresentationConfig = {
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
    const start = config.inicioAutomatico === false && explicitStart
      ? explicitStart
      : (index === 0 ? explicitStart ?? globalStart : null)
        ?? proposalResolveDependencyStart(predecessor, type, lagDays, duration)
        ?? explicitStart
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

  return rawRows.map((row) => {
    const automaticPhysical = row.configuredPhysicalPercent !== null
      ? row.configuredPhysicalPercent
      : missingPhysical.length === 0
        ? 0
        : missingDurationTotal > 0 && row.duration
          ? (Number(row.duration) / missingDurationTotal) * remainingPhysical
          : totalDuration > 0 && row.duration
            ? (Number(row.duration) / totalDuration) * 100
            : remainingPhysical / missingPhysical.length;
    const physicalPercent = Math.max(0, Math.min(100, automaticPhysical));

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
      const start = index === 0
        ? explicitStart ?? row.start
        : proposalResolveDependencyStart(predecessor, phase.tipoDependencia ?? "FS", Number(phase.defasagemDias ?? 0), duration)
          ?? explicitStart
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
}

type ProposalScheduleRow = {
  id: string;
  ordem: number;
  nome: string;
  value: number;
  physicalPercent: number;
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
  for (let index = 0; index < periods.length; index += 4) {
    chunks.push(periods.slice(index, index + 4));
  }

  return chunks.map((chunk, chunkIndex) => {
    const body = displayRows.map((row) => {
      const cells = chunk.map((period) => {
        const stage = period.stages.find((item) => item.id === row.id);
        if (!stage || stage.share <= 0) return '<td class="period-empty">—</td>';
        return `<td class="period-cell">
          <strong>${fmtMoney(stage.amount)}</strong>
          <span>Físico ${stage.physical.toFixed(1)}%</span>
        </td>`;
      }).join("");
      return `<tr>
        <td class="period-stage"><span>${escapeProposalText(row.nome || "Execução")}</span></td>
        ${cells}
      </tr>`;
    }).join("");

    const grossFooter = chunk.map((period) => `<td class="r"><strong>${fmtMoney(period.amount)}</strong></td>`).join("");
    const amortFooter = chunk.map((period) => `<td class="r"><strong>-${fmtMoney(period.amortization)}</strong></td>`).join("");
    const netFooter = chunk.map((period) => `<td class="r"><strong>${fmtMoney(period.netAmount)}</strong></td>`).join("");
    const physicalFooter = chunk.map((period) => `<td class="r"><strong>${period.physical.toFixed(1)}%</strong></td>`).join("");
    const accumulatedFooter = chunk.map((period) => `<td class="r"><strong>${period.accumulatedPhysical.toFixed(1)}%</strong></td>`).join("");

    return `<div class="period-matrix-group">
      <div class="period-matrix-caption">${chunks.length > 1 ? `Períodos ${chunkIndex * 4 + 1}–${chunkIndex * 4 + chunk.length}` : "Fluxo mensal previsto"}</div>
      <table class="period-matrix">
        <thead>
          <tr><th>Etapa / fase</th>${chunk.map((period) => `<th class="r">${period.label}</th>`).join("")}</tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr><td>Valor bruto previsto</td>${grossFooter}</tr>
          <tr><td>Amortização da entrada</td>${amortFooter}</tr>
          <tr><td>Valor líquido previsto</td>${netFooter}</tr>
          <tr><td>Avanço físico do mês</td>${physicalFooter}</tr>
          <tr><td>Físico acumulado</td>${accumulatedFooter}</tr>
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
}): string {
  const { json, tenantName, tenantLogoUrl, clientName, imagens, orcamento, builderModuleEnabled } = args;
  const hero = json.hero || {};
  const meta = json.meta || {};
  const presentation = normalizeProposalPresentation(orcamento.apresentacao);
  const groupedItems = groupProposalPresentationItems(orcamento.itens);
  const calculatedTotal = orcamento.itens.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const total = orcamento.valorTotal ? Number(orcamento.valorTotal) : calculatedTotal;
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v || 0);
  const visualImages = (imagens || []).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const coverImage = visualImages[0] || Object.values(presentation.imagensEtapas).find(Boolean) || null;
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
  const company = tenantName || "Construtora";
  const client = clientName || meta.clientName || "Cliente";
  const title = orcamento.titulo || hero.title || "Construção residencial";
  const subtitle = "Orçamento por etapas + cronograma físico-financeiro";
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
  const entryValue = total * (presentation.entradaPercentual / 100);
  const contractBalanceAfterEntry = Math.max(0, total - entryValue);

  const summaryCards = [
    { label: "Valor global", value: fmtBRL(total) },
    ...(estimatedDays > 0 ? [{ label: "Prazo estimado", value: `${estimatedDays} dias` }] : []),
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
            <thead><tr><th>Fase</th><th>Início</th><th>Término</th><th class="r">Peso físico</th><th class="r">Valor</th></tr></thead>
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
      ${imageUrl && builderModuleEnabled("imagem_por_etapa")
        ? `<div class="stage-image"><img src="${escapeProposalText(imageUrl)}" alt="${escapeProposalText(group.nome)}" onerror="this.parentElement.style.display='none'" /></div>`
        : ""}
      <div class="stage-metrics">
        <div><span>VALOR DA ETAPA</span><strong>${fmtBRL(stageTotal)}</strong></div>
        <div><span>DURAÇÃO</span><strong>${row?.duration ? `${row.duration} dias` : "A definir"}</strong></div>
        <div><span>PESO FÍSICO</span><strong>${weight.toFixed(0)}%</strong></div>
      </div>
      ${row?.start || row?.end ? `
        <div class="stage-period">
          <div><span>INÍCIO PREVISTO</span><strong>${row?.start ? proposalFormatDate(row.start) : "A definir"}</strong></div>
          <div><span>TÉRMINO PREVISTO</span><strong>${row?.end ? proposalFormatDate(row.end) : "A definir"}</strong></div>
          <div><span>FASES</span><strong>${row?.phases?.length ?? 0}</strong></div>
        </div>` : ""}
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

  const conditions = [
    ["VALOR GLOBAL", fmtBRL(total)],
    ...(presentation.entradaPercentual > 0 ? [["ENTRADA / ADIANTAMENTO", `${presentation.entradaPercentual.toFixed(2)}% · ${fmtBRL(entryValue)}`]] : []),
    ...(presentation.entradaPercentual > 0 ? [["AMORTIZAÇÃO DA ENTRADA", `${presentation.amortizacaoEntradaPercentual.toFixed(2)}% sobre cada medição bruta até quitação do saldo`]] : []),
    ["FORMA DE PAGAMENTO", orcamento.condPagamento || orcamento.formaPagamento || "Conforme cronograma físico-financeiro"],
    ...(orcamento.validadeAte ? [["VALIDADE DA PROPOSTA", proposalFormatDate(orcamento.validadeAte)]] : []),
    ...(presentation.previsaoInicio ? [["PREVISÃO DE INÍCIO", proposalFormatDate(presentation.previsaoInicio)]] : []),
    ...(estimatedDays > 0 ? [["PRAZO ESTIMADO", `${estimatedDays} dias`]] : []),
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
</style>
</head>
<body>
<section class="page cover">
  ${coverImage ? `<img class="cover-bg" src="${escapeProposalText(coverImage)}" alt="Projeto" onerror="this.style.display='none'" />` : ""}
  <div class="cover-shade"></div>
  <div class="cover-content">
    <div class="cover-top">
      <div class="cover-brand">${tenantLogoUrl ? `<img src="${escapeProposalText(tenantLogoUrl)}" alt="${escapeProposalText(company)}" onerror="this.style.display='none'" />` : escapeProposalText(company)}</div>
      <div>PROPOSTA COMERCIAL</div>
    </div>
    <div class="cover-main">
      <h1 class="cover-title">${escapeProposalText(title)}</h1>
      <div class="cover-subtitle">${subtitle}</div>
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

<section class="page">
  ${header("RESUMO EXECUTIVO", "Proposta integrada ao orçamento")}
  <h1 class="summary-heading">Visão geral da proposta</h1>
  <p class="summary-lead">Este documento parte do orçamento oficial da obra e organiza escopo técnico, etapas, fases de execução e medição, valores contratados, cronograma executivo e fluxo físico-financeiro em uma única apresentação comercial. Após o aceite, estas informações formam a linha-base da obra.</p>
  <div class="metrics">${summaryCardsHtml}</div>
  <h2 class="organize-title">Como o documento está organizado</h2>
  <div class="organize-grid">
    <div class="organize-item"><b>01 · Escopo por etapa</b><p>Cada etapa reúne os itens e uma descrição objetiva do que está contemplado.</p></div>
    <div class="organize-item"><b>02 · Imagem representativa</b><p>Uma imagem visual acompanha cada etapa quando esse módulo estiver ativo.</p></div>
    <div class="organize-item"><b>03 · Cronograma integrado</b><p>As etapas podem ser sequenciais, defasadas ou executadas em paralelo conforme o planejamento.</p></div>
    <div class="organize-item"><b>04 · Físico-financeiro</b><p>Os valores são distribuídos pelos períodos planejados, separando valor bruto, amortização da entrada e líquido previsto.</p></div>
    <div class="organize-item"><b>05 · Fases e medições</b><p>Quando uma etapa possuir fases, elas aparecem com datas, peso físico e valor para orientar a medição real da execução.</p></div>
    <div class="organize-item"><b>06 · Portal do Cliente</b><p>Após o aceite, a mesma linha-base alimenta o acompanhamento de previsto × executado × medido × financeiro.</p></div>
  </div>
  ${footer()}
</section>

${stagePages}

${(builderModuleEnabled("cronograma") || builderModuleEnabled("fisico_financeiro")) ? `
<section class="page">
  ${header("CRONOGRAMA", "Execução e físico-financeiro")}
  <h1 class="schedule-title">Cronograma de execução</h1>
  <p class="schedule-sub">Modelo com etapas independentes, dependências configuráveis e possibilidade de execução simultânea.</p>
  ${builderModuleEnabled("cronograma") ? `
  <table class="schedule-demo">
    <thead><tr><th>Etapa</th><th>Início</th><th>Duração</th><th>Término</th><th class="r">Peso físico</th><th class="r">Valor</th></tr></thead>
    <tbody>${executionRows}</tbody>
  </table>` : ""}
  ${builderModuleEnabled("fisico_financeiro") ? `
    <h2 class="schedule-block-title">Cronograma físico-financeiro</h2>
    <div class="advance-summary"><strong>Entrada / adiantamento:</strong> ${presentation.entradaPercentual.toFixed(2)}% (${fmtBRL(total * presentation.entradaPercentual / 100)}) · <strong>Amortização:</strong> ${presentation.amortizacaoEntradaPercentual.toFixed(2)}% sobre cada medição até quitação do adiantamento.</div>
    <div class="matrix-wrap">${renderProposalMonthlyMatrix(scheduleRows, presentation, total, fmtBRL)}</div>
  ` : ""}
  ${footer()}
</section>` : ""}

<section class="page">
  ${header("CONDIÇÕES COMERCIAIS", "Modelo final")}
  <h1 class="conditions-title">Condições comerciais</h1>
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
  ${builderModuleEnabled("aceite") ? `
    <h2 class="accept-title">Aceite do cliente</h2>
    <div class="signature"><div>Nome / assinatura</div><div>Data</div></div>
  ` : ""}
  ${footer()}
</section>
</body>
</html>`;
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

  const builderModuleSet = Array.isArray(builder?.enabledModules)
    ? new Set(builder!.enabledModules!.filter((value): value is string => typeof value === "string"))
    : null;
  const builderModuleEnabled = (key: string, fallback = true) =>
    builderModuleSet ? builderModuleSet.has(key) : fallback;

  const navName = tenantName || "Proposta Comercial";
  const navLogoUrl = tenantLogoUrl || null;
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const visualImages = (imagens || []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  if (builder?.proposalKind === "construction_project" && orcamento) {
    return renderConstructionProposalLayout({
      json: d,
      tenantName,
      tenantLogoUrl,
      clientName,
      imagens: visualImages,
      orcamento,
      builderModuleEnabled,
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
    <td>${row.start && row.end ? `${proposalFormatDate(row.start)} a ${proposalFormatDate(row.end)}` : row.duration ? `${row.duration} dias` : "A definir"}</td>
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
  <h2>Cronograma e físico-financeiro</h2>
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
        <thead><tr><th>Etapa</th><th>Período</th><th class="r">Peso físico</th><th class="r">% financeiro</th><th class="r">Valor</th><th>Marco / pagamento</th></tr></thead>
        <tbody>${physicalFinancialRows}</tbody>
      </table>
      <div class="commercial-title" style="margin-top:4mm;">Modelo por colunas · cobrança mensal</div>
      ${renderProposalMonthlyMatrix(scheduleRows, fmtBRL)}
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
  const executionScheduleRows = scheduleRows.map((row) => `<tr>
    <td><strong>Etapa ${row.ordem}</strong> · ${escapeProposalText(row.nome || "Execução")}</td>
    <td>${row.start ? proposalFormatDate(row.start) : "A definir"}</td>
    <td>${row.duration ? `${row.duration} dias` : "A definir"}</td>
    <td>${row.end ? proposalFormatDate(row.end) : "A definir"}</td>
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
  <div class="schedule-intro">
    ${presentation.previsaoInicio ? `<strong>Previsão de início:</strong> ${proposalFormatDate(presentation.previsaoInicio)}.` : "<strong>Previsão de início:</strong> a definir."}
    Cada etapa possui sua própria data de início e duração. Etapas simultâneas aparecem na mesma coluna mensal e suas cobranças são somadas no período.
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
        <thead><tr><th>Etapa</th><th>Período</th><th class="r">Peso físico</th><th class="r">% financeiro</th><th class="r">Valor</th><th>Marco / pagamento</th></tr></thead>
        <tbody>${physicalFinancialRows}</tbody>
      </table>
      <div class="commercial-title" style="margin-top:4mm;">Modelo por colunas · cobrança mensal</div>
      ${renderProposalMonthlyMatrix(scheduleRows, fmtBRL)}
    </div>` : ""}
</div>` : ""}

</body>
</html>`;
}
