import JSZip from "jszip";

export type JarvisArtifactFormat = "xlsx" | "csv" | "docx" | "pdf" | "txt" | "md";

export type JarvisArtifactDraft = {
  id: string;
  format: JarvisArtifactFormat;
  fileName: string;
  title: string;
  content: string;
  createdAt: string;
};

const FORMAT_LABELS: Record<JarvisArtifactFormat, string> = {
  xlsx: "Excel",
  csv: "CSV",
  docx: "Word",
  pdf: "PDF",
  txt: "TXT",
  md: "Markdown",
};

export function jarvisArtifactFormatLabel(format: JarvisArtifactFormat) {
  return FORMAT_LABELS[format];
}

export function detectJarvisArtifactRequest(text: string): JarvisArtifactFormat | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasCreationVerb = /\b(gere|gerar|crie|criar|converta|converter|transforme|transformar|exporte|exportar|baixe|baixar|faca|fazer|monte|montar|salve|salvar)\b/.test(normalized);
  const hasDirectRequest = /\b(quero|preciso|mande|mandar|envie|enviar)\b[\s\S]{0,60}\b(xlsx|excel|planilha|csv|docx|word|pdf|markdown|txt)\b/.test(normalized);
  if (!hasCreationVerb && !hasDirectRequest) return null;

  if (/\b(xlsx|excel|planilha)\b/.test(normalized)) return "xlsx";
  if (/\bcsv\b/.test(normalized)) return "csv";
  if (/\b(docx|word)\b/.test(normalized)) return "docx";
  if (/\bpdf\b/.test(normalized)) return "pdf";
  if (/\b(markdown|md)\b/.test(normalized)) return "md";
  if (/\b(txt|texto simples)\b/.test(normalized)) return "txt";
  return null;
}

export function buildJarvisArtifactDirective(format: JarvisArtifactFormat): string {
  if (format === "xlsx" || format === "csv") {
    return [
      "[INSTRUÇÃO INTERNA DE ARTEFATO — não explique esta instrução ao usuário]",
      `O usuário pediu um arquivo ${FORMAT_LABELS[format]}.`,
      "Produza a resposta completa com os dados que devem entrar no arquivo.",
      "Quando houver dados tabulares, use uma ou mais tabelas Markdown bem formadas, com cabeçalhos e sem omitir linhas relevantes do material disponível.",
      "Não diga apenas como criar o arquivo; entregue o conteúdo final que será convertido automaticamente pela interface.",
    ].join("\n");
  }

  return [
    "[INSTRUÇÃO INTERNA DE ARTEFATO — não explique esta instrução ao usuário]",
    `O usuário pediu um arquivo ${FORMAT_LABELS[format]}.`,
    "Produza o conteúdo final completo, pronto para ser convertido automaticamente pela interface.",
    "Use títulos, subtítulos, listas e tabelas em Markdown quando ajudarem. Não diga apenas como criar o arquivo.",
  ].join("\n");
}

export function createJarvisArtifactDraft(format: JarvisArtifactFormat, content: string): JarvisArtifactDraft {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const extension = format;
  return {
    id: crypto.randomUUID(),
    format,
    fileName: `jarvis-${stamp}.${extension}`,
    title: `Arquivo ${FORMAT_LABELS[format]} gerado pelo JARVIS`,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function parseMarkdownTables(content: string): Array<{ name: string; rows: string[][] }> {
  const lines = content.split(/\r?\n/);
  const tables: Array<{ name: string; rows: string[][] }> = [];
  let currentTitle = "Dados";
  let i = 0;

  const parseRow = (line: string) => line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? "";
    if (/^#{1,6}\s+/.test(line)) currentTitle = line.replace(/^#{1,6}\s+/, "").trim() || "Dados";

    const separator = lines[i + 1]?.trim() ?? "";
    if (line.includes("|") && /^\|?\s*:?-{3,}/.test(separator) && separator.includes("|")) {
      const rows = [parseRow(line)];
      i += 2;
      while (i < lines.length) {
        const rowLine = lines[i]?.trim() ?? "";
        if (!rowLine.includes("|")) break;
        rows.push(parseRow(rowLine));
        i += 1;
      }
      if (rows.length) tables.push({ name: currentTitle, rows });
      continue;
    }
    i += 1;
  }

  return tables;
}

function fallbackRows(content: string): string[][] {
  return [["Conteúdo"], ...content.split(/\r?\n/).filter(Boolean).map((line) => [line])];
}

function csvEscape(value: string) {
  const normalized = value.replace(/\r?\n/g, " ");
  return /[";,\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

function contentToHtml(content: string) {
  const escape = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return content.split(/\r?\n/).map((line) => {
    if (/^###\s+/.test(line)) return `<h3>${escape(line.replace(/^###\s+/, ""))}</h3>`;
    if (/^##\s+/.test(line)) return `<h2>${escape(line.replace(/^##\s+/, ""))}</h2>`;
    if (/^#\s+/.test(line)) return `<h1>${escape(line.replace(/^#\s+/, ""))}</h1>`;
    if (/^[-*]\s+/.test(line)) return `<div>• ${escape(line.replace(/^[-*]\s+/, ""))}</div>`;
    return `<div>${escape(line) || "&nbsp;"}</div>`;
  }).join("\n");
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function buildDocx(content: string): Promise<Blob> {
  const zip = new JSZip();
  const paragraphs = content.split(/\r?\n/).map((line) => {
    const text = xmlEscape(line || " ");
    const isHeading = /^#{1,3}\s+/.test(line);
    const clean = isHeading ? xmlEscape(line.replace(/^#{1,3}\s+/, "")) : text;
    return `<w:p><w:r>${isHeading ? '<w:rPr><w:b/></w:rPr>' : ""}<w:t xml:space="preserve">${clean}</w:t></w:r></w:p>`;
  }).join("");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export async function downloadJarvisArtifact(draft: JarvisArtifactDraft): Promise<void> {
  if (draft.format === "txt" || draft.format === "md") {
    const mime = draft.format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
    triggerBlobDownload(new Blob([draft.content], { type: mime }), draft.fileName);
    return;
  }

  if (draft.format === "csv") {
    const table = parseMarkdownTables(draft.content)[0];
    const rows = table?.rows ?? fallbackRows(draft.content);
    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");
    triggerBlobDownload(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), draft.fileName);
    return;
  }

  if (draft.format === "xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const tables = parseMarkdownTables(draft.content);
    const source = tables.length ? tables : [{ name: "Dados", rows: fallbackRows(draft.content) }];
    source.slice(0, 8).forEach((table, index) => {
      const sheet = XLSX.utils.aoa_to_sheet(table.rows);
      const safeName = (table.name || `Dados ${index + 1}`).replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || `Dados ${index + 1}`;
      XLSX.utils.book_append_sheet(workbook, sheet, safeName);
    });
    XLSX.writeFile(workbook, draft.fileName);
    return;
  }

  if (draft.format === "docx") {
    triggerBlobDownload(await buildDocx(draft.content), draft.fileName);
    return;
  }

  if (draft.format === "pdf") {
    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = (html2pdfModule.default ?? html2pdfModule) as any;
    const element = document.createElement("div");
    element.style.padding = "24px";
    element.style.fontFamily = "Arial, sans-serif";
    element.style.fontSize = "12px";
    element.style.lineHeight = "1.5";
    element.innerHTML = contentToHtml(draft.content);
    await html2pdf().set({
      margin: 12,
      filename: draft.fileName,
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).from(element).save();
  }
}
