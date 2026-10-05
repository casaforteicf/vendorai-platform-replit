import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProspectorEnrich, type ProspectorSearchResult } from "@workspace/api-client-react";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Factory,
  HardHat,
  Home,
  MapPin,
  Megaphone,
  Search,
  Sparkles,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import ConstructionRadar from "./ConstructionRadar";
import { ProspectorLocationMap, type ProspectorGeoArea } from "@/components/ProspectorLocationMap";

type WorkCategory = "residencial" | "comercial" | "empreendimentos" | "industrial" | "publica";

type AdResult = {
  pageId: string;
  pageName: string;
  snapshotUrl: string | null;
  startDate: string | null;
};

type ConstructionWorkSignal = {
  id: string;
  obra: string;
  categoria: string | null;
  local: string;
  endereco: string | null;
  proprietario: string | null;
  proprietarioTipo: "pessoa" | "empresa" | "orgao_publico" | "nao_informado";
  responsavelTecnico: string | null;
  construtora: string | null;
  incorporadora: string | null;
  fase: string | null;
  evidencia: string;
  dataReferencia: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceFamily:
    | "prefeitura_alvara"
    | "diario_oficial"
    | "crea_cau"
    | "licenciamento_ambiental"
    | "incorporadora_construtora"
    | "arquiteto_engenheiro"
    | "noticia_portal"
    | "portal_imobiliario"
    | "outro";
  sourceAuthority: "oficial" | "primaria" | "secundaria";
  confidence: number;
  opportunityScore: number;
  priority: "alta" | "media" | "baixa";
  priorityReason: string;
  recommendedActor: "proprietario" | "responsavel_tecnico" | "construtora" | "incorporadora" | "identificar";
};

type ConstructionWorkSearchResponse = {
  works?: ConstructionWorkSignal[];
  sources?: Array<{
    url: string;
    title: string;
    family: ConstructionWorkSignal["sourceFamily"];
    authority: ConstructionWorkSignal["sourceAuthority"];
  }>;
  retrievedAt?: string;
  error?: string;
};

type ProspectorConfigResponse = {
  config?: {
    cidade?: string | null;
    setor?: string | null;
  } | null;
};

type ConstructionActorChoice = "auto" | "proprietario" | "responsavel_tecnico" | "construtora" | "incorporadora";

const CATEGORY_OPTIONS: Array<{ value: WorkCategory; label: string; icon: typeof Home; description: string }> = [
  { value: "residencial", label: "Residenciais", icon: Home, description: "Casas, sobrados, geminadas e edifícios residenciais" },
  { value: "comercial", label: "Comerciais", icon: Building2, description: "Lojas, clínicas, hotéis, escolas e outros negócios" },
  { value: "empreendimentos", label: "Empreendimentos", icon: Sparkles, description: "Condomínios, loteamentos e incorporações" },
  { value: "industrial", label: "Industriais", icon: Factory, description: "Galpões, fábricas, centros logísticos e agroindústrias" },
  { value: "publica", label: "Públicas", icon: HardHat, description: "Obras confirmadas em fontes oficiais" },
];

const MODELS: Record<Exclude<WorkCategory, "publica">, string[]> = {
  residencial: ["Casa térrea", "Sobrado", "Geminada", "Casa alto padrão", "Condomínio horizontal", "Edifício residencial"],
  comercial: ["Loja", "Clínica", "Restaurante", "Hotel", "Supermercado", "Escritório", "Shopping", "Escola"],
  empreendimentos: ["Condomínio fechado", "Loteamento", "Edifício residencial", "Edifício comercial", "Edifício misto", "Incorporação"],
  industrial: ["Galpão", "Fábrica", "Centro logístico", "Centro de distribuição", "Agroindústria", "Armazém"],
};

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  residencial: "Residencial",
  comercial: "Comercial",
  empreendimentos: "Empreendimento",
  industrial: "Industrial",
  publica: "Pública",
};

