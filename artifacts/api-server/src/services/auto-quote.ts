/**
 * AI Sales Agent — Auto-Quote Service
 *
 * Automates quote generation for leads that come from WhatsApp/Instagram channels.
 * Manual leads (created by clients) keep manual quote flow.
 *
 * Flow:
 *   1. Extract intent & products from message (OpenAI JSON schema)
 *   2. Lookup products in catalog + check stock
 *   3. If missing info → ask clarifying questions
 *   4. If complete → generate quote + update CRM
 *   5. Send quote summary to lead via WhatsApp
 */
import { and, eq, ilike, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import {
  db,
  leadsTable,
  propostasTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  inventoryItemsTable,
  dealsTable,
} from "@workspace/db";
import type { PropostaItem } from "@workspace/db";
import { sendOutgoingMessage } from "./omnichannel.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExtractedIntent = {
  intent: "quote_request" | "question" | "other";
  products: Array<{
    name: string;
    quantity: number;
    width?: string;
    height?: string;
    color?: string;
    specs?: string;
  }>;
  missingInformation: string[];
  notes: string;
};

type FoundProduct = {
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  quantity: number;
  precoImplantacao: number | null;
  precoMensalidade: number | null;
};

// ── OpenAI JSON schema for intent extraction ──────────────────────────────────

const INTENT_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false as const,
  properties: {
    intent: {
      type: "string" as const,
      enum: ["quote_request", "question", "other"],
      description: "Intenção do cliente: solicitar orçamento, fazer pergunta, ou outro",
    },
    products: {
      type: "array" as const,
      items: {
        type: "object" as const,
        additionalProperties: false as const,
        properties: {
          name: { type: "string" as const, description: "Nome do produto identificado" },
          quantity: { type: "number" as const, description: "Quantidade solicitada" },
          width: { type: ["string", "null"] as const, description: "Largura, se mencionada" },
          height: { type: ["string", "null"] as const, description: "Altura, se mencionada" },
          color: { type: ["string", "null"] as const, description: "Cor, se mencionada" },
          specs: { type: ["string", "null"] as const, description: "Outras especificações relevantes" },
        },
        required: ["name", "quantity", "width", "height", "color", "specs"],
      },
    },
    missingInformation: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Informações que faltam para gerar o orçamento",
    },
    notes: {
      type: "string" as const,
      description: "Observações adicionais sobre a intenção do cliente",
    },
  },
  required: ["intent", "products", "missingInformation", "notes"],
};


// ── Extract intent from customer message ──────────────────────────────────────

export async function extractIntent(
  mensagem: string,
  catalogo: Array<{ nome: string; categoria: string | null; sku: string | null }>,
  tenantId: string,
  log: Logger
): Promise<ExtractedIntent> {
  const catalogSummary = catalogo
    .map((p) => `${p.nome}${p.sku ? ` (SKU: ${p.sku})` : ""}${p.categoria ? ` [${p.categoria}]` : ""}`)
    .join("\n");

  const systemPrompt =
    "Você é um especialista comercial de uma empresa. Analise a mensagem do cliente e identifique a intenção de compra.\n" +
    "\nCATÁLOGO DISPONÍVEL:\n" + catalogSummary + "\n\n" +
    "REGRAS:\n" +
    "- Mapeie o produto mencionado pelo cliente ao produto mais próximo do catálogo\n" +
    "- Extraia quantidade, medidas, cor e especificações\n" +
    "- Se faltar informação essencial (ex: medidas, cor), liste em missingInformation\n" +
    "- Nunca invente produtos que não existem no catálogo\n" +
    "- Se o cliente não está pedindo orçamento, use intent='question' ou 'other'\n" +
    "- Retorne APENAS JSON válido conforme o schema";

  const result = await gatewayCallOpenAI(
    tenantId,
    "auto_quote",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: mensagem },
    ],
    {
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 800,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "sales_intent",
          schema: INTENT_JSON_SCHEMA,
          strict: true,
        },
      } as any,
      log,
    },
  );

  const raw = result.content;
  log.info({ raw }, "auto-quote: intent extracted");

  try {
    const parsed = JSON.parse(raw) as ExtractedIntent;
    return parsed;
  } catch {
    log.error({ raw }, "auto-quote: failed to parse intent JSON");
    return { intent: "other", products: [], missingInformation: [], notes: "" };
  }
}

// ── Find products in catalog + stock check ────────────────────────────────────

