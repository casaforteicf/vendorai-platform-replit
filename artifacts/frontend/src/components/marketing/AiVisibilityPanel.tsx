import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, ExternalLink, FileUp, Loader2, RefreshCw, Sparkles, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricSummary = {
  totalCitations: number;
  citedPages: number;
  averagePerPage: number;
  citationShare: number | null;
  citationsDeltaPct: number | null;
};

type AiPage = {
  page_url: string;
  citations: number;
  citation_share: number | null;
  query_count: number;
};

type AiQuery = { grounding_query: string; citations: number; page_count: number };
type AiLabel = { topic?: string; intent?: string; citations: number };
type AiImport = {
  id: string;
  provider?: string;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  imported_at: string;
};

type AiSummary = {
  provider: string;
  empty: boolean;
  metrics: MetricSummary;
  topPages: AiPage[];
  topQueries: AiQuery[];
  topics: AiLabel[];
  intents: AiLabel[];
  currentImport: AiImport | null;
  previousImport?: AiImport | null;
};

type CsvRecord = Record<string, string>;
type NormalizedRow = {
  pageUrl: string;
  groundingQuery: string | null;
  topic: string | null;
  intent: string | null;
  citations: string | number;
  citationShare: string | number | null;
  periodStart: string | null;
  periodEnd: string | null;
};

