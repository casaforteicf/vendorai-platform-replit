import mammoth from "mammoth";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { interpretPdfBuffer } from "./media-interpretation.js";

const MAX_TEXT_CHARS = 12_000;

function truncate(text: string) {
  const trimmed = text.trim();
  return trimmed.length > MAX_TEXT_CHARS
    ? `${trimmed.slice(0, MAX_TEXT_CHARS)}\n[...conteúdo truncado para contexto...]`
    : trimmed;
}

export async function interpretJarvisUpload(input: {
  tenantId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const { tenantId, buffer, mimeType, fileName } = input;

  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return interpretPdfBuffer(buffer, fileName);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    const text = truncate(result.value ?? "");
    return text ? `[Documento Word: "${fileName}"]\n${text}` : `[Documento Word: "${fileName}" — sem texto extraível]`;
  }

  if (mimeType.startsWith("text/") || /\.(txt|csv|md)$/i.test(fileName)) {
    const text = truncate(buffer.toString("utf8"));
    return text ? `[Arquivo de texto: "${fileName}"]\n${text}` : `[Arquivo de texto: "${fileName}" — vazio]`;
  }

  if (mimeType.startsWith("image/")) {
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const result = await gatewayCallOpenAI(
      tenantId,
      "document_extraction",
      [
        {
          role: "system",
          content:
            "Você é a camada de visão do JARVIS. Extraia fielmente o conteúdo útil da imagem para que outro agente possa responder à solicitação do usuário. Identifique textos, tabelas, números, colunas, produtos, valores, datas e estrutura visual relevante. Não invente conteúdo ilegível. Responda em português brasileiro e preserve tabelas em formato Markdown quando possível.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Interprete o arquivo de imagem \"${fileName}\".` },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        } as any,
      ],
      { model: "gpt-4o-mini", maxTokens: 1800 },
    );
    return `[Imagem interpretada: "${fileName}"]\n${truncate(result.content)}`;
  }

  throw new Error(`Tipo de arquivo não suportado pelo JARVIS: ${mimeType || fileName}`);
}
