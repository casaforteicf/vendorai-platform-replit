import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { callOpenAI as gatewayCallOpenAI, callOpenAIFileExtraction } from "./ai-gateway.js";
import { z } from "zod/v4";

// ─── Quote / Budget extraction ────────────────────────────────────────────────

export const quoteExtractionResultSchema = z.object({
  titulo: z.string().nullable().optional(),
  numeroDocumento: z.string().nullable().optional(),
  dataEmissao: z.string().nullable().optional(),
  valorTotal: z.number().nullable().optional(),
  cliente: z.string().nullable().optional(),
  clienteDocumento: z.string().nullable().optional(),
  clienteTelefone: z.string().nullable().optional(),
  clienteEmail: z.string().nullable().optional(),
  clienteCidade: z.string().nullable().optional(),
  clienteEstado: z.string().nullable().optional(),
  clienteCep: z.string().nullable().optional(),
  clienteEndereco: z.string().nullable().optional(),
  fornecedor: z.string().nullable().optional(),
  fornecedorDocumento: z.string().nullable().optional(),
  fornecedorEndereco: z.string().nullable().optional(),
  validade: z.string().nullable().optional(),
  desconto: z.number().nullable().optional(),
  acrescimos: z.number().nullable().optional(),
  frete: z.number().nullable().optional(),
  impostos: z.number().nullable().optional(),
  formaPagamento: z.string().nullable().optional(),
  condPagamento: z.string().nullable().optional(),
  prazoEntrega: z.string().nullable().optional(),
  itens: z
    .array(
      z.object({
        codigo: z.string().nullable().optional(),
        descricao: z.string(),
        unidade: z.string().nullable().optional(),
        quantidade: z.number().nullable().optional(),
        valorUnitario: z.number().nullable().optional(),
        valorTotal: z.number().nullable().optional(),
        grupo: z.string().nullable().optional(),
        etapa: z.string().nullable().optional(),
        observacoes: z.string().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
  inclusoes: z.array(z.string()).nullable().optional(),
  exclusoes: z.array(z.string()).nullable().optional(),
  clausulas: z.array(z.string()).nullable().optional(),
  informacoesAdicionais: z.array(z.string()).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  confianca: z.number().nullable().optional(),
});

export type QuoteExtractionResult = z.infer<typeof quoteExtractionResultSchema>;

function parseLooseNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return value as null | undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLooseString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value as null | undefined;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function normalizeQuoteExtractionPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = { ...input };

  const stringFields = [
    "titulo", "numeroDocumento", "dataEmissao", "cliente", "clienteDocumento",
    "clienteTelefone", "clienteEmail", "clienteCidade", "clienteEstado", "clienteCep",
    "clienteEndereco", "fornecedor", "fornecedorDocumento", "fornecedorEndereco",
    "validade", "formaPagamento", "condPagamento", "prazoEntrega", "observacoes",
  ];
  for (const key of stringFields) output[key] = parseLooseString(input[key]);

  const numericFields = ["valorTotal", "desconto", "acrescimos", "frete", "impostos", "confianca"];
  for (const key of numericFields) output[key] = parseLooseNumber(input[key]);

  if (Array.isArray(input.itens)) {
    output.itens = input.itens
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          ...row,
          codigo: parseLooseString(row.codigo),
          descricao: parseLooseString(row.descricao),
          unidade: parseLooseString(row.unidade),
          quantidade: parseLooseNumber(row.quantidade),
          valorUnitario: parseLooseNumber(row.valorUnitario),
          valorTotal: parseLooseNumber(row.valorTotal),
          grupo: parseLooseString(row.grupo),
          etapa: parseLooseString(row.etapa),
          observacoes: parseLooseString(row.observacoes),
        };
      })
      .filter((item) => typeof item.descricao === "string" && item.descricao.length > 0);
  }

  for (const key of ["inclusoes", "exclusoes", "clausulas", "informacoesAdicionais"]) {
    if (Array.isArray(input[key])) {
      output[key] = (input[key] as unknown[])
        .map(parseLooseString)
        .filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  }

  return output;
}

