export type CsvRow = Record<string, string>;

const HEADER_ALIASES: Record<string, string> = {
  preco: "preco_unitario",
  preco_unitario_rs: "preco_unitario",
  preco_unitario_r: "preco_unitario",
  preco_r: "preco_unitario",
  valor_unitario: "preco_unitario",
  valor_unitario_r: "preco_unitario",
  cod: "codigo",
  code: "codigo",
  composicao: "composicao_nome",
  nome_composicao: "composicao_nome",
  codigo_composicao: "composicao_codigo",
  insumo: "insumo_nome",
  nome_insumo: "insumo_nome",
  codigo_insumo: "insumo_codigo",
  qtd: "quantidade",
};

function normalizeHeader(value: string) {
  const normalized = value.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return HEADER_ALIASES[normalized] ?? normalized;
}

function detectDelimiter(firstLine: string) {
  const counts = [";", ",", "\t"].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length,
  }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseConstructionCsv(text: string): CsvRow[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = detectDelimiter(clean.split("\n")[0] ?? "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === '"') {
      if (quoted && clean[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim()); field = "";
    } else if (char === "\n" && !quoted) {
      row.push(field.trim());
      if (row.some(Boolean)) records.push(row);
      row = []; field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) records.push(row);
  if (records.length < 2) return [];

  const headers = records[0].map(normalizeHeader);
  return records.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index]?.trim() ?? ""]),
  ));
}

export function csvDecimal(value?: string) {
  const raw = (value ?? "").trim().replace(/\s/g, "");
  if (!raw) return "";
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : "";
}

export function downloadCsvTemplate(filename: string, content: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
