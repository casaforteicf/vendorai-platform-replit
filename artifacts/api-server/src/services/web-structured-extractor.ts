import { z } from "zod";
import { callOpenAI } from "../lib/ai-gateway.js";
import type { RenderedFetchResult } from "./browser-fetch.js";

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type ExtractionSchema = Record<string, "string" | "number" | "boolean" | "string[]" | "number[]">;

function schemaInstruction(schema: ExtractionSchema) {
  return Object.entries(schema).map(([key, type]) => `${key}: ${type}`).join("\n");
}

export async function extractStructuredData(input: {
  tenantId: string;
  goal: string;
  page: Pick<RenderedFetchResult, "url" | "title" | "text" | "links" | "tables">;
  schema: ExtractionSchema;
}) {
  const result = await callOpenAI(
    input.tenantId,
    "agent_runtime",
    [
      {
        role: "system",
        content: [
          "Você é o Structured Extractor do Vendi Web Engine.",
          "Extraia somente informações explicitamente suportadas pelo conteúdo fornecido.",
          "Não invente valores ausentes. Use null ou [] quando não houver evidência.",
          "Responda SOMENTE JSON válido com as chaves solicitadas.",
          "Schema:",
          schemaInstruction(input.schema),
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          goal: input.goal,
          url: input.page.url,
          title: input.page.title,
          text: input.page.text.slice(0, 30000),
          links: input.page.links.slice(0, 100),
          tables: input.page.tables.slice(0, 20),
        }),
      },
    ],
    {
      temperature: 0,
      maxTokens: 1600,
      responseFormat: { type: "json_object" },
      billingScope: "platform_runtime",
    },
  );

  const parsed = JSON.parse(result.content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("STRUCTURED_EXTRACT_INVALID");
  }

  for (const [key, type] of Object.entries(input.schema)) {
    const value = (parsed as any)[key];
    if (value == null) continue;
    if (type === "string" && typeof value !== "string") throw new Error(`STRUCTURED_EXTRACT_TYPE:${key}`);
    if (type === "number" && typeof value !== "number") throw new Error(`STRUCTURED_EXTRACT_TYPE:${key}`);
    if (type === "boolean" && typeof value !== "boolean") throw new Error(`STRUCTURED_EXTRACT_TYPE:${key}`);
    if (type === "string[]" && (!Array.isArray(value) || !value.every(v => typeof v === "string"))) throw new Error(`STRUCTURED_EXTRACT_TYPE:${key}`);
    if (type === "number[]" && (!Array.isArray(value) || !value.every(v => typeof v === "number"))) throw new Error(`STRUCTURED_EXTRACT_TYPE:${key}`);
  }

  return {
    data: parsed as Record<string, z.infer<typeof scalarSchema> | string[] | number[]>,
    extractedAt: new Date().toISOString(),
  };
}
