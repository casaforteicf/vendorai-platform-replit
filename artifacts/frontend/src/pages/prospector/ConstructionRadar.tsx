import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CheckCircle2,
  Database,
  ExternalLink,
  HardHat,
  Layers3,
  Lightbulb,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useProspectorEnrich } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

const OBRASGOV_BASE_URL = "https://api-publica.obrasgov.gestao.gov.br/obras";
const OBRASGOV_DOCS_URL = "https://api-publica.obrasgov.gestao.gov.br/obras/docs";
const WATCH_STORAGE_KEY = "vendorai_prospector_obras_salvas_v1";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const SITUACOES = ["Cadastrada", "Em execução", "Paralisada", "Inacabada", "Concluída", "Cancelada"];

type PriorityFilter = "todas" | "quentes" | "antecipadas" | "monitorar";
type ResultTab = "priorizadas" | "carregadas" | "responsavel" | "crm" | "descartadas";

type ObrasGovProject = {
  id_projeto_investimento?: string | null;
  desc_nome?: string | null;
  desc_endereco?: string | null;
  desc_projeto?: string | null;
  desc_funcao_social?: string | null;
  desc_meta_global?: string | null;
  dt_inicial_prevista?: string | null;
  dt_final_prevista?: string | null;
  dt_inicial_efetiva?: string | null;
  dt_final_efetiva?: string | null;
  dt_cadastro?: string | null;
  natureza_intervencao?: string | null;
  especie_intervencao?: string | null;
  situacao?: string | null;
  uf_principal?: string | null;
  organizacao_resp?: string | null;
  cnpj_organizacao_resp?: string | null;
  populacao_beneficiada?: number | null;
  qtd_empregos_gerados?: number | null;
  sistema_resp?: string | null;
  investimentos_previstos?: Array<{
    vl_investimento_previsto?: number | null;
    desc_nome_fonte_recurso?: string | null;
  }> | null;
};

type ObrasGovEnvelope = {
  data?: ObrasGovProject[];
  total_pages?: number;
  total_items?: number;
  page_number?: number;
  page_size?: number;
  detail?: unknown;
};

function projectKey(project: ObrasGovProject) {
  return project.id_projeto_investimento || `${project.organizacao_resp ?? "sem-responsavel"}:${project.desc_nome ?? project.desc_endereco ?? "obra"}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : `${value}T12:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value}T12:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysFromNow(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

function scoreProject(project: ObrasGovProject) {
  const status = (project.situacao ?? "").toLocaleLowerCase("pt-BR");
  let score = 48;

  if (status.includes("em execução")) score = 84;
  else if (status.includes("cadastrada")) score = 76;
  else if (status.includes("inacabada")) score = 61;
  else if (status.includes("paralisada")) score = 52;
  else if (status.includes("concluída")) score = 28;
  else if (status.includes("cancelada")) score = 8;

  const plannedDays = daysFromNow(project.dt_inicial_prevista);
  if (plannedDays != null && plannedDays >= -30 && plannedDays <= 180) score += 9;

  const effectiveDays = daysFromNow(project.dt_inicial_efetiva);
  if (effectiveDays != null && effectiveDays <= 0 && effectiveDays >= -180) score += 6;

  if (project.organizacao_resp) score += 5;
  if (project.cnpj_organizacao_resp) score += 2;
  if (project.desc_endereco) score += 2;
  if (project.natureza_intervencao || project.especie_intervencao) score += 1;

  return Math.max(0, Math.min(100, score));
}

function phaseLabel(project: ObrasGovProject, score: number) {
  const status = (project.situacao ?? "").toLocaleLowerCase("pt-BR");
  if (status.includes("cadastrada")) return "Pré-obra / entrar cedo";
  if (status.includes("em execução") && score >= 85) return "Execução / agir agora";
  if (status.includes("em execução")) return "Execução / qualificar fase";
  if (status.includes("paralisada") || status.includes("inacabada")) return "Retomada potencial";
  if (status.includes("concluída")) return "Pós-obra / baixa prioridade";
  return "Validar momento";
}

function opportunityReason(project: ObrasGovProject, score: number) {
  const status = project.situacao ?? "situação não informada";
  const plannedDays = daysFromNow(project.dt_inicial_prevista);
  if (plannedDays != null && plannedDays >= 0 && plannedDays <= 180) {
    return `Início previsto nos próximos ${plannedDays} dias — boa janela para entrar antes das próximas contratações.`;
  }
  if (score >= 88) return `Obra em ${status.toLocaleLowerCase("pt-BR")} com sinais fortes para abordagem imediata.`;
  if (score >= 70) return `Projeto em ${status.toLocaleLowerCase("pt-BR")}: oportunidade de antecipar contato e mapear necessidades.`;
  if (score >= 50) return "Sinal relevante, mas ainda exige validação da fase, responsável e cronograma.";
  return "Baixa prioridade neste momento. Mantenha no radar e acompanhe mudança de fase.";
}

function scoreBadge(score: number) {
  if (score >= 85) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 70) return "border-amber-200 bg-amber-50 text-amber-800";
  if (score >= 50) return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-border bg-muted text-muted-foreground";
}

