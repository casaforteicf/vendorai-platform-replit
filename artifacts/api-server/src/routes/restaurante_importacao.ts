import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import {
  abCardapioItensTable,
  abCardapiosTable,
  abFichaInsumosTable,
  abFichasTecnicasTable,
  insumosTable,
} from "@workspace/db";
import { abAllowed, camposInvalidos, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();

/**
 * Restaurante — importação com preview e edição.
 *
 * Formatos: CSV/TSV, TXT, JSON, PDF e DOCX. A planilha (XLSX) é recusada com
 * instrução para exportar em CSV — evita aceitar um binário que não sabemos
 * interpretar e gerar receita errada em silêncio.
 *
 * O preview devolve itens normalizados; o frontend edita e só então chama
 * `confirmar`, que grava em transações por item e devolve erros parciais.
 */

const TIPOS = ["receitas", "cardapios", "ingredientes"] as const;
type TipoImportacao = (typeof TIPOS)[number];
const SERVICOS = ["cafe_manha", "almoco", "jantar", "outro"] as const;

const UNIDADES = new Set(["g", "ml", "un"]);

function normalizar(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function numero(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  // vírgula = decimal pt-BR (remove milhar com ponto); ponto sozinho = decimal.
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizarData(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return raw;
}

function unidadeBase(value: unknown): "g" | "ml" | "un" | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "kg" || raw === "quilo" || raw === "quilos") return "g";
  if (raw === "l" || raw === "litro" || raw === "litros") return "ml";
  if (raw === "un" || raw === "und" || raw === "unidade" || raw === "unidades" || raw === "pç" || raw === "pc") return "un";
  if (UNIDADES.has(raw)) return raw as "g" | "ml" | "un";
  return null;
}

function converterQuantidade(value: number, unidadeOriginal: unknown): { quantidade: number; unidade: "g" | "ml" | "un" } | null {
  const base = unidadeBase(unidadeOriginal);
  if (!base) return null;
  const raw = String(unidadeOriginal ?? "").trim().toLowerCase();
  if (raw === "kg" || raw === "quilo" || raw === "quilos") return { quantidade: value * 1000, unidade: "g" };
  if (raw === "l" || raw === "litro" || raw === "litros") return { quantidade: value * 1000, unidade: "ml" };
  return { quantidade: value, unidade: base };
}

export type InsumoImportado = {
  nome: string;
  unidade: "g" | "ml" | "un";
  quantidadePorPorcao: number;
  fatorCorrecao: number;
};
export type ReceitaImportada = {
  nome: string;
  rendimentoPorcoes: number;
  insumos: InsumoImportado[];
};
export type CardapioImportado = {
  nome: string;
  data: string;
  servico: (typeof SERVICOS)[number];
  itens: Array<{ receitaNome: string; porcoesPorPax: number }>;
};
export type IngredienteImportado = {
  nome: string;
  unidade: "g" | "ml" | "un";
  precoUnitario: string | null;
  categoria: string | null;
};

type Preview = {
  tipo: TipoImportacao;
  formato: string;
  itens: ReceitaImportada[] | CardapioImportado[] | IngredienteImportado[];
  avisos: string[];
};

export function parseDelimited(text: string): { rows: string[][]; delimiter: string } {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const counts = [
    { delimiter: ";", count: (sample.match(/;/g) ?? []).length },
    { delimiter: "\t", count: (sample.match(/\t/g) ?? []).length },
    { delimiter: ",", count: (sample.match(/,/g) ?? []).length },
  ].sort((a, b) => b.count - a.count);
  const delimiter = counts[0]?.count ? counts[0].delimiter : ";";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(field.trim()); field = ""; continue; }
    if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; continue; }
    if (char === "\r") continue;
    field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return { rows, delimiter };
}

