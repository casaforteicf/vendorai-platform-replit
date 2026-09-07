import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronUp, History, RefreshCw, Search } from "lucide-react";

type HistoryItem = {
  id: string;
  usuarioId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  antes?: unknown;
  depois?: unknown;
  ip?: string | null;
  createdAt: string;
};

type HistoryPayload = {
  items?: HistoryItem[];
  limit?: number;
};

type RiskLevel = "baixo" | "medio" | "alto" | "critico";

type ChangedField = {
  path: string;
  before: unknown;
  after: unknown;
};

const ENTITY_LABELS: Record<string, string> = {
  business_profile: "Empresa",
  agent_config: "IA e Agentes",
  tenant_agent_config: "IA e Agentes",
  contract_settings: "Documentos",
  contract_template: "Documentos",
  tenant_integrations: "Integrações",
  whatsapp_connection: "WhatsApp",
  instagram_connection: "Instagram",
  google_ads_connection: "Google Ads",
  search_console_connection: "Search Console",
  google_calendar_connection: "Google Calendar",
  meta_ads_connection: "Meta Ads",
  social_connection: "Redes sociais",
};

const ACTION_LABELS: Record<string, string> = {
  criar: "Criado",
  atualizar: "Atualizado",
  excluir: "Excluído",
  conectar: "Conectado",
  reconectar: "Reconectado",
  desconectar: "Desconectado",
};

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  name: "Nome",
  email: "E-mail",
  telefone: "Telefone",
  phone: "Telefone",
  segmento: "Segmento",
  address: "Endereço",
  endereco: "Endereço",
  templateName: "Nome do modelo",
  templateHtml: "Conteúdo do modelo",
  settings: "Parâmetros",
  active: "Ativo",
  ativo: "Ativo",
  enabled: "Habilitado",
  connected: "Conectado",
  status: "Status",
  accountName: "Conta",
  accountId: "ID da conta",
  pageName: "Página",
  pageId: "ID da página",
  phoneNumber: "Número",
  username: "Usuário",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  critico: "Crítico",
};

const RISK_CLASSES: Record<RiskLevel, string> = {
  baixo: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medio: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  alto: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  critico: "border-destructive/40 bg-destructive/10 text-destructive",
};

const INTEGRATION_ENTITIES = new Set([
  "tenant_integrations",
  "whatsapp_connection",
  "instagram_connection",
  "google_ads_connection",
  "search_console_connection",
  "google_calendar_connection",
  "meta_ads_connection",
  "social_connection",
]);

const CONTRACT_ENTITIES = new Set(["contract_settings", "contract_template"]);
const AGENT_ENTITIES = new Set(["agent_config", "tenant_agent_config"]);
const SENSITIVE_KEY_PATTERN = /(token|secret|senha|password|api.?key|authorization|cookie|credential|webhook.?secret)/i;

function containsSensitiveKey(value: unknown, depth = 0): boolean {
  if (depth > 5 || value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => (
    SENSITIVE_KEY_PATTERN.test(key) || containsSensitiveKey(child, depth + 1)
  ));
}

function riskFor(item: HistoryItem): RiskLevel {
  if (containsSensitiveKey(item.antes) || containsSensitiveKey(item.depois)) return "critico";
  if (item.acao === "excluir") return "critico";
  if (INTEGRATION_ENTITIES.has(item.entidade)) return "alto";
  if (CONTRACT_ENTITIES.has(item.entidade)) return "alto";
  if (AGENT_ENTITIES.has(item.entidade)) return "medio";
  if (item.entidade === "business_profile") return "baixo";
  return "medio";
}

function stableValue(value: unknown) {
  if (value === undefined) return "__undefined__";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function changedFields(before: unknown, after: unknown, prefix = "", depth = 0): ChangedField[] {
  if (depth > 4 || (!isPlainObject(before) && !isPlainObject(after))) {
    return stableValue(before) === stableValue(after) ? [] : [{ path: prefix || "valor", before, after }];
  }

  const beforeObject = isPlainObject(before) ? before : {};
  const afterObject = isPlainObject(after) ? after : {};
  const keys = Array.from(new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])).sort();
  const changes: ChangedField[] = [];

  keys.forEach((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const beforeValue = beforeObject[key];
    const afterValue = afterObject[key];

    if (isPlainObject(beforeValue) || isPlainObject(afterValue)) {
      changes.push(...changedFields(beforeValue, afterValue, path, depth + 1));
      return;
    }

    if (stableValue(beforeValue) !== stableValue(afterValue)) {
      changes.push({ path, before: beforeValue, after: afterValue });
    }
  });

  return changes;
}

