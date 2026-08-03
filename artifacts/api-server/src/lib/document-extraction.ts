import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { callOpenAI as gatewayCallOpenAI } from "./ai-gateway.js";
import { z } from "zod/v4";

// ─── Quote / Budget extraction ────────────────────────────────────────────────

export const quoteExtractionResultSchema = z.object({
  titulo: z.string().nullable().optional(),
  valorTotal: z.number().nullable().optional(),
  cliente: z.string().nullable().optional(),
  fornecedor: z.string().nullable().optional(),
  validade: z.string().nullable().optional(),
  itens: z
    .array(
      z.object({
        descricao: z.string(),
        quantidade: z.number().nullable().optional(),
        valorUnitario: z.number().nullable().optional(),
        valorTotal: z.number().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
  observacoes: z.string().nullable().optional(),
  confianca: z.number().nullable().optional(),
});

export type QuoteExtractionResult = z.infer<typeof quoteExtractionResultSchema>;

const QUOTE_EXTRACTION_SYSTEM_PROMPT = `Você é um analisador especializado em orçamentos, propostas comerciais e cotações.
Analise o documento fornecido e extraia as informações do orçamento/proposta.
Retorne APENAS um JSON válido (sem texto extra) com os campos abaixo. Omita ou deixe null campos não encontrados.

{
  "titulo": "assunto ou descrição resumida do orçamento (ex: 'Orçamento - Instalação de Energia Solar')",
  "valorTotal": número_decimal_sem_símbolo_ou_null,
  "cliente": "nome do cliente ou empresa compradora",
  "fornecedor": "nome do fornecedor ou empresa vendedora",
  "validade": "data de validade do orçamento em formato YYYY-MM-DD ou null",
  "itens": [
    {
      "descricao": "descrição do item ou serviço",
      "quantidade": número_ou_null,
      "valorUnitario": número_decimal_ou_null,
      "valorTotal": número_decimal_ou_null
    }
  ],
  "observacoes": "condições comerciais, prazo de entrega, forma de pagamento ou observações relevantes (máx 300 chars)",
  "confianca": 0.0
}

Instruções:
- valorTotal: use SOMENTE o valor numérico (ex: 15000.00), sem R$, sem pontos de milhar
- Se houver desconto, use o valor final com desconto
- confianca: número entre 0 e 1 indicando sua confiança na extração
- Retorne SOMENTE o JSON, nenhum texto fora dele`;

export async function extractQuoteData(
  files: Array<{ buffer: Buffer; mimeType: string; originalName: string }>,
  tenantId: string
): Promise<QuoteExtractionResult> {
  const texts: string[] = [];

  for (const file of files) {
    try {
      const text = await extractTextFromBuffer(file.buffer, file.mimeType, file.originalName, tenantId);
      if (text.trim().length > 20) {
        texts.push(`=== ${file.originalName} ===\n${text.trim()}`);
      }
    } catch {
      // skip unreadable files
    }
  }

  if (texts.length === 0) return { confianca: 0 };

  let combinedText = texts.join("\n\n");
  if (combinedText.length > MAX_TEXT_LENGTH) {
    combinedText = combinedText.slice(0, MAX_TEXT_LENGTH) + "\n[texto truncado]";
  }

  const aiResult = await gatewayCallOpenAI(
    tenantId,
    "document_extraction",
    [
      { role: "system", content: QUOTE_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: combinedText },
    ],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1500, temperature: 0.1 },
  );

  const raw = aiResult.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    return quoteExtractionResultSchema.parse(parsed);
  } catch {
    return { confianca: 0 };
  }
}

const MAX_TEXT_LENGTH = 15_000;

export const documentExtractionResultSchema = z.object({
  nomeFantasia: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
  produtos: z
    .array(
      z.object({
        nome: z.string(),
        descricao: z.string().nullable().optional(),
        preco: z.number().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
  diferenciais: z.string().nullable().optional(),
  publicoAlvo: z.string().nullable().optional(),
  concorrentes: z.array(z.string()).nullable().optional(),
  canaisVenda: z.array(z.string()).nullable().optional(),
  missao: z.string().nullable().optional(),
  visao: z.string().nullable().optional(),
  valores: z.array(z.string()).nullable().optional(),
  historia: z.string().nullable().optional(),
  confianca: z.number().nullable().optional(),
});

export type DocumentExtractionResult = z.infer<
  typeof documentExtractionResultSchema
>;

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  tenantId: string
): Promise<string> {
  // PDF
  if (mimeType === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }

  // DOCX / DOC
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    originalName.endsWith(".docx") ||
    originalName.endsWith(".doc")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Plain text / Markdown / CSV
  if (
    mimeType.startsWith("text/") ||
    originalName.endsWith(".md") ||
    originalName.endsWith(".txt")
  ) {
    return buffer.toString("utf-8");
  }

  // Images — use OpenAI vision
  if (mimeType.startsWith("image/")) {
    const base64 = buffer.toString("base64");
    const imageContent: import("openai").OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: "Extraia todo o texto e informações relevantes desta imagem sobre o negócio: nome, produtos, serviços, missão, valores, diferenciais, público-alvo.",
      },
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      },
    ];
    const aiResult = await gatewayCallOpenAI(
      tenantId,
      "document_extraction",
      [{ role: "user", content: imageContent } as any],
      { model: "gpt-4o-mini", maxTokens: 1000 },
    );
    return aiResult.content;
  }

  return "";
}