function chaveHeader(value: string): string {
  return normalizar(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function acharColuna(headers: string[], aliases: string[]): number {
  const normalized = headers.map(chaveHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(chaveHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

export function parseIngredientesLinhas(linhas: string[], avisos: string[]): IngredienteImportado[] {
  const itens: IngredienteImportado[] = [];
  for (const linha of linhas) {
    const limpa = linha.replace(/^[-*•]\s*/, "").trim();
    if (!limpa) continue;
    const partes = limpa.split(/[;|]/).map((parte) => parte.trim());
    const nome = partes[0] ?? "";
    const unidadeRaw = String(partes[1] ?? "").trim().toLowerCase();
    if (["kg", "quilo", "quilos", "l", "litro", "litros"].includes(unidadeRaw)) {
      avisos.push(`Use g/ml (unidade base) para preço de ingrediente: ${limpa.slice(0, 120)}`);
      continue;
    }
    const unidade = unidadeBase(unidadeRaw);
    if (!nome || !unidade) {
      avisos.push(`Linha de ingrediente ignorada: ${limpa.slice(0, 120)}`);
      continue;
    }
    const preco = numero(partes[2] ?? "");
    itens.push({
      nome,
      unidade,
      precoUnitario: preco !== null ? preco.toFixed(4) : null,
      categoria: partes[3]?.trim() || null,
    });
  }
  return itens;
}

export function parseReceitasTexto(text: string, nomeArquivo: string, avisos: string[]): ReceitaImportada[] {
  const receitas: ReceitaImportada[] = [];
  let atual: ReceitaImportada | null = null;
  const inicio = nomeArquivo.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Receita importada";

  for (const linhaOriginal of text.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha) continue;
    const cabecalho = linha.match(/^(receita|ficha|prato)\s*[:\-]\s*(.+)$/i);
    if (cabecalho) {
      const nome = cabecalho[2]!.replace(/\s*[|;].*$/, "").trim();
      const rendimentoMatch = linha.match(/rendimento\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
      atual = { nome, rendimentoPorcoes: rendimentoMatch ? Number(rendimentoMatch[1]!.replace(",", ".")) : 1, insumos: [] };
      receitas.push(atual);
      continue;
    }
    const item = linha.replace(/^[-*•]\s*/, "").trim();
    if (!item) continue;
    if (!atual) {
      atual = { nome: inicio, rendimentoPorcoes: 1, insumos: [] };
      receitas.push(atual);
    }
    const partes = item.split(/[;|]/).map((parte) => parte.trim());
    let nome = partes[0] ?? "";
    let quantidade: number | null = null;
    let unidade: string | null = null;
    let fator = 1;
    if (partes.length >= 3) {
      quantidade = numero(partes[1] ?? "");
      unidade = partes[2] ?? "";
      fator = numero(partes[3] ?? "") ?? 1;
    } else {
      const match = item.match(/^(.+?)[\s:]+(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|un|und|unidade)\b(?:\s*(?:fc|fator)\s*[:=]?\s*(\d+(?:[.,]\d+)?))?/i);
      if (match) {
        nome = match[1]!.trim();
        quantidade = Number(match[2]!.replace(",", "."));
        unidade = match[3]!;
        fator = match[4] ? Number(match[4].replace(",", ".")) : 1;
      }
    }
    if (!nome || quantidade === null || !unidade) {
      avisos.push(`Ingrediente não reconhecido em "${atual.nome}": ${item.slice(0, 120)}`);
      continue;
    }
    const convertida = converterQuantidade(quantidade, unidade);
    if (!convertida) {
      avisos.push(`Unidade não suportada em "${atual.nome}": ${unidade}`);
      continue;
    }
    atual.insumos.push({
      nome,
      unidade: convertida.unidade,
      quantidadePorPorcao: convertida.quantidade,
      fatorCorrecao: fator > 0 ? fator : 1,
    });
  }
  return receitas.filter((receita) => receita.insumos.length > 0);
}

export function parseCardapiosTexto(text: string, avisos: string[]): CardapioImportado[] {
  const cardapios: CardapioImportado[] = [];
  let atual: CardapioImportado | null = null;
  for (const linhaOriginal of text.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha) continue;
    const cabecalho = linha.match(/^(cardapio|cardápio|menu)\s*[:\-]\s*(.+)$/i);
    if (cabecalho) {
      const nome = cabecalho[2]!.replace(/\s*[|;].*$/, "").trim();
      const dataMatch = linha.match(/data\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[\/.-]\d{2}[\/.-]\d{4})/i);
      const servicoRaw = normalizar(linha.match(/servi[cç]o\s*[:\-]?\s*([a-z_]+)/i)?.[1] ?? "outro");
      const servico = (SERVICOS as readonly string[]).includes(servicoRaw) ? servicoRaw as CardapioImportado["servico"] : "outro";
      atual = { nome, data: normalizarData(dataMatch?.[1] ?? new Date().toISOString().slice(0, 10)), servico, itens: [] };
      cardapios.push(atual);
      continue;
    }
    if (!atual) {
      avisos.push(`Item sem cardápio declarado: ${linha.slice(0, 120)}`);
      continue;
    }
    const item = linha.replace(/^[-*•]\s*/, "").trim();
    const partes = item.split(/[;|]/).map((parte) => parte.trim());
    let nome = partes[0] ?? "";
    let porcoes = numero(partes[1] ?? "") ?? 1;
    if (partes.length === 1) {
      const comDoisPontos = item.match(/^(.+?):\s*(\d+(?:[.,]\d+)?)\s*(?:por.*)?$/i);
      if (comDoisPontos) {
        nome = comDoisPontos[1]!.trim();
        porcoes = Number(comDoisPontos[2]!.replace(",", "."));
      }
    }
    if (!nome) { avisos.push(`Item vazio ignorado no cardápio "${atual.nome}"`); continue; }
    atual.itens.push({ receitaNome: nome, porcoesPorPax: porcoes > 0 ? porcoes : 1 });
  }
  return cardapios;
}

export function parseReceitasDelimitado(rows: string[][], avisos: string[]): ReceitaImportada[] {
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((cell) => cell);
  const primeira = headers.map(chaveHeader);
  const header = ["receita", "prato", "nome"].some((key) => primeira.includes(key))
    && ["ingrediente", "insumo", "item"].some((key) => primeira.includes(key));
  const idxReceita = header ? acharColuna(headers, ["receita", "prato", "nome"]) : 0;
  const idxRendimento = header ? acharColuna(headers, ["rendimento", "porcoes", "porções", "yield"]) : 1;
  const idxIngrediente = header ? acharColuna(headers, ["ingrediente", "insumo", "item"]) : 2;
  const idxQuantidade = header ? acharColuna(headers, ["quantidade", "qtd", "quantity"]) : 3;
  const idxUnidade = header ? acharColuna(headers, ["unidade", "unit", "medida"]) : 4;
  const idxFator = header ? acharColuna(headers, ["fator", "fator correcao", "fator de correcao", "fc"]) : 5;
  const dataRows = header ? rows.slice(1) : rows;
  const mapa = new Map<string, ReceitaImportada>();
  for (const row of dataRows) {
    const nome = String(row[idxReceita] ?? "").trim();
    const ingrediente = String(row[idxIngrediente] ?? "").trim();
    if (!nome || !ingrediente) { avisos.push(`Linha sem receita/ingrediente ignorada: ${row.join(" | ").slice(0, 120)}`); continue; }
    const chave = normalizar(nome);
    const receita = mapa.get(chave) ?? { nome, rendimentoPorcoes: numero(row[idxRendimento] ?? "") ?? 1, insumos: [] };
    const quantidade = numero(row[idxQuantidade] ?? "");
    const convertida = quantidade !== null ? converterQuantidade(quantidade, row[idxUnidade]) : null;
    if (!convertida) { avisos.push(`Quantidade/unidade inválida em "${nome}": ${row.join(" | ").slice(0, 120)}`); continue; }
    receita.insumos.push({
      nome: ingrediente,
      unidade: convertida.unidade,
      quantidadePorPorcao: convertida.quantidade,
      fatorCorrecao: numero(row[idxFator] ?? "") ?? 1,
    });
    mapa.set(chave, receita);
  }
  return [...mapa.values()].filter((receita) => receita.insumos.length > 0);
}

export function parseCardapiosDelimitado(rows: string[][]): CardapioImportado[] {
  if (rows.length === 0) return [];
  const headers = rows[0]!;
  const primeira = headers.map(chaveHeader);
  const header = primeira.includes("cardapio") || primeira.includes("menu");
  const idxCardapio = header ? acharColuna(headers, ["cardapio", "menu", "nome"]) : 0;
  const idxData = header ? acharColuna(headers, ["data", "date"]) : 1;
  const idxServico = header ? acharColuna(headers, ["servico", "serviço", "service"]) : 2;
  const idxReceita = header ? acharColuna(headers, ["receita", "prato", "ficha", "item"]) : 3;
  const idxPorcoes = header ? acharColuna(headers, ["porcoes", "porções", "porcoes por pax", "porcoes_por_pax"]) : 4;
  const dataRows = header ? rows.slice(1) : rows;
  const mapa = new Map<string, CardapioImportado>();
  for (const row of dataRows) {
    const nome = String(row[idxCardapio] ?? "").trim();
    const receita = String(row[idxReceita] ?? "").trim();
    if (!nome || !receita) continue;
    const data = normalizarData(row[idxData] ?? "") || new Date().toISOString().slice(0, 10);
    const servicoRaw = String(row[idxServico] ?? "").trim().toLowerCase();
    const servico = (SERVICOS as readonly string[]).includes(servicoRaw) ? servicoRaw as CardapioImportado["servico"] : "outro";
    const chave = `${normalizar(nome)}|${data}|${servico}`;
    const cardapio = mapa.get(chave) ?? { nome, data, servico, itens: [] };
    cardapio.itens.push({ receitaNome: receita, porcoesPorPax: numero(row[idxPorcoes] ?? "") ?? 1 });
    mapa.set(chave, cardapio);
  }
  return [...mapa.values()];
}

export function parseIngredientesDelimitado(rows: string[][], avisos: string[]): IngredienteImportado[] {
  if (rows.length === 0) return [];
  const headers = rows[0]!;
  const primeira = headers.map(chaveHeader);
  const header = primeira.includes("nome") || primeira.includes("ingrediente");
  const idxNome = header ? acharColuna(headers, ["nome", "ingrediente", "insumo"]) : 0;
  const idxUnidade = header ? acharColuna(headers, ["unidade", "unit", "medida"]) : 1;
  const idxPreco = header ? acharColuna(headers, ["preco", "preço", "preco unitario", "valor"]) : 2;
  const idxCategoria = header ? acharColuna(headers, ["categoria", "grupo"]) : 3;
  const dataRows = header ? rows.slice(1) : rows;
  const itens: IngredienteImportado[] = [];
  for (const row of dataRows) {
    const nome = String(row[idxNome] ?? "").trim();
    const unidadeRaw = String(row[idxUnidade] ?? "").trim().toLowerCase();
    if (["kg", "quilo", "quilos", "l", "litro", "litros"].includes(unidadeRaw)) {
      avisos.push(`Use g/ml (unidade base) para preço de ingrediente: ${row.join(" | ").slice(0, 120)}`);
      continue;
    }
    const unidade = unidadeBase(unidadeRaw);
    if (!nome || !unidade) { avisos.push(`Linha de ingrediente ignorada: ${row.join(" | ").slice(0, 120)}`); continue; }
    const preco = numero(row[idxPreco] ?? "");
    itens.push({ nome, unidade, precoUnitario: preco !== null ? preco.toFixed(4) : null, categoria: String(row[idxCategoria] ?? "").trim() || null });
  }
  return itens;
}

async function extrairTexto(buffer: Buffer, filename: string): Promise<{ texto: string; formato: string }> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const magic = buffer.subarray(0, 5).toString("ascii");
  if (magic === "%PDF-" || ext === "pdf") {
    const doc = await pdfParse(buffer, { max: 50 });
    return { texto: doc.text ?? "", formato: "pdf" };
  }
  if (magic.startsWith("PK") && (ext === "docx" || ext === "doc")) {
    const result = await mammoth.extractRawText({ buffer });
    return { texto: result.value ?? "", formato: "docx" };
  }
  if (magic.startsWith("PK") && ext === "xlsx") {
    throw new Error("XLSX não é suportado diretamente. Exporte a planilha como CSV e importe novamente.");
  }
  const texto = buffer.toString("utf8");
  const trimmed = texto.trim();
  if (ext === "json" || trimmed.startsWith("{") || trimmed.startsWith("[")) return { texto, formato: "json" };
  if (ext === "csv" || ext === "tsv" || (trimmed.includes(";") && trimmed.includes("\n")) || (trimmed.includes(",") && trimmed.includes("\n"))) {
    return { texto, formato: "csv" };
  }
  return { texto, formato: "txt" };
}

function parseJson(texto: string, tipo: TipoImportacao): unknown[] {
  const parsed = JSON.parse(texto) as unknown;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["itens", "receitas", "cardapios", "ingredientes", "data"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [parsed];
  }
  return [];
}

function normalizarJson(tipo: TipoImportacao, rows: unknown[], avisos: string[]): ReceitaImportada[] | CardapioImportado[] | IngredienteImportado[] {
  if (tipo === "ingredientes") {
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      const unidadeRaw = String(r.unidade ?? r.unit ?? "").trim().toLowerCase();
      if (["kg", "quilo", "quilos", "l", "litro", "litros"].includes(unidadeRaw)) {
        avisos.push(`Use g/ml (unidade base) para preço de ingrediente: ${JSON.stringify(row).slice(0, 120)}`);
        return [];
      }
      const unidade = unidadeBase(unidadeRaw);
      if (!r.nome || !unidade) { avisos.push(`Ingrediente JSON inválido: ${JSON.stringify(row).slice(0, 120)}`); return []; }
      const preco = numero(r.precoUnitario ?? r.preco ?? r.price);
      return [{ nome: String(r.nome), unidade, precoUnitario: preco !== null ? preco.toFixed(4) : null, categoria: r.categoria ? String(r.categoria) : null }];
    });
  }
  if (tipo === "receitas") {
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      const nome = String(r.nome ?? r.receita ?? r.title ?? "").trim();
      const insumosRaw = Array.isArray(r.insumos) ? r.insumos : Array.isArray(r.ingredientes) ? r.ingredientes : [];
      if (!nome || insumosRaw.length === 0) return [];
      const insumos = insumosRaw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const i = item as Record<string, unknown>;
        const quantidade = numero(i.quantidadePorPorcao ?? i.quantidade ?? i.qtd);
        const convertida = quantidade !== null ? converterQuantidade(quantidade, i.unidade) : null;
        if (!i.nome || !convertida) { avisos.push(`Insumo inválido na receita "${nome}"`); return []; }
        return [{ nome: String(i.nome), unidade: convertida.unidade, quantidadePorPorcao: convertida.quantidade, fatorCorrecao: numero(i.fatorCorrecao ?? i.fator) ?? 1 }];
      });
      return insumos.length ? [{ nome, rendimentoPorcoes: numero(r.rendimentoPorcoes ?? r.rendimento) ?? 1, insumos }] : [];
    });
  }
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const nome = String(r.nome ?? r.cardapio ?? "").trim();
    const itensRaw = Array.isArray(r.itens) ? r.itens : [];
    if (!nome || itensRaw.length === 0) return [];
    const data = normalizarData(r.data) || new Date().toISOString().slice(0, 10);
    const servicoRaw = String(r.servico ?? "outro").toLowerCase();
    const servico = (SERVICOS as readonly string[]).includes(servicoRaw) ? servicoRaw as CardapioImportado["servico"] : "outro";
    const itens = itensRaw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const i = item as Record<string, unknown>;
      const receitaNome = String(i.receitaNome ?? i.receita ?? i.nome ?? "").trim();
      if (!receitaNome) return [];
      return [{ receitaNome, porcoesPorPax: numero(i.porcoesPorPax ?? i.porcoes) ?? 1 }];
    });
    return itens.length ? [{ nome, data, servico, itens }] : [];
  });
}

