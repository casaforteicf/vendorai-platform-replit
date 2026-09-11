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

type WorkCategory = "residencial" | "comercial" | "empreendimentos" | "industrial" | "publica";

type AdResult = {
  pageId: string;
  pageName: string;
  snapshotUrl: string | null;
  startDate: string | null;
};

type ProspectorConfigResponse = {
  config?: {
    cidade?: string | null;
    setor?: string | null;
  } | null;
};

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
  const [intervention, setIntervention] = useState("nova obra");
  const [standard, setStandard] = useState("todos");
  const [phase, setPhase] = useState("todas");
  const [productInterest, setProductInterest] = useState("");

  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [companies, setCompanies] = useState<ProspectorSearchResult[]>([]);
  const [ads, setAds] = useState<AdResult[]>([]);
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const [prospectedCompanies, setProspectedCompanies] = useState<Set<string>>(new Set());
  const [prospectedAds, setProspectedAds] = useState<Set<string>>(new Set());
  const [prospectingCompany, setProspectingCompany] = useState<string | null>(null);
  const [prospectingAd, setProspectingAd] = useState<string | null>(null);

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

    const [companyResponse, adsResponse] = await Promise.allSettled([
      fetch("/api/prospector/search", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ atividade: companyTerms, localidade: locality.trim(), maxResults: 20, ...tenantField() }),
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

    setSourceWarnings(warnings);
    setSearched(true);
    setSearching(false);

    if (companyResponse.status === "rejected" && adsResponse.status === "rejected") {
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
    return { actors: companies.length, digitalSignals: ads.length, strong };
  }, [ads.length, companies]);

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
                Para obras privadas não existe uma base nacional única como nas obras públicas. O Radar cruza sinais digitais e empresas relacionadas e marca tudo como sinal até a validação.
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
                  <Input value={locality} onChange={(event) => setLocality(event.target.value)} placeholder="Ex: Chapecó, SC ou Oeste de Santa Catarina" />
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
                  Fluxo: sinal detectado → validar → identificar responsável → criar oportunidade → CRM.
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
              <div className="grid gap-3 sm:grid-cols-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sinais digitais</p><p className="mt-1 text-2xl font-bold">{stats.digitalSignals}</p><p className="text-xs text-muted-foreground">anunciantes / campanhas relacionadas</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Atores relacionados</p><p className="mt-1 text-2xl font-bold">{stats.actors}</p><p className="text-xs text-muted-foreground">construtoras, incorporadoras e empresas locais</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Alta prioridade</p><p className="mt-1 text-2xl font-bold">{stats.strong}</p><p className="text-xs text-muted-foreground">pré-score ≥ 80 entre empresas encontradas</p></CardContent></Card>
              </div>

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