const EXTRACTION_SYSTEM_PROMPT = `Você é um analisador de documentos empresariais especializado.
Analise o texto dos documentos fornecidos e extraia informações sobre o negócio.
Retorne APENAS um JSON válido (sem texto extra) com os campos abaixo. Omita ou deixe null campos não encontrados.

{
  "nomeFantasia": "nome comercial/fantasia da empresa (não razão social)",
  "vertical": "setor/segmento (ex: Saúde & Estética, Tecnologia, Alimentação, Varejo, Educação, etc.)",
  "produtos": [{"nome": "nome", "descricao": "descrição breve", "preco": número_ou_null}],
  "diferenciais": "principais diferenciais competitivos e pontos fortes",
  "publicoAlvo": "perfil do cliente ideal / público-alvo",
  "concorrentes": ["nome do concorrente"],
  "canaisVenda": ["whatsapp", "instagram", "site", "marketplace", "fisico"],
  "missao": "missão da empresa",
  "visao": "visão da empresa",
  "valores": ["valor1", "valor2"],
  "historia": "história/fundação da empresa (máx 3 frases)",
  "confianca": 0.0
}

Instruções:
- Para canaisVenda, use SOMENTE: whatsapp, instagram, site, marketplace, fisico
- confianca: número entre 0 e 1 indicando sua confiança geral na extração
- Se o documento não tiver dados suficientes, retorne {"confianca": 0}
- Retorne SOMENTE o JSON, nenhum texto fora dele`;

export async function extractBusinessDataFromDocuments(
  files: Array<{ buffer: Buffer; mimeType: string; originalName: string }>,
  tenantId: string
): Promise<DocumentExtractionResult> {
  const texts: string[] = [];

  for (const file of files) {
    try {
      const text = await extractTextFromBuffer(
        file.buffer,
        file.mimeType,
        file.originalName,
        tenantId
      );
      if (text.trim().length > 50) {
        texts.push(`=== ${file.originalName} ===\n${text.trim()}`);
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  if (texts.length === 0) {
    return { confianca: 0 };
  }

  let combinedText = texts.join("\n\n");
  if (combinedText.length > MAX_TEXT_LENGTH) {
    combinedText = combinedText.slice(0, MAX_TEXT_LENGTH) + "\n[texto truncado]";
  }

  const aiResult2 = await gatewayCallOpenAI(
    tenantId,
    "document_extraction",
    [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: combinedText },
    ],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1500, temperature: 0.2 },
  );

  const raw = aiResult2.content || "{}";

  try {
    const parsed = JSON.parse(raw);
    return documentExtractionResultSchema.parse(parsed);
  } catch {
    return { confianca: 0 };
  }
}