export async function findProducts(
  tenantId: string,
  extracted: ExtractedIntent,
  log: Logger
): Promise<{ found: FoundProduct[]; missing: string[] }> {
  const found: FoundProduct[] = [];
  const missing: string[] = [];

  for (const item of extracted.products) {
    // Try exact match by name
    let [produto] = await db
      .select()
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenantId),
          eq(produtosCatalogoTable.ativo, true),
          ilike(produtosCatalogoTable.nome, item.name)
        )
      )
      .limit(1);

    // Fallback: partial match
    if (!produto) {
      [produto] = await db
        .select()
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            eq(produtosCatalogoTable.ativo, true),
            ilike(produtosCatalogoTable.nome, `%${item.name}%`)
          )
        )
        .limit(1);
    }

    if (!produto) {
      missing.push(`Produto "${item.name}" não encontrado no catálogo`);
      continue;
    }

    // Check stock
    const [stock] = await db
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.tenantId, tenantId),
          eq(inventoryItemsTable.produtoId, produto.id)
        )
      )
      .limit(1);

    const stockQty = stock ? Number(stock.quantidadeAtual) : 0;
    const price = Number(produto.precoBase);
    const precoImplantacao = produto.precoImplantacao != null ? Number(produto.precoImplantacao) : null;
    const precoMensalidade = produto.precoMensalidade != null ? Number(produto.precoMensalidade) : null;

    found.push({
      productId: produto.id,
      name: produto.nome,
      sku: produto.sku,
      price,
      stock: stockQty,
      quantity: item.quantity,
      precoImplantacao,
      precoMensalidade,
    });

    if (stockQty < item.quantity) {
      missing.push(`Estoque insuficiente: ${produto.nome} (disponível: ${stockQty}, solicitado: ${item.quantity})`);
    }
  }

  // Also include AI-detected missing info
  missing.push(...extracted.missingInformation);

  log.info({ foundCount: found.length, missingCount: missing.length }, "auto-quote: product lookup");
  return { found, missing };
}

// ── Generate quote number ─────────────────────────────────────────────────────

export async function generateQuoteNumber(tenantId: string): Promise<string> {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const timePart = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const prefix = `ORC-${datePart}-${timePart}`;

  const { count } = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(propostasTable)
    .where(
      and(
        eq(propostasTable.tenantId, tenantId),
        sql`${propostasTable.createdAt} >= ${new Date(now.getFullYear(), now.getMonth(), now.getDate())}`
      )
    )
    .then((r) => r[0] ?? { count: 0 });

  const seq = ((count ?? 0) + 1).toString().padStart(3, "0");
  return `${prefix}-${seq}`;
}

// ── Create quote in database ────────────────────────────────────────────────────

