import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useProspectorEnrich,
  useProspectorGenerateMessage,
  prospectorExport,
  type ProspectEnrichment,
  type ProspectorSearchResult,
} from "@workspace/api-client-react";
import {
  AlertCircle,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSearch,
  Filter,
  Flame,
  Globe,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ProspectorAprovacoesContent } from "./ProspectorAprovacoes";
import { ProspectorLocationMap, type ProspectorGeoArea } from "@/components/ProspectorLocationMap";

type SearchFilter = "todos" | "fortes" | "com_contato";
type QueueFilter = "todos" | "quentes" | "aquecendo" | "analisando";
type ApprovalDecision = "approved" | "approved_edited" | "rejected";

type TaggedSearchResult = ProspectorSearchResult & {
  prospectNichos: string[];
  prospectLocalidades: string[];
  prospectFonte: string;
};

interface CnpjEmpresa {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnaeCode: string;
  cnaeDescricao: string;
  enderecoCompleto: string;
  municipio: string;
  uf: string;
  telefone: string | null;
  email: string | null;
  dataAbertura: string;
  porte: string | null;
  capitalSocial: number | null;
  socios: Array<{ nome: string; qualificacao: string }>;
}

interface AdResult {
  pageId: string;
  pageName: string;
  snapshotUrl: string | null;
  startDate: string | null;
}

type QueueLead = {
  id: string;
  nome: string;
  empresa?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  mercadoSegmento?: string | null;
  enrichmentStatus: string;
  propensityScore?: number;
  roiEstimate?: {
    volume_atendimentos_mes?: number;
    perda_estimada_mes?: number;
    ganho_potencial_mes?: number;
    ticket_estimado?: string;
  };
  enrichmentData?: { digital?: Record<string, unknown>; growth?: Record<string, unknown> };
  priorityReason?: string;
  metadata?: {
    revenue_scout_campaign_ids?: string[];
    prospector_nichos?: string[];
    prospector_localidades?: string[];
    prospector_fontes?: string[];
  };
  createdAt: string;
  events: Array<{ tipo: string; descricao: string }>;
};