function authHeaders(json = false): HeadersInit {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(text: string): CsvRecord[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  const delimiter = candidates
    .map((value) => ({ value, count: firstLine.split(value).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.value ?? ",";

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
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

function pick(row: CsvRecord, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function normalizeCsvRows(records: CsvRecord[]): NormalizedRow[] {
  const pageAliases = ["page_url", "page", "url", "cited_page", "cited_page_url", "pagina", "pagina_citada", "pagina_url"];
  const citationAliases = ["citations", "citation_count", "total_citations", "citacoes", "total_de_citacoes"];
  const shareAliases = ["citation_share", "share", "citation_share_percent", "participacao_de_citacoes", "participacao"];
  const queryAliases = ["grounding_query", "grounding_queries", "query", "consulta", "consulta_de_fundamentacao"];
  const topicAliases = ["topic", "topics", "topico", "topicos", "tema"];
  const intentAliases = ["intent", "intents", "intencao", "intencoes"];
  const startAliases = ["period_start", "start_date", "date_start", "data_inicial"];
  const endAliases = ["period_end", "end_date", "date_end", "data_final"];

  return records.map((row) => ({
    pageUrl: pick(row, pageAliases),
    groundingQuery: pick(row, queryAliases) || null,
    topic: pick(row, topicAliases) || null,
    intent: pick(row, intentAliases) || null,
    citations: pick(row, citationAliases) || 0,
    citationShare: pick(row, shareAliases) || null,
    periodStart: pick(row, startAliases) || null,
    periodEnd: pick(row, endAliases) || null,
  })).filter((row) => Boolean(row.pageUrl));
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function hostLabel(value: string) {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}`;
    return path === "/" ? url.hostname : path;
  } catch {
    return value;
  }
}

export default function AiVisibilityPanel({ tenantId }: { tenantId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [imports, setImports] = useState<AiImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, importsResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/ai-visibility/summary`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/ai-visibility/imports`, { headers: authHeaders() }),
      ]);
      if (!summaryResponse.ok || !importsResponse.ok) throw new Error("Não foi possível carregar a visibilidade em IA.");
      const [summaryData, importsData] = await Promise.all([summaryResponse.json(), importsResponse.json()]);
      setSummary(summaryData as AiSummary);
      setImports((importsData as { imports?: AiImport[] }).imports ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar Visibilidade em IA.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const importCsv = async (file: File) => {
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const text = await file.text();
      const records = parseCsv(text.replace(/^\uFEFF/, ""));
      const rows = normalizeCsvRows(records);
      if (!rows.length) {
        throw new Error("Não encontrei a coluna de página/URL no CSV do AI Performance.");
      }
      if (rows.length > 5000) {
        throw new Error("O arquivo tem mais de 5.000 linhas. Exporte um período menor e tente novamente.");
      }

      const response = await fetch(`/api/tenants/${tenantId}/ai-visibility/import`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ fileName: file.name, rows }),
      });
      const payload = await response.json().catch(() => ({})) as { duplicate?: boolean; rowCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível importar o relatório.");
      setNotice(payload.duplicate
        ? "Este mesmo relatório já havia sido importado. Nenhum dado foi duplicado."
        : `${payload.rowCount ?? rows.length} linhas importadas do Bing AI Performance.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao importar o CSV.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImport = async (item: AiImport) => {
    if (!window.confirm("Excluir este snapshot de Visibilidade em IA?")) return;
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/ai-visibility/imports/${item.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("Não foi possível excluir a importação.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao excluir importação.");
    }
  };

  const actions = useMemo(() => {
    if (!summary || summary.empty) return [] as string[];
    const result: string[] = [];
    if (summary.topPages[0]) result.push(`Replicar a estrutura de ${hostLabel(summary.topPages[0].page_url)}, hoje a página mais citada.`);
    if (summary.topQueries[0]) result.push(`Criar ou reforçar uma resposta direta para “${summary.topQueries[0].grounding_query}”.`);
    if (summary.metrics.citationsDeltaPct != null && summary.metrics.citationsDeltaPct < 0) result.push("Priorizar páginas que perderam citações antes de ampliar novos clusters.");
    if (!result.length) result.push("Importe novos snapshots periodicamente para o VendorAI medir evolução e perda de presença em IA.");
    return result.slice(0, 3);
  }, [summary]);

  const delta = summary?.metrics.citationsDeltaPct;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary" />Visibilidade em IA</CardTitle>
              <Badge variant="secondary">Bing AI Performance</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Quais páginas, consultas, temas e intenções estão sendo usados como fonte em respostas de IA.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || importing}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar
            </Button>
            <input ref={inputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }} />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1.5 h-3.5 w-3.5" />}
              Importar CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
        {notice && <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">{notice}</div>}

        {loading && !summary ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando presença em IA…</div>
        ) : summary?.empty ? (
          <div className="rounded-lg border border-dashed p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div className="space-y-2">
                <p className="font-medium">Comece com o relatório do Bing AI Performance</p>
                <p className="text-sm text-muted-foreground">No Bing Webmaster Tools, abra AI Performance, exporte CSV e importe aqui. O VendorAI guarda cada snapshot por tenant e compara a evolução sem misturar dados entre empresas.</p>
                <Button size="sm" variant="outline" asChild><a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">Abrir Bing Webmaster Tools <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
              </div>
            </div>
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Citações em IA</p><div className="mt-1 flex items-center gap-2"><p className="text-xl font-semibold">{summary.metrics.totalCitations.toLocaleString("pt-BR")}</p>{delta != null && <Badge variant="outline" className="gap-1">{delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{delta > 0 ? "+" : ""}{delta}%</Badge>}</div></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Páginas citadas</p><p className="mt-1 text-xl font-semibold">{summary.metrics.citedPages.toLocaleString("pt-BR")}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Média por página</p><p className="mt-1 text-xl font-semibold">{summary.metrics.averagePerPage.toLocaleString("pt-BR")}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Citation Share médio</p><p className="mt-1 text-xl font-semibold">{summary.metrics.citationShare == null ? "—" : `${summary.metrics.citationShare.toLocaleString("pt-BR")}%`}</p></div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border overflow-hidden">
                <div className="border-b px-4 py-3"><p className="text-sm font-medium">Páginas mais citadas</p><p className="text-xs text-muted-foreground">Use as líderes como padrão de estrutura para as páginas com baixa presença.</p></div>
                <div className="divide-y">
                  {summary.topPages.slice(0, 8).map((page, index) => (
                    <div key={page.page_url} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium"><span className="mr-2 text-muted-foreground">#{index + 1}</span>{hostLabel(page.page_url)}</p><p className="text-xs text-muted-foreground">{page.query_count ?? 0} consultas associadas</p></div>
                      <div className="shrink-0 text-right"><p className="text-sm font-semibold">{Number(page.citations).toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">citações</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Próximas ações sugeridas</p>
                  <div className="mt-3 space-y-2">{actions.map((action, index) => <div key={action} className="flex gap-2 text-sm"><Badge variant="outline" className="h-5 min-w-5 justify-center px-1.5">{index + 1}</Badge><span>{action}</span></div>)}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Consultas que geram citações</p>
                  <div className="mt-3 space-y-2">{summary.topQueries.slice(0, 6).map((item) => <div key={item.grounding_query} className="flex items-start justify-between gap-3 text-sm"><span className="line-clamp-2">{item.grounding_query}</span><span className="shrink-0 font-medium">{Number(item.citations).toLocaleString("pt-BR")}</span></div>)}{summary.topQueries.length === 0 && <p className="text-xs text-muted-foreground">O CSV importado não trouxe grounding queries.</p>}</div>
                </div>
              </div>
            </div>

            {(summary.topics.length > 0 || summary.intents.length > 0) && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-4"><p className="text-sm font-medium">Tópicos</p><div className="mt-3 flex flex-wrap gap-2">{summary.topics.map((item) => <Badge key={item.topic} variant="secondary">{item.topic} · {Number(item.citations).toLocaleString("pt-BR")}</Badge>)}</div></div>
                <div className="rounded-lg border p-4"><p className="text-sm font-medium">Intenções</p><div className="mt-3 flex flex-wrap gap-2">{summary.intents.map((item) => <Badge key={item.intent} variant="outline">{item.intent} · {Number(item.citations).toLocaleString("pt-BR")}</Badge>)}</div></div>
              </div>
            )}

            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">Histórico de importações</p><p className="text-xs text-muted-foreground">Cada arquivo vira um snapshot; arquivos idênticos são bloqueados automaticamente.</p></div>{summary.currentImport && <span className="text-xs text-muted-foreground">Atual: {dateLabel(summary.currentImport.imported_at)}</span>}</div>
              <div className="mt-3 divide-y rounded-md border">{imports.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm">{item.file_name || "Bing AI Performance"}</p><p className="text-xs text-muted-foreground">{Number(item.row_count).toLocaleString("pt-BR")} linhas · {dateLabel(item.imported_at)}{item.period_start || item.period_end ? ` · período ${dateLabel(item.period_start)}–${dateLabel(item.period_end)}` : ""}</p></div><Button size="icon" variant="ghost" aria-label="Excluir snapshot" onClick={() => void removeImport(item)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