function humanizeField(path: string) {
  const key = path.split(".").pop() || path;
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactValue(value: unknown) {
  const text = formatValue(value).replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function actorKey(item: HistoryItem) {
  return item.usuarioId || item.actorEmail || item.actorName || "__system__";
}

function actorLabel(item: HistoryItem) {
  if (item.actorName && item.actorEmail) return `${item.actorName} · ${item.actorEmail}`;
  return item.actorName || item.actorEmail || "Sistema";
}

export function ConfigurationHistoryPanel() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/configuration-history?limit=100`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as HistoryPayload;
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setError("Não foi possível carregar o histórico agora.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) void load();
  }, [tenantId]);

  const areas = useMemo(() => {
    return Array.from(new Set(items.map((item) => ENTITY_LABELS[item.entidade] ?? item.entidade))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const actors = useMemo(() => {
    const byKey = new Map<string, string>();
    items.forEach((item) => byKey.set(actorKey(item), actorLabel(item)));
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [items]);

  const criticalCount = useMemo(() => items.filter((item) => riskFor(item) === "critico").length, [items]);

  const filteredItems = useMemo(() => {
    const query = searchFilter.trim().toLocaleLowerCase("pt-BR");
    const from = dateFromFilter ? new Date(`${dateFromFilter}T00:00:00`) : null;
    const to = dateToFilter ? new Date(`${dateToFilter}T23:59:59.999`) : null;

    return items.filter((item) => {
      const area = ENTITY_LABELS[item.entidade] ?? item.entidade;
      const risk = riskFor(item);
      if (actionFilter !== "all" && item.acao !== actionFilter) return false;
      if (areaFilter !== "all" && area !== areaFilter) return false;
      if (riskFilter !== "all" && risk !== riskFilter) return false;
      if (actorFilter !== "all" && actorKey(item) !== actorFilter) return false;

      const createdAt = new Date(item.createdAt);
      if (from && !Number.isNaN(createdAt.getTime()) && createdAt < from) return false;
      if (to && !Number.isNaN(createdAt.getTime()) && createdAt > to) return false;
      if (!query) return true;

      const searchable = [
        area,
        ACTION_LABELS[item.acao] ?? item.acao,
        item.entidade,
        item.actorName,
        item.actorEmail,
        ...changedFields(item.antes, item.depois).flatMap((field) => [field.path, humanizeField(field.path), compactValue(field.before), compactValue(field.after)]),
      ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");

      return searchable.includes(query);
    });
  }, [items, actionFilter, areaFilter, riskFilter, actorFilter, dateFromFilter, dateToFilter, searchFilter]);

  const hasFilters = Boolean(
    searchFilter ||
    actionFilter !== "all" ||
    areaFilter !== "all" ||
    riskFilter !== "all" ||
    actorFilter !== "all" ||
    dateFromFilter ||
    dateToFilter
  );

  const clearFilters = () => {
    setSearchFilter("");
    setActionFilter("all");
    setAreaFilter("all");
    setRiskFilter("all");
    setActorFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
  };

  return (
    <section className="mb-4 rounded-xl border bg-background p-3 sm:p-4" aria-label="Histórico de alterações das configurações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Histórico de alterações</strong>
              <Badge variant="secondary" className="text-[10px]">{items.length} registros</Badge>
              {criticalCount > 0 && (
                <Badge variant="outline" className={`text-[10px] ${RISK_CLASSES.critico}`}>
                  <AlertTriangle className="mr-1 h-3 w-3" />{criticalCount} crítico(s)
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Veja quem alterou as configurações, quando, quais campos mudaram e os valores registrados antes e depois.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
            {expanded ? "Ocultar" : "Ver histórico"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium">
              Buscar
              <span className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm"
                  value={searchFilter}
                  onChange={(event) => setSearchFilter(event.target.value)}
                  placeholder="Campo, usuário ou valor"
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Ação
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">Todas</option>
                <option value="criar">Criado</option>
                <option value="atualizar">Atualizado</option>
                <option value="excluir">Excluído</option>
                <option value="conectar">Conectado</option>
                <option value="reconectar">Reconectado</option>
                <option value="desconectar">Desconectado</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Área
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
                <option value="all">Todas</option>
                {areas.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Risco
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as "all" | RiskLevel)}>
                <option value="all">Todos</option>
                <option value="critico">Crítico</option>
                <option value="alto">Alto</option>
                <option value="medio">Médio</option>
                <option value="baixo">Baixo</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium sm:col-span-2 lg:col-span-2">
              Usuário
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                <option value="all">Todos os usuários</option>
                {actors.map((actor) => <option key={actor.key} value={actor.key}>{actor.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              De
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={dateFromFilter}
                max={dateToFilter || undefined}
                onChange={(event) => setDateFromFilter(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Até
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={dateToFilter}
                min={dateFromFilter || undefined}
                onChange={(event) => setDateToFilter(event.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{filteredItems.length} alteração(ões) exibida(s)</span>
            {hasFilters && (
              <button type="button" className="font-medium underline underline-offset-2" onClick={clearFilters}>Limpar filtros</button>
            )}
          </div>

          {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
          {!error && !loading && filteredItems.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma alteração encontrada para os filtros selecionados.</p>
          )}

          <div className="space-y-2">
            {filteredItems.map((item) => {
              const area = ENTITY_LABELS[item.entidade] ?? item.entidade;
              const action = ACTION_LABELS[item.acao] ?? item.acao;
              const risk = riskFor(item);
              const open = openItemId === item.id;
              const actor = item.actorName || item.actorEmail || "Sistema";
              const fields = changedFields(item.antes, item.depois);
              return (
                <article key={item.id} className="rounded-lg border bg-muted/20">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 p-3 text-left"
                    onClick={() => setOpenItemId(open ? null : item.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{area}</span>
                        <Badge variant="outline" className="text-[10px]">{action}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${RISK_CLASSES[risk]}`}>
                          {risk === "critico" && <AlertTriangle className="mr-1 h-3 w-3" />}
                          Risco {RISK_LABELS[risk]}
                        </Badge>
                        {fields.length > 0 && <Badge variant="secondary" className="text-[10px]">{fields.length} campo(s)</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{actor}</span>
                        <span>{formatDate(item.createdAt)}</span>
                        {item.actorEmail && item.actorName && <span>{item.actorEmail}</span>}
                      </div>
                    </div>
                    {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  </button>

                  {open && (
                    <div className="space-y-3 border-t p-3">
                      {fields.length > 0 && (
                        <div className="overflow-hidden rounded-md border bg-background">
                          <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campos alterados</div>
                          <div className="divide-y">
                            {fields.map((field) => (
                              <div key={field.path} className="grid gap-2 p-3 text-xs md:grid-cols-[minmax(140px,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
                                <div>
                                  <div className="font-semibold">{humanizeField(field.path)}</div>
                                  <div className="mt-0.5 break-all text-[10px] text-muted-foreground">{field.path}</div>
                                </div>
                                <div className="min-w-0 rounded bg-muted/40 p-2">
                                  <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Antes</div>
                                  <div className="break-words whitespace-pre-wrap">{compactValue(field.before)}</div>
                                </div>
                                <div className="min-w-0 rounded bg-muted/40 p-2">
                                  <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Depois</div>
                                  <div className="break-words whitespace-pre-wrap">{compactValue(field.after)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <details className="rounded-md border bg-background">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Ver snapshot técnico completo</summary>
                        <div className="grid gap-3 border-t p-3 lg:grid-cols-2">
                          <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Antes</div>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px] leading-5">{formatValue(item.antes)}</pre>
                          </div>
                          <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Depois</div>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px] leading-5">{formatValue(item.depois)}</pre>
                          </div>
                        </div>
                      </details>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                        <span>Entidade: {item.entidade}</span>
                        {item.entidadeId && <span>ID: {item.entidadeId}</span>}
                        {item.ip && <span>IP: {item.ip}</span>}
                        <span>Risco: {RISK_LABELS[risk]}</span>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