type MultiConfigResponse = {
  config: {
    setores: string[];
    cidades: string[];
    ritmoDiario: number;
    ativo: boolean;
    combinacoes?: Array<{ id: string; setor: string; cidade: string; ativo: boolean }>;
    totalCombinacoes?: number;
  } | null;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function cleanUnique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (value.length < 2) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function scoreClass(score: number) {
  if (score >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 60) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreSearchResult(result: ProspectorSearchResult) {
  let score = 35;
  if (result.telefone) score += 22;
  if (result.siteOficial) score += 12;
  if ((result.rating ?? 0) >= 4.2) score += 12;
  if ((result.reviewCount ?? 0) >= 20) score += 8;
  if ((result.reviewCount ?? 0) >= 100) score += 6;
  if (result.endereco) score += 5;
  return Math.min(100, score);
}

function searchReason(result: ProspectorSearchResult, score: number) {
  const signals: string[] = [];
  if (result.telefone) signals.push("contato disponível");
  if (result.siteOficial) signals.push("presença digital");
  if ((result.rating ?? 0) >= 4.2) signals.push("boa reputação");
  if ((result.reviewCount ?? 0) >= 100) signals.push("volume relevante de avaliações");
  if (signals.length === 0) return "Poucos sinais públicos. Enriqueça apenas se o perfil fizer sentido para o seu ICP.";
  return `${score >= 80 ? "Prioridade alta" : score >= 60 ? "Bom candidato" : "Candidato"}: ${signals.join(", ")}.`;
}

function resultKey(result: ProspectorSearchResult) {
  return [result.nomeEmpresa ?? "", result.endereco ?? "", result.telefone ?? "", result.siteOficial ?? ""]
    .join("|")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function daysOpen(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function scoreCnpj(empresa: CnpjEmpresa) {
  let score = 42;
  const days = daysOpen(empresa.dataAbertura);
  if (days != null && days <= 30) score += 22;
  else if (days != null && days <= 90) score += 16;
  else if (days != null && days <= 365) score += 8;
  if (empresa.telefone) score += 12;
  if (empresa.email) score += 8;
  if (empresa.socios?.length) score += 6;
  if (empresa.porte && empresa.porte !== "MEI") score += 5;
  return Math.min(100, score);
}

function formatMoney(value?: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function MultiValueInput({
  label,
  values,
  onChange,
  placeholder,
  maxItems,
  helper,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  maxItems: number;
  helper?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const candidates = draft.split(/[,;\n]/g).map((item) => item.trim()).filter(Boolean);
    if (!candidates.length) return;
    onChange(cleanUnique([...values, ...candidates]).slice(0, maxItems));
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-[11px] text-muted-foreground">{values.length}/{maxItems}</span>
      </div>
      <div className="min-h-10 rounded-lg border bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
        <div className="flex flex-wrap items-center gap-1.5">
          {values.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 pr-1">
              {value}
              <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} className="rounded-full p-0.5 hover:bg-background/70" aria-label={`Remover ${value}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {values.length < maxItems && (
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "," || event.key === ";") {
                  event.preventDefault();
                  commit();
                }
              }}
              placeholder={values.length ? "Adicionar..." : placeholder}
              className="h-7 min-w-[160px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
        </div>
      </div>
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

function EnrichmentResult({ data }: { data: ProspectEnrichment }) {
  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{data.nomeEmpresa ?? "Empresa"}</CardTitle>
            {data.endereco && <CardDescription className="mt-1 flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5" />{data.endereco}</CardDescription>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.scoreProspector != null && <Badge><Target className="mr-1 h-3.5 w-3.5" />Score {data.scoreProspector}</Badge>}
            <Badge variant={data.temContato ? "secondary" : "outline"}>{data.temContato ? "Com contato" : "Sem contato"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {data.rating != null && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{data.rating} {data.reviewCount != null ? `(${data.reviewCount})` : ""}</span>}
          {data.telefone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{data.telefone}</span>}
          {data.whatsapp && <span className="flex items-center gap-1 text-emerald-700"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</span>}
          {data.instagram && <span>{data.instagram}</span>}
          {data.siteOficial && <a className="flex items-center gap-1 text-primary hover:underline" href={data.siteOficial} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" />Site</a>}
        </div>
        {data.resumoNegocio && <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{data.resumoNegocio}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {data.pontosFortes && data.pontosFortes.length > 0 && <div className="rounded-lg border p-3"><p className="text-xs font-semibold">Sinais positivos</p><div className="mt-2 flex flex-wrap gap-1.5">{data.pontosFortes.map((item) => <Badge variant="outline" key={item}>{item}</Badge>)}</div></div>}
          {data.doresPrincipais && data.doresPrincipais.length > 0 && <div className="rounded-lg border p-3"><p className="text-xs font-semibold">Dores prováveis</p><div className="mt-2 flex flex-wrap gap-1.5">{data.doresPrincipais.map((item) => <Badge variant="outline" key={item}>{item}</Badge>)}</div></div>}
        </div>
      </CardContent>
    </Card>
  );
}

function MessageApproval({ generatedText }: { generatedText: string }) {
  const { toast } = useToast();
  const [edited, setEdited] = useState(generatedText);
  const [decision, setDecision] = useState<ApprovalDecision | null>(null);

  function decide(next: ApprovalDecision) {
    setDecision(next);
    toast({ title: next === "rejected" ? "Mensagem rejeitada" : next === "approved_edited" ? "Mensagem aprovada com edição" : "Mensagem aprovada" });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Mensagem de abordagem</CardTitle>
        <CardDescription>Revise antes de usar. A automação aprende com as aprovações registradas no fluxo oficial.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={edited} onChange={(event) => setEdited(event.target.value)} rows={6} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide("approved")}><ThumbsUp className="mr-1.5 h-3.5 w-3.5" />Aprovar</Button>
          <Button size="sm" variant="secondary" onClick={() => decide("approved_edited")}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Aprovar edição</Button>
          <Button size="sm" variant="outline" onClick={() => decide("rejected")}><ThumbsDown className="mr-1.5 h-3.5 w-3.5" />Rejeitar</Button>
          {decision && <Badge variant={decision === "rejected" ? "destructive" : "secondary"}>{decision === "rejected" ? "Rejeitada" : "Aprovada"}</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProspectorAutoConfig({ tenantId, isSuperAdmin }: { tenantId: string; isSuperAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setores, setSetores] = useState<string[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [ritmoDiario, setRitmoDiario] = useState(10);
  const [ativo, setAtivo] = useState(false);

  const configQuery = useQuery({
    queryKey: ["prospector-config-multi", tenantId],
    enabled: !isSuperAdmin || Boolean(tenantId),
    queryFn: async () => {
      const params = isSuperAdmin && tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const response = await fetch(`/api/prospector/config-multi${params}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Falha ao carregar configuração");
      return response.json() as Promise<MultiConfigResponse>;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const config = configQuery.data?.config;
    if (!config) return;
    setSetores(config.setores ?? []);
    setCidades(config.cidades ?? []);
    setRitmoDiario(config.ritmoDiario ?? 10);
    setAtivo(Boolean(config.ativo));
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const total = setores.length * cidades.length;
      if (ativo && (!setores.length || !cidades.length)) throw new Error("Adicione pelo menos um nicho e uma localidade antes de ativar.");
      if (total > 60) throw new Error("Reduza para no máximo 60 combinações de nicho × localidade.");
      const response = await fetch("/api/prospector/config-multi", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ setores, cidades, ritmoDiario, ativo, ...(isSuperAdmin && tenantId ? { tenantId } : {}) }),
      });
      const data = await response.json() as MultiConfigResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar configuração");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospector-config-multi", tenantId] });
      toast({ title: "Busca automática atualizada", description: `${setores.length} nicho(s) × ${cidades.length} localidade(s), com limite total de ${ritmoDiario} lead(s)/dia.` });
    },
    onError: (error) => toast({ title: "Falha ao salvar configuração", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  const totalCombinacoes = setores.length * cidades.length;

  return (
    <Card className={ativo ? "border-emerald-200" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" />Busca automática</CardTitle>
            <CardDescription>Combine vários nichos e localidades. O ritmo diário continua sendo um limite total do tenant, não por combinação.</CardDescription>
          </div>
          <Badge variant="outline" className={ativo ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-700" : "w-fit"}>{ativo ? "Ativa" : "Desativada"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {configQuery.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Spinner className="h-4 w-4" />Carregando...</div>
        ) : configQuery.isError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar a configuração automática.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <MultiValueInput label="Nichos / ICP" values={setores} onChange={setSetores} placeholder="Ex: materiais de construção" maxItems={10} helper="Enter, vírgula ou ponto e vírgula adiciona outro nicho." />
              <div className="space-y-2"><MultiValueInput label="Localidades" values={cidades} onChange={setCidades} placeholder="Ex: Chapecó, SC" maxItems={20} helper="Pode usar cidade, região ou praça comercial." /><ProspectorLocationMap values={cidades} onChange={setCidades} maxItems={20} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><Label>Ritmo total: {ritmoDiario}/dia</Label><Badge variant="secondary">{totalCombinacoes} combinação(ões)</Badge></div>
                <input type="range" min={1} max={100} value={ritmoDiario} onChange={(event) => setRitmoDiario(Number(event.target.value))} className="h-9 w-full accent-primary" />
              </div>
              <div className="flex items-center gap-2 pb-0.5"><Switch checked={ativo} onCheckedChange={setAtivo} /><span className="text-sm">{ativo ? "Ativa" : "Pausada"}</span></div>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (isSuperAdmin && !tenantId)}>{saveMutation.isPending ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}Salvar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProspectorClassic() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.platformRole === "super_admin";
  const [tenantId, setTenantId] = useState(tenantOverride?.id ?? user?.tenantId ?? "");

  useEffect(() => {
    if (tenantOverride?.id || user?.tenantId) setTenantId(tenantOverride?.id ?? user?.tenantId ?? "");
  }, [tenantOverride?.id, user?.tenantId]);

  const enrich = useProspectorEnrich();
  const generate = useProspectorGenerateMessage();

  const [nichos, setNichos] = useState<string[]>([]);
  const [localidades, setLocalidades] = useState<string[]>([]);
  const [geoAreas, setGeoAreas] = useState<ProspectorGeoArea[]>([]);
  const [maxResults, setMaxResults] = useState(20);
  const [results, setResults] = useState<TaggedSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("todos");
  const [selectedSearchIndexes, setSelectedSearchIndexes] = useState<Set<number>>(new Set());
  const [prospectingIndex, setProspectingIndex] = useState<number | null>(null);
  const [bulkProspecting, setBulkProspecting] = useState(false);
  const [prospectedIndexes, setProspectedIndexes] = useState<Set<number>>(new Set());
  const [duplicateIndexes, setDuplicateIndexes] = useState<Set<number>>(new Set());
  const [enrichment, setEnrichment] = useState<ProspectEnrichment | null>(null);
  const [exporting, setExporting] = useState(false);

  const [messageType, setMessageType] = useState<"whatsapp" | "email">("whatsapp");
  const [msgNomeEmpresa, setMsgNomeEmpresa] = useState("");
  const [contexto, setContexto] = useState("");
  const [generatedText, setGeneratedText] = useState<string | null>(null);

  const [cnaeSearch, setCnaeSearch] = useState("");
  const [cnaeSelected, setCnaeSelected] = useState("");
  const [cnpjUf, setCnpjUf] = useState("");
  const [cnpjMunicipio, setCnpjMunicipio] = useState("");
  const [cnpjAberturaDias, setCnpjAberturaDias] = useState("qualquer");
  const [cnpjPorte, setCnpjPorte] = useState("todos");
  const [cnpjResultados, setCnpjResultados] = useState<CnpjEmpresa[]>([]);
  const [cnpjSearched, setCnpjSearched] = useState(false);
  const [cnpjApiKeyRequired, setCnpjApiKeyRequired] = useState(false);
  const [cnpjProspectandoIndex, setCnpjProspectandoIndex] = useState<number | null>(null);
  const [cnpjProspectadoIds, setCnpjProspectadoIds] = useState<Set<string>>(new Set());

  const [adsSearchTerms, setAdsSearchTerms] = useState("");
  const [adsResultados, setAdsResultados] = useState<AdResult[]>([]);
  const [adsSearched, setAdsSearched] = useState(false);
  const [adsSearching, setAdsSearching] = useState(false);
  const [adsProspectandoPageId, setAdsProspectandoPageId] = useState<string | null>(null);
  const [adsProspectadosPageIds, setAdsProspectadosPageIds] = useState<Set<string>>(new Set());
  const [adsDuplicadosPageIds, setAdsDuplicadosPageIds] = useState<Set<string>>(new Set());

  const [queueFilter, setQueueFilter] = useState<QueueFilter>("todos");
  const [selectedFilaLeadIds, setSelectedFilaLeadIds] = useState<Set<string>>(new Set());

  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  const requestedQueueFilter = params.get("queueFilter");
  const defaultTab = ["busca", "cnpj", "anunciantes", "fila", "aprovacoes"].includes(requestedTab ?? "") ? requestedTab! : "busca";
  const campaignFilterId = params.get("campaignId");
  const jarvisCaseId = params.get("jarvisCase");
  const jarvisTerm = params.get("jarvisTerm")?.trim() ?? "";
  const jarvisRegion = params.get("jarvisRegion")?.trim() ?? "";

  useEffect(() => {
    if (["todos", "quentes", "aquecendo", "analisando"].includes(requestedQueueFilter ?? "")) {
      setQueueFilter(requestedQueueFilter as QueueFilter);
    }
  }, [requestedQueueFilter]);

  useEffect(() => {
    if (!jarvisCaseId) return;
    if (jarvisTerm) setNichos((current) => cleanUnique([...current, jarvisTerm]).slice(0, 10));
    if (jarvisRegion) setLocalidades((current) => cleanUnique([...current, jarvisRegion]).slice(0, 20));
  }, [jarvisCaseId, jarvisRegion, jarvisTerm]);

  function tenantField() {
    return isSuperAdmin && tenantId ? { tenantId } : {};
  }

  function changeQueueFilter(value: QueueFilter) {
    setQueueFilter(value);
    const url = new URL(window.location.href);
    if (value === "todos") url.searchParams.delete("queueFilter");
    else url.searchParams.set("queueFilter", value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function tagProspectorLead(leadId: string, tagNichos: string[], tagLocalidades: string[], fonte: string) {
    const response = await fetch(`/api/prospector/leads/${encodeURIComponent(leadId)}/tags`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ nichos: cleanUnique(tagNichos), localidades: cleanUnique(tagLocalidades), fonte, ...tenantField() }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? "Falha ao salvar tags do prospect");
    }
  }

  const scoredResults = useMemo(() => results.map((result, index) => ({ result, index, score: scoreSearchResult(result) }))
    .filter(({ result, score }) => {
      if (searchFilter === "fortes") return score >= 70;
      if (searchFilter === "com_contato") return Boolean(result.telefone);
      return true;
    })
    .sort((a, b) => b.score - a.score), [results, searchFilter]);

  const cnaeListQuery = useQuery({
    queryKey: ["prospector-cnaes"],
    queryFn: async () => {
      const response = await fetch("/api/prospector/cnpj/cnaes", { headers: authHeaders() });
      if (!response.ok) throw new Error("Falha ao carregar CNAEs");
      return response.json() as Promise<{ cnaes: Array<{ cnae: string; label: string; vertical: string; prioridade: number }> }>;
    },
    staleTime: 300_000,
  });

  const cnpjSearchMutation = useMutation({
    mutationFn: async (payload: { cnae: string; uf?: string; municipio?: string; aberturaDias?: number; porte?: string }) => {
      const response = await fetch("/api/prospector/cnpj/search", { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...payload, limit: 30, tenantId: tenantId || undefined }) });
      if (!response.ok) throw new Error("Falha na busca CNPJ");
      return response.json() as Promise<{ empresas: CnpjEmpresa[]; total: number; apiKeyRequired: boolean }>;
    },
    onSuccess: (data) => {
      setCnpjResultados([...data.empresas].sort((a, b) => scoreCnpj(b) - scoreCnpj(a)));
      setCnpjSearched(true);
      setCnpjApiKeyRequired(data.apiKeyRequired);
    },
    onError: () => toast({ title: "Falha na busca CNPJ", variant: "destructive" }),
  });

  const cnpjProspectMutation = useMutation({
    mutationFn: async (empresa: CnpjEmpresa) => {
      const response = await fetch("/api/prospector/cnpj/prospectar", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          cnpj: empresa.cnpj,
          razaoSocial: empresa.razaoSocial,
          nomeFantasia: empresa.nomeFantasia,
          cnaeCode: empresa.cnaeCode,
          cnaeDescricao: empresa.cnaeDescricao,
          endereco: empresa.enderecoCompleto,
          municipio: empresa.municipio,
          uf: empresa.uf,
          telefone: empresa.telefone,
          email: empresa.email,
          dataAbertura: empresa.dataAbertura,
          porte: empresa.porte,
          socios: empresa.socios,
          tenantId: tenantId || undefined,
        }),
      });
      const data = await response.json() as { leadId?: string; merged?: boolean; message?: string; isRecemAberta?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao prospectar");
      if (data.leadId) {
        const local = [empresa.municipio, empresa.uf].filter(Boolean).join("/");
        await tagProspectorLead(data.leadId, [empresa.cnaeDescricao], local ? [local] : [], "CNPJ/CNAE").catch(() => undefined);
      }
      return data;
    },
    onSuccess: (data, empresa) => {
      setCnpjProspectadoIds((current) => new Set(current).add(empresa.cnpj));
      toast({ title: data.merged ? "Empresa já estava no CRM" : data.isRecemAberta ? "Empresa recém-aberta prospectada" : "Empresa prospectada", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] });
    },
    onError: (error) => toast({ title: "Falha ao prospectar empresa", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  const filaQuery = useQuery({
    queryKey: ["prospector-fila", tenantId],
    queryFn: async () => {
      const response = await fetch("/api/prospector/fila?limit=100", { headers: authHeaders() });
      if (!response.ok) throw new Error("Falha ao carregar a fila");
      return response.json() as Promise<{ leads: QueueLead[]; autoDispatchThreshold: number; total: number }>;
    },
    staleTime: 30_000,
  });

  const queueLeads = useMemo(() => (filaQuery.data?.leads ?? [])
    .filter((lead) => !campaignFilterId || lead.metadata?.revenue_scout_campaign_ids?.includes(campaignFilterId))
    .filter((lead) => {
      const score = lead.propensityScore ?? 0;
      if (queueFilter === "quentes") return lead.enrichmentStatus !== "pending" && score >= 80;
      if (queueFilter === "aquecendo") return lead.enrichmentStatus !== "pending" && score >= 50 && score < 80;
      if (queueFilter === "analisando") return lead.enrichmentStatus === "pending";
      return true;
    }), [campaignFilterId, filaQuery.data?.leads, queueFilter]);

  const createCampaignPackageMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const response = await fetch("/api/prospector/campaign-package", { method: "POST", headers: authHeaders(), body: JSON.stringify({ leadIds, tenantId: tenantId || undefined }) });
      const data = await response.json() as any;
      if (!response.ok) throw new Error(data.error ?? "Falha ao criar pacote comercial");
      return data;
    },
    onSuccess: (data) => {
      const strategy = data.strategy ?? {};
      sessionStorage.setItem("vendorai_ads_revenue_scout_draft_v1", JSON.stringify({ campaignId: data.campaignId, campaignName: data.campaign?.nome ?? strategy.campaignName, suggestedPlatform: strategy.recommendedPaidPlatform ?? "meta", marketingContext: strategy.marketingContext, region: strategy.region, opportunity: strategy.opportunity, offer: strategy.offer, headline: strategy.adsHeadline, description: strategy.adsDescription }));
      sessionStorage.setItem("vendorai_lp_revenue_scout_draft_v1", JSON.stringify({ campaignId: data.campaignId, audience: strategy.audienceNiche, offer: strategy.offer, objective: strategy.campaignGoal, notes: [strategy.opportunity, strategy.lpHeadline, strategy.lpSubheadline].filter(Boolean).join("\n"), productIds: strategy.productIds ?? [], headline: strategy.lpHeadline, subheadline: strategy.lpSubheadline }));
      setSelectedFilaLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      toast({ title: "Pacote comercial criado", description: "Campanha, LP e anúncios ficaram preparados para revisão." });
      setLocation(data.marketingUrl ?? `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(data.campaignId)}`);
    },
    onError: (error) => toast({ title: "Falha ao criar pacote comercial", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  const dispatchSdrMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const response = await fetch(`/api/prospector/dispatch-sdr/${leadId}`, { method: "POST", headers: authHeaders() });
      if (!response.ok) throw new Error("Falha ao disparar SDR");
      return response.json();
    },
    onSuccess: () => { toast({ title: "SDR disparado" }); queryClient.invalidateQueries({ queryKey: ["prospector-fila"] }); },
    onError: () => toast({ title: "Falha ao disparar SDR", variant: "destructive" }),
  });

  const dispatchTopMutation = useMutation({
    mutationFn: async (n: number) => {
      const response = await fetch("/api/prospector/dispatch-top", { method: "POST", headers: authHeaders(), body: JSON.stringify({ n }) });
      if (!response.ok) throw new Error("Falha ao disparar em lote");
      return response.json() as Promise<{ dispatched: number }>;
    },
    onSuccess: (data) => { toast({ title: `${data.dispatched} SDR(s) disparado(s)` }); queryClient.invalidateQueries({ queryKey: ["prospector-fila"] }); },
    onError: () => toast({ title: "Falha no disparo em lote", variant: "destructive" }),
  });

  const discardMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const response = await fetch(`/api/prospector/fila/discard/${leadId}`, { method: "POST", headers: authHeaders() });
      if (!response.ok) throw new Error("Falha ao descartar lead");
      return response.json();
    },
    onSuccess: () => { toast({ title: "Lead removido da fila" }); queryClient.invalidateQueries({ queryKey: ["prospector-fila"] }); queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] }); },
  });

  async function runSearch() {
    if (!nichos.length || !localidades.length) {
      toast({ title: "Adicione pelo menos um nicho e uma localidade", variant: "destructive" });
      return;
    }
    const combinations = nichos.flatMap((nicho) => localidades.map((localidade) => ({ nicho, localidade })));
    if (combinations.length > 60) {
      toast({ title: "Muitas combinações", description: "Reduza para no máximo 60 combinações de nicho × localidade.", variant: "destructive" });
      return;
    }

    setSearching(true);
    setSearched(false);
    try {
      const perCombination = Math.max(1, Math.min(20, Math.ceil(maxResults / combinations.length)));
      const merged = new Map<string, TaggedSearchResult>();
      let failed = 0;

      for (const combination of combinations) {
        try {
          const response = await fetch("/api/prospector/search", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ atividade: combination.nicho, localidade: combination.localidade, maxResults: perCombination, geo: geoAreas.find((area) => area.label.toLocaleLowerCase("pt-BR") === combination.localidade.toLocaleLowerCase("pt-BR")) ? (() => { const area = geoAreas.find((item) => item.label.toLocaleLowerCase("pt-BR") === combination.localidade.toLocaleLowerCase("pt-BR"))!; return { lat: area.lat, lng: area.lng, radiusKm: area.radiusKm }; })() : undefined, ...tenantField() }),
          });
          const data = await response.json() as { results?: ProspectorSearchResult[]; error?: string };
          if (!response.ok) throw new Error(data.error ?? "Falha na busca");
          for (const result of data.results ?? []) {
            const key = resultKey(result);
            const existing = merged.get(key);
            if (existing) {
              existing.prospectNichos = cleanUnique([...existing.prospectNichos, combination.nicho]);
              existing.prospectLocalidades = cleanUnique([...existing.prospectLocalidades, combination.localidade]);
            } else {
              merged.set(key, { ...result, prospectNichos: [combination.nicho], prospectLocalidades: [combination.localidade], prospectFonte: "Google Places" });
            }
          }
        } catch {
          failed += 1;
        }
      }

      const finalResults = [...merged.values()].sort((a, b) => scoreSearchResult(b) - scoreSearchResult(a)).slice(0, maxResults);
      setResults(finalResults);
      setSearched(true);
      setSelectedSearchIndexes(new Set());
      setProspectedIndexes(new Set());
      setDuplicateIndexes(new Set());
      setEnrichment(null);
      toast({ title: finalResults.length ? `${finalResults.length} empresa(s) priorizada(s)` : "Nenhuma empresa encontrada", description: `${combinations.length - failed}/${combinations.length} combinação(ões) consultada(s) com sucesso.` });
    } finally {
      setSearching(false);
    }
  }

  async function prospectSearchResult(result: TaggedSearchResult, index: number, silent = false) {
    const nome = result.nomeEmpresa?.trim();
    if (!nome) return "skipped" as const;
    if (!silent) setProspectingIndex(index);
    try {
      const response = await enrich.mutateAsync({ data: { nomeEmpresa: nome, endereco: result.endereco ?? undefined, ...tenantField() } } as any);
      setEnrichment(response.enrichment);
      if (!msgNomeEmpresa) setMsgNomeEmpresa(response.enrichment.nomeEmpresa ?? nome);
      const duplicate = Boolean((response as { isDuplicate?: boolean }).isDuplicate);
      if (!response.saved) return "skipped" as const;

      const leadId = (response as { leadId?: string | null }).leadId;
      let tagsOk = true;
      if (leadId) {
        try {
          await tagProspectorLead(leadId, result.prospectNichos, result.prospectLocalidades, result.prospectFonte);
        } catch {
          tagsOk = false;
        }
      }

      if (duplicate) {
        setDuplicateIndexes((current) => new Set(current).add(index));
        if (!silent) toast({ title: "Já estava no CRM", description: tagsOk ? "As novas tags de atividade/localidade foram incorporadas ao registro existente." : "O registro existente foi preservado." });
        return "duplicate" as const;
      }
      setProspectedIndexes((current) => new Set(current).add(index));
      if (!silent) toast({ title: "Lead criado", description: tagsOk ? "Enriquecimento, score e tags de atividade/localidade foram salvos." : "Lead criado; as tags precisam ser sincronizadas." });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] });
      return "created" as const;
    } catch (error) {
      if (!silent) toast({ title: "Falha ao prospectar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return "error" as const;
    } finally {
      if (!silent) setProspectingIndex(null);
    }
  }

  async function prospectSelectedSearch() {
    const selected = scoredResults.filter(({ index }) => selectedSearchIndexes.has(index));
    if (!selected.length) return;
    setBulkProspecting(true);
    let created = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const item of selected) {
      const status = await prospectSearchResult(item.result, item.index, true);
      if (status === "created") created += 1;
      else if (status === "duplicate") duplicates += 1;
      else skipped += 1;
    }
    setBulkProspecting(false);
    setSelectedSearchIndexes(new Set());
    toast({ title: "Lote concluído", description: `${created} novo(s), ${duplicates} já existente(s), ${skipped} não processado(s).` });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await prospectorExport(isSuperAdmin && tenantId ? { tenantId } : undefined);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "prospector_leads.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Falha ao exportar prospects", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function generateMessage() {
    generate.mutate(
      { data: { messageType, nomeEmpresa: msgNomeEmpresa.trim() || undefined, contexto: contexto.trim() || undefined, ...tenantField() } },
      {
        onSuccess: (response) => { setGeneratedText(messageType === "email" ? response.email : response.whatsapp); toast({ title: "Mensagem gerada" }); },
        onError: (error) => toast({ title: "Falha ao gerar mensagem", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
      },
    );
  }

  async function searchAds() {
    if (!adsSearchTerms.trim()) return;
    setAdsSearching(true);
    try {
      const response = await fetch("/api/prospector/ads/search", { method: "POST", headers: authHeaders(), body: JSON.stringify({ searchTerms: adsSearchTerms.trim(), limit: 30, tenantId: tenantId || undefined }) });
      const data = await response.json() as { ads?: AdResult[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha na busca de anúncios");
      setAdsResultados(data.ads ?? []);
      setAdsSearched(true);
    } catch (error) {
      toast({ title: "Falha na busca de anunciantes", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAdsSearching(false);
    }
  }

  const adsProspectMutation = useMutation({
    mutationFn: async (ad: AdResult) => {
      const response = await fetch("/api/prospector/ads/prospectar", { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...ad, searchTerms: adsSearchTerms, tenantId: tenantId || undefined }) });
      const data = await response.json() as { leadId?: string; merged?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao prospectar anunciante");
      if (data.leadId) await tagProspectorLead(data.leadId, [adsSearchTerms], [], "Anunciantes Meta").catch(() => undefined);
      return data;
    },
    onSuccess: (data, ad) => {
      if (data.merged) setAdsDuplicadosPageIds((current) => new Set(current).add(ad.pageId));
      else setAdsProspectadosPageIds((current) => new Set(current).add(ad.pageId));
      toast({ title: data.merged ? "Anunciante já estava no CRM" : "Anunciante prospectado", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      queryClient.invalidateQueries({ queryKey: ["prospector-command-center"] });
    },
    onError: (error) => toast({ title: "Falha ao prospectar anunciante", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Building2 className="h-6 w-6 text-primary" />Empresas</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Descubra empresas por presença local, CNPJ/CNAE ou sinais comerciais. O Prospector pontua, enriquece, deduplica e mantém a origem da oportunidade no CRM.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>{exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}Exportar prospects</Button>
      </div>

      {isSuperAdmin && !tenantOverride?.id && !user?.tenantId && (
        <Card className="border-amber-200 bg-amber-50"><CardContent className="grid gap-2 p-3 sm:grid-cols-[1fr_2fr] sm:items-center"><div><p className="text-sm font-semibold text-amber-900">Tenant alvo</p><p className="text-xs text-amber-800">Necessário quando o super admin não está visualizando um tenant.</p></div><Input value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="tenantId" /></CardContent></Card>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="busca" className="gap-1.5"><Search className="h-4 w-4" />Descobrir</TabsTrigger>
          <TabsTrigger value="cnpj" className="gap-1.5"><FileSearch className="h-4 w-4" />CNPJ / CNAE</TabsTrigger>
          <TabsTrigger value="anunciantes" className="gap-1.5"><Megaphone className="h-4 w-4" />Anunciantes</TabsTrigger>
          <TabsTrigger value="fila" className="gap-1.5"><TrendingUp className="h-4 w-4" />Oportunidades{(filaQuery.data?.total ?? 0) > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">{filaQuery.data?.total}</span>}</TabsTrigger>
          <TabsTrigger value="aprovacoes" className="gap-1.5"><ClipboardCheck className="h-4 w-4" />Aprovações</TabsTrigger>
        </TabsList>

        <TabsContent value="busca" className="mt-4 space-y-4">
          {jarvisCaseId && (
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardContent className="flex flex-wrap items-center gap-2 p-3 text-xs">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">Contexto trazido pelo JARVIS</span>
                {jarvisTerm && <Badge variant="secondary">{jarvisTerm}</Badge>}
                {jarvisRegion && <Badge variant="outline"><MapPin className="mr-1 h-3 w-3" />{jarvisRegion}</Badge>}
                <span className="text-muted-foreground">Revise os campos e execute a busca quando quiser.</span>
              </CardContent>
            </Card>
          )}

          <ProspectorAutoConfig tenantId={tenantId} isSuperAdmin={isSuperAdmin} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4 text-primary" />Descobrir empresas locais</CardTitle>
              <CardDescription>Selecione vários nichos e localidades. O Prospector cruza as combinações, remove repetições e preserva as tags de origem em cada prospect.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <MultiValueInput label="Atividades / nichos" values={nichos} onChange={setNichos} placeholder="Ex: lojas de piscinas" maxItems={10} />
                <div className="space-y-2"><MultiValueInput label="Localidades" values={localidades} onChange={(values) => { setLocalidades(values); setGeoAreas((current) => current.filter((area) => values.some((value) => value.toLocaleLowerCase("pt-BR") === area.label.toLocaleLowerCase("pt-BR")))); }} placeholder="Ex: Chapecó, SC" maxItems={20} /><ProspectorLocationMap values={localidades} onChange={setLocalidades} maxItems={20} onAreaAdd={(area) => setGeoAreas((current) => [...current.filter((item) => item.label.toLocaleLowerCase("pt-BR") !== area.label.toLocaleLowerCase("pt-BR")), area])} /></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2"><Label>Limite total de resultados</Label><div className="flex gap-2"><Badge variant="secondary">{maxResults} prospects</Badge><Badge variant="outline">{nichos.length * localidades.length} combinação(ões)</Badge></div></div>
                <input type="range" min={5} max={100} step={5} value={maxResults} onChange={(event) => setMaxResults(Number(event.target.value))} className="w-full accent-primary" />
              </div>
              <Button className="w-full" onClick={() => void runSearch()} disabled={searching || !nichos.length || !localidades.length}>{searching ? <><Spinner className="mr-2 h-4 w-4" />Buscando combinações...</> : <><Search className="mr-2 h-4 w-4" />Buscar, deduplicar e priorizar</>}</Button>
            </CardContent>
          </Card>

          {searched && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><CardTitle className="text-base">Empresas encontradas ({scoredResults.length})</CardTitle><CardDescription>As etiquetas mostram em quais nichos e localidades cada empresa foi encontrada.</CardDescription></div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={searchFilter} onValueChange={(value) => setSearchFilter(value as SearchFilter)}><SelectTrigger className="h-9 w-[160px]"><Filter className="mr-1.5 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="fortes">Score ≥ 70</SelectItem><SelectItem value="com_contato">Com telefone</SelectItem></SelectContent></Select>
                    {selectedSearchIndexes.size > 0 && <Button size="sm" onClick={() => void prospectSelectedSearch()} disabled={bulkProspecting || enrich.isPending}>{bulkProspecting ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Users className="mr-1.5 h-3.5 w-3.5" />}Prospectar selecionadas ({selectedSearchIndexes.size})</Button>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {scoredResults.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Nenhum resultado para este filtro.</div> : (
                  <div className="divide-y">
                    {scoredResults.map(({ result, index, score }) => {
                      const done = prospectedIndexes.has(index);
                      const duplicate = duplicateIndexes.has(index);
                      const pending = prospectingIndex === index && enrich.isPending;
                      return (
                        <div key={`${resultKey(result)}-${index}`} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
                          <div className="flex items-start gap-3 sm:flex-1">
                            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={selectedSearchIndexes.has(index)} disabled={done || duplicate} onChange={() => setSelectedSearchIndexes((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />
                            <div className={`min-w-[58px] rounded-lg border px-2 py-2 text-center ${scoreClass(score)}`}><p className="text-lg font-bold leading-none">{score}</p><p className="mt-1 text-[10px]">pré-score</p></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{result.nomeEmpresa || "Sem nome"}</p>{result.rating != null && <Badge variant="outline"><Star className="mr-1 h-3 w-3" />{result.rating}</Badge>}</div>
                              <div className="mt-1.5 flex flex-wrap gap-1">{result.prospectNichos.map((tag) => <Badge key={`n-${tag}`} variant="secondary" className="text-[10px]">{tag}</Badge>)}{result.prospectLocalidades.map((tag) => <Badge key={`l-${tag}`} variant="outline" className="text-[10px]"><MapPin className="mr-1 h-2.5 w-2.5" />{tag}</Badge>)}<Badge variant="outline" className="text-[10px]">Google Places</Badge></div>
                              {result.endereco && <p className="mt-1.5 text-xs text-muted-foreground">{result.endereco}</p>}
                              <p className="mt-1.5 text-xs text-muted-foreground">{searchReason(result, score)}</p>
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{result.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{result.telefone}</span>}{result.reviewCount != null && <span>{result.reviewCount} avaliações</span>}{result.siteOficial && <a href={result.siteOficial} target="_blank" rel="noreferrer" className="text-primary hover:underline">site</a>}</div>
                            </div>
                          </div>
                          <Button size="sm" variant={done || duplicate ? "outline" : "default"} disabled={done || duplicate || enrich.isPending || bulkProspecting || !result.nomeEmpresa} onClick={() => void prospectSearchResult(result, index)}>{pending ? <><Spinner className="mr-1.5 h-3.5 w-3.5" />Prospectando...</> : duplicate ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-amber-600" />Já no CRM</> : done ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />Prospectado</> : <><UserPlus className="mr-1.5 h-3.5 w-3.5" />Prospectar</>}</Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {enrichment && <EnrichmentResult data={enrichment} />}

          {enrichment && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Abordagem com IA</CardTitle><CardDescription>Agora que o prospect foi analisado, gere uma abordagem com contexto real.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Canal</Label><Select value={messageType} onValueChange={(value) => setMessageType(value as "whatsapp" | "email")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">E-mail</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Empresa</Label><Input value={msgNomeEmpresa} onChange={(event) => setMsgNomeEmpresa(event.target.value)} placeholder="Nome do prospect" /></div></div>
                <div className="space-y-1.5"><Label>Contexto / oferta</Label><Textarea rows={3} value={contexto} onChange={(event) => setContexto(event.target.value)} placeholder="O que você vende e por que faz sentido para esse prospect?" /></div>
                <Button variant="secondary" className="w-full" onClick={generateMessage} disabled={generate.isPending}>{generate.isPending ? <Spinner className="mr-2 h-4 w-4" /> : messageType === "email" ? <Mail className="mr-2 h-4 w-4" /> : <MessageCircle className="mr-2 h-4 w-4" />}Gerar abordagem</Button>
              </CardContent>
            </Card>
          )}
          {generatedText && <MessageApproval key={generatedText} generatedText={generatedText} />}
        </TabsContent>

        <TabsContent value="cnpj" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-4 w-4 text-primary" />Empresas por CNPJ / CNAE</CardTitle><CardDescription>Encontre empresas por atividade, localização, porte e data de abertura. Empresas novas recebem prioridade por timing.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5"><Label>Atividade</Label><Input value={cnaeSearch} onChange={(event) => setCnaeSearch(event.target.value)} placeholder="Digite atividade ou CNAE" />{cnaeListQuery.data && <div className="max-h-28 overflow-y-auto rounded-lg border p-2"><div className="flex flex-wrap gap-1.5">{cnaeListQuery.data.cnaes.filter((item) => !cnaeSearch || item.label.toLowerCase().includes(cnaeSearch.toLowerCase()) || item.cnae.includes(cnaeSearch)).slice(0, 40).map((item) => <button type="button" key={item.cnae} onClick={() => { setCnaeSelected(item.cnae); setCnaeSearch(item.label); }} className={`rounded-full border px-2 py-1 text-xs ${cnaeSelected === item.cnae ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item.label}</button>)}</div></div>}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1.5"><Label>Município</Label><Input value={cnpjMunicipio} onChange={(event) => setCnpjMunicipio(event.target.value)} placeholder="Chapecó" /></div><div className="space-y-1.5"><Label>UF</Label><Input maxLength={2} value={cnpjUf} onChange={(event) => setCnpjUf(event.target.value.toUpperCase())} placeholder="SC" /></div><div className="space-y-1.5"><Label>Abertura</Label><Select value={cnpjAberturaDias} onValueChange={setCnpjAberturaDias}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="qualquer">Qualquer data</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem><SelectItem value="180">Últimos 6 meses</SelectItem><SelectItem value="365">Último ano</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Porte</Label><Select value={cnpjPorte} onValueChange={setCnpjPorte}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="MEI">MEI</SelectItem><SelectItem value="ME">ME</SelectItem><SelectItem value="EPP">EPP</SelectItem><SelectItem value="DEMAIS">Demais</SelectItem></SelectContent></Select></div></div>
              <Button className="w-full" disabled={!cnaeSelected || cnpjSearchMutation.isPending} onClick={() => cnpjSearchMutation.mutate({ cnae: cnaeSelected, uf: cnpjUf || undefined, municipio: cnpjMunicipio || undefined, aberturaDias: cnpjAberturaDias === "qualquer" ? undefined : Number(cnpjAberturaDias), porte: cnpjPorte === "todos" ? undefined : cnpjPorte })}>{cnpjSearchMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : <FileSearch className="mr-2 h-4 w-4" />}Buscar e priorizar empresas</Button>
            </CardContent>
          </Card>

          {cnpjApiKeyRequired && <Card className="border-amber-200 bg-amber-50"><CardContent className="flex items-start gap-3 py-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-900">Fonte de registro empresarial indisponível</p><p className="mt-1 text-sm text-amber-800">A integração precisa ser habilitada pelo administrador da plataforma antes desta busca.</p></div></CardContent></Card>}

          {cnpjSearched && !cnpjApiKeyRequired && <div className="space-y-2">{cnpjResultados.length === 0 ? <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</CardContent></Card> : cnpjResultados.map((empresa, index) => { const score = scoreCnpj(empresa); const days = daysOpen(empresa.dataAbertura); const done = cnpjProspectadoIds.has(empresa.cnpj); const pending = cnpjProspectandoIndex === index && cnpjProspectMutation.isPending; return <Card key={empresa.cnpj} className={score >= 80 ? "border-emerald-200" : ""}><CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start"><div className={`min-w-[64px] rounded-lg border px-2 py-2 text-center ${scoreClass(score)}`}><p className="text-xl font-bold">{score}</p><p className="text-[10px]">pré-score</p></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{empresa.nomeFantasia || empresa.razaoSocial}</p>{days != null && days <= 90 && <Badge className="bg-emerald-100 text-emerald-700"><CalendarDays className="mr-1 h-3 w-3" />Aberta há {days}d</Badge>}{empresa.porte && <Badge variant="outline">{empresa.porte}</Badge>}</div><div className="mt-1.5 flex flex-wrap gap-1"><Badge variant="secondary" className="text-[10px]">{empresa.cnaeDescricao}</Badge><Badge variant="outline" className="text-[10px]">{empresa.municipio}/{empresa.uf}</Badge><Badge variant="outline" className="text-[10px]">CNPJ/CNAE</Badge></div><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{empresa.telefone && <span><Phone className="mr-1 inline h-3 w-3" />{empresa.telefone}</span>}{empresa.email && <span><Mail className="mr-1 inline h-3 w-3" />{empresa.email}</span>}{empresa.socios?.[0] && <span className="font-medium text-primary"><Users className="mr-1 inline h-3 w-3" />{empresa.socios[0].nome}</span>}</div></div><Button size="sm" variant={done ? "outline" : "default"} disabled={done || pending || cnpjProspectMutation.isPending} onClick={() => { setCnpjProspectandoIndex(index); cnpjProspectMutation.mutate(empresa, { onSettled: () => setCnpjProspectandoIndex(null) }); }}>{pending ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : done ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}{done ? "Prospectado" : "Prospectar"}</Button></CardContent></Card>; })}</div>}
        </TabsContent>

        <TabsContent value="anunciantes" className="mt-4 space-y-4">
          <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" />Empresas investindo em anúncios</CardTitle><CardDescription>O investimento em mídia é um sinal comercial. A IA deve investigar atendimento, conversão e follow-up antes da abordagem.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex gap-2"><Input value={adsSearchTerms} onChange={(event) => setAdsSearchTerms(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void searchAds()} placeholder="Ex: loja de piscinas, clínica, esquadrias..." /><Button onClick={() => void searchAds()} disabled={adsSearching || !adsSearchTerms.trim()}>{adsSearching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}</Button></div><p className="text-xs text-muted-foreground">A fonte depende da integração Meta disponível para o tenant.</p></CardContent></Card>
          {adsSearched && (adsResultados.length === 0 ? <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum anunciante encontrado para esse termo.</CardContent></Card> : <div className="space-y-2">{adsResultados.map((ad) => { const done = adsProspectadosPageIds.has(ad.pageId); const duplicate = adsDuplicadosPageIds.has(ad.pageId); const pending = adsProspectandoPageId === ad.pageId && adsProspectMutation.isPending; return <Card key={ad.pageId} className="border-amber-100"><CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{ad.pageName}</p><Badge className="bg-amber-100 text-amber-800">Anunciando agora</Badge><Badge variant="outline" className="text-[10px]">{adsSearchTerms}</Badge></div>{ad.startDate && <p className="mt-1 text-xs text-muted-foreground"><CalendarDays className="mr-1 inline h-3 w-3" />Ativo desde {new Date(ad.startDate).toLocaleDateString("pt-BR")}</p>}<p className="mt-2 max-w-2xl text-xs text-muted-foreground">Sinal comercial: já existe investimento em aquisição. Investigue o processo de atendimento antes de oferecer solução.</p></div><div className="flex shrink-0 gap-2">{ad.snapshotUrl && <Button size="sm" variant="outline" asChild><a href={ad.snapshotUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Ver anúncio</a></Button>}<Button size="sm" variant={done || duplicate ? "outline" : "default"} disabled={done || duplicate || adsProspectMutation.isPending} onClick={() => { setAdsProspectandoPageId(ad.pageId); adsProspectMutation.mutate(ad, { onSettled: () => setAdsProspectandoPageId(null) }); }}>{pending ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : done || duplicate ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}{duplicate ? "Já no CRM" : done ? "Prospectado" : "Prospectar"}</Button></div></CardContent></Card>; })}</div>)}
        </TabsContent>

        <TabsContent value="fila" className="mt-4 space-y-4">
          <Card><CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" />Fila de oportunidades</CardTitle><CardDescription>Prospects enriquecidos e ordenados por chance comercial. As tags preservam a origem da prospecção.</CardDescription></div><div className="flex flex-wrap gap-2"><Select value={queueFilter} onValueChange={(value) => changeQueueFilter(value as QueueFilter)}><SelectTrigger className="h-9 w-[160px]"><Filter className="mr-1.5 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="quentes">Quentes ≥80</SelectItem><SelectItem value="aquecendo">50–79</SelectItem><SelectItem value="analisando">Analisando</SelectItem></SelectContent></Select><Button size="sm" variant="outline" onClick={() => filaQuery.refetch()} disabled={filaQuery.isFetching}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${filaQuery.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>{selectedFilaLeadIds.size > 0 && <Button size="sm" variant="secondary" onClick={() => createCampaignPackageMutation.mutate([...selectedFilaLeadIds])} disabled={createCampaignPackageMutation.isPending}><Megaphone className="mr-1.5 h-3.5 w-3.5" />Criar pacote ({selectedFilaLeadIds.size})</Button>}<Button size="sm" onClick={() => dispatchTopMutation.mutate(10)} disabled={dispatchTopMutation.isPending || !queueLeads.length}><Zap className="mr-1.5 h-3.5 w-3.5" />Disparar top 10</Button></div></div></CardHeader></Card>

          {filaQuery.isLoading ? <div className="flex justify-center py-10 text-sm text-muted-foreground"><Spinner className="mr-2 h-5 w-5" />Carregando oportunidades...</div> : filaQuery.isError ? <Card className="border-destructive/30"><CardContent className="py-6 text-center text-sm text-destructive">Falha ao carregar a fila.</CardContent></Card> : queueLeads.length === 0 ? <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground"><Target className="mx-auto mb-2 h-8 w-8 opacity-40" />Nenhuma oportunidade neste filtro.</CardContent></Card> : <div className="space-y-2">{queueLeads.map((lead) => { const score = lead.propensityScore ?? 0; const pending = lead.enrichmentStatus === "pending"; const roi = lead.roiEstimate; const tagNichos = lead.metadata?.prospector_nichos ?? []; const tagLocais = lead.metadata?.prospector_localidades ?? []; return <Card key={lead.id} className={score >= 80 ? "border-emerald-200" : ""}><CardContent className="flex items-start gap-3 py-4"><input type="checkbox" className="mt-3 h-4 w-4 accent-primary" checked={selectedFilaLeadIds.has(lead.id)} disabled={pending} onChange={() => setSelectedFilaLeadIds((current) => { const next = new Set(current); if (next.has(lead.id)) next.delete(lead.id); else next.add(lead.id); return next; })} /><div className={`min-w-[66px] rounded-lg border px-2 py-2 text-center ${pending ? "border-slate-200 bg-slate-50 text-slate-500" : scoreClass(score)}`}>{pending ? <><Spinner className="mx-auto h-4 w-4" /><p className="mt-1 text-[10px]">analisando</p></> : <><p className="text-xl font-bold leading-none">{score}</p><p className="mt-1 text-[10px]">/100</p></>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{lead.nome}</p>{score >= 80 && !pending && <Badge className="bg-emerald-100 text-emerald-700"><Flame className="mr-1 h-3 w-3" />Quente</Badge>}{lead.enrichmentStatus !== "pending" && <Badge variant="outline">{lead.enrichmentStatus}</Badge>}</div>{(tagNichos.length > 0 || tagLocais.length > 0) && <div className="mt-1.5 flex flex-wrap gap-1">{tagNichos.map((tag) => <Badge key={`qn-${tag}`} variant="secondary" className="text-[10px]">{tag}</Badge>)}{tagLocais.map((tag) => <Badge key={`ql-${tag}`} variant="outline" className="text-[10px]"><MapPin className="mr-1 h-2.5 w-2.5" />{tag}</Badge>)}</div>}{lead.priorityReason && <p className="mt-1 text-sm text-muted-foreground">{lead.priorityReason}</p>}{lead.events.map((event) => <p key={`${event.tipo}-${event.descricao}`} className="mt-1 text-xs font-medium text-primary">{event.descricao}</p>)}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{lead.telefone && <span><Phone className="mr-1 inline h-3 w-3" />{lead.telefone}</span>}{lead.endereco && <span><MapPin className="mr-1 inline h-3 w-3" />{lead.endereco}</span>}{lead.mercadoSegmento && <span>{lead.mercadoSegmento}</span>}</div>{roi?.perda_estimada_mes != null && <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700"><BarChart3 className="h-3.5 w-3.5" />Potencial recuperável: {formatMoney(roi.perda_estimada_mes)}/mês</div>}<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={pending || dispatchSdrMutation.isPending} onClick={() => dispatchSdrMutation.mutate(lead.id)}><PlayCircle className="mr-1.5 h-3.5 w-3.5" />Disparar SDR</Button><Button size="sm" variant="outline" disabled={pending || createCampaignPackageMutation.isPending} onClick={() => createCampaignPackageMutation.mutate([lead.id])}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Criar pacote</Button>{lead.metadata?.revenue_scout_campaign_ids?.[0] && <Link href={`/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(lead.metadata.revenue_scout_campaign_ids[0])}&from=revenue-scout`}><Button size="sm" variant="outline"><Megaphone className="mr-1.5 h-3.5 w-3.5" />Abrir campanha</Button></Link>}<Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={discardMutation.isPending} onClick={() => discardMutation.mutate(lead.id)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Descartar</Button></div></div></CardContent></Card>; })}</div>}
        </TabsContent>

        <TabsContent value="aprovacoes" className="mt-4"><ProspectorAprovacoesContent /></TabsContent>
      </Tabs>
    </div>
  );
}