function parseQuoteExtraction(raw: string): QuoteExtractionResult {
  const parsed = JSON.parse(raw || "{}");
  const normalized = normalizeQuoteExtractionPayload(parsed);
  const result = quoteExtractionResultSchema.safeParse(normalized);
  if (result.success) return validateQuoteExtraction(result.data);
  return {
    confianca: 0,
    informacoesAdicionais: ["A leitura retornou dados parcialmente inválidos. Revise o orçamento importado antes de salvar."],
  };
}

function normalizeComparable(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function validateQuoteExtraction(data: QuoteExtractionResult): QuoteExtractionResult {
  const warnings = [...(data.informacoesAdicionais ?? [])];
  let confidence = Math.max(0, Math.min(1, data.confianca ?? 0.75));

  const phoneDigits = (data.clienteTelefone ?? "").replace(/\D/g, "");
  if (data.clienteTelefone && (phoneDigits.length < 10 || phoneDigits.length > 13)) {
    warnings.push("Telefone do cliente com formato incomum; conferir no documento original.");
    confidence -= 0.08;
  }

  const cepDigits = (data.clienteCep ?? "").replace(/\D/g, "");
  if (data.clienteCep && cepDigits.length !== 8) {
    warnings.push("CEP do cliente não possui 8 dígitos; conferir.");
    confidence -= 0.06;
  }

  const documentDigits = (data.clienteDocumento ?? "").replace(/\D/g, "");
  if (data.clienteDocumento && ![11, 14].includes(documentDigits.length)) {
    warnings.push("CPF/CNPJ do cliente com quantidade de dígitos incomum; conferir.");
    confidence -= 0.08;
  }

  if (data.clienteEstado && !/^[A-Za-z]{2}$/.test(data.clienteEstado.trim())) {
    warnings.push("UF/estado do cliente não está no formato esperado; conferir.");
    confidence -= 0.04;
  }

  const clientKey = normalizeComparable(data.cliente);
  const supplierKey = normalizeComparable(data.fornecedor);
  if (clientKey && supplierKey && clientKey === supplierKey) {
    warnings.push("Cliente e fornecedor foram identificados com o mesmo nome; risco de inversão entre destinatário e emitente.");
    confidence -= 0.15;
  }

  if (!data.cliente && (data.clienteTelefone || data.clienteDocumento || data.clienteEndereco)) {
    warnings.push("Há dados cadastrais de cliente, mas o nome/razão social não foi identificado com segurança.");
    confidence -= 0.08;
  }

  const lineTotals = (data.itens ?? [])
    .map((item) => item.valorTotal)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (lineTotals.length > 0 && typeof data.valorTotal === "number" && Number.isFinite(data.valorTotal)) {
    const itemSum = lineTotals.reduce((sum, value) => sum + value, 0);
    const expectedFinal = itemSum
      + (data.frete ?? 0)
      + (data.impostos ?? 0)
      + (data.acrescimos ?? 0)
      - (data.desconto ?? 0);
    const tolerance = Math.max(1, Math.abs(data.valorTotal) * 0.015);
    if (Math.abs(expectedFinal - data.valorTotal) > tolerance) {
      warnings.push(
        `Conferir total: soma estruturada dos itens/ajustes (${expectedFinal.toFixed(2)}) difere do total informado no documento (${data.valorTotal.toFixed(2)}).`
      );
      confidence -= 0.10;
    }
  }

  return {
    ...data,
    confianca: Math.max(0, Math.min(1, confidence)),
    informacoesAdicionais: warnings.length > 0 ? Array.from(new Set(warnings)) : data.informacoesAdicionais,
  };
}

async function structureQuoteFromTranscript(
  tenantId: string,
  transcript: string,
): Promise<QuoteExtractionResult> {
  const aiResult = await gatewayCallOpenAI(
    tenantId,
    "document_extraction",
    [
      { role: "system", content: QUOTE_EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "A seguir está uma TRANSCRIÇÃO fiel do documento. Estruture somente o que estiver explicitamente presente. " +
          "Não complete lacunas e não troque emitente/fornecedor por cliente/destinatário.\n\n" +
          transcript,
      },
    ],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 4500, temperature: 0 },
  );
  return parseQuoteExtraction(aiResult.content || "{}");
}