export async function createAutoQuote(params: {
  tenantId: string;
  leadId: string;
  found: FoundProduct[];
  log: Logger;
}): Promise<{ propostaId: string; numero: string; valorTotal: number }> {
  const { tenantId, leadId, found, log } = params;

  // Build items — dual-price products get two line items (implantação + mensalidade)
  const itens: PropostaItem[] = [];
  let hasDualPrice = false;
  let totalImplantacao = 0;
  let totalMensalidade = 0;

  for (const p of found) {
    if (p.precoImplantacao != null && p.precoMensalidade != null) {
      hasDualPrice = true;
      itens.push({
        nome: `${p.name} — Implantação (taxa única)`,
        quantidade: p.quantity,
        valorUnitario: p.precoImplantacao,
        produtoId: p.productId,
        descricao: "taxa_implantacao",
      });
      itens.push({
        nome: `${p.name} — Mensalidade`,
        quantidade: p.quantity,
        valorUnitario: p.precoMensalidade,
        produtoId: p.productId,
        descricao: "mensalidade_recorrente",
      });
      totalImplantacao += p.precoImplantacao * p.quantity;
      totalMensalidade += p.precoMensalidade * p.quantity;
    } else {
      itens.push({
        nome: p.name,
        quantidade: p.quantity,
        valorUnitario: p.price,
        produtoId: p.productId,
      });
    }
  }

  // valorTotal = one-time costs (implantação + any regular items)
  const regularTotal = found
    .filter((p) => p.precoImplantacao == null || p.precoMensalidade == null)
    .reduce((sum, p) => sum + p.price * p.quantity, 0);
  const valorTotal = totalImplantacao + regularTotal;

  const numero = await generateQuoteNumber(tenantId);

  const [proposta] = await db
    .insert(propostasTable)
    .values({
      tenantId,
      leadId,
      titulo: `Orçamento ${numero}`,
      itens,
      valorTotal: valorTotal.toFixed(2),
      ...(hasDualPrice && {
        recorrente: true,
        valorMensal: totalMensalidade.toFixed(2),
      }),
      status: "enviada",
      numero,
      autoGenerated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  // Create or update deal
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.tenantId, tenantId),
        eq(dealsTable.leadId, leadId),
        eq(dealsTable.etapa, "novo")
      )
    )
    .limit(1);

  // Deal valor = implantação (one-time) + first monthly payment, gives a realistic deal size
  const dealValor = hasDualPrice
    ? (totalImplantacao + totalMensalidade).toFixed(2)
    : valorTotal.toFixed(2);

  if (!deal) {
    await db.insert(dealsTable).values({
      tenantId,
      leadId,
      titulo: `Negócio ${numero}`,
      etapa: "proposta" as const,
      valor: dealValor,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(dealsTable)
      .set({ etapa: "proposta", valor: dealValor, updatedAt: new Date() })
      .where(eq(dealsTable.id, deal.id));
  }

  // Update lead status
  await db
    .update(leadsTable)
    .set({ status: "qualificado", updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));

  log.info({ propostaId: proposta.id, numero, valorTotal }, "auto-quote: created");
  return { propostaId: proposta.id, numero, valorTotal };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Build quote message for WhatsApp ──────────────────────────────────────────

export function buildQuoteMessage(
  found: FoundProduct[],
  numero: string,
  valorTotal: number,
  missing: string[]
): string {
  const lines: string[] = [
    "📋 *Orçamento Gerado*",
    `Nº: ${numero}`,
    "",
  ];

  let totalMensalidade = 0;
  let hasAnyDual = false;

  for (const p of found) {
    lines.push(`*${p.name}*`);

    if (p.precoImplantacao != null && p.precoMensalidade != null) {
      hasAnyDual = true;
      totalMensalidade += p.precoMensalidade * p.quantity;
      lines.push(
        `💰 Implantação (única vez): R$ ${formatBRL(p.precoImplantacao * p.quantity)}`,
        `🔄 Mensalidade: R$ ${formatBRL(p.precoMensalidade * p.quantity)}/mês`,
      );
    } else {
      const total = p.price * p.quantity;
      if (p.quantity > 1) {
        lines.push(
          `  Qtd: ${p.quantity} × R$ ${formatBRL(p.price)}`,
          `  Total: R$ ${formatBRL(total)}`,
        );
      } else {
        lines.push(`  Valor: R$ ${formatBRL(total)}`);
      }
    }
    lines.push("");
  }

  if (hasAnyDual) {
    if (valorTotal > 0) {
      lines.push(`💳 *Investimento inicial: R$ ${formatBRL(valorTotal)}*`);
    }
    lines.push(`📅 *Mensalidade recorrente: R$ ${formatBRL(totalMensalidade)}/mês*`);
  } else {
    lines.push(`💰 *Valor total: R$ ${formatBRL(valorTotal)}*`);
  }

  lines.push("", "Deseja confirmar, precisa de ajustes, ou tem alguma dúvida?");

  if (missing.length > 0) {
    lines.push(
      "",
      "⚠️ *Observações:*",
      ...missing.map((m) => `- ${m}`)
    );
  }

  return lines.join("\n");
}

// ── Main entry: auto-quote pipeline ───────────────────────────────────────────

export async function runAutoQuotePipeline(params: {
  tenantId: string;
  leadId: string;
  mensagem: string;
  log: Logger;
}): Promise<{ generated: boolean; message: string; propostaId?: string }> {
  const { tenantId, leadId, mensagem, log } = params;

  // 1. Load catalog
  const catalogoRows = await db
    .select({
      id: produtosCatalogoTable.id,
      nome: produtosCatalogoTable.nome,
      categoriaNome: categoriasProdutoTable.nome,
      sku: produtosCatalogoTable.sku,
    })
    .from(produtosCatalogoTable)
    .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)));
  const catalogo = catalogoRows.map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoriaNome, sku: p.sku }));

  if (catalogo.length === 0) {
    log.info("auto-quote: no catalog products — skipping");
    return { generated: false, message: "Catálogo vazio — orçamento automático desabilitado" };
  }

  // 2. Extract intent
  const intent = await extractIntent(mensagem, catalogo, tenantId, log);
  log.info({ intent: intent.intent, products: intent.products.length }, "auto-quote: intent");

  if (intent.intent !== "quote_request") {
    return { generated: false, message: "Intenção não é orçamento — pipeline ignorado" };
  }

  if (intent.products.length === 0) {
    return { generated: false, message: "Nenhum produto identificado — perguntando ao cliente" };
  }

  // 3. Find products + stock check
  const { found, missing } = await findProducts(tenantId, intent, log);

  if (found.length === 0) {
    const askMessage =
      "Olá! Recebi sua mensagem, mas não encontrei os produtos mencionados no nosso catálogo.\n" +
      "Poderia confirmar os nomes? Ou se preferir, posso te ajudar a encontrar o que precisa.";
    return { generated: false, message: askMessage };
  }

  if (missing.length > 0) {
    const askMessage =
      "Olá! Entendi sua solicitação. Para montar o orçamento completo, preciso de mais algumas informações:\n\n" +
      missing.map((m) => `- ${m}`).join("\n") +
      "\n\nPode me enviar esses detalhes?";
    return { generated: false, message: askMessage };
  }

  // 4. Generate quote
  const { propostaId, numero, valorTotal } = await createAutoQuote({
    tenantId,
    leadId,
    found,
    log,
  });

  // 5. Build WhatsApp message
  const quoteMessage = buildQuoteMessage(found, numero, valorTotal, missing);

  log.info({ propostaId, numero }, "auto-quote: pipeline complete");
  return { generated: true, message: quoteMessage, propostaId };
}