function base64Valido(value: string): Buffer | null {
  try {
    const buffer = Buffer.from(value, "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

router.post("/tenants/:tenantId/restaurante/importacoes/preview", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    tipo: z.enum(TIPOS),
    filename: z.string().trim().min(1).max(200),
    base64: z.string().min(1),
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Payload inválido", fields: camposInvalidos(input.error) });

  const buffer = base64Valido(input.data.base64);
  if (!buffer) return res.status(422).json({ error: "Arquivo vazio ou base64 inválido" });
  if (buffer.length > 8_000_000) return res.status(422).json({ error: "Arquivo maior que 8 MB" });

  const avisos: string[] = [];
  try {
    const { texto, formato } = await extrairTexto(buffer, input.data.filename);
    let itens: ReceitaImportada[] | CardapioImportado[] | IngredienteImportado[];
    if (formato === "json") {
      itens = normalizarJson(input.data.tipo, parseJson(texto, input.data.tipo), avisos);
    } else if (formato === "csv") {
      const { rows } = parseDelimited(texto);
      itens = input.data.tipo === "receitas"
        ? parseReceitasDelimitado(rows, avisos)
        : input.data.tipo === "cardapios"
          ? parseCardapiosDelimitado(rows)
          : parseIngredientesDelimitado(rows, avisos);
    } else if (input.data.tipo === "receitas") {
      itens = parseReceitasTexto(texto, input.data.filename, avisos);
    } else if (input.data.tipo === "cardapios") {
      itens = parseCardapiosTexto(texto, avisos);
    } else {
      itens = parseIngredientesLinhas(texto.split(/\r?\n/), avisos);
    }

    if (itens.length === 0 && formato === "txt") {
      return res.status(422).json({
        error: "Não foi possível reconhecer itens no texto. Use o modelo CSV ou revise o arquivo.",
        formato,
        avisos,
      });
    }
    return res.json({ tipo: input.data.tipo, formato, itens, avisos } satisfies Preview);
  } catch (error) {
    console.error("[restaurante-importacao] preview", error);
    const message = error instanceof Error ? error.message : "Falha ao ler o arquivo";
    return res.status(422).json({ error: message });
  }
});

const insumoImportadoSchema = z.object({
  nome: z.string().trim().min(1).max(500),
  unidade: z.enum(["g", "ml", "un"]),
  quantidadePorPorcao: z.number().finite().positive(),
  fatorCorrecao: z.number().finite().positive().default(1),
});

const confirmarSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("ingredientes"),
    itens: z.array(z.object({
      nome: z.string().trim().min(1).max(500),
      unidade: z.enum(["g", "ml", "un"]),
      precoUnitario: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
      categoria: z.string().trim().max(255).nullable().optional(),
    })).min(1).max(2000),
  }),
  z.object({
    tipo: z.literal("receitas"),
    itens: z.array(z.object({
      nome: z.string().trim().min(1).max(120),
      rendimentoPorcoes: z.number().finite().positive(),
      insumos: z.array(insumoImportadoSchema).min(1).max(200),
    })).min(1).max(500),
  }),
  z.object({
    tipo: z.literal("cardapios"),
    itens: z.array(z.object({
      nome: z.string().trim().min(1).max(120),
      data: z.iso.date(),
      servico: z.enum(SERVICOS),
      itens: z.array(z.object({
        receitaNome: z.string().trim().min(1).max(120),
        porcoesPorPax: z.number().finite().positive(),
      })).min(1).max(200),
    })).min(1).max(500),
  }),
]);

