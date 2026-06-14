import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { getOpenAI } from "./agent-engine.js";
import { z } from "zod/v4";

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

async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  originalName: string
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
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraia todo o texto e informações relevantes desta imagem sobre o negócio: nome, produtos, serviços, missão, valores, diferenciais, público-alvo.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });
    return response.choices[0]?.message?.content ?? "";
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
  files: Array<{ buffer: Buffer; mimeType: string; originalName: string }>
): Promise<DocumentExtractionResult> {
  const texts: string[] = [];

  for (const file of files) {
    try {
      const text = await extractTextFromBuffer(
        file.buffer,
        file.mimeType,
        file.originalName
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

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: combinedText },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(raw);
    return documentExtractionResultSchema.parse(parsed);
  } catch {
    return { confianca: 0 };
  }
}
