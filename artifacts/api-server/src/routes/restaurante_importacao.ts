import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import {
  abBriffingPrevisoesTable,
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

const TIPOS = ["receitas", "cardapios", "ingredientes", "briffing"] as const;
type TipoImportacao = (typeof TIPOS)[number];
const SERVICOS = ["cafe_manha", "almoco", "jantar", "outro"] as const;

const UNIDADES = new Set(["g", "ml", "un"]);

function normalizar(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

/**
 * Remove a forma de preparo do nome do ingrediente:
 * "cebola picada" -> "cebola"; "cenoura cortada em tiras" -> "cenoura";
 * "bacon em cubos pequenos" -> "bacon"; "pimenta do reino preta" -> "pimenta do reino".
 */
export function nomeInsumoCanonico(nome: string): string {
  const preparo = /\b(picad[oa]s?|cortad[oa]s?|ralad[oa]s?|moid[oa]s?|fatiad[oa]s?|em\s+cubos(?:\s+(?:pequenos|m[eé]dios|grandes))?|em\s+tiras|em\s+peda[çc]os(?:\s+(?:pequenos|m[eé]dios|grandes))?|em\s+rodelas|em\s+fatias|fresc[oa]s?|grosseiramente|finamente|bem\s+picad[oa]|a\s+gosto|q\.?\s*b\.?|limpo|lavad[oa]|descascad[oa]|sem\s+pele|sem\s+sementes?|aprox\.?|aproximadamente|preta|preto)\b/gi;
  const limpo = nome
    .replace(/\([^)]*\)/g, " ")
    .split(",")[0]!
    .replace(preparo, " ")
    .replace(/\s+/g, " ")
    .replace(/[.;:]+$/, "")
    .trim();
  return limpo || nome.trim();
}

/** Chave de comparação: sem acento, sem preparo, singularizando palavras. */
export function chaveInsumo(nome: string): string {
  return normalizar(nomeInsumoCanonico(nome))
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ");
}

/** Canoniza e soma ingredientes repetidos da mesma receita/unidade. */
export function consolidarInsumos(insumos: InsumoImportado[]): InsumoImportado[] {
  const consolidados = new Map<string, InsumoImportado>();
  for (const insumo of insumos) {
    const nome = nomeInsumoCanonico(insumo.nome);
    if (!nome) continue;
    const chave = `${chaveInsumo(nome)}|${insumo.unidade}`;
    const atual = consolidados.get(chave);
    if (atual) atual.quantidadePorPorcao += insumo.quantidadePorPorcao;
    else consolidados.set(chave, { ...insumo, nome });
  }
  return [...consolidados.values()];
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

function normalizarServico(value: unknown): (typeof SERVICOS)[number] | null {
  const raw = normalizar(String(value ?? ""));
  if (["cafe_manha", "cafe da manha", "café da manhã", "breakfast", "manha", "manhã"].includes(raw)) return "cafe_manha";
  if (["almoco", "almoço", "lunch"].includes(raw)) return "almoco";
  if (["jantar", "janta", "dinner"].includes(raw)) return "jantar";
  if (["outro", "outros", "evento", "eventos"].includes(raw)) return "outro";
  return null;
}

function ocupacaoValida(value: unknown): number | null {
  const parsed = numero(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) return null;
  return parsed;
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
export type BriffingImportado = {
  data: string;
  servico: (typeof SERVICOS)[number];
  ocupacao: number;
  evento: string | null;
  observacoes: string | null;
};

type Preview = {
  tipo: TipoImportacao;
  formato: string;
  itens: ReceitaImportada[] | CardapioImportado[] | IngredienteImportado[] | BriffingImportado[];
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
    const unidade = unidadeBase(unidadeRaw);
    if (!nome || !unidade) {
      avisos.push(`Linha de ingrediente ignorada: ${limpa.slice(0, 120)}`);
      continue;
    }
    const fatorPreco = ["kg", "quilo", "quilos", "l", "litro", "litros"].includes(unidadeRaw) ? 1000 : 1;
    const preco = numero(partes[2] ?? "");
    itens.push({
      nome,
      unidade,
      precoUnitario: preco !== null ? (preco / fatorPreco).toFixed(4) : null,
      categoria: partes[3]?.trim() || null,
    });
  }
  return itens;
}

const UNIDADES_RECEITA = "kg|g|ml|l|un|und|unidades?";

function limparLinhaReceita(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function numeroReceita(value: string | undefined): number | null {
  const raw = String(value ?? "").trim();
  const fracao = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracao) {
    const denominador = Number(fracao[2]);
    return denominador > 0 ? Number(fracao[1]) / denominador : null;
  }
  return numero(raw);
}

/**
 * Lê uma linha de ingrediente em formatos comuns de ficha técnica/PDF:
 * - "3 kg de costelinhas de porco" (quantidade primeiro)
 * - "Costelinhas de porco - 3 kg" (nome primeiro)
 * - "Costelinhas de porco 3 kg"
 */
function parseIngredienteReceita(linha: string): InsumoImportado | null {
  const item = limparLinhaReceita(linha).replace(/^[-*•]\s*/, "").trim();
  if (!item) return null;

  let nome = "";
  let quantidade: number | null = null;
  let unidade: string | null = null;
  let match: RegExpMatchArray | null = null;

  // "Sal a gosto" / "Pimenta q.b." não têm quantidade fechada; entram com 1 g
  // para o insumo existir e possam ser ajustados no preview.
  const aGosto = item.match(/^(.+?)\s+(?:a gosto|q\.?\s*b\.?)$/i);
  if (aGosto) {
    const nome = aGosto[1]!.replace(/[.;:]+$/, "").trim();
    return nome.length >= 2 ? { nome, unidade: "g", quantidadePorPorcao: 1, fatorCorrecao: 1 } : null;
  }

  // Medidas caseiras comuns em fichas: convertidas para a unidade base.
  const caseira = item.match(/^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(x[ií]caras?|colheres?\s+de\s+sopa|colheres?\s+de\s+ch[aá]|copos?|pitadas?|dentes?|folhas?|ramos?)\b\.?\s*(?:de\s+)?(.+)$/i);
  if (caseira) {
    const quantidade = numeroReceita(caseira[1]);
    const medida = normalizar(caseira[2]!);
    const nome = caseira[3]!.replace(/[.;:]+$/, "").split(",")[0]!.trim();
    if (quantidade !== null && nome.length >= 2) {
      if (medida.startsWith("xicara") || medida.startsWith("copo")) {
        return { nome, unidade: "ml", quantidadePorPorcao: quantidade * 240, fatorCorrecao: 1 };
      }
      if (medida.includes("sopa")) return { nome, unidade: "ml", quantidadePorPorcao: quantidade * 15, fatorCorrecao: 1 };
      if (medida.includes("cha")) return { nome, unidade: "ml", quantidadePorPorcao: quantidade * 5, fatorCorrecao: 1 };
      if (medida.startsWith("pitada")) return { nome, unidade: "g", quantidadePorPorcao: quantidade, fatorCorrecao: 1 };
      return { nome, unidade: "un", quantidadePorPorcao: quantidade, fatorCorrecao: 1 };
    }
  }

  // 3 kg de costelinhas / 300g ketchup / 1,5 L de caldo
  match = item.match(new RegExp(`^(\\d+(?:[.,]\\d+)?|\\d+\\s*\\/\\s*\\d+)\\s*(${UNIDADES_RECEITA})\\b\\.?\\s*(?:(?:de|da|do)\\s+|[-–—]\\s*)?(.+)$`, "i"));
  if (match) {
    quantidade = numeroReceita(match[1]);
    unidade = match[2]!;
    nome = match[3]!;
  }

  // Costelinhas de porco - 3 kg / Costelinhas: 3 kg
  if (quantidade === null) {
    match = item.match(new RegExp(`^(.+?)\\s*[-–—:]\\s*(\\d+(?:[.,]\\d+)?|\\d+\\s*\\/\\s*\\d+)\\s*(${UNIDADES_RECEITA})\\b`, "i"));
    if (match) {
      nome = match[1]!;
      quantidade = numeroReceita(match[2]);
      unidade = match[3]!;
    }
  }

  // Costelinhas de porco 3 kg
  if (quantidade === null) {
    match = item.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?|\\d+\\s*\\/\\s*\\d+)\\s*(${UNIDADES_RECEITA})\\b`, "i"));
    if (match) {
      nome = match[1]!;
      quantidade = numeroReceita(match[2]);
      unidade = match[3]!;
    }
  }

  if (!nome || quantidade === null || !unidade) return null;
  const convertida = converterQuantidade(quantidade, unidade);
  if (!convertida) return null;

  // Descarta preparo entre parênteses e complementos após vírgula:
  // "costelinhas de porco (cortadas), limpas" -> "costelinhas de porco".
  const nomeLimpo = nome
    .replace(/\([^)]*\)/g, " ")
    .split(",")[0]!
    .replace(/^(de|da|do)\s+/i, "")
    .replace(/[.;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (nomeLimpo.length < 2 || nomeLimpo.length > 120) return null;

  return {
    nome: nomeLimpo,
    unidade: convertida.unidade,
    quantidadePorPorcao: convertida.quantidade,
    fatorCorrecao: 1,
  };
}

export function parseReceitasTexto(text: string, nomeArquivo: string, avisos: string[]): ReceitaImportada[] {
  const receitas: ReceitaImportada[] = [];
  let atual: ReceitaImportada | null = null;
  let secao: "ingredientes" | "preparo" | null = null;
  const linhasIgnoradas: string[] = [];
  const inicio = nomeArquivo.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Receita importada";

  function garantirReceita(): ReceitaImportada {
    if (!atual) {
      atual = { nome: inicio, rendimentoPorcoes: 1, insumos: [] };
      receitas.push(atual);
    }
    return atual;
  }

  for (const linhaOriginal of text.split(/\r?\n/)) {
    const linha = limparLinhaReceita(linhaOriginal);
    if (!linha) continue;

    // Cabeçalho explícito da receita.
    const cabecalho = linha.match(/^(receita|ficha|prato)\s*[:\-]\s*(.+)$/i);
    if (cabecalho) {
      const nome = cabecalho[2]!.replace(/\s*[|;].*$/, "").trim();
      const rendimentoMatch = linha.match(/rendimento\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
      atual = {
        nome: nome || inicio,
        rendimentoPorcoes: rendimentoMatch ? numeroReceita(rendimentoMatch[1]) ?? 1 : 1,
        insumos: [],
      };
      receitas.push(atual);
      secao = null;
      continue;
    }

    const normalizada = normalizar(linha).replace(/[:.;]+$/, "").trim();

    // Seções da ficha. A partir de "modo de preparo" nada mais é ingrediente.
    if (/^(ingredientes|lista de ingredientes|ingredientes e temperos)$/.test(normalizada)) {
      secao = "ingredientes";
      garantirReceita();
      continue;
    }
    if (/^(modo de preparo|preparo|como fazer|instrucoes|preparacao|finalizacao|montagem)$/.test(normalizada)) {
      secao = "preparo";
      continue;
    }

    // Rendimento pode aparecer em qualquer linha antes do preparo.
    if (secao !== "preparo") {
      const rendimento = linha.match(/(?:rendimento|por[cç][oõ]es|rende|serve)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i)
        ?? linha.match(/(\d+(?:[.,]\d+)?)\s*(?:por[cç][oõ]es|pessoas)/i);
      if (rendimento) {
        garantirReceita().rendimentoPorcoes = numeroReceita(rendimento[1]) ?? 1;
        continue;
      }
    }

    // Depois de "modo de preparo", o texto é instrução — não vira insumo.
    if (secao === "preparo") continue;

    // Metadados comuns de ficha técnica.
    if (/^(tempo|dificuldade|categoria|chef|autor|fonte|observacoes|dicas?|equipamento|utensilios)\b/.test(normalizada)) continue;
    if (/^(pagina|página)\s*\d+/i.test(linha) || /^\d+$/.test(linha)) continue;

    // Antes da seção de ingredientes, a primeira linha costuma ser o título.
    if (!atual && secao === null) {
      const titulo = linha.replace(/^\d{1,3}\s*[-.)]?\s+/, "").replace(/[.;:]+$/, "").trim();
      atual = { nome: titulo || inicio, rendimentoPorcoes: 1, insumos: [] };
      receitas.push(atual);
      continue;
    }

    const insumo = parseIngredienteReceita(linha);
    if (!insumo) {
      if (secao === "ingredientes") linhasIgnoradas.push(linha.slice(0, 120));
      continue;
    }

    const receita = garantirReceita();

    // "1 peça de aprox. 2 kg" não traz o nome do corte. Usa o primeiro termo
    // da receita ("Lagarto Recheado" -> "Lagarto") para o insumo não nascer
    // com nome de quantidade.
    const peca = insumo.nome.match(/^\d+\s+pe[çc]a\s+de\s+(?:(aprox\.?|aproximadamente)\s*)?(.*)$/i);
    if (peca) {
      const restante = (peca[2] ?? "").replace(/[.;:]+$/, "").trim();
      if (!restante || /^(aprox\.?|aproximadamente)$/i.test(restante)) {
        insumo.nome = receita.nome.replace(/^\d+\s*[-.)]?\s*/, "").split(/\s+/)[0] || "Peça";
      } else {
        insumo.nome = restante;
      }
    }

    // "1 lagarto (aprox. 2 kg)" -> nome "lagarto"; a quantidade já está
    // separada no campo próprio. Evita insumo começando com número.
    insumo.nome = insumo.nome
      .replace(/^\d+(?:[.,]\d+)?\s+/, "")
      .replace(/\(\s*(?:aprox\.?|aproximadamente)\s*$/i, "")
      .trim();
    const existente = receita.insumos.find((item) => normalizar(item.nome) === normalizar(insumo.nome));
    if (existente && existente.unidade === insumo.unidade) {
      existente.quantidadePorPorcao += insumo.quantidadePorPorcao;
    } else {
      receita.insumos.push(insumo);
    }
  }

  if (linhasIgnoradas.length > 0) {
    avisos.push(
      `${linhasIgnoradas.length} linha(s) da seção de ingredientes não puderam ser lidas: `
      + `${linhasIgnoradas.slice(0, 5).join(" | ")}`
      + `${linhasIgnoradas.length > 5 ? ` | +${linhasIgnoradas.length - 5}` : ""}. Revise o preview e complete manualmente.`,
    );
  }
  return receitas
    .filter((receita) => receita.insumos.length > 0)
    .map((receita) => ({ ...receita, insumos: consolidarInsumos(receita.insumos) }));
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
  return [...mapa.values()]
    .filter((receita) => receita.insumos.length > 0)
    .map((receita) => ({ ...receita, insumos: consolidarInsumos(receita.insumos) }));
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
    const unidade = unidadeBase(unidadeRaw);
    if (!nome || !unidade) { avisos.push(`Linha de ingrediente ignorada: ${row.join(" | ").slice(0, 120)}`); continue; }
    const fatorPreco = ["kg", "quilo", "quilos", "l", "litro", "litros"].includes(unidadeRaw) ? 1000 : 1;
    const preco = numero(row[idxPreco] ?? "");
    itens.push({ nome, unidade, precoUnitario: preco !== null ? (preco / fatorPreco).toFixed(4) : null, categoria: String(row[idxCategoria] ?? "").trim() || null });
  }
  return itens;
}

export function parseBriffingDelimitado(rows: string[][], avisos: string[]): BriffingImportado[] {
  if (rows.length === 0) return [];
  const headers = rows[0]!;
  const primeira = headers.map(chaveHeader);
  const header = primeira.includes("data") || primeira.includes("ocupacao") || primeira.includes("pax");
  const idxData = header ? acharColuna(headers, ["data", "date", "dia"]) : 0;
  const idxServico = header ? acharColuna(headers, ["servico", "serviço", "service", "refeicao", "refeição"]) : 1;
  const idxOcupacao = header ? acharColuna(headers, ["ocupacao", "ocupação", "pax", "hospedes", "hóspedes", "guests", "quantidade"]) : 2;
  const idxEvento = header ? acharColuna(headers, ["evento", "event", "grupo"]) : 3;
  const idxObservacoes = header ? acharColuna(headers, ["observacoes", "observações", "obs", "notas"]) : 4;
  const dataRows = header ? rows.slice(1) : rows;
  const mapa = new Map<string, BriffingImportado>();
  for (const row of dataRows) {
    const data = normalizarData(row[idxData] ?? "");
    const ocupacao = ocupacaoValida(row[idxOcupacao] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || ocupacao === null) {
      avisos.push(`Linha de briffing ignorada (data/ocupação): ${row.join(" | ").slice(0, 140)}`);
      continue;
    }
    const servico = normalizarServico(row[idxServico] ?? "") ?? "outro";
    mapa.set(`${data}|${servico}`, {
      data,
      servico,
      ocupacao,
      evento: String(row[idxEvento] ?? "").trim() || null,
      observacoes: String(row[idxObservacoes] ?? "").trim() || null,
    });
  }
  return [...mapa.values()];
}

export function parseBriffingTexto(text: string, avisos: string[]): BriffingImportado[] {
  const itens: BriffingImportado[] = [];
  let atual: Partial<BriffingImportado> = {};

  function flush() {
    if (atual.data && atual.ocupacao !== undefined) {
      itens.push({
        data: atual.data,
        servico: atual.servico ?? "outro",
        ocupacao: atual.ocupacao,
        evento: atual.evento ?? null,
        observacoes: atual.observacoes ?? null,
      });
    } else if (atual.data || atual.ocupacao !== undefined) {
      avisos.push(`Previsão incompleta ignorada: data=${atual.data ?? "—"} ocupação=${atual.ocupacao ?? "—"}`);
    }
    atual = {};
  }

  for (const linhaOriginal of text.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha) { flush(); continue; }

    const partes = linha.split(/[;|]/).map((parte) => parte.trim());
    if (partes.length >= 3 && /^(\d{4}-\d{2}-\d{2}|\d{2}[\/.-]\d{2}[\/.-]\d{4})$/.test((partes[0] ?? "").trim())) {
      const data = normalizarData(partes[0]);
      const servico = normalizarServico(partes[1]) ?? "outro";
      const ocupacao = ocupacaoValida(partes[2]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || ocupacao === null) {
        avisos.push(`Linha de briffing ignorada: ${linha.slice(0, 140)}`);
        continue;
      }
      if (atual.data || atual.ocupacao !== undefined) flush();
      itens.push({ data, servico, ocupacao, evento: partes[3] ?? null, observacoes: partes[4] ?? null });
      continue;
    }

    const dataMatch = linha.match(/(\d{4}-\d{2}-\d{2}|\d{2}[\/.-]\d{2}[\/.-]\d{4})/);
    const servicoMatch = linha.match(/(?:servi[cç]o|service|refei[cç][aã]o)\s*[:\-]?\s*([^|;]+)/i);
    const ocupacaoMatch = linha.match(/(?:ocupa[cç][aã]o|pax|h[oó]spedes|guests|quantidade)\s*[:\-]?\s*(\d+)/i);
    const eventoMatch = linha.match(/(?:evento|event|grupo)\s*[:\-]?\s*([^|;]+)/i);
    const obsMatch = linha.match(/(?:observa[cç][oõ]es|obs|notas)\s*[:\-]?\s*([^|;]+)/i);

    const data = dataMatch ? normalizarData(dataMatch[1]) : undefined;
    if (data && atual.data && atual.ocupacao !== undefined && data !== atual.data) flush();
    if (data) atual.data = data;
    if (servicoMatch) atual.servico = normalizarServico(servicoMatch[1]) ?? "outro";
    if (ocupacaoMatch) {
      const ocupacao = ocupacaoValida(ocupacaoMatch[1]);
      if (ocupacao === null) {
        avisos.push(`Ocupação inválida: ${linha.slice(0, 140)}`);
        continue;
      }
      atual.ocupacao = ocupacao;
    }
    if (eventoMatch) atual.evento = eventoMatch[1]!.trim();
    if (obsMatch) atual.observacoes = obsMatch[1]!.trim();

    // Linha única com data + serviço + ocupação fecha o registro na hora.
    if (data && servicoMatch && ocupacaoMatch) flush();
  }
  flush();
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
    for (const key of ["itens", "receitas", "cardapios", "ingredientes", "briffing", "previsoes", "data"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [parsed];
  }
  return [];
}

function normalizarJson(tipo: TipoImportacao, rows: unknown[], avisos: string[]): ReceitaImportada[] | CardapioImportado[] | IngredienteImportado[] | BriffingImportado[] {
  if (tipo === "briffing") {
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      const data = normalizarData(r.data ?? r.dia);
      const ocupacao = ocupacaoValida(r.ocupacao ?? r.pax ?? r.hospedes ?? r.guests ?? r.quantidade);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || ocupacao === null) {
        avisos.push(`Previsão JSON inválida: ${JSON.stringify(row).slice(0, 140)}`);
        return [];
      }
      return [{
        data,
        servico: normalizarServico(r.servico ?? r.service ?? r.refeicao) ?? "outro",
        ocupacao,
        evento: r.evento ? String(r.evento) : null,
        observacoes: r.observacoes ? String(r.observacoes) : (r.obs ? String(r.obs) : null),
      }];
    });
  }
  if (tipo === "ingredientes") {
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      const unidadeRaw = String(r.unidade ?? r.unit ?? "").trim().toLowerCase();
      const unidade = unidadeBase(unidadeRaw);
      if (!r.nome || !unidade) { avisos.push(`Ingrediente JSON inválido: ${JSON.stringify(row).slice(0, 120)}`); return []; }
      const fatorPreco = ["kg", "quilo", "quilos", "l", "litro", "litros"].includes(unidadeRaw) ? 1000 : 1;
      const preco = numero(r.precoUnitario ?? r.preco ?? r.price);
      return [{ nome: String(r.nome), unidade, precoUnitario: preco !== null ? (preco / fatorPreco).toFixed(4) : null, categoria: r.categoria ? String(r.categoria) : null }];
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
      return insumos.length ? [{ nome, rendimentoPorcoes: numero(r.rendimentoPorcoes ?? r.rendimento) ?? 1, insumos: consolidarInsumos(insumos) }] : [];
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
    let itens: ReceitaImportada[] | CardapioImportado[] | IngredienteImportado[] | BriffingImportado[];
    if (formato === "json") {
      itens = normalizarJson(input.data.tipo, parseJson(texto, input.data.tipo), avisos);
    } else if (formato === "csv") {
      const { rows } = parseDelimited(texto);
      itens = input.data.tipo === "receitas"
        ? parseReceitasDelimitado(rows, avisos)
        : input.data.tipo === "cardapios"
          ? parseCardapiosDelimitado(rows)
          : input.data.tipo === "briffing"
            ? parseBriffingDelimitado(rows, avisos)
            : parseIngredientesDelimitado(rows, avisos);
    } else if (input.data.tipo === "receitas") {
      itens = parseReceitasTexto(texto, input.data.filename, avisos);
    } else if (input.data.tipo === "cardapios") {
      itens = parseCardapiosTexto(texto, avisos);
    } else if (input.data.tipo === "briffing") {
      itens = parseBriffingTexto(texto, avisos);
    } else {
      itens = parseIngredientesLinhas(texto.split(/\r?\n/), avisos);
    }

    if (itens.length === 0) {
      return res.status(422).json({
        error: "Não foi possível reconhecer itens no arquivo. Confira o formato ou use o modelo CSV.",
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
    /** Cria automaticamente o insumo/ingrediente que ainda não existe no catálogo. */
    criarInsumosFaltantes: z.boolean().optional().default(true),
    itens: z.array(z.object({
      nome: z.string().trim().min(1).max(120),
      rendimentoPorcoes: z.number().finite().positive(),
      insumos: z.array(insumoImportadoSchema).min(1).max(200),
    })).min(1).max(500),
  }),
  z.object({
    tipo: z.literal("cardapios"),
    /** Se true, receita do cardápio sem ficha cria uma ficha vazia para completar depois. */
    criarFichasFaltantes: z.boolean().optional(),
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
  z.object({
    tipo: z.literal("briffing"),
    itens: z.array(z.object({
      data: z.iso.date(),
      servico: z.enum(SERVICOS),
      ocupacao: z.number().int().min(0).max(100_000),
      evento: z.string().trim().max(255).nullable().optional(),
      observacoes: z.string().trim().max(2000).nullable().optional(),
    })).min(1).max(1000),
  }),
]);

/** Converte a quantidade total da receita para a quantidade por porção. */
export function quantidadePorPorcao(total: number, rendimentoPorcoes: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(rendimentoPorcoes) || rendimentoPorcoes <= 0) return total;
  return Number((total / rendimentoPorcoes).toFixed(4));
}

type CatalogoInsumo = { id: string; nome: string };

async function carregarCatalogo(tx: any, tenantId: string): Promise<CatalogoInsumo[]> {
  return tx
    .select({ id: insumosTable.id, nome: insumosTable.nome })
    .from(insumosTable)
    .where(and(eq(insumosTable.tenantId, tenantId), eq(insumosTable.catalogo, "restaurante")));
}

async function obterOuCriarInsumo(
  tx: any,
  tenantId: string,
  nome: string,
  unidade: "g" | "ml" | "un",
  preco: string | null,
  criar: boolean,
  catalogo: CatalogoInsumo[],
): Promise<{ id: string; criado: boolean }> {
  const canonico = nomeInsumoCanonico(nome);
  const chave = chaveInsumo(canonico);
  const existente = catalogo.find((item) => chaveInsumo(item.nome) === chave);
  if (existente) {
    const patch: Record<string, unknown> = {};
    if (preco) patch.precoUnitario = preco;
    if (existente.nome !== canonico) patch.nome = canonico;
    if (Object.keys(patch).length > 0) {
      await tx.update(insumosTable).set({ ...patch, catalogo: "restaurante", updatedAt: new Date() }).where(eq(insumosTable.id, existente.id));
    }
    if (existente.nome !== canonico) {
      // Mantém o nome exibido nas fichas alinhado ao catálogo limpo.
      await tx.update(abFichaInsumosTable).set({ insumoNome: canonico, updatedAt: new Date() }).where(and(
        eq(abFichaInsumosTable.tenantId, tenantId),
        eq(abFichaInsumosTable.insumoId, existente.id),
      ));
      existente.nome = canonico;
    }
    return { id: existente.id, criado: false };
  }
  if (!criar) throw new Error(`Ingrediente não cadastrado: ${canonico}`);
  const [criado] = await tx
    .insert(insumosTable)
    .values({ tenantId, catalogo: "restaurante", nome: canonico, unidade, precoUnitario: preco ?? null })
    .returning({ id: insumosTable.id });
  catalogo.push({ id: criado!.id as string, nome: canonico });
  return { id: criado!.id as string, criado: true };
}

router.post("/tenants/:tenantId/restaurante/importacoes/confirmar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = confirmarSchema.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Itens inválidos", fields: camposInvalidos(input.error) });

  const resultado = { criados: 0, atualizados: 0, fichasCriadas: 0, insumosCriados: 0, erros: [] as string[] };
  try {
    if (input.data.tipo === "ingredientes") {
      for (const item of input.data.itens) {
        try {
          await withTenantTx(tenantId, async (tx) => {
            const [existente] = await tx
              .select({ id: insumosTable.id })
              .from(insumosTable)
              .where(and(eq(insumosTable.tenantId, tenantId), eq(insumosTable.catalogo, "restaurante"), sql`lower(btrim(${insumosTable.nome})) = lower(btrim(${item.nome}))`))
              .limit(1);
            if (existente) {
              await tx.update(insumosTable).set({
                catalogo: "restaurante",
                unidade: item.unidade,
                precoUnitario: item.precoUnitario ?? null,
                categoria: item.categoria ?? null,
                updatedAt: new Date(),
              }).where(eq(insumosTable.id, existente.id));
              resultado.atualizados += 1;
            } else {
              await tx.insert(insumosTable).values({ tenantId, catalogo: "restaurante", nome: item.nome, unidade: item.unidade, precoUnitario: item.precoUnitario ?? null, categoria: item.categoria ?? null });
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
              const nome = nomeInsumoCanonico(insumo.nome);
              const chave = chaveInsumo(nome);
              const atual = consolidados.get(chave);
              if (atual) {
                // A ficha tem índice único por nome; duas unidades diferentes
                // para o mesmo ingrediente não podem ser somadas sem conversão.
                if (atual.unidade !== insumo.unidade) {
                  throw new Error(`Ingrediente "${nome}" repetido com unidades diferentes (${atual.unidade} e ${insumo.unidade})`);
                }
                atual.quantidadePorPorcao += insumo.quantidadePorPorcao;
              } else {
                consolidados.set(chave, { ...insumo, nome });
              }
            }
            const insumosConsolidados = [...consolidados.values()];
            const catalogo = await carregarCatalogo(tx, tenantId);
            const insumoIds: string[] = [];
            for (const insumo of insumosConsolidados) {
              const resolvido = await obterOuCriarInsumo(
                tx,
                tenantId,
                insumo.nome,
                insumo.unidade,
                null,
                input.data.criarInsumosFaltantes !== false,
                catalogo,
              );
              insumoIds.push(resolvido.id);
              if (resolvido.criado) resultado.insumosCriados += 1;
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
              // As quantidades importadas são da receita inteira. A ficha
              // guarda por porção, então divide pelo rendimento.
              quantidadePorPorcao: String(quantidadePorPorcao(insumo.quantidadePorPorcao, receita.rendimentoPorcoes)),
              fatorCorrecao: String(insumo.fatorCorrecao),
              ordem: index,
            })));
          });
        } catch (error) {
          resultado.erros.push(`${receita.nome}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (input.data.tipo === "cardapios") {
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
              let ficha = porNome.get(normalizar(item.receitaNome)) as { id: string; nome: string } | undefined;
              if (!ficha) {
                if (!input.data.criarFichasFaltantes) throw new Error(`Receita não encontrada: ${item.receitaNome}`);
                const [criada] = await tx.insert(abFichasTecnicasTable).values({
                  tenantId,
                  nome: item.receitaNome,
                  rendimentoPorcoes: "1",
                }).returning({ id: abFichasTecnicasTable.id, nome: abFichasTecnicasTable.nome });
                ficha = criada as { id: string; nome: string };
                porNome.set(normalizar(ficha.nome), ficha);
                resultado.fichasCriadas += 1;
              }
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
    } else {
      for (const previsao of input.data.itens) {
        try {
          await withTenantTx(tenantId, async (tx) => {
            const [existente] = await tx
              .select({ id: abBriffingPrevisoesTable.id })
              .from(abBriffingPrevisoesTable)
              .where(and(
                eq(abBriffingPrevisoesTable.tenantId, tenantId),
                eq(abBriffingPrevisoesTable.data, previsao.data),
                eq(abBriffingPrevisoesTable.servico, previsao.servico),
              ))
              .limit(1);
            if (existente) {
              await tx.update(abBriffingPrevisoesTable).set({
                ocupacao: previsao.ocupacao,
                evento: previsao.evento ?? null,
                observacoes: previsao.observacoes ?? null,
                updatedAt: new Date(),
              }).where(eq(abBriffingPrevisoesTable.id, existente.id));
              resultado.atualizados += 1;
            } else {
              await tx.insert(abBriffingPrevisoesTable).values({
                tenantId,
                data: previsao.data,
                servico: previsao.servico,
                ocupacao: previsao.ocupacao,
                evento: previsao.evento ?? null,
                observacoes: previsao.observacoes ?? null,
                createdBy: req.user?.sub ?? null,
              });
              resultado.criados += 1;
            }
          });
        } catch (error) {
          resultado.erros.push(`${previsao.data} ${previsao.servico}: ${error instanceof Error ? error.message : String(error)}`);
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