// ─── Financial entry (lançamento) extraction — nota fiscal, recibo, boleto ───
// D-004: novo lançamento no ERP por foto/upload -- IA identifica o tipo de
// documento, extrai os dados e devolve pra revisão antes de lançar de
// verdade (usuário aprova ou edita, nunca lança direto sem conferir).

export const lancamentoExtractionResultSchema = z.object({
  tipoDocumento: z.enum(["nfe", "nfse", "recibo", "boleto", "outro"]).nullable().optional(),
  tipo: z.enum(["receber", "pagar"]).nullable().optional(),
  categoria: z.enum(["receita", "custo", "despesa", "imposto", "investimento"]).nullable().optional(),
  descricao: z.string().nullable().optional(),
  pessoa: z.string().nullable().optional(),
  documento: z.string().nullable().optional(),
  valorOriginal: z.number().nullable().optional(),
  vencimento: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  chave: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  confianca: z.number().nullable().optional(),
});

export type LancamentoExtractionResult = z.infer<typeof lancamentoExtractionResultSchema>;

const LANCAMENTO_EXTRACTION_SYSTEM_PROMPT = `Você é um analisador especializado em documentos financeiros brasileiros: nota fiscal (NFe/NFSe), recibo e boleto.
Analise o documento fornecido, identifique o tipo e extraia os dados pra um lançamento financeiro.
Retorne APENAS um JSON válido (sem texto extra) com os campos abaixo. Omita ou deixe null campos não encontrados.

{
  "tipoDocumento": "nfe" | "nfse" | "recibo" | "boleto" | "outro",
  "tipo": "receber" (empresa vai RECEBER esse valor, ex: nota fiscal de venda emitida pela empresa) ou "pagar" (empresa vai PAGAR, ex: nota de compra/serviço recebido, boleto a pagar),
  "categoria": "receita" | "custo" | "despesa" | "imposto" | "investimento",
  "descricao": "descrição curta do lançamento (ex: 'Compra de material elétrico - Fornecedor XYZ')",
  "pessoa": "nome da pessoa ou empresa (emitente se for pagar, destinatário se for receber)",
  "documento": "CNPJ ou CPF da pessoa, só números",
  "valorOriginal": número_decimal_sem_símbolo_ou_null,
  "vencimento": "data de vencimento/pagamento em formato YYYY-MM-DD ou null",
  "numero": "número da nota/documento",
  "chave": "chave de acesso da NFe/NFSe, se houver (44 dígitos)",
  "observacoes": "informações adicionais relevantes (máx 300 chars)",
  "confianca": 0.0
}

Instruções:
- valorOriginal: use SOMENTE o valor numérico (ex: 1580.50), sem R$, sem pontos de milhar
- confianca: número entre 0 e 1 indicando sua confiança na extração
- Retorne SOMENTE o JSON, nenhum texto fora dele`;

export async function extractLancamentoData(
  files: Array<{ buffer: Buffer; mimeType: string; originalName: string }>,
  tenantId: string
): Promise<LancamentoExtractionResult> {
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
      { role: "system", content: LANCAMENTO_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: combinedText },
    ],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1500, temperature: 0.1 },
  );

  const raw = aiResult.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    return lancamentoExtractionResultSchema.parse(parsed);
  } catch {
    return { confianca: 0 };
  }
}


