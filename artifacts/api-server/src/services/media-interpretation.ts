/**
 * Media Interpretation Service
 *
 * Interprets images (via GPT-4o Vision) and PDF/document files (via text extraction)
 * received from Z-API WhatsApp messages. The extracted description/text is treated
 * identically to typed text in the auto-quote pipeline.
 */

import OpenAI from "openai";
import pdfParse from "pdf-parse";
import type { Logger } from "pino";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Interprets an image using GPT-4o Vision.
 * Returns a natural-language description focused on purchase intent,
 * products, quantities, and prices visible in the image.
 */
export async function interpretImage(imageUrl: string, caption?: string, log?: Logger): Promise<string> {
  log?.info({ imageUrl: imageUrl.slice(0, 60) }, "media: interpreting image");

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: caption
        ? `O cliente enviou esta imagem com a legenda: "${caption}". Descreva o que está na imagem com foco em: produtos visíveis, marcas, quantidades, preços ou qualquer intenção de compra. Seja objetivo e conciso.`
        : `O cliente enviou esta imagem via WhatsApp. Descreva o que está na imagem com foco em: produtos visíveis, marcas, quantidades, preços ou qualquer intenção de compra. Seja objetivo e conciso.`,
    },
    {
      type: "image_url",
      image_url: { url: imageUrl, detail: "auto" },
    },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente de vendas. Analise imagens enviadas por clientes via WhatsApp e extraia informações relevantes sobre produtos, pedidos, quantidades, preços ou intenção de compra. Responda sempre em português.",
      },
      { role: "user", content: userContent },
    ],
    max_tokens: 400,
  });

  const description = completion.choices[0]?.message?.content?.trim() ?? "";
  log?.info({ description: description.slice(0, 100) }, "media: image interpreted");

  // Prefix so the auto-quote pipeline has full context
  const prefix = caption ? `[Imagem recebida — legenda: "${caption}"]\n` : "[Imagem recebida]\n";
  return `${prefix}${description}`;
}

/**
 * Extracts text from a PDF file.
 * Falls back to a note if extraction fails or returns no text.
 */
export async function interpretPdf(documentUrl: string, fileName?: string, log?: Logger): Promise<string> {
  log?.info({ documentUrl: documentUrl.slice(0, 60) }, "media: extracting PDF text");

  const buffer = await downloadBuffer(documentUrl);

  let text = "";
  try {
    const parsed = await pdfParse(buffer);
    text = parsed.text?.trim() ?? "";
  } catch (err) {
    log?.warn({ err }, "media: pdf-parse failed, treating as empty");
  }

  if (!text) {
    const name = fileName ?? "documento.pdf";
    log?.info({ fileName: name }, "media: PDF has no extractable text");
    return `[PDF recebido: "${name}" — sem texto extraível]`;
  }

  // Truncate very long PDFs to avoid token explosion
  const maxChars = 3000;
  const truncated = text.length > maxChars;
  const excerpt = truncated ? text.slice(0, maxChars) + "\n[...texto truncado...]" : text;

  const name = fileName ?? "documento.pdf";
  log?.info({ fileName: name, chars: text.length, truncated }, "media: PDF text extracted");
  return `[PDF recebido: "${name}"]\n${excerpt}`;
}
