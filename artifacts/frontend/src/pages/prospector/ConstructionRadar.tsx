import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  HardHat,
  Landmark,
  Layers3,
  MapPin,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Zap,
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
};

type ObrasGovEnvelope = {
  data?: ObrasGovProject[];
  total_pages?: number;
  total_items?: number;
  page_number?: number;
  page_size?: number;
  detail?: unknown;
};

type SourceCard = {
  title: string;
  description: string;
  status: "active" | "next" | "authorized";
  icon: typeof HardHat;
};

const SOURCES: SourceCard[] = [
  {
    title: "ObrasGov",
    description: "Projetos e obras públicas em fonte oficial nacional.",
    status: "active",
    icon: Landmark,
  },
  {
    title: "Prefeituras / Alvarás",
    description: "Projeto aprovado, alvará, demolição e terraplenagem por município.",
    status: "next",
    icon: FileCheck2,
  },
  {
    title: "CREA / CAU",
    description: "ART/RRT apenas quando houver consulta pública ou integração autorizada.",
    status: "authorized",
    icon: HardHat,
  },
  {
    title: "Diários Oficiais",
    description: "Eventos públicos de obras, contratos, licitações e autorizações.",
    status: "next",
    icon: Search,
  },
  {
    title: "Cartórios / Imobiliário",
    description: "Somente bases públicas, convênios ou fontes autorizadas; sem dados privados.",
    status: "authorized",
    icon: ShieldCheck,
  },
];

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
    return `Início previsto nos próximos ${plannedDays} dias. É uma janela boa para identificar decisores, fornecedores e itens ainda não contratados.`;
  }
  if (score >= 88) {
    return `Obra em ${status.toLocaleLowerCase("pt-BR")} com sinais suficientes para abordagem imediata. Confirme a fase atual antes de oferecer a solução.`;
  }
  if (score >= 70) {
    return `Projeto em ${status.toLocaleLowerCase("pt-BR")}: oportunidade de entrar antes da concorrência e mapear necessidades futuras.`;
  }
  if (score >= 50) {
    return "Sinal relevante, mas ainda exige validação da fase, responsável e cronograma antes do contato comercial.";
  }
  return "Baixa prioridade neste momento. Salve no radar e volte quando houver mudança de fase ou novo evento.";
}

function nextAction(project: ObrasGovProject, score: number) {
  if (!project.organizacao_resp) return "Primeiro identifique a organização responsável em fonte pública antes de qualquer abordagem.";
  if (score >= 85) return "Prospecte o responsável, gere briefing e confirme a etapa atual da obra antes de montar a oferta.";
  if (score >= 70) return "Enriqueça o responsável e prepare contato consultivo focado no cronograma e nas próximas contratações.";
  return "Salve a obra no radar e acompanhe mudança de situação antes de priorizar contato.";
}

function scoreBadge(score: number) {
  if (score >= 85) return "border-emerald-200 bg-emerald-100 text-emerald-700";
  if (score >= 70) return "border-amber-200 bg-amber-100 text-amber-800";
  if (score >= 50) return "border-blue-200 bg-blue-100 text-blue-700";
  return "border-border bg-muted text-muted-foreground";
}

