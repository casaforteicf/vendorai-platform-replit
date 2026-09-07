import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronUp, History, RefreshCw } from "lucide-react";

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

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

  const criticalCount = useMemo(() => items.filter((item) => riskFor(item) === "critico").length, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const area = ENTITY_LABELS[item.entidade] ?? item.entidade;
      const risk = riskFor(item);
      if (actionFilter !== "all" && item.acao !== actionFilter) return false;
      if (areaFilter !== "all" && area !== areaFilter) return false;
      if (riskFilter !== "all" && risk !== riskFilter) return false;
      return true;
    });
  }, [items, actionFilter, areaFilter, riskFilter]);

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
              Veja quem alterou as configurações, quando, o nível de risco e os valores registrados antes e depois.
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
          <div className="grid gap-2 sm:grid-cols-3">
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
                    <div className="grid gap-3 border-t p-3 lg:grid-cols-2">
                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Antes</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 text-[11px] leading-5">{formatValue(item.antes)}</pre>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Depois</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 text-[11px] leading-5">{formatValue(item.depois)}</pre>
                      </div>
                      <div className="lg:col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
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