const CONSTRUCTION_SOURCE_LABEL: Record<ConstructionWorkSignal["sourceFamily"], string> = {
  prefeitura_alvara: "Prefeitura / Alvará",
  diario_oficial: "Diário Oficial",
  crea_cau: "CREA / CAU",
  licenciamento_ambiental: "Licenciamento ambiental",
  incorporadora_construtora: "Construtora / Incorporadora",
  arquiteto_engenheiro: "Arquiteto / Engenheiro",
  noticia_portal: "Notícia / Portal",
  portal_imobiliario: "Portal imobiliário",
  outro: "Fonte pública",
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function resultKey(result: ProspectorSearchResult) {
  return [result.nomeEmpresa ?? "", result.endereco ?? "", result.telefone ?? ""]
    .join("|")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function privateScore(result: ProspectorSearchResult) {
  let score = 42;
  if (result.telefone) score += 20;
  if (result.siteOficial) score += 12;
  if ((result.rating ?? 0) >= 4.2) score += 10;
  if ((result.reviewCount ?? 0) >= 20) score += 7;
  if ((result.reviewCount ?? 0) >= 100) score += 5;
  if (result.endereco) score += 4;
  return Math.min(100, score);
}

function scoreClass(score: number) {
  if (score >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 65) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-border bg-muted text-muted-foreground";
}

function workPriorityClass(priority: ConstructionWorkSignal["priority"]) {
  if (priority === "alta") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (priority === "media") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-border bg-muted text-muted-foreground";
}

function actorLabel(work: ConstructionWorkSignal) {
  if (work.recommendedActor === "proprietario") return work.proprietario ? `Proprietário: ${work.proprietario}` : "Proprietário";
  if (work.recommendedActor === "responsavel_tecnico") return work.responsavelTecnico ? `Resp. técnico: ${work.responsavelTecnico}` : "Responsável técnico";
  if (work.recommendedActor === "construtora") return work.construtora ? `Construtora: ${work.construtora}` : "Construtora";
  if (work.recommendedActor === "incorporadora") return work.incorporadora ? `Incorporadora: ${work.incorporadora}` : "Incorporadora";
  return "Contato ainda a identificar";
}

function actorSearchTerm(category: Exclude<WorkCategory, "publica">, model: string) {
  const prefix = category === "residencial"
    ? "construtora arquitetura residencial"
    : category === "comercial"
      ? "construtora arquitetura comercial"
      : category === "industrial"
        ? "construtora engenharia industrial"
        : "incorporadora construtora";
  return `${prefix} ${model}`.trim();
}

export default function ConstructionRadarWorkspace() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const enrich = useProspectorEnrich();

  const isSuperAdmin = user?.platformRole === "super_admin";
  const tenantId = isSuperAdmin && tenantOverride?.id ? tenantOverride.id : user?.tenantId ?? "";

  const [category, setCategory] = useState<WorkCategory>("residencial");
  const [model, setModel] = useState(MODELS.residencial[0]);
  const [locality, setLocality] = useState("");
  const [geoArea, setGeoArea] = useState<ProspectorGeoArea | null>(null);
  const [intervention, setIntervention] = useState("nova obra");
  const [standard, setStandard] = useState("todos");
  const [phase, setPhase] = useState("todas");
  const [productInterest, setProductInterest] = useState("");

  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [companies, setCompanies] = useState<ProspectorSearchResult[]>([]);
  const [ads, setAds] = useState<AdResult[]>([]);
  const [works, setWorks] = useState<ConstructionWorkSignal[]>([]);
  const [workSources, setWorkSources] = useState<NonNullable<ConstructionWorkSearchResponse["sources"]>>([]);
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const [prospectedCompanies, setProspectedCompanies] = useState<Set<string>>(new Set());
  const [prospectedAds, setProspectedAds] = useState<Set<string>>(new Set());
  const [prospectedWorks, setProspectedWorks] = useState<Set<string>>(new Set());
  const [workActorChoice, setWorkActorChoice] = useState<Record<string, ConstructionActorChoice>>({});
  const [prospectingCompany, setProspectingCompany] = useState<string | null>(null);
  const [prospectingAd, setProspectingAd] = useState<string | null>(null);
  const [prospectingWork, setProspectingWork] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["prospector-radar-config", tenantId],
    queryFn: async () => {
      const response = await fetch("/api/prospector/config", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) return { config: null } as ProspectorConfigResponse;
      return response.json() as Promise<ProspectorConfigResponse>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const city = configQuery.data?.config?.cidade?.trim();
    if (city && !locality) setLocality(city);
  }, [configQuery.data?.config?.cidade, locality]);

  function tenantField() {
    return tenantId ? { tenantId } : {};
  }

  function selectCategory(next: WorkCategory) {
    setCategory(next);
    setSearched(false);
    setCompanies([]);
    setAds([]);
    setWorks([]);
    setWorkSources([]);
    setProspectedWorks(new Set());
    setWorkActorChoice({});
    setSourceWarnings([]);
    if (next !== "publica") setModel(MODELS[next][0]);
  }

  async function tagLead(leadId: string, source: string) {
    const tags = [CATEGORY_LABEL[category], model, intervention, standard !== "todos" ? standard : "", productInterest]
      .map((item) => item.trim())
      .filter(Boolean);
    const response = await fetch(`/api/prospector/leads/${encodeURIComponent(leadId)}/tags`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ nichos: tags, localidades: locality ? [locality] : [], fonte: source, ...tenantField() }),
    });
    if (!response.ok) throw new Error("Falha ao registrar a origem do sinal");
  }

  async function runPrivateSearch() {
    if (category === "publica") return;
    if (!locality.trim()) {
      toast({ title: "Informe a cidade ou região", description: "A busca privada precisa de uma localidade para priorizar sinais úteis.", variant: "destructive" });
      return;
    }

    setSearching(true);
    setSearched(false);
    setSourceWarnings([]);

    const queryParts = [
      CATEGORY_LABEL[category],
      model,
      intervention !== "nova obra" ? intervention : "construção",
      standard !== "todos" ? standard : "",
      phase !== "todas" ? phase : "",
      productInterest,
      locality,
    ].filter(Boolean);
    const adTerms = queryParts.join(" ");
    const companyTerms = actorSearchTerm(category, model);

    const [companyResponse, adsResponse, worksResponse] = await Promise.allSettled([
      fetch("/api/prospector/search", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ atividade: companyTerms, localidade: locality.trim(), maxResults: 20, geo: geoArea ? { lat: geoArea.lat, lng: geoArea.lng, radiusKm: geoArea.radiusKm } : undefined, ...tenantField() }),
      }).then(async (response) => {
        const data = await response.json() as { results?: ProspectorSearchResult[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Falha ao consultar empresas relacionadas");
        return data.results ?? [];
      }),
      fetch("/api/prospector/ads/search", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ searchTerms: adTerms, limit: 30, ...tenantField() }),
      }).then(async (response) => {
        const data = await response.json() as { ads?: AdResult[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Falha ao consultar sinais de anúncios");
        return data.ads ?? [];
      }),
      fetch("/api/prospector/construction-signals/search", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category: CATEGORY_LABEL[category],
          model,
          locality: locality.trim(),
          intervention,
          standard,
          phase,
          productInterest,
          maxResults: 12,
          geo: geoArea ? { lat: geoArea.lat, lng: geoArea.lng, radiusKm: geoArea.radiusKm } : undefined,
          ...tenantField(),
        }),
      }).then(async (response) => {
        const data = await response.json() as ConstructionWorkSearchResponse;
        if (!response.ok) throw new Error(data.error ?? "Falha ao localizar obras privadas");
        return data;
      }),
    ]);

    const warnings: string[] = [];
    if (companyResponse.status === "fulfilled") {
      setCompanies([...companyResponse.value].sort((a, b) => privateScore(b) - privateScore(a)));
    } else {
      setCompanies([]);
      warnings.push("A fonte de empresas locais não respondeu.");
    }

    if (adsResponse.status === "fulfilled") {
      setAds(adsResponse.value);
    } else {
      setAds([]);
      warnings.push("A fonte de anúncios/sinais digitais não respondeu ou não está configurada.");
    }

    if (worksResponse.status === "fulfilled") {
      const locatedWorks = worksResponse.value.works ?? [];
      setWorks(locatedWorks);
      setWorkSources(worksResponse.value.sources ?? []);

      const autoEligible = locatedWorks.filter((work) => work.opportunityScore >= 60);
      if (autoEligible.length > 0) {
        void Promise.all(autoEligible.map((work) => prospectWork(work, true))).then((results) => {
          const imported = results.filter(Boolean).length;
          if (imported > 0) {
            toast({
              title: "Prospecctor atualizado automaticamente",
              description: `${imported} obra${imported === 1 ? "" : "s"} de prioridade alta/média enviada${imported === 1 ? "" : "s"} para pesquisa e qualificação.`,
            });
          }
        });
      }
    } else {
      setWorks([]);
      setWorkSources([]);
      warnings.push("A pesquisa web de obras privadas não respondeu nesta consulta.");
    }

    setSourceWarnings(warnings);
    setSearched(true);
    setSearching(false);

    if (
      companyResponse.status === "rejected" &&
      adsResponse.status === "rejected" &&
      worksResponse.status === "rejected"
    ) {
      toast({ title: "Não foi possível consultar as fontes privadas", description: "Tente novamente ou revise as integrações do Prospector.", variant: "destructive" });
    }
  }

  async function prospectCompany(result: ProspectorSearchResult) {
    const name = result.nomeEmpresa?.trim();
    if (!name) return;
    const key = resultKey(result);
    setProspectingCompany(key);
    try {
      const response = await enrich.mutateAsync({
        data: {
          nomeEmpresa: name,
          endereco: result.endereco ?? undefined,
          ...tenantField(),
        },
      } as any);
      const leadId = (response as { leadId?: string | null }).leadId;
      if (leadId) await tagLead(leadId, "Radar de Obras — sinal privado").catch(() => undefined);
      if (response.saved) setProspectedCompanies((current) => new Set(current).add(key));
      toast({
        title: (response as { isDuplicate?: boolean }).isDuplicate ? "Empresa já estava no CRM" : "Sinal enviado para qualificação",
        description: "O Prospector registrou a origem, enriqueceu os dados e manteve o item separado de uma obra confirmada.",
      });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] });
    } catch (error) {
      toast({ title: "Falha ao prospectar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setProspectingCompany(null);
    }
  }

  async function prospectWork(work: ConstructionWorkSignal, silent = false) {
    setProspectingWork(work.id);
    try {
      const response = await fetch("/api/prospector/construction-signals/prospect", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ work, actor: workActorChoice[work.id] ?? "auto", ...tenantField() }),
      });
      const data = await response.json() as {
        leadId?: string;
        dealId?: string | null;
        merged?: boolean;
        actor?: { role?: string; name?: string | null; type?: string };
        opportunityScore?: number;
        priority?: "alta" | "media" | "baixa";
        readyForOutreach?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Falha ao enviar obra ao Prospecctor");

      setProspectedWorks((current) => new Set(current).add(work.id));
      if (!silent) {
        toast({
          title: data.merged ? "Obra atualizada no Prospecctor" : "Obra enviada ao Prospecctor",
          description: data.message ?? (data.readyForOutreach
            ? "Contato empresarial público encontrado e oportunidade pronta para pesquisa consultiva."
            : "O sinal foi salvo; o Prospecctor seguirá a pesquisa antes de qualquer abordagem."),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      return true;
    } catch (error) {
      if (!silent) {
        toast({
          title: "Falha ao enviar obra",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
      return false;
    } finally {
      setProspectingWork(null);
    }
  }

  async function prospectAd(ad: AdResult) {
    setProspectingAd(ad.pageId);
    try {
      const response = await fetch("/api/prospector/ads/prospectar", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...ad, searchTerms: `${CATEGORY_LABEL[category]} ${model} ${locality}`, ...tenantField() }),
      });
      const data = await response.json() as { leadId?: string; merged?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao prospectar sinal");
      if (data.leadId) await tagLead(data.leadId, "Radar de Obras — anunciante/sinal privado").catch(() => undefined);
      setProspectedAds((current) => new Set(current).add(ad.pageId));
      toast({ title: data.merged ? "Sinal associado a registro existente" : "Sinal privado enviado para qualificação", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] });
    } catch (error) {
      toast({ title: "Falha ao prospectar sinal", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setProspectingAd(null);
    }
  }

  const stats = useMemo(() => {
    const strong = companies.filter((item) => privateScore(item) >= 80).length;
    const withOwner = works.filter((item) => item.proprietario).length;
    const officialSources = workSources.filter((item) => item.authority === "oficial").length;
    return {
      works: works.length,
      withOwner,
      officialSources,
      actors: companies.length,
      digitalSignals: ads.length,
      strong,
    };
  }, [ads.length, companies, workSources, works]);

  const currentCategory = CATEGORY_OPTIONS.find((item) => item.value === category)!;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <HardHat className="h-6 w-6 text-primary" /> Radar de Obras e Empreendimentos
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Monitore obras públicas e sinais de obras privadas, filtre pelo modelo e transforme somente o que for validado em oportunidade comercial.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORY_OPTIONS.map((item) => {
          const Icon = item.icon;
          const selected = category === item.value;
          return (
            <button
              type="button"
              key={item.value}
              onClick={() => selectCategory(item.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20" : "bg-background hover:bg-muted/40"}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-semibold">{item.label}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.description}</p>
            </button>
          );
        })}
      </div>

      {category === "publica" ? (
        <div className="space-y-3">
          <Card className="border-blue-200 bg-blue-50/40">
            <CardContent className="flex items-start gap-3 p-4 text-sm">
              <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <div>
                <p className="font-semibold">Obras públicas confirmadas</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Nesta categoria o Radar usa a fonte oficial de obras. UF, situação, prioridade e termos da obra continuam disponíveis abaixo.
                </p>
              </div>
            </CardContent>
          </Card>
          <ConstructionRadar />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">O que você quer encontrar?</CardTitle>
              <CardDescription>
                O Radar cruza pesquisa web atual, sinais digitais e empresas relacionadas para identificar a obra específica, sua localização, proprietário/contratante quando publicamente informado e os responsáveis envolvidos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">{currentCategory.label}</div>
                </div>
                <div className="space-y-1.5">
                  <Label>Modelo</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MODELS[category].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 xl:col-span-2">
                  <Label>Cidade, região ou praça comercial</Label>
                  <Input value={locality} onChange={(event) => setLocality(event.target.value)} placeholder="Ex: Chapecó, SC ou Oeste de Santa Catarina" /><ProspectorLocationMap values={locality ? [locality] : []} onChange={(values) => { const next = values[values.length - 1] ?? ""; setLocality(next); if (!next) setGeoArea(null); }} maxItems={1} onAreaAdd={(area) => { setGeoArea(area); setLocality(area.label); }} />
                </div>
                <div className="space-y-1.5">
                  <Label>Intervenção</Label>
                  <Select value={intervention} onValueChange={setIntervention}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nova obra">Nova obra</SelectItem>
                      <SelectItem value="reforma">Reforma</SelectItem>
                      <SelectItem value="ampliação">Ampliação</SelectItem>
                      <SelectItem value="retrofit">Retrofit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Padrão</Label>
                  <Select value={standard} onValueChange={setStandard}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="econômico">Econômico</SelectItem>
                      <SelectItem value="médio padrão">Médio padrão</SelectItem>
                      <SelectItem value="alto padrão">Alto padrão</SelectItem>
                      <SelectItem value="luxo">Luxo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fase desejada</Label>
                  <Select value={phase} onValueChange={setPhase}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas / a validar</SelectItem>
                      <SelectItem value="projeto">Projeto</SelectItem>
                      <SelectItem value="aprovação">Aprovação</SelectItem>
                      <SelectItem value="fundação">Fundação</SelectItem>
                      <SelectItem value="estrutura">Estrutura</SelectItem>
                      <SelectItem value="fechamento">Fechamento</SelectItem>
                      <SelectItem value="acabamento">Acabamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Produto / serviço de interesse</Label>
                  <Input value={productInterest} onChange={(event) => setProductInterest(event.target.value)} placeholder="Ex: esquadrias de PVC" />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Fluxo: obra detectada → validar local e fonte → identificar proprietário/contratante e responsáveis → criar oportunidade → CRM.
                </p>
                <Button onClick={() => void runPrivateSearch()} disabled={searching} className="sm:min-w-[180px]">
                  {searching ? <Spinner className="mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
                  Buscar sinais
                </Button>
              </div>
            </CardContent>
          </Card>

          {searched && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Obras detectadas</p><p className="mt-1 text-2xl font-bold">{stats.works}</p><p className="text-xs text-muted-foreground">obras / empreendimentos individualizados</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Com proprietário</p><p className="mt-1 text-2xl font-bold">{stats.withOwner}</p><p className="text-xs text-muted-foreground">proprietário/contratante publicado na fonte</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sinais digitais</p><p className="mt-1 text-2xl font-bold">{stats.digitalSignals}</p><p className="text-xs text-muted-foreground">anunciantes / campanhas relacionadas</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Atores relacionados</p><p className="mt-1 text-2xl font-bold">{stats.actors}</p><p className="text-xs text-muted-foreground">construtoras, incorporadoras e empresas locais</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Alta prioridade</p><p className="mt-1 text-2xl font-bold">{stats.strong}</p><p className="text-xs text-muted-foreground">pré-score ≥ 80 entre empresas encontradas</p></CardContent></Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HardHat className="h-4 w-4 text-primary" />
                    Obras privadas localizadas
                  </CardTitle>
                  <CardDescription>
                    Resultado por obra: local, endereço, proprietário/contratante quando publicado, responsáveis e fonte para validação.
                  </CardDescription>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["Prefeitura / Alvarás", "Diários Oficiais", "CREA / CAU", "Licenciamento ambiental", "Construtoras / Incorporadoras"].map((source) => (
                      <Badge key={source} variant="outline" className="text-[10px]">{source}</Badge>
                    ))}
                    {stats.officialSources > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{stats.officialSources} fontes oficiais citadas</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {works.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Nenhuma obra privada individualizada foi encontrada nesta consulta. Os demais sinais continuam disponíveis abaixo.
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {works.map((work) => (
                        <div key={work.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="secondary">Obra detectada</Badge>
                                <Badge variant="outline" className={workPriorityClass(work.priority)}>
                                  Prioridade {work.priority} · {work.opportunityScore}/100
                                </Badge>
                                {work.fase && <Badge variant="outline">{work.fase}</Badge>}
                                <Badge variant="outline">{CONSTRUCTION_SOURCE_LABEL[work.sourceFamily]}</Badge>
                                {work.sourceAuthority === "oficial" && <Badge variant="outline">Fonte oficial</Badge>}
                                <Badge variant="outline">{work.confidence}% confiança</Badge>
                              </div>
                              <p className="mt-2 font-semibold">{work.obra}</p>
                            </div>
                            {work.sourceUrl && (
                              <a
                                href={work.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted"
                                title={work.sourceTitle ?? "Abrir fonte pública"}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>

                          <div className="mt-3 space-y-2 text-xs">
                            <div className="flex items-start gap-2">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <div>
                                <p className="font-medium text-foreground">{work.local}</p>
                                {work.endereco && <p className="text-muted-foreground">{work.endereco}</p>}
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <div>
                                <p className="font-medium text-foreground">
                                  Proprietário / contratante: {work.proprietario || "não publicado"}
                                </p>
                                {(work.construtora || work.incorporadora || work.responsavelTecnico) && (
                                  <p className="mt-0.5 text-muted-foreground">
                                    {[work.construtora && `Construtora: ${work.construtora}`, work.incorporadora && `Incorporadora: ${work.incorporadora}`, work.responsavelTecnico && `Resp. técnico: ${work.responsavelTecnico}`]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="rounded-lg border bg-background p-2.5">
                              <p className="font-medium text-foreground">Contato recomendado pelo Prospecctor</p>
                              <p className="mt-0.5 text-muted-foreground">{actorLabel(work)}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{work.priorityReason}</p>
                              <div className="mt-2">
                                <Select
                                  value={workActorChoice[work.id] ?? "auto"}
                                  onValueChange={(value) => setWorkActorChoice((current) => ({
                                    ...current,
                                    [work.id]: value as ConstructionActorChoice,
                                  }))}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Escolher contato" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="auto">Automático — usar recomendação</SelectItem>
                                    {work.proprietario && <SelectItem value="proprietario">Proprietário — {work.proprietario}</SelectItem>}
                                    {work.responsavelTecnico && <SelectItem value="responsavel_tecnico">Arquiteto/engenheiro — {work.responsavelTecnico}</SelectItem>}
                                    {work.construtora && <SelectItem value="construtora">Construtora — {work.construtora}</SelectItem>}
                                    {work.incorporadora && <SelectItem value="incorporadora">Incorporadora — {work.incorporadora}</SelectItem>}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <p className="rounded-lg bg-muted/40 p-2.5 leading-5 text-muted-foreground">{work.evidencia}</p>
                            {work.dataReferencia && (
                              <p className="text-[11px] text-muted-foreground">
                                Referência: {new Date(`${work.dataReferencia}T12:00:00`).toLocaleDateString("pt-BR")}
                              </p>
                            )}
                            <Button
                              size="sm"
                              className="mt-2"
                              variant={prospectedWorks.has(work.id) ? "outline" : "default"}
                              disabled={prospectedWorks.has(work.id) || prospectingWork === work.id}
                              onClick={() => void prospectWork(work)}
                            >
                              {prospectingWork === work.id
                                ? <Spinner className="mr-1.5 h-3.5 w-3.5" />
                                : prospectedWorks.has(work.id)
                                  ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                              {prospectedWorks.has(work.id) ? "No Prospecctor" : "Enviar ao Prospecctor"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {sourceWarnings.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/40"><CardContent className="p-3 text-xs text-amber-900">{sourceWarnings.join(" ")}</CardContent></Card>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" />Sinais privados detectados</CardTitle>
                    <CardDescription>Anúncios e movimentos digitais compatíveis com {CATEGORY_LABEL[category].toLowerCase()} · {model.toLowerCase()}.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ads.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum sinal de anúncio encontrado nesta consulta.</div>
                    ) : (
                      <div className="divide-y">
                        {ads.map((ad) => {
                          const done = prospectedAds.has(ad.pageId);
                          return (
                            <div key={ad.pageId} className="space-y-2 py-3 first:pt-0 last:pb-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="secondary">Sinal privado</Badge>
                                    <Badge variant="outline">{model}</Badge>
                                  </div>
                                  <p className="mt-1.5 font-semibold">{ad.pageName}</p>
                                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{locality}</p>
                                  {ad.startDate && <p className="mt-1 text-xs text-muted-foreground">Sinal ativo desde {new Date(ad.startDate).toLocaleDateString("pt-BR")}</p>}
                                </div>
                                {ad.snapshotUrl && <a href={ad.snapshotUrl} target="_blank" rel="noreferrer" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ExternalLink className="h-4 w-4" /></a>}
                              </div>
                              <Button size="sm" variant={done ? "outline" : "default"} disabled={done || prospectingAd === ad.pageId} onClick={() => void prospectAd(ad)}>
                                {prospectingAd === ad.pageId ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : done ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                                {done ? "Enviado para qualificação" : "Qualificar sinal"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" />Empresas e responsáveis relacionados</CardTitle>
                    <CardDescription>Possíveis atores da obra para identificar construtora, incorporadora, arquiteto ou responsável comercial.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {companies.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma empresa relacionada encontrada nesta consulta.</div>
                    ) : (
                      <div className="divide-y">
                        {companies.slice(0, 12).map((result) => {
                          const key = resultKey(result);
                          const score = privateScore(result);
                          const done = prospectedCompanies.has(key);
                          return (
                            <div key={key} className="space-y-2 py-3 first:pt-0 last:pb-0">
                              <div className="flex items-start gap-3">
                                <div className={`min-w-[54px] rounded-lg border px-2 py-2 text-center ${scoreClass(score)}`}><p className="text-lg font-bold leading-none">{score}</p><p className="mt-1 text-[9px]">pré-score</p></div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold">{result.nomeEmpresa || "Empresa"}</p>
                                  {result.endereco && <p className="mt-1 text-xs text-muted-foreground">{result.endereco}</p>}
                                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    {result.telefone && <span>{result.telefone}</span>}
                                    {result.rating != null && <span>{result.rating}★</span>}
                                    {result.siteOficial && <a href={result.siteOficial} target="_blank" rel="noreferrer" className="text-primary hover:underline">site</a>}
                                  </div>
                                </div>
                              </div>
                              <Button size="sm" variant={done ? "outline" : "default"} disabled={done || prospectingCompany === key || !result.nomeEmpresa} onClick={() => void prospectCompany(result)}>
                                {prospectingCompany === key ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : done ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                                {done ? "Prospectado" : "Prospectar responsável"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