const QUOTE_EXTRACTION_SYSTEM_PROMPT = `Você é um analisador especializado em orçamentos, propostas comerciais, cotações e contratos.
Sua tarefa é RECONSTRUIR fielmente o documento para que ele possa virar um orçamento editável no Vendor.ai.

Regras obrigatórias:
- NÃO resuma itens.
- NÃO agrupe linhas diferentes em um item genérico.
- NÃO invente valores, quantidades, códigos, unidades, condições ou cláusulas.
- Preserve a descrição dos itens com o máximo de fidelidade possível.
- Extraia TODAS as linhas comerciais identificáveis do documento.
- Se o documento tiver grupos, capítulos, etapas ou seções, preserve essa hierarquia em "grupo" e/ou "etapa".
- Quando houver valor total da linha, preserve-o. Quando houver quantidade e valor unitário, preserve ambos.
- Extraia também as informações comerciais, contratuais e cadastrais do CLIENTE, com atenção especial a nome/razão social, CPF/CNPJ, telefone/WhatsApp, e-mail, cidade, UF, CEP e endereço.
- Não confunda dados do fornecedor/emitente com os dados do cliente/destinatário. Use o rótulo, posição e contexto do documento para decidir.
- Se cidade/UF aparecerem dentro do endereço do cliente, extraia também nos campos clienteCidade e clienteEstado quando houver segurança.
- Campos não encontrados devem ser omitidos ou null.
- Datas devem usar YYYY-MM-DD quando for possível determinar a data com segurança.
- Retorne SOMENTE JSON válido, sem texto fora dele.

Formato:
{
  "titulo": "título/objeto do documento",
  "numeroDocumento": "número do orçamento/proposta/contrato",
  "dataEmissao": "YYYY-MM-DD ou null",
  "valorTotal": 0,
  "cliente": "nome/razão social do cliente",
  "clienteDocumento": "CPF/CNPJ/documento",
  "clienteTelefone": "telefone/WhatsApp do cliente exatamente como aparece no documento",
  "clienteEmail": "e-mail do cliente",
  "clienteCidade": "cidade do cliente",
  "clienteEstado": "UF/estado do cliente",
  "clienteCep": "CEP do cliente",
  "clienteEndereco": "endereço completo do cliente",
  "fornecedor": "nome/razão social do fornecedor",
  "fornecedorDocumento": "CPF/CNPJ/documento",
  "fornecedorEndereco": "endereço do fornecedor",
  "validade": "YYYY-MM-DD ou null",
  "desconto": 0,
  "acrescimos": 0,
  "frete": 0,
  "impostos": 0,
  "formaPagamento": "forma de pagamento",
  "condPagamento": "condições de pagamento completas",
  "prazoEntrega": "prazo de entrega/execução",
  "itens": [
    {
      "codigo": "código/referência/SKU ou null",
      "descricao": "descrição completa do item/serviço",
      "unidade": "unidade original, ex.: un, m², m, kg, serviço",
      "quantidade": 0,
      "valorUnitario": 0,
      "valorTotal": 0,
      "grupo": "grupo/categoria/seção do documento ou null",
      "etapa": "etapa/fase quando existir ou null",
      "observacoes": "observação específica da linha ou null"
    }
  ],
  "inclusoes": ["itens/serviços expressamente inclusos"],
  "exclusoes": ["itens/serviços expressamente não inclusos"],
  "clausulas": ["cláusulas e condições contratuais relevantes, preservando o conteúdo"],
  "informacoesAdicionais": ["outras informações relevantes que não se encaixem nos campos acima"],
  "observacoes": "observações gerais do documento",
  "confianca": 0.0
}

Validação:
- valorTotal e demais valores monetários devem ser números sem símbolo de moeda e sem separador de milhar.
- Se houver desconto, valorTotal deve refletir o total final apresentado no documento.
- Se valorUnitario estiver ausente mas quantidade e valorTotal existirem, NÃO calcule nem invente o unitário; deixe null.
- Se quantidade estiver ausente, deixe null em vez de assumir 1.
- Se unidade estiver ausente, deixe null; nunca deduza a unidade pelo tipo do produto.
- Não corrija, normalize, resuma ou reescreva descrições comerciais.
- Preserve a ordem em que os itens aparecem no documento.
- Se subtotal/total da linha divergir da multiplicação matemática, preserve o valor apresentado no documento e não "corrija" silenciosamente.
- Qualquer informação relevante sem campo próprio deve ser colocada em informacoesAdicionais; nunca descarte conteúdo.
- confianca deve ser um número entre 0 e 1 indicando a confiança geral da reconstrução.
`;