async function obterOuCriarInsumo(tx: any, tenantId: string, nome: string, unidade: "g" | "ml" | "un", preco?: string | null) {
  const [existente] = await tx
    .select({ id: insumosTable.id })
    .from(insumosTable)
    .where(and(eq(insumosTable.tenantId, tenantId), sql`lower(btrim(${insumosTable.nome})) = lower(btrim(${nome}))`))
    .limit(1);
  if (existente) {
    if (preco) {
      await tx.update(insumosTable).set({ precoUnitario: preco, updatedAt: new Date() }).where(eq(insumosTable.id, existente.id));
    }
    return existente.id as string;
  }
  const [criado] = await tx.insert(insumosTable).values({ tenantId, nome, unidade, precoUnitario: preco ?? null }).returning({ id: insumosTable.id });
  return criado!.id as string;
}

router.post("/tenants/:tenantId/restaurante/importacoes/confirmar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = confirmarSchema.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Itens inválidos", fields: camposInvalidos(input.error) });

  const resultado = { criados: 0, atualizados: 0, erros: [] as string[] };
  try {
    if (input.data.tipo === "ingredientes") {
      for (const item of input.data.itens) {
        try {
          await withTenantTx(tenantId, async (tx) => {
            const [existente] = await tx
              .select({ id: insumosTable.id })
              .from(insumosTable)
              .where(and(eq(insumosTable.tenantId, tenantId), sql`lower(btrim(${insumosTable.nome})) = lower(btrim(${item.nome}))`))
              .limit(1);
            if (existente) {
              await tx.update(insumosTable).set({
                unidade: item.unidade,
                precoUnitario: item.precoUnitario ?? null,
                categoria: item.categoria ?? null,
                updatedAt: new Date(),
              }).where(eq(insumosTable.id, existente.id));
              resultado.atualizados += 1;
            } else {
              await tx.insert(insumosTable).values({ tenantId, nome: item.nome, unidade: item.unidade, precoUnitario: item.precoUnitario ?? null, categoria: item.categoria ?? null });
              resultado.criados += 1;
            }
          });
        } catch (error) {
          resultado.erros.push(`${item.nome}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (input.data.tipo === "receitas") {
      for (const receita of input.data.itens) {
        try {
          await withTenantTx(tenantId, async (tx) => {
            const consolidados = new Map<string, InsumoImportado>();
            for (const insumo of receita.insumos) {
              const chave = normalizar(insumo.nome);
              const atual = consolidados.get(chave);
              if (atual) {
                // A ficha tem índice único por nome; duas unidades diferentes
                // para o mesmo ingrediente não podem ser somadas sem conversão.
                if (atual.unidade !== insumo.unidade) {
                  throw new Error(`Ingrediente "${insumo.nome}" repetido com unidades diferentes (${atual.unidade} e ${insumo.unidade})`);
                }
                atual.quantidadePorPorcao += insumo.quantidadePorPorcao;
              } else {
                consolidados.set(chave, { ...insumo });
              }
            }
            const insumosConsolidados = [...consolidados.values()];
            const insumoIds: string[] = [];
            for (const insumo of insumosConsolidados) {
              insumoIds.push(await obterOuCriarInsumo(tx, tenantId, insumo.nome, insumo.unidade));
            }
            const [existente] = await tx
              .select({ id: abFichasTecnicasTable.id })
              .from(abFichasTecnicasTable)
              .where(and(eq(abFichasTecnicasTable.tenantId, tenantId), sql`lower(btrim(${abFichasTecnicasTable.nome})) = lower(btrim(${receita.nome}))`))
              .limit(1);
            let fichaId: string;
            if (existente) {
              fichaId = existente.id;
              await tx.update(abFichasTecnicasTable).set({ rendimentoPorcoes: String(receita.rendimentoPorcoes), updatedAt: new Date() }).where(eq(abFichasTecnicasTable.id, existente.id));
              await tx.delete(abFichaInsumosTable).where(and(eq(abFichaInsumosTable.tenantId, tenantId), eq(abFichaInsumosTable.fichaId, existente.id)));
              resultado.atualizados += 1;
            } else {
              const [criada] = await tx.insert(abFichasTecnicasTable).values({ tenantId, nome: receita.nome, rendimentoPorcoes: String(receita.rendimentoPorcoes) }).returning({ id: abFichasTecnicasTable.id });
              fichaId = criada!.id;
              resultado.criados += 1;
            }
            await tx.insert(abFichaInsumosTable).values(insumosConsolidados.map((insumo, index) => ({
              tenantId,
              fichaId,
              insumoId: insumoIds[index] ?? null,
              insumoNome: insumo.nome,
              unidadeBase: insumo.unidade,
              quantidadePorPorcao: String(insumo.quantidadePorPorcao),
              fatorCorrecao: String(insumo.fatorCorrecao),
              ordem: index,
            })));
          });
        } catch (error) {
          resultado.erros.push(`${receita.nome}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else {
      for (const menu of input.data.itens) {
        try {
          await withTenantTx(tenantId, async (tx) => {
            const fichas = await tx
              .select({ id: abFichasTecnicasTable.id, nome: abFichasTecnicasTable.nome })
              .from(abFichasTecnicasTable)
              .where(eq(abFichasTecnicasTable.tenantId, tenantId));
            const porNome = new Map(fichas.map((ficha: { id: string; nome: string }) => [normalizar(ficha.nome), ficha]));
            const consolidados = new Map<string, { fichaId: string; fichaNome: string; porcoesPorPax: number }>();
            for (const item of menu.itens) {
              const ficha = porNome.get(normalizar(item.receitaNome)) as { id: string; nome: string } | undefined;
              if (!ficha) throw new Error(`Receita não encontrada: ${item.receitaNome}`);
              const atual = consolidados.get(ficha.id);
              if (atual) atual.porcoesPorPax += item.porcoesPorPax;
              else consolidados.set(ficha.id, { fichaId: ficha.id, fichaNome: ficha.nome, porcoesPorPax: item.porcoesPorPax });
            }
            const itens = [...consolidados.values()].map((item, index) => ({ ...item, ordem: index }));
            const [existente] = await tx
              .select({ id: abCardapiosTable.id })
              .from(abCardapiosTable)
              .where(and(eq(abCardapiosTable.tenantId, tenantId), eq(abCardapiosTable.data, menu.data), eq(abCardapiosTable.servico, menu.servico), sql`lower(btrim(${abCardapiosTable.nome})) = lower(btrim(${menu.nome}))`))
              .limit(1);
            let cardapioId: string;
            if (existente) {
              cardapioId = existente.id;
              await tx.update(abCardapiosTable).set({ updatedAt: new Date() }).where(eq(abCardapiosTable.id, existente.id));
              await tx.delete(abCardapioItensTable).where(and(eq(abCardapioItensTable.tenantId, tenantId), eq(abCardapioItensTable.cardapioId, existente.id)));
              resultado.atualizados += 1;
            } else {
              const [criado] = await tx.insert(abCardapiosTable).values({ tenantId, nome: menu.nome, data: menu.data, servico: menu.servico, createdBy: req.user!.sub }).returning({ id: abCardapiosTable.id });
              cardapioId = criado!.id;
              resultado.criados += 1;
            }
            await tx.insert(abCardapioItensTable).values(itens.map((item) => ({ tenantId, cardapioId, ...item })));
          });
        } catch (error) {
          resultado.erros.push(`${menu.nome}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[restaurante-importacao] confirmar", error);
    return res.status(500).json({ error: "Falha ao confirmar a importação", ...resultado });
  }
});

export default router;
