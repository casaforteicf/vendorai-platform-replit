import { useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  HardHat,
  Landmark,
  MapPin,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
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

const OBRASGOV_BASE_URL = "https://api-publica.obrasgov.gestao.gov.br/obras";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const SITUACOES = ["Cadastrada", "Em execução", "Paralisada", "Inacabada", "Concluída", "Cancelada"];

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
  status: "active" | "connector" | "authorized";
  icon: typeof HardHat;
};

const SOURCES: SourceCard[] = [
  {
    title: "ObrasGov",
    description: "Obras públicas e projetos de infraestrutura em fonte oficial nacional.",
    status: "active",
    icon: Landmark,
  },
  {
    title: "Prefeituras / Alvarás",
    description: "Conectores municipais para projeto aprovado, alvará, demolição e terraplenagem.",
    status: "connector",
    icon: FileCheck2,
  },
  {
    title: "CREA / CAU",
    description: "ART/RRT quando houver consulta pública, convênio ou integração autorizada.",
    status: "connector",
    icon: HardHat,
  },
  {
    title: "Diários Oficiais",
    description: "Leitura de publicações públicas para detectar novos eventos de obra.",
    status: "connector",
    icon: Search,
  },
  {
    title: "Registro imobiliário",
    description: "Somente fontes autorizadas; sem varredura massiva de CPF ou dados privados.",
    status: "authorized",
    icon: ShieldCheck,
  },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function scoreProject(project: ObrasGovProject) {
  const status = (project.situacao ?? "").toLowerCase();
  let score = 50;
  if (status.includes("em execução")) score = 90;
  else if (status.includes("cadastrada")) score = 74;
  else if (status.includes("inacabada")) score = 64;
  else if (status.includes("paralisada")) score = 58;
  else if (status.includes("concluída")) score = 34;
  else if (status.includes("cancelada")) score = 10;

  if (project.dt_inicial_efetiva) score += 4;
  else if (project.dt_inicial_prevista) score += 2;
  if (project.organizacao_resp) score += 3;
  if (project.desc_endereco) score += 2;
  if (project.cnpj_organizacao_resp) score += 1;
  return Math.max(0, Math.min(100, score));
}

function opportunityReason(project: ObrasGovProject, score: number) {
  const status = project.situacao ?? "situação não informada";
  if (score >= 88) return `Obra em ${status.toLowerCase()} com responsável identificado: bom momento para mapear fornecedores e necessidades da fase atual.`;
  if (score >= 70) return `Projeto em ${status.toLowerCase()}: oportunidade antecipada para investigar cronograma, responsável e itens que ainda serão contratados.`;
  if (score >= 50) return `Há um evento de obra relevante, mas a abordagem deve confirmar a fase real antes de iniciar contato comercial.`;
  return `Sinal de baixa prioridade neste momento (${status.toLowerCase()}); mantenha no radar para mudança de fase.`;
}

function scoreBadge(score: number) {
  if (score >= 85) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (score >= 70) return "bg-amber-100 text-amber-800 border-amber-200";
  if (score >= 50) return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground border-border";
}

function sourceStatus(source: SourceCard) {
  if (source.status === "active") return { label: "Fonte ativa", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (source.status === "authorized") return { label: "Fonte autorizada", className: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: "Conector por fonte", className: "bg-amber-100 text-amber-800 border-amber-200" };
}

function numberLabel(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return new Intl.NumberFormat("pt-BR").format(Number(value));
}

export default function ConstructionRadar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const enrich = useProspectorEnrich();

  const [uf, setUf] = useState("SC");
  const [situacao, setSituacao] = useState("Em execução");
  const [keyword, setKeyword] = useState("");
  const [projects, setProjects] = useState<ObrasGovProject[]>([]);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prospectingId, setProspectingId] = useState<string | null>(null);
  const [superAdminTenantId, setSuperAdminTenantId] = useState("");

  const isSuperAdmin = user?.platformRole === "super_admin";

  const filtered = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("pt-BR");
    const rows = !term
      ? projects
      : projects.filter((project) =>
          [
            project.desc_nome,
            project.desc_projeto,
            project.desc_endereco,
            project.organizacao_resp,
            project.natureza_intervencao,
            project.especie_intervencao,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term)),
        );

    return [...rows].sort((a, b) => scoreProject(b) - scoreProject(a));
  }, [projects, keyword]);

  async function searchProjects() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pagina: "1", tamanho_da_pagina: "100" });
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

      setProjects(body.data);
      setTotalItems(typeof body.total_items === "number" ? body.total_items : body.data.length);
      setSearched(true);
      toast({
        title: `${body.data.length} obra(s) carregada(s)`,
        description: typeof body.total_items === "number" ? `${body.total_items} registro(s) encontrados na fonte oficial.` : undefined,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível consultar a fonte.";
      setError(message);
      setProjects([]);
      setSearched(true);
      toast({ title: "Falha ao consultar ObrasGov", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function prospectResponsible(project: ObrasGovProject) {
    const nomeEmpresa = project.organizacao_resp?.trim();
    if (!nomeEmpresa) {
      toast({ title: "Responsável não identificado", description: "Esta obra ainda não informa uma organização responsável para enriquecer.", variant: "destructive" });
      return;
    }
    if (isSuperAdmin && !superAdminTenantId.trim() && !user?.tenantId) {
      toast({ title: "Informe o tenantId", description: "Super admin precisa indicar o tenant que receberá o prospect.", variant: "destructive" });
      return;
    }

    const externalId = project.id_projeto_investimento ?? nomeEmpresa;
    setProspectingId(externalId);
    enrich.mutate(
      {
        data: {
          nomeEmpresa,
          endereco: [project.desc_endereco, project.uf_principal].filter(Boolean).join(", ") || undefined,
          ...(isSuperAdmin ? { tenantId: superAdminTenantId.trim() || user?.tenantId || undefined } : {}),
        },
      },
      {
        onSuccess: (result) => {
          const duplicate = Boolean((result as { isDuplicate?: boolean }).isDuplicate);
          if (!result.saved) {
            toast({ title: "Responsável localizado, mas sem canal útil", description: result.reason ?? "Não foi possível criar o lead." });
          } else if (duplicate) {
            toast({ title: "Responsável já estava no CRM", description: "O registro existente foi preservado; a obra serviu como novo sinal de prospecção." });
          } else {
            toast({ title: "Responsável prospectado", description: "Lead criado no fluxo atual do Prospector com enriquecimento, deal e briefing." });
          }
        },
        onError: (cause) => {
          toast({ title: "Falha ao prospectar responsável", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
        },
        onSettled: () => setProspectingId(null),
      },
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" /> Radar de Obras
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Antecipe oportunidades comerciais a partir de eventos reais de obra. O radar identifica o projeto primeiro e só então prospecta responsáveis usando o fluxo existente do CRM.
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 py-1.5 px-2.5">
          <Radar className="h-3.5 w-3.5" /> Sinal → oportunidade → prospect
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {SOURCES.map((source) => {
          const Icon = source.icon;
          const status = sourceStatus(source);
          return (
            <Card key={source.title} className={source.status === "active" ? "border-emerald-200" : ""}>
              <CardContent className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-md bg-muted p-1.5"><Icon className="h-4 w-4" /></div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${status.className}`}>{status.label}</Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold">{source.title}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground mt-1">{source.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" /> Buscar obras públicas — fonte oficial ObrasGov
          </CardTitle>
          <CardDescription>
            Primeiro conector real do Radar. Consulta a API pública atual do Governo Federal e ordena os registros por oportunidade de prospecção.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
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
              <Label>Filtrar resultados carregados</Label>
              <Input
                placeholder="Ex: escola, pavimentação, hospital..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </div>

          {isSuperAdmin && (
            <div className="space-y-1.5 max-w-md">
              <Label>TenantId para prospectar</Label>
              <Input
                placeholder="Tenant que receberá o lead"
                value={superAdminTenantId}
                onChange={(event) => setSuperAdminTenantId(event.target.value)}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={searchProjects} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {loading ? "Consultando fonte..." : "Buscar oportunidades"}
            </Button>
            <Button asChild variant="outline">
              <a href="https://api-publica.obrasgov.gestao.gov.br/obras/docs" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Fonte oficial
              </a>
            </Button>
            {searched && totalItems != null && (
              <span className="text-xs text-muted-foreground">{totalItems} registro(s) na consulta · exibindo {filtered.length} desta página</span>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              O radar não transforma automaticamente proprietário ou CPF em lead. Ele detecta o evento de obra e, quando existe organização/responsável comercial identificável, usa o Prospector atual para enriquecer, deduplicar e inserir no CRM.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Fonte temporariamente indisponível</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {searched && !error && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <HardHat className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Nenhuma obra encontrada com estes filtros.</p>
            <p className="text-xs mt-1">Altere UF, situação ou limpe o filtro textual.</p>
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Oportunidades encontradas</h2>
              <p className="text-xs text-muted-foreground">Ordenadas pelo momento provável de prospecção, não apenas pela ordem da fonte.</p>
            </div>
            <Badge variant="secondary">{filtered.length} visíveis</Badge>
          </div>

          {filtered.map((project, index) => {
            const id = project.id_projeto_investimento ?? `${project.desc_nome ?? "obra"}-${index}`;
            const score = scoreProject(project);
            const isProspecting = prospectingId === id && enrich.isPending;
            const population = numberLabel(project.populacao_beneficiada);
            const jobs = numberLabel(project.qtd_empregos_gerados);

            return (
              <Card key={id} className={score >= 85 ? "border-emerald-200 shadow-sm" : ""}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={scoreBadge(score)}>
                          <Sparkles className="h-3 w-3 mr-1" /> Oportunidade {score}/100
                        </Badge>
                        <Badge variant="secondary">{project.situacao ?? "Situação não informada"}</Badge>
                        <Badge variant="outline">ObrasGov</Badge>
                      </div>

                      <div>
                        <h3 className="font-semibold leading-5">{project.desc_nome || project.desc_projeto || "Obra sem título"}</h3>
                        {project.desc_projeto && project.desc_nome && project.desc_projeto !== project.desc_nome && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.desc_projeto}</p>
                        )}
                      </div>

                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <span className="flex items-start gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{project.desc_endereco || project.uf_principal || "Local não informado"}</span>
                        </span>
                        <span className="flex items-start gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{project.organizacao_resp || "Organização responsável não informada"}</span>
                        </span>
                        <span className="flex items-start gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>Início: {formatDate(project.dt_inicial_efetiva || project.dt_inicial_prevista)}</span>
                        </span>
                        <span className="flex items-start gap-1.5">
                          <HardHat className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{project.especie_intervencao || project.natureza_intervencao || "Tipo de intervenção não informado"}</span>
                        </span>
                      </div>

                      {(population || jobs) && (
                        <div className="flex flex-wrap gap-2">
                          {population && <Badge variant="outline">População beneficiada: {population}</Badge>}
                          {jobs && <Badge variant="outline">Empregos previstos: {jobs}</Badge>}
                        </div>
                      )}

                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-medium flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Por que entrou no radar</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-5">{opportunityReason(project, score)}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:w-48 shrink-0">
                      <Button
                        size="sm"
                        disabled={!project.organizacao_resp || isProspecting || enrich.isPending}
                        onClick={() => prospectResponsible(project)}
                      >
                        {isProspecting ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                        {isProspecting ? "Prospectando..." : "Prospectar responsável"}
                      </Button>
                      <p className="text-[10px] text-muted-foreground leading-4">
                        {project.organizacao_resp
                          ? "Usa o enriquecimento e a deduplicação já existentes no Prospector."
                          : "A fonte não trouxe organização responsável para este registro."}
                      </p>
                      {project.id_projeto_investimento && (
                        <div className="text-[10px] text-muted-foreground border-t pt-2 break-all">ID: {project.id_projeto_investimento}</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="py-4 flex items-start gap-3">
          <Radar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Próxima camada do Radar</p>
            <p className="text-xs text-muted-foreground mt-1 leading-5">
              A arquitetura fica preparada para normalizar sinais de alvará municipal, projeto aprovado, ART/RRT, terraplenagem, demolição, loteamentos e fontes imobiliárias autorizadas. Cada conector deverá guardar a origem e a data do sinal para o score ser explicável e auditável.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