export async function extractQuoteData(
  files: Array<{ buffer: Buffer; mimeType: string; originalName: string }>,
  tenantId: string
): Promise<QuoteExtractionResult> {
  const texts: string[] = [];
  const scannedPdfs: Array<{ buffer: Buffer; mimeType: string; originalName: string }> = [];

  for (const file of files) {
    try {
      const text = await extractTextFromBuffer(file.buffer, file.mimeType, file.originalName, tenantId);
      if (text.trim().length > 20) {
        texts.push(`=== ${file.originalName} ===\n${text.trim()}`);
      } else if (file.mimeType === "application/pdf" || file.originalName.toLowerCase().endsWith(".pdf")) {
        scannedPdfs.push(file);
      }
    } catch {
      if (file.mimeType === "application/pdf" || file.originalName.toLowerCase().endsWith(".pdf")) {
        scannedPdfs.push(file);
      }
    }
  }

  // PDF escaneado/sem camada de texto: leitura em duas fases.
  // 1) transcreve fielmente; 2) estrutura/valida. Isso reduz inversões entre
  // cliente/destinatário e fornecedor/emitente e evita completar dados ausentes.
  if (texts.length === 0 && scannedPdfs.length === 1) {
    const file = scannedPdfs[0];
    try {
      const visual = await callOpenAIFileExtraction(
        tenantId,
        "document_extraction",
        { buffer: file.buffer, mimeType: file.mimeType || "application/pdf", filename: file.originalName },
        "Transcreva fielmente o PDF página por página. Preserve títulos, rótulos, tabelas, linhas, nomes, CPF/CNPJ, telefones, e-mails, endereços, cidade/UF/CEP, códigos, descrições, quantidades, unidades, preços, totais, condições e observações. Não resuma, não interprete, não reordene e não invente. Retorne somente a transcrição.",
        { model: "gpt-4.1-mini", maxTokens: 7000 },
      );
      const transcript = visual.content.trim();
      if (!transcript) {
        return { confianca: 0, informacoesAdicionais: ["PDF visual sem texto legível suficiente para importação automática."] };
      }
      return await structureQuoteFromTranscript(tenantId, `=== ${file.originalName} ===\n${transcript}`);
    } catch {
      return { confianca: 0, informacoesAdicionais: ["PDF visual não pôde ser lido com segurança; conferir manualmente."] };
    }
  }

  // Em importações compostas, incorpora a extração visual como contexto
  // estruturado para que o consolidado final preserve todos os documentos.
  for (const file of scannedPdfs) {
    try {
      const visual = await callOpenAIFileExtraction(
        tenantId,
        "document_extraction",
        { buffer: file.buffer, mimeType: file.mimeType || "application/pdf", filename: file.originalName },
        "Transcreva fielmente o PDF página por página, preservando rótulos, tabelas, dados cadastrais, itens, quantidades, unidades, preços, totais, condições e observações. Não resuma, não interprete e não invente.",
        { model: "gpt-4.1-mini", maxTokens: 7000 },
      );
      if (visual.content.trim()) texts.push(`=== ${file.originalName} (transcrição visual) ===\n${visual.content.trim()}`);
    } catch {
      texts.push(`=== ${file.originalName} ===\n[PDF sem camada de texto; leitura visual indisponível. Exigir conferência manual.]`);
    }
  }

  if (texts.length === 0) return { confianca: 0 };

  let combinedText = texts.join("\n\n");
  if (combinedText.length > MAX_TEXT_LENGTH) {
    combinedText = combinedText.slice(0, MAX_TEXT_LENGTH) + "\n[texto truncado]";
  }

  try {
    return await structureQuoteFromTranscript(tenantId, combinedText);
  } catch {
    return { confianca: 0, informacoesAdicionais: ["Não foi possível interpretar a resposta da leitura automática."] };
  }
}

const MAX_TEXT_LENGTH = 30_000;

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
        text: "Transcreva fielmente TODO o texto visível desta imagem. Preserve a ordem visual, quebras de linha, títulos, rótulos e tabelas; mantenha nomes, telefones, e-mails, CPF/CNPJ, endereços, cidades/UF/CEP, números de documento, códigos, itens, quantidades, unidades, preços, totais, condições de pagamento e observações. Não resuma, não interprete, não corrija e não descarte dados cadastrais.",
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
      { model: "gpt-4o-mini", maxTokens: 4000, temperature: 0 },
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