// ── Send quote via WhatsApp ───────────────────────────────────────────────────

export async function sendQuoteViaWhatsApp(params: {
  tenantId: string;
  leadId: string;
  mensagem: string;
  log: Logger;
}): Promise<void> {
  const { tenantId, leadId, mensagem, log } = params;

  try {
    await sendOutgoingMessage(
      { tenantId, leadId, conteudo: mensagem, canal: "whatsapp", agentName: "auto-quote" },
      log
    );
    log.info("auto-quote: sent via WhatsApp");
  } catch (err) {
    log.error({ err }, "auto-quote: failed to send via WhatsApp");
  }
}

// ── Closer-triggered quote from a single catalog plan ─────────────────────────

/**
 * Creates a formal proposal from a single catalog plan, looked up by productId.
 * Used by the Closer agent when the lead asks for pricing and the agent emits
 * {{action:generate_quote}}. Always quantity=1, stock unlimited (SaaS).
 *
 * Returns null if the product is not found or inactive.
 */
export async function createQuoteFromCatalogPlan(params: {
  tenantId: string;
  leadId: string;
  productId: string;
  log: Logger;
}): Promise<{ propostaId: string; numero: string; valorTotal: number; nomePlano: string; precoImplantacao: number; precoMensalidade: number; recorrencia: string | null } | null> {
  const { tenantId, leadId, productId, log } = params;

  const [product] = await db
    .select({
      id:               produtosCatalogoTable.id,
      nome:             produtosCatalogoTable.nome,
      sku:              produtosCatalogoTable.sku,
      precoBase:        produtosCatalogoTable.precoBase,
      precoImplantacao: produtosCatalogoTable.precoImplantacao,
      precoMensalidade: produtosCatalogoTable.precoMensalidade,
      recorrencia:      produtosCatalogoTable.recorrencia,
    })
    .from(produtosCatalogoTable)
    .where(
      and(
        eq(produtosCatalogoTable.id, productId),
        eq(produtosCatalogoTable.tenantId, tenantId),
        eq(produtosCatalogoTable.ativo, true),
      ),
    )
    .limit(1);

  if (!product) {
    log.warn({ tenantId, leadId, productId }, "createQuoteFromCatalogPlan: product not found or inactive");
    return null;
  }

  const price          = Number(product.precoBase ?? product.precoMensalidade ?? 0);
  const precoImplantacao = product.precoImplantacao != null ? Number(product.precoImplantacao) : null;
  const precoMensalidade = product.precoMensalidade != null ? Number(product.precoMensalidade) : null;

  const found: FoundProduct[] = [{
    productId: product.id,
    name:      product.nome,
    sku:       product.sku ?? null,
    price,
    stock:     9999,
    quantity:  1,
    precoImplantacao,
    precoMensalidade,
  }];

  const result = await createAutoQuote({ tenantId, leadId, found, log });
  return {
    ...result,
    nomePlano:        product.nome,
    precoImplantacao: precoImplantacao ?? 0,
    precoMensalidade: precoMensalidade ?? price,
    recorrencia:      product.recorrencia ?? null,
  };
}