function sourceStatus(source: SourceCard) {
  if (source.status === "active") return { label: "Ativa", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (source.status === "authorized") return { label: "Mediante fonte", className: "border-slate-200 bg-slate-50 text-slate-700" };
  return { label: "Próximo conector", className: "border-amber-200 bg-amber-50 text-amber-800" };
}

function numberLabel(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return new Intl.NumberFormat("pt-BR").format(Number(value));
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
  const [projects, setProjects] = useState<ObrasGovProject[]>([]);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prospectingId, setProspectingId] = useState<string | null>(null);
  const [bulkProspecting, setBulkProspecting] = useState(false);
  const [prospectedIds, setProspectedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [superAdminTenantId, setSuperAdminTenantId] = useState("");
  const [lastQueryAt, setLastQueryAt] = useState<Date | null>(null);

  const isSuperAdmin = user?.platformRole === "super_admin";
  const effectiveTenantId = tenantOverride?.id ?? user?.tenantId ?? superAdminTenantId.trim();

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

  const filtered = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("pt-BR");
    return [...projects]
      .filter((project) => {
        if (term) {
          const matches = [
            project.desc_nome,
            project.desc_projeto,
            project.desc_endereco,
            project.organizacao_resp,
            project.natureza_intervencao,
            project.especie_intervencao,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
          if (!matches) return false;
        }
        if (onlyResponsible && !project.organizacao_resp) return false;
        const score = scoreProject(project);
        if (priority === "quentes" && score < 85) return false;
        if (priority === "antecipadas" && (score < 70 || score >= 85)) return false;
        if (priority === "monitorar" && (score < 50 || score >= 70)) return false;
        return true;
      })
      .sort((a, b) => scoreProject(b) - scoreProject(a));
  }, [projects, keyword, onlyResponsible, priority]);

  const stats = useMemo(() => {
    const withResponsible = projects.filter((project) => project.organizacao_resp).length;
    const hot = projects.filter((project) => scoreProject(project) >= 85).length;
    const early = projects.filter((project) => {
      const score = scoreProject(project);
      return score >= 70 && score < 85;
    }).length;
    return { withResponsible, hot, early };
  }, [projects]);

  async function requestPage(nextPage: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pagina: String(nextPage), tamanho_da_pagina: "100" });
      if (uf !== "todos") params.set("uf_principal", uf);
      if (situacao !== "todas") params.set("situacao", situacao);

      const response = await fetch(`${OBRASGOV_BASE_URL}/projeto-investimento?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const body = (await response.json().catch(() => ({}))) as ObrasGovEnvelope;
      if (!response.ok) {
        const detail = typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      if (!Array.isArray(body.data)) throw new Error("A fonte retornou um formato inesperado.");

      setProjects((current) => {
        if (!append) return body.data ?? [];
        const map = new Map<string, ObrasGovProject>();
        [...current, ...(body.data ?? [])].forEach((project) => map.set(projectKey(project), project));
        return [...map.values()];
      });
      setTotalItems(typeof body.total_items === "number" ? body.total_items : body.data.length);
      setTotalPages(typeof body.total_pages === "number" ? body.total_pages : nextPage);
      setPage(typeof body.page_number === "number" ? body.page_number : nextPage);
      setSearched(true);
      setLastQueryAt(new Date());
      if (!append) {
        setSelectedIds(new Set());
        toast({
          title: `${body.data.length} obra(s) carregada(s)`,
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
      if (result.saved) setProspectedIds((current) => new Set(current).add(id));
      if (!silent) {
        if (!result.saved) {
          toast({ title: "Responsável localizado, mas sem canal útil", description: result.reason ?? "Não foi possível criar o lead." });
        } else if (duplicate) {
          toast({ title: "Responsável já estava no CRM", description: "O registro existente foi preservado e a obra serviu como sinal de prospecção." });
        } else {
          toast({ title: "Responsável prospectado", description: "Lead criado com enriquecimento, deal, score e briefing no fluxo existente." });
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
    const selected = filtered.filter((project) => selectedIds.has(projectKey(project)) && project.organizacao_resp);
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
      description: `${created} novo(s), ${duplicates} já existente(s), ${skipped} não processado(s). Responsáveis repetidos foram deduplicados.`,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <HardHat className="h-6 w-6 text-primary" /> Radar de Obras
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Descubra o evento de obra primeiro, avalie o momento comercial e só depois transforme o responsável em prospect. Assim o vendedor chega com contexto, não com uma lista fria.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit gap-1.5 px-2.5 py-1.5">
            <Radar className="h-3.5 w-3.5" /> Evento → score → responsável
          </Badge>
          <Button size="sm" variant="outline" asChild>
            <a href={OBRASGOV_DOCS_URL} target="_blank" rel="noopener noreferrer">
              Fonte oficial <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {SOURCES.map((source) => {
          const Icon = source.icon;
          const status = sourceStatus(source);
          return (
            <Card key={source.title} className={source.status === "active" ? "border-emerald-200" : ""}>
              <CardContent className="space-y-2.5 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-md bg-muted p-1.5"><Icon className="h-4 w-4" /></div>
                  <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${status.className}`}>{status.label}</Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold">{source.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{source.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" /> Buscar oportunidades de obra — ObrasGov
          </CardTitle>
          <CardDescription>
            A consulta traz até 100 registros por página e o VendorAI reordena pelo melhor momento provável de prospecção.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <SelectItem value="todas">Todas as prioridades</SelectItem>
                  <SelectItem value="quentes">Quentes — agir agora</SelectItem>
                  <SelectItem value="antecipadas">Antecipadas — entrar cedo</SelectItem>
                  <SelectItem value="monitorar">Monitorar — validar fase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Filtrar resultados</Label>
              <Input
                placeholder="obra, cidade, responsável..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Switch checked={onlyResponsible} onCheckedChange={setOnlyResponsible} aria-label="Somente com responsável identificado" />
              <div>
                <p className="text-sm font-medium">Somente com responsável identificado</p>
                <p className="text-xs text-muted-foreground">Facilita transformar o evento em prospect imediatamente.</p>
              </div>
            </div>
            <Button onClick={() => requestPage(1, false)} disabled={loading} className="sm:min-w-40">
              {loading ? <><Spinner className="mr-2 h-4 w-4" /> Consultando...</> : <><Search className="mr-2 h-4 w-4" /> Buscar obras</>}
            </Button>
          </div>

          {isSuperAdmin && !tenantOverride?.id && !user?.tenantId && (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Label className="text-amber-900">Tenant alvo</Label>
              <Input value={superAdminTenantId} onChange={(event) => setSuperAdminTenantId(event.target.value)} placeholder="tenantId" />
              <p className="text-xs text-amber-800">Use apenas quando o super admin não estiver visualizando um tenant específico.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {searched && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Carregadas</p><p className="mt-1 text-2xl font-bold">{projects.length}</p><p className="text-xs text-muted-foreground">de {numberLabel(totalItems) ?? projects.length}</p></CardContent></Card>
          <Card className="border-emerald-200"><CardContent className="p-4"><p className="text-xs text-emerald-700">Quentes</p><p className="mt-1 text-2xl font-bold text-emerald-700">{stats.hot}</p><p className="text-xs text-muted-foreground">score ≥ 85</p></CardContent></Card>
          <Card className="border-amber-200"><CardContent className="p-4"><p className="text-xs text-amber-800">Antecipadas</p><p className="mt-1 text-2xl font-bold text-amber-800">{stats.early}</p><p className="text-xs text-muted-foreground">score 70–84</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Com responsável</p><p className="mt-1 text-2xl font-bold">{stats.withResponsible}</p><p className="text-xs text-muted-foreground">prontas para enriquecer</p></CardContent></Card>
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">A fonte não respondeu como esperado</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">O CRM não foi alterado. Tente novamente ou consulte a documentação oficial.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {searched && !error && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" /> Oportunidades priorizadas ({filtered.length})
                </CardTitle>
                <CardDescription>
                  O score é explicável e serve para ordenar a investigação; não substitui a confirmação humana da fase real.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedIds.size > 0 && (
                  <Button size="sm" onClick={prospectSelected} disabled={bulkProspecting || enrich.isPending}>
                    {bulkProspecting ? <><Spinner className="mr-1.5 h-3.5 w-3.5" /> Prospectando...</> : <><Users className="mr-1.5 h-3.5 w-3.5" /> Prospectar selecionadas ({selectedIds.size})</>}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => requestPage(1, false)} disabled={loading}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <HardHat className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Nenhuma obra corresponde aos filtros atuais.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((project) => {
                  const id = projectKey(project);
                  const score = scoreProject(project);
                  const isSelected = selectedIds.has(id);
                  const isSaved = savedIds.has(id);
                  const done = prospectedIds.has(id);
                  const isProspecting = prospectingId === id && enrich.isPending;
                  return (
                    <div key={id} className={`rounded-xl border p-4 transition-colors ${isSelected ? "border-primary/40 bg-primary/[0.025]" : ""}`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        <div className="flex items-start gap-3 lg:w-20 lg:flex-col lg:items-center">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-input accent-primary"
                            checked={isSelected}
                            disabled={!project.organizacao_resp}
                            aria-label={`Selecionar ${project.desc_nome ?? "obra"}`}
                            onChange={() => setSelectedIds((current) => {
                              const next = new Set(current);
                              if (next.has(id)) next.delete(id); else next.add(id);
                              return next;
                            })}
                          />
                          <div className={`rounded-lg border px-3 py-2 text-center ${scoreBadge(score)}`}>
                            <p className="text-xl font-bold leading-none">{score}</p>
                            <p className="mt-1 text-[10px] font-medium">/100</p>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold">{project.desc_nome || project.desc_projeto || "Projeto sem nome"}</h3>
                                {project.situacao && <Badge variant="outline">{project.situacao}</Badge>}
                                <Badge variant="secondary">{phaseLabel(project, score)}</Badge>
                              </div>
                              {project.desc_endereco && (
                                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {project.desc_endereco}{project.uf_principal ? ` — ${project.uf_principal}` : ""}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
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
                                {isSaved ? "Salva" : "Salvar no radar"}
                              </Button>
                              <Button
                                size="sm"
                                variant={done ? "outline" : "default"}
                                disabled={!project.organizacao_resp || done || isProspecting || enrich.isPending || bulkProspecting}
                                onClick={() => void prospectResponsible(project)}
                              >
                                {isProspecting ? <><Spinner className="mr-1.5 h-3.5 w-3.5" /> Prospectando...</> : done ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Prospectado</> : <><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Prospectar responsável</>}
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg bg-muted/40 p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Responsável</p>
                              <p className="mt-1 text-xs font-medium">{project.organizacao_resp || "Não informado"}</p>
                              {project.cnpj_organizacao_resp && <p className="mt-0.5 text-[10px] text-muted-foreground">CNPJ {project.cnpj_organizacao_resp}</p>}
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Início previsto</p>
                              <p className="mt-1 text-xs font-medium">{formatDate(project.dt_inicial_prevista)}</p>
                              {project.dt_inicial_efetiva && <p className="mt-0.5 text-[10px] text-muted-foreground">Efetivo {formatDate(project.dt_inicial_efetiva)}</p>}
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Intervenção</p>
                              <p className="mt-1 text-xs font-medium">{project.especie_intervencao || project.natureza_intervencao || "Não informada"}</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Impacto</p>
                              <p className="mt-1 text-xs font-medium">{numberLabel(project.populacao_beneficiada) ? `${numberLabel(project.populacao_beneficiada)} pessoas` : "—"}</p>
                              {numberLabel(project.qtd_empregos_gerados) && <p className="mt-0.5 text-[10px] text-muted-foreground">{numberLabel(project.qtd_empregos_gerados)} empregos</p>}
                            </div>
                          </div>

                          <div className="grid gap-2 lg:grid-cols-2">
                            <div className="rounded-lg border border-primary/15 bg-primary/[0.025] p-3">
                              <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-primary" /> Por que agora?</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{opportunityReason(project, score)}</p>
                            </div>
                            <div className="rounded-lg border p-3">
                              <p className="flex items-center gap-1.5 text-xs font-semibold"><ArrowRight className="h-3.5 w-3.5 text-primary" /> Próximo passo recomendado</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{nextAction(project, score)}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {project.id_projeto_investimento && <span>ID {project.id_projeto_investimento}</span>}
                            {project.sistema_resp && <span>Origem no cadastro: {project.sistema_resp}</span>}
                            {project.dt_cadastro && <span>Cadastrada em {formatDate(project.dt_cadastro)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {page > 0 && page < totalPages && (
              <Button variant="outline" className="mt-4 w-full" onClick={() => requestPage(page + 1, true)} disabled={loadingMore}>
                {loadingMore ? <><Spinner className="mr-2 h-4 w-4" /> Carregando mais...</> : <><Layers3 className="mr-2 h-4 w-4" /> Carregar mais resultados ({page}/{totalPages})</>}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              O Radar usa dados empresariais e eventos públicos/autorizados para prospecção B2B. Não cria contato a partir de CPF, telefone privado ou proprietário de imóvel sem base legítima.
            </p>
          </div>
          {lastQueryAt && <span className="shrink-0">Última consulta {lastQueryAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
        </CardContent>
      </Card>
    </div>
  );
}
