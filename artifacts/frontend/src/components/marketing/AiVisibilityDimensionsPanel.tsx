import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CsvRecord = Record<string, string>;
type ImportItem = {
  id: string;
  dimension_type: "grounding_queries" | "timeseries" | "topics" | "intents";
  file_name: string | null;
  row_count: number;
  imported_at: string;
};
type Summary = {
  available: boolean;
  topQueries: Array<{ grounding_query: string; citations: number; citation_share: number | null; page_count: number }>;
  topics: Array<{ topic: string; citations: number }>;
  intents: Array<{ intent: string; citations: number }>;
  timeline: Array<{ activity_date: string; citations: number }>;
  imports: ImportItem[];
};

type UploadRow = {
  pageUrl: string | null;
  groundingQuery: string | null;
  topic: string | null;
  intent: string | null;
  activityDate: string | null;
  citations: string | number;
  citationShare: string | number | null;
};

function authHeaders(json = false): HeadersInit {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseCsv(text: string): CsvRecord[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((value) => ({ value, count: firstLine.split(value).length - 1 })).sort((a, b) => b.count - a.count)[0]?.value ?? ",";
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') { cell += '"'; index += 1; } else quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) matrix.push(row);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeKey);
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function pick(row: CsvRecord, aliases: string[]) {
  for (const alias of aliases) if (row[alias]?.trim()) return row[alias].trim();
  return "";
}

function normalizeRows(records: CsvRecord[]): UploadRow[] {
  return records.map((row) => ({
    pageUrl: pick(row, ["page_url", "page", "url", "cited_page", "cited_page_url", "pagina", "pagina_citada"]) || null,
    groundingQuery: pick(row, ["grounding_query", "grounding_queries", "query", "consulta", "consulta_de_fundamentacao"]) || null,
    topic: pick(row, ["topic", "topics", "topico", "topicos", "tema"]) || null,
    intent: pick(row, ["intent", "intents", "intencao", "intencoes"]) || null,
    activityDate: pick(row, ["activity_date", "date", "day", "data", "data_da_atividade"]) || null,
    citations: pick(row, ["citations", "citation_count", "total_citations", "citacoes", "total_de_citacoes"]) || 0,
    citationShare: pick(row, ["citation_share", "share", "citation_share_percent", "participacao_de_citacoes", "participacao"]) || null,
  })).filter((row) => Boolean(row.groundingQuery || row.topic || row.intent || row.activityDate));
}

function typeLabel(type: ImportItem["dimension_type"]) {
  if (type === "grounding_queries") return "Grounding Queries";
  if (type === "timeseries") return "Série temporal";
  if (type === "topics") return "Tópicos";
  return "Intenções";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

export default function AiVisibilityDimensionsPanel({ tenantId }: { tenantId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/ai-visibility/dimensions/summary`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar consultas e tendências de IA.");
      setSummary(await response.json() as Summary);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar dados complementares.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const importFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const records = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
      const rows = normalizeRows(records);
      if (!rows.length) throw new Error("Este CSV não parece ser Grounding Queries, Tópicos/Intenções ou série temporal do Bing AI Performance.");
      if (rows.length > 10000) throw new Error("O arquivo tem mais de 10.000 linhas. Exporte um período menor.");
      const response = await fetch(`/api/tenants/${tenantId}/ai-visibility/dimensions/import`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ fileName: file.name, rows }),
      });
      const payload = await response.json().catch(() => ({})) as { duplicate?: boolean; rowCount?: number; dimensionType?: ImportItem["dimension_type"]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao importar o relatório complementar.");
      setNotice(payload.duplicate
        ? `${typeLabel(payload.dimensionType ?? "grounding_queries")}: este mesmo relatório já havia sido importado.`
        : `${typeLabel(payload.dimensionType ?? "grounding_queries")}: ${payload.rowCount ?? rows.length} linhas importadas.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao importar o relatório complementar.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImport = async (item: ImportItem) => {
    if (!window.confirm(`Excluir o snapshot de ${typeLabel(item.dimension_type)}?`)) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/ai-visibility/dimensions/imports/${item.id}`, { method: "DELETE", headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível excluir a importação.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao excluir importação.");
    }
  };

  const recentTimeline = summary?.timeline.slice(-10) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Consultas, tópicos e tendências de IA</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">O Bing exporta essas visões separadamente. Importe Grounding Queries, Tópicos/Intenções ou série temporal; o VendorAI identifica o tipo automaticamente.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || importing}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={importing}>{importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1.5 h-3.5 w-3.5" />}Importar dados complementares</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
        {notice && <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">{notice}</div>}
        {loading && !summary ? <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando dados complementares…</div> : null}

        {summary && !summary.available ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Depois do relatório de Páginas, importe também o CSV de <strong className="text-foreground">Grounding Queries</strong> e, se desejar, a <strong className="text-foreground">série temporal</strong>. Assim o VendorAI consegue detectar temas, intenções e mudanças ao longo do tempo.</div>
        ) : null}

        {summary?.available ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Grounding Queries</p>
                <div className="mt-3 space-y-2">{summary.topQueries.slice(0, 8).map((item) => <div key={item.grounding_query} className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><p className="line-clamp-2">{item.grounding_query}</p>{Number(item.page_count ?? 0) > 0 && <p className="text-xs text-muted-foreground">{item.page_count} páginas relacionadas</p>}</div><span className="shrink-0 font-medium">{Number(item.citations).toLocaleString("pt-BR")}</span></div>)}{summary.topQueries.length === 0 && <p className="text-xs text-muted-foreground">Importe a visão Grounding Queries para preencher esta análise.</p>}</div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Tendência de citações</p>
                <div className="mt-3 space-y-2">{recentTimeline.map((item) => <div key={item.activity_date} className="flex items-center justify-between text-sm"><span>{dateLabel(item.activity_date)}</span><span className="font-medium">{Number(item.citations).toLocaleString("pt-BR")} citações</span></div>)}{recentTimeline.length === 0 && <p className="text-xs text-muted-foreground">Importe a série temporal para acompanhar a evolução diária.</p>}</div>
              </div>
            </div>

            {(summary.topics.length > 0 || summary.intents.length > 0) && <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border p-4"><p className="text-sm font-medium">Tópicos</p><div className="mt-3 flex flex-wrap gap-2">{summary.topics.map((item) => <Badge key={item.topic} variant="secondary">{item.topic} · {Number(item.citations).toLocaleString("pt-BR")}</Badge>)}</div></div><div className="rounded-lg border p-4"><p className="text-sm font-medium">Intenções</p><div className="mt-3 flex flex-wrap gap-2">{summary.intents.map((item) => <Badge key={item.intent} variant="outline">{item.intent} · {Number(item.citations).toLocaleString("pt-BR")}</Badge>)}</div></div></div>}

            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">Relatórios complementares importados</p>
              <div className="mt-3 divide-y rounded-md border">{summary.imports.slice(0, 8).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2"><div className="min-w-0"><div className="flex items-center gap-2"><Badge variant="outline">{typeLabel(item.dimension_type)}</Badge><p className="truncate text-sm">{item.file_name || "Bing AI Performance"}</p></div><p className="mt-1 text-xs text-muted-foreground">{Number(item.row_count).toLocaleString("pt-BR")} linhas · {dateLabel(item.imported_at)}</p></div><Button size="icon" variant="ghost" aria-label="Excluir snapshot" onClick={() => void removeImport(item)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