function numberLabel(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return new Intl.NumberFormat("pt-BR").format(Number(value));
}

function investmentValue(project: ObrasGovProject) {
  const values = project.investimentos_previstos ?? [];
  const total = values.reduce((sum, item) => sum + (Number(item.vl_investimento_previsto) || 0), 0);
  return total > 0 ? total : null;
}

function formatCurrency(value: number | null) {
  if (value == null) return "Não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ConstructionRadar() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const enrich = useProspectorEnrich();

  const [uf, setUf] = useState("SC");
  const [situacao, setSituacao] = useState("Em execução");
  const [keyword, setKeyword] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("todas");
  const [onlyResponsible, setOnlyResponsible] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("priorizadas");
  const [projects, setProjects] = useState<ObrasGovProject[]>([]);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prospectingId, setProspectingId] = useState<string | null>(null);
  const [bulkProspecting, setBulkProspecting] = useState(false);
  const [prospectedIds, setProspectedIds] = useState<Set<string>>(new Set());
  const [createdIds, setCreatedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());
  const [superAdminTenantId, setSuperAdminTenantId] = useState("");
  const [lastQueryAt, setLastQueryAt] = useState<Date | null>(null);

  const isSuperAdmin = user?.platformRole === "super_admin";
  const effectiveTenantId = isSuperAdmin && tenantOverride?.id
    ? tenantOverride.id
    : user?.tenantId ?? (isSuperAdmin ? superAdminTenantId.trim() : "");

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCH_STORAGE_KEY) ?? "[]") as string[];
      if (Array.isArray(parsed)) setSavedIds(new Set(parsed.filter((value) => typeof value === "string")));
    } catch {
      setSavedIds(new Set());
    }
  }, []);

  function persistSaved(next: Set<string>) {
    setSavedIds(next);
    localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify([...next]));
  }

  const stats = useMemo(() => {
    const operational = projects.filter((project) => !discardedIds.has(projectKey(project)));
    const withResponsible = operational.filter((project) => project.organizacao_resp).length;
    const hot = operational.filter((project) => scoreProject(project) >= 85).length;
    const early = operational.filter((project) => {
      const score = scoreProject(project);
      return score >= 70 && score < 85;
    }).length;
    return {
      loaded: operational.length,
      withResponsible,
      hot,
      early,
      prioritized: hot + early,
    };
  }, [projects, discardedIds]);

  const visibleProjects = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("pt-BR");
    return [...projects]
      .filter((project) => {
        const id = projectKey(project);
        const discarded = discardedIds.has(id);

        if (activeTab === "descartadas") {
          if (!discarded) return false;
        } else if (discarded) {
          return false;
        }

        const score = scoreProject(project);
        if (activeTab === "priorizadas" && score < 70) return false;
        if (activeTab === "responsavel" && !project.organizacao_resp) return false;
        if (activeTab === "crm" && !prospectedIds.has(id)) return false;

        if (term) {
          const matches = [
            project.desc_nome,
            project.desc_projeto,
            project.desc_endereco,
            project.organizacao_resp,
            project.natureza_intervencao,
            project.especie_intervencao,
            project.uf_principal,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
          if (!matches) return false;
        }

        if (onlyResponsible && !project.organizacao_resp) return false;
        if (priority === "quentes" && score < 85) return false;
        if (priority === "antecipadas" && (score < 70 || score >= 85)) return false;
        if (priority === "monitorar" && (score < 50 || score >= 70)) return false;
        return true;
      })
      .sort((a, b) => scoreProject(b) - scoreProject(a));
  }, [projects, activeTab, keyword, onlyResponsible, priority, discardedIds, prospectedIds]);

  const selectableVisible = visibleProjects.filter((project) => project.organizacao_resp && activeTab !== "descartadas");
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((project) => selectedIds.has(projectKey(project)));
  const hasLocalFilters = Boolean(keyword.trim()) || priority !== "todas" || onlyResponsible;

  function resetLocalFilters() {
    setKeyword("");
    setPriority("todas");
    setOnlyResponsible(false);
  }

  function buildSourceParams(requestedPage: number) {
    const params = new URLSearchParams({ pagina: String(requestedPage), tamanho_da_pagina: "100" });
    if (uf !== "todos") params.set("uf_principal", uf);
    if (situacao !== "todas") params.set("situacao", situacao);
    return params;
  }

  async function fetchSourcePage(requestedPage: number) {
    const response = await fetch(`${OBRASGOV_BASE_URL}/projeto-investimento?${buildSourceParams(requestedPage).toString()}`, {
      headers: { Accept: "application/json" },
    });
    const body = (await response.json().catch(() => ({}))) as ObrasGovEnvelope;
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (!Array.isArray(body.data)) throw new Error("A fonte retornou um formato inesperado.");
    return body;
  }

  async function requestPage(nextPage: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const body = await fetchSourcePage(nextPage);
      setProjects((current) => {
        if (!append) return body.data ?? [];
        const map = new Map<string, ObrasGovProject>();
        [...current, ...(body.data ?? [])].forEach((project) => map.set(projectKey(project), project));
        return [...map.values()];
      });
      setTotalItems(typeof body.total_items === "number" ? body.total_items : body.data?.length ?? 0);
      setTotalPages(typeof body.total_pages === "number" ? body.total_pages : nextPage);
      setPage(typeof body.page_number === "number" ? body.page_number : nextPage);
      setSearched(true);
      setLastQueryAt(new Date());
      if (!append) {
        setSelectedIds(new Set());
        setDiscardedIds(new Set());
        setActiveTab("priorizadas");
        toast({
          title: `${body.data?.length ?? 0} obra(s) carregada(s)`,
          description: typeof body.total_items === "number" ? `${body.total_items} registro(s) encontrados na fonte oficial.` : undefined,
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível consultar a fonte.";
      setError(message);
      if (!append) setProjects([]);
      setSearched(true);
      toast({ title: "Falha ao consultar ObrasGov", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadAllResults() {
    if (page <= 0 || page >= totalPages) return;
    setLoadingAll(true);
    setError(null);
    try {
      const collected: ObrasGovProject[] = [];
      for (let nextPage = page + 1; nextPage <= totalPages; nextPage += 1) {
        const body = await fetchSourcePage(nextPage);
        collected.push(...(body.data ?? []));
      }
      setProjects((current) => {
        const map = new Map<string, ObrasGovProject>();
        [...current, ...collected].forEach((project) => map.set(projectKey(project), project));
        return [...map.values()];
      });
      setPage(totalPages);
      setLastQueryAt(new Date());
      toast({ title: "Todos os resultados foram carregados", description: `${numberLabel(totalItems) ?? projects.length + collected.length} obra(s) disponíveis para análise.` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível carregar todos os resultados.";
      setError(message);
      toast({ title: "Falha ao carregar todos os resultados", description: message, variant: "destructive" });
    } finally {
      setLoadingAll(false);
    }
  }

  async function prospectResponsible(project: ObrasGovProject, silent = false) {
    const nomeEmpresa = project.organizacao_resp?.trim();
    if (!nomeEmpresa) {
      if (!silent) toast({ title: "Responsável não identificado", description: "Esta obra ainda não informa uma organização responsável.", variant: "destructive" });
      return { status: "missing" as const };
    }
    if (isSuperAdmin && !effectiveTenantId) {
      if (!silent) toast({ title: "Selecione um tenant", description: "Super admin precisa estar em um tenant ou informar o tenantId alvo.", variant: "destructive" });
      return { status: "missing-tenant" as const };
    }

    const id = projectKey(project);
    if (!silent) setProspectingId(id);
    try {
      const result = await enrich.mutateAsync({
        data: {
          nomeEmpresa,
          endereco: [project.desc_endereco, project.uf_principal].filter(Boolean).join(", ") || undefined,
          ...(isSuperAdmin && effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
        },
      });
      const duplicate = Boolean((result as { isDuplicate?: boolean }).isDuplicate);
      if (result.saved) {
        setProspectedIds((current) => new Set(current).add(id));
        if (!duplicate) setCreatedIds((current) => new Set(current).add(id));
      }
      if (!silent) {
        if (!result.saved) {
          toast({ title: "Responsável localizado, mas sem canal útil", description: result.reason ?? "Não foi possível criar o lead." });
        } else if (duplicate) {
          toast({ title: "Responsável já estava no CRM", description: "O registro existente foi preservado e a obra serviu como sinal de prospecção." });
        } else {
          toast({ title: "Lead e negócio criados", description: "O responsável foi enriquecido e entrou no fluxo comercial com score e briefing." });
        }
      }
      return { status: result.saved ? (duplicate ? "duplicate" as const : "created" as const) : "not-saved" as const };
    } catch (cause) {
      if (!silent) toast({ title: "Falha ao prospectar responsável", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
      return { status: "error" as const };
    } finally {
      if (!silent) setProspectingId(null);
    }
  }

  async function prospectSelected() {
    if (selectedIds.size === 0) return;
    setBulkProspecting(true);
    const selected = projects.filter((project) => selectedIds.has(projectKey(project)) && project.organizacao_resp);
    const uniqueByCompany = new Map<string, ObrasGovProject>();
    selected.forEach((project) => {
      const company = project.organizacao_resp!.trim().toLocaleLowerCase("pt-BR");
      if (!uniqueByCompany.has(company)) uniqueByCompany.set(company, project);
    });

    let created = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const project of uniqueByCompany.values()) {
      const result = await prospectResponsible(project, true);
      if (result.status === "created") created += 1;
      else if (result.status === "duplicate") duplicates += 1;
      else skipped += 1;
    }
    setBulkProspecting(false);
    setSelectedIds(new Set());
    toast({
      title: "Prospecção em lote concluída",
      description: `${created} novo(s), ${duplicates} já existente(s), ${skipped} não processado(s).`,
    });
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        selectableVisible.forEach((project) => next.delete(projectKey(project)));
      } else {
        selectableVisible.forEach((project) => next.add(projectKey(project)));
      }
      return next;
    });
  }

  function discardOne(id: string) {
    setDiscardedIds((current) => new Set(current).add(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function discardSelected() {
    if (selectedIds.size === 0) return;
    setDiscardedIds((current) => {
      const next = new Set(current);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    toast({ title: "Oportunidades descartadas", description: "Elas continuam disponíveis na aba Descartadas." });
  }

  const tabItems: Array<{ key: ResultTab; label: string; count: number }> = [
    { key: "priorizadas", label: "Priorizadas", count: stats.prioritized },
    { key: "carregadas", label: "Carregadas", count: stats.loaded },
    { key: "responsavel", label: "Com responsável", count: stats.withResponsible },
    { key: "crm", label: "No CRM", count: prospectedIds.size },
    { key: "descartadas", label: "Descartadas", count: discardedIds.size },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Prospector / Radar de Obras</div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Target className="h-6 w-6 text-primary" /> Radar de Obras
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Encontre, avalie e transforme obras públicas em oportunidades de negócio — sem confundir fonte oficial com lead do CRM.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href={OBRASGOV_DOCS_URL} target="_blank" rel="noopener noreferrer">
            Fonte oficial <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[140px_170px_190px_minmax(240px,1fr)_auto_auto] xl:items-end">
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Brasil inteiro</SelectItem>
                  {UFS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {SITUACOES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as PriorityFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="quentes">Quentes — agir agora</SelectItem>
                  <SelectItem value="antecipadas">Antecipadas — entrar cedo</SelectItem>
                  <SelectItem value="monitorar">Monitorar — validar fase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cidade, região ou obra</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Filtrar resultados carregados..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
              </div>
            </div>
            <div className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md border px-3">
              <Switch checked={onlyResponsible} onCheckedChange={setOnlyResponsible} aria-label="Somente com responsável" />
              <span className="text-xs font-medium">Só com responsável</span>
            </div>
            <Button onClick={() => requestPage(1, false)} disabled={loading} className="h-10 min-w-36">
              {loading ? <><Spinner className="mr-2 h-4 w-4" /> Consultando</> : <><Search className="mr-2 h-4 w-4" /> Buscar obras</>}
            </Button>
          </div>

          {isSuperAdmin && !tenantOverride?.id && !user?.tenantId && (
            <div className="mt-3 max-w-md space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Label className="text-amber-900">Tenant alvo</Label>
              <Input value={superAdminTenantId} onChange={(event) => setSuperAdminTenantId(event.target.value)} placeholder="tenantId" />
            </div>
          )}
        </CardContent>
      </Card>

      {searched && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Fonte oficial</span><Database className="h-4 w-4 text-blue-600" /></div><p className="text-2xl font-bold">{numberLabel(totalItems) ?? projects.length}</p><p className="text-[11px] text-muted-foreground">obras encontradas</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Carregadas</span><Layers3 className="h-4 w-4 text-emerald-600" /></div><p className="text-2xl font-bold">{projects.length}</p><p className="text-[11px] text-muted-foreground">disponíveis nesta busca</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Priorizadas</span><Star className="h-4 w-4 text-amber-600" /></div><p className="text-2xl font-bold">{stats.prioritized}</p><p className="text-[11px] text-muted-foreground">score ≥ 70</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Com responsável</span><Users className="h-4 w-4 text-blue-600" /></div><p className="text-2xl font-bold">{stats.withResponsible}</p><p className="text-[11px] text-muted-foreground">aptas a enriquecer</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Leads criados</span><UserPlus className="h-4 w-4 text-violet-600" /></div><p className="text-2xl font-bold">{createdIds.size}</p><p className="text-[11px] text-muted-foreground">nesta sessão</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Negócios criados</span><Briefcase className="h-4 w-4 text-primary" /></div><p className="text-2xl font-bold">{createdIds.size}</p><p className="text-[11px] text-muted-foreground">junto com novos leads</p></CardContent></Card>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="grid gap-0 p-0 sm:grid-cols-5">
              {[
                { label: "Fonte oficial", value: numberLabel(totalItems) ?? projects.length, icon: Database },
                { label: "Carregadas", value: projects.length, icon: Layers3 },
                { label: "Priorizadas", value: stats.prioritized, icon: Star },
                { label: "No CRM", value: prospectedIds.size, icon: Users },
                { label: "Negócios", value: createdIds.size, icon: Briefcase },
              ].map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="relative flex items-center gap-3 border-b p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                    <div className={`rounded-full p-2 ${index <= 2 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="h-4 w-4" /></div>
                    <div><p className="text-xs font-semibold">{step.label}</p><p className="text-[11px] text-muted-foreground">{step.value} obra(s)</p></div>
                    {index < 4 && <ArrowRight className="absolute -right-2 z-10 hidden h-4 w-4 rounded-full bg-background text-muted-foreground sm:block" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div><p className="font-semibold text-destructive">A fonte não respondeu como esperado</p><p className="mt-1 text-muted-foreground">{error}</p></div>
          </CardContent>
        </Card>
      )}

      {searched && !error && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="border-b pb-0">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Oportunidades de obras</CardTitle>
                    <CardDescription>O score prioriza a investigação; a decisão comercial continua sendo humana.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => requestPage(1, false)} disabled={loading}>
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
                  </Button>
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {tabItems.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} className="h-4 w-4 rounded border-input accent-primary" />
                    {selectedIds.size} selecionada(s)
                  </label>
                  <Button size="sm" onClick={prospectSelected} disabled={selectedIds.size === 0 || bulkProspecting || enrich.isPending}>
                    {bulkProspecting ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />} Criar leads
                  </Button>
                  <Button size="sm" variant="outline" onClick={discardSelected} disabled={selectedIds.size === 0}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Descartar</Button>
                </div>
                {hasLocalFilters && <Button size="sm" variant="ghost" onClick={resetLocalFilters}>Limpar filtros locais</Button>}
              </div>

              {visibleProjects.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <HardHat className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Nenhuma obra aparece nesta visão.</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    {projects.length > 0
                      ? "Existem obras carregadas, mas os filtros ou a aba atual estão ocultando os resultados."
                      : "Faça uma busca para carregar oportunidades da fonte oficial."}
                  </p>
                  {projects.length > 0 && (
                    <div className="mt-4 flex justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => { resetLocalFilters(); setActiveTab("carregadas"); }}>Ver todas as carregadas</Button>
                      {hasLocalFilters && <Button size="sm" onClick={resetLocalFilters}>Limpar filtros</Button>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {visibleProjects.map((project) => {
                    const id = projectKey(project);
                    const score = scoreProject(project);
                    const isSelected = selectedIds.has(id);
                    const isSaved = savedIds.has(id);
                    const done = prospectedIds.has(id);
                    const isProspecting = prospectingId === id && enrich.isPending;
                    const investment = investmentValue(project);
                    return (
                      <div key={id} className={`p-4 transition-colors ${isSelected ? "bg-primary/[0.025]" : "hover:bg-muted/20"}`}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <div className="flex items-start gap-3 lg:flex-1">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-primary"
                              checked={isSelected}
                              disabled={!project.organizacao_resp || activeTab === "descartadas"}
                              aria-label={`Selecionar ${project.desc_nome ?? "obra"}`}
                              onChange={() => setSelectedIds((current) => {
                                const next = new Set(current);
                                if (next.has(id)) next.delete(id); else next.add(id);
                                return next;
                              })}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold">{project.desc_nome || project.desc_projeto || "Projeto sem nome"}</h3>
                                {project.situacao && <Badge variant="outline" className="text-[10px]">{project.situacao}</Badge>}
                                <Badge variant="secondary" className="text-[10px]">{phaseLabel(project, score)}</Badge>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.desc_endereco || project.uf_principal || "Local não informado"}</span>
                                <span>{project.organizacao_resp || "Responsável não informado"}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {project.organizacao_resp && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Com responsável</Badge>}
                                {project.uf_principal && <Badge variant="secondary">{project.uf_principal}</Badge>}
                                {project.desc_funcao_social && <Badge variant="outline">{project.desc_funcao_social}</Badge>}
                                {score >= 85 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Potencial alto</Badge>}
                              </div>
                              <div className="mt-3 rounded-lg border border-primary/10 bg-primary/[0.02] px-3 py-2 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />Por que agora:</span> {opportunityReason(project, score)}
                              </div>
                            </div>
                          </div>

                          <div className="grid shrink-0 grid-cols-2 gap-2 lg:w-[330px]">
                            <div className="rounded-lg bg-muted/40 p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Investimento previsto</p>
                              <p className="mt-1 text-xs font-semibold">{formatCurrency(investment)}</p>
                            </div>
                            <div className={`rounded-lg border p-2.5 text-center ${scoreBadge(score)}`}>
                              <p className="text-[10px] uppercase tracking-wide">Score</p>
                              <p className="mt-1 text-xl font-bold leading-none">{score}</p>
                            </div>
                            <Button
                              size="sm"
                              className="col-span-2"
                              variant={done ? "outline" : "default"}
                              disabled={!project.organizacao_resp || done || isProspecting || enrich.isPending || bulkProspecting || activeTab === "descartadas"}
                              onClick={() => void prospectResponsible(project)}
                            >
                              {isProspecting ? <><Spinner className="mr-1.5 h-3.5 w-3.5" /> Criando...</> : done ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> No CRM</> : <><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Criar lead</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const next = new Set(savedIds);
                                if (next.has(id)) next.delete(id); else next.add(id);
                                persistSaved(next);
                              }}
                            >
                              {isSaved ? <BookmarkCheck className="mr-1.5 h-3.5 w-3.5" /> : <Bookmark className="mr-1.5 h-3.5 w-3.5" />}
                              {isSaved ? "Salva" : "Salvar"}
                            </Button>
                            {activeTab === "descartadas" ? (
                              <Button size="sm" variant="outline" onClick={() => setDiscardedIds((current) => { const next = new Set(current); next.delete(id); return next; })}>Restaurar</Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => discardOne(id)}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Descartar</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {projects.length > 0 && (
                <div className="flex flex-col gap-2 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Mostrando {projects.length} de {numberLabel(totalItems) ?? projects.length} resultados carregados</p>
                  <div className="flex flex-wrap gap-2">
                    {page > 0 && page < totalPages && (
                      <Button size="sm" variant="outline" onClick={() => requestPage(page + 1, true)} disabled={loadingMore || loadingAll}>
                        {loadingMore ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Layers3 className="mr-1.5 h-3.5 w-3.5" />} Carregar mais 100
                      </Button>
                    )}
                    {page > 0 && page < totalPages && (
                      <Button size="sm" variant="outline" onClick={loadAllResults} disabled={loadingAll || loadingMore}>
                        {loadingAll ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Database className="mr-1.5 h-3.5 w-3.5" />} Carregar tudo ({numberLabel(totalItems) ?? ""})
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-amber-600" /> Obras carregadas não são leads automaticamente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground">
                <p>As obras são oportunidades identificadas na fonte oficial. Analise, priorize e transforme as mais relevantes em leads para iniciar o relacionamento.</p>
                <Button className="w-full" size="sm" onClick={prospectSelected} disabled={selectedIds.size === 0 || bulkProspecting || enrich.isPending}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Transformar selecionadas em leads
                </Button>
                <p className="text-[11px]">Ao criar um novo lead, o fluxo atual também cria o negócio/deal e o briefing comercial.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4 text-primary" /> Dicas de prospecção</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>• Priorize obras com responsável identificado.</p>
                <p>• Verifique estágio, investimento e cronograma.</p>
                <p>• Use o score como referência, não como decisão única.</p>
                <p>• Converta em lead somente quando houver contexto comercial.</p>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
                <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> O Radar usa dados empresariais e eventos públicos/autorizados para prospecção B2B.</p>
                {lastQueryAt && <p>Última consulta: {lastQueryAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
