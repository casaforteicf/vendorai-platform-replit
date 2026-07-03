import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useProspectorEnrich,
  useProspectorSearch,
  useProspectorGenerateMessage,
  useProspectorGetConfig,
  useProspectorUpdateConfig,
  prospectorExport,
  type ProspectEnrichment,
  type ProspectorSearchResult,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Star,
  Phone,
  Globe,
  MapPin,
  Sparkles,
  CheckCircle2,
  PencilLine,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Download,
  Instagram,
  MessageCircle,
  Building2,
  Target,
  Gauge,
  Briefcase,
  UserPlus,
  ClipboardCheck,
  Bot,
  Save,
  TrendingUp,
  Zap,
  Trash2,
  PlayCircle,
  BarChart3,
  RefreshCw,
  Settings,
  Megaphone,
  CalendarDays,
  Users,
  ExternalLink,
  AlertCircle,
  FileSearch,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ProspectorAprovacoesContent } from "./ProspectorAprovacoes";

type ApprovalDecision = "approved" | "approved_edited" | "rejected";

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

function EnrichmentResult({ data }: { data: ProspectEnrichment }) {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{data.nomeEmpresa ?? "Empresa"}</CardTitle>
            {data.endereco && (
              <CardDescription className="flex items-center gap-1.5 mt-1">
                <MapPin className="h-3.5 w-3.5" /> {data.endereco}
              </CardDescription>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {data.scoreProspector != null && (
              <Badge variant="default" className="text-sm">
                <Gauge className="h-3.5 w-3.5 mr-1" /> Score {data.scoreProspector}
              </Badge>
            )}
            {data.temContato ? (
              <Badge variant="secondary">Com contato</Badge>
            ) : (
              <Badge variant="outline">Sem contato</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm">
          {data.rating != null && (
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500" />
              {data.rating}
              {data.reviewCount != null && (
                <span className="text-muted-foreground">({data.reviewCount} avaliações)</span>
              )}
            </span>
          )}
          {data.telefone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-muted-foreground" /> {data.telefone}
            </span>
          )}
          {data.whatsapp && (
            <span className="flex items-center gap-1.5 text-green-600">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </span>
          )}
          {data.instagram && (
            <span className="flex items-center gap-1.5 text-pink-600">
              <Instagram className="h-4 w-4" /> {data.instagram}
            </span>
          )}
          {data.siteOficial && (
            <a
              href={data.siteOficial}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <Globe className="h-4 w-4" /> Site oficial
            </a>
          )}
        </div>

        {(data.cnpj || data.razaoSocial || data.situacaoCadastral || data.atividadePrincipal) && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Dados cadastrais (ReceitaWS)
            </p>
            {data.razaoSocial && <p>Razão social: {data.razaoSocial}</p>}
            {data.cnpj && <p>CNPJ: {data.cnpj}</p>}
            {data.situacaoCadastral && <p>Situação: {data.situacaoCadastral}</p>}
            {data.atividadePrincipal && <p>Atividade: {data.atividadePrincipal}</p>}
          </div>
        )}

        {data.resumoNegocio && (
          <p className="text-sm text-muted-foreground italic">{data.resumoNegocio}</p>
        )}

        <div className="flex flex-wrap gap-2 text-sm">
          {data.tipoNegocio && (
            <Badge variant="outline" className="font-normal">
              <Building2 className="h-3.5 w-3.5 mr-1" /> {data.tipoNegocio}
            </Badge>
          )}
          {data.publicoAlvo && (
            <Badge variant="outline" className="font-normal">
              <Target className="h-3.5 w-3.5 mr-1" /> {data.publicoAlvo}
            </Badge>
          )}
          {data.nivelPresencaDigital && (
            <Badge variant="outline" className="font-normal">
              <Gauge className="h-3.5 w-3.5 mr-1" /> Presença digital: {data.nivelPresencaDigital}
            </Badge>
          )}
        </div>

        {data.pontosFortes && data.pontosFortes.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1.5">Pontos fortes</p>
            <ul className="flex flex-wrap gap-2">
              {data.pontosFortes.map((p, i) => (
                <li key={i}>
                  <Badge variant="outline" className="font-normal">
                    {p}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.doresPrincipais && data.doresPrincipais.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1.5">Dores principais</p>
            <ul className="flex flex-wrap gap-2">
              {data.doresPrincipais.map((d, i) => (
                <li key={i}>
                  <Badge variant="outline" className="font-normal text-destructive border-destructive/40">
                    {d}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MessageApproval({ generatedText }: { generatedText: string }) {
  const { toast } = useToast();
  const [edited, setEdited] = useState(generatedText);
  const [decision, setDecision] = useState<ApprovalDecision | null>(null);

  function decide(d: ApprovalDecision) {
    setDecision(d);
    const labels: Record<ApprovalDecision, string> = {
      approved: "Mensagem aprovada",
      approved_edited: "Mensagem aprovada com edição",
      rejected: "Mensagem rejeitada",
    };
    toast({ title: labels[d] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Mensagem gerada
        </CardTitle>
        <CardDescription>Revise, edite se quiser e decida a aprovação.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={edited}
          onChange={(e) => setEdited(e.target.value)}
          rows={6}
          className="resize-none"
        />

        {decision && (
          <div className="flex items-center gap-2 text-sm">
            {decision === "rejected" ? (
              <Badge variant="destructive">Rejeitada</Badge>
            ) : (
              <Badge variant="default">
                {decision === "approved_edited" ? "Aprovada com edição" : "Aprovada"}
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("approved")} variant="default">
            <ThumbsUp className="h-4 w-4 mr-2" /> Aprovar
          </Button>
          <Button onClick={() => decide("approved_edited")} variant="secondary">
            <PencilLine className="h-4 w-4 mr-2" /> Aprovar com Edição
          </Button>
          <Button onClick={() => decide("rejected")} variant="outline">
            <ThumbsDown className="h-4 w-4 mr-2" /> Rejeitar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Seção de Configuração de Busca Automática ─────────────────────────────────
function ProspectorAutoConfig() {
  const { toast } = useToast();
  const { data, isLoading } = useProspectorGetConfig();
  const update = useProspectorUpdateConfig();

  const cfg = data?.config;

  const [setor, setSetor] = useState("");
  const [cidade, setCidade] = useState("");
  const [ritmoDiario, setRitmoDiario] = useState(10);
  const [ativo, setAtivo] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Populate form once config is loaded
  if (!isLoading && !initialized && data !== undefined) {
    setSetor(cfg?.setor ?? "");
    setCidade(cfg?.cidade ?? "");
    setRitmoDiario(cfg?.ritmoDiario ?? 10);
    setAtivo(cfg?.ativo ?? false);
    setInitialized(true);
  }

  function onSave() {
    update.mutate(
      { data: { setor: setor || null, cidade: cidade || null, ritmoDiario, ativo } },
      {
        onSuccess: () => toast({ title: "Configuração salva" }),
        onError: () => toast({ title: "Falha ao salvar", variant: "destructive" }),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" /> Configuração de Busca Automática
        </CardTitle>
        <CardDescription>
          O agente Prospector buscará novas empresas no Google Places diariamente às 09:00 (BRT) e
          preencherá a fila automática com os resultados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Carregando configuração...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-setor">Setor comercial</Label>
                <Input
                  id="cfg-setor"
                  placeholder="Ex: materiais de construção"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-cidade">Cidade</Label>
                <Input
                  id="cfg-cidade"
                  placeholder="Ex: Curitiba, PR"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-ritmo">
                Ritmo de abordagem{" "}
                <span className="text-muted-foreground font-normal">
                  ({ritmoDiario} leads/dia)
                </span>
              </Label>
              <input
                id="cfg-ritmo"
                type="range"
                min={1}
                max={100}
                step={1}
                value={ritmoDiario}
                onChange={(e) => setRitmoDiario(Number(e.target.value))}
                className="w-full accent-primary h-2 rounded cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Busca automática diária</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o sistema buscará novas empresas todo dia às 09:00 BRT e as
                  adicionará à fila do Prospector.
                </p>
              </div>
              <Switch
                checked={ativo}
                onCheckedChange={setAtivo}
                aria-label="Ativar busca automática diária"
              />
            </div>

            <Button onClick={onSave} disabled={update.isPending} className="w-full sm:w-auto">
              {update.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar configuração
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Prospector() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.platformRole === "super_admin";

  const [tenantId, setTenantId] = useState(user?.tenantId ?? "");

  // Busca por atividade + localidade
  const [atividade, setAtividade] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [maxResults, setMaxResults] = useState(10);
  const [results, setResults] = useState<ProspectorSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [prospectingIndex, setProspectingIndex] = useState<number | null>(null);
  const [prospectedIndexes, setProspectedIndexes] = useState<number[]>([]);
  const [duplicateIndexes, setDuplicateIndexes] = useState<number[]>([]);
  const [enrichment, setEnrichment] = useState<ProspectEnrichment | null>(null);
  const [exporting, setExporting] = useState(false);
  const [prospectStep, setProspectStep] = useState<"idle" | "importing" | "briefing" | "done">("idle");
  const [prospectDealId, setProspectDealId] = useState<string | null>(null);

  // Message form
  const [messageType, setMessageType] = useState("whatsapp");
  const [msgNomeEmpresa, setMsgNomeEmpresa] = useState("");
  const [contexto, setContexto] = useState("");
  const [generatedText, setGeneratedText] = useState<string | null>(null);

  const search = useProspectorSearch();
  const enrich = useProspectorEnrich();
  const generate = useProspectorGenerateMessage();
  const queryClient = useQueryClient();

  // ── Cmd 23: Busca CNPJ state ─────────────────────────────────────────────
  const [cnaeSearch, setCnaeSearch] = useState("");
  const [cnaeSelected, setCnaeSelected] = useState("");
  const [cnpjUf, setCnpjUf] = useState("");
  const [cnpjMunicipio, setCnpjMunicipio] = useState("");
  const [cnpjAberturaDias, setCnpjAberturaDias] = useState<string>("");
  const [cnpjPorte, setCnpjPorte] = useState("");
  const [cnpjResultados, setCnpjResultados] = useState<CnpjEmpresa[]>([]);
  const [cnpjSearched, setCnpjSearched] = useState(false);
  const [cnpjApiKeyRequired, setCnpjApiKeyRequired] = useState(false);
  const [cnpjProspectandoIndex, setCnpjProspectandoIndex] = useState<number | null>(null);
  const [cnpjProspectadoIds, setCnpjProspectadoIds] = useState<Set<string>>(new Set());

  // ── Cmd 23: Anunciantes state ─────────────────────────────────────────────
  const [adsSearchTerms, setAdsSearchTerms] = useState("");
  const [adsResultados, setAdsResultados] = useState<AdResult[]>([]);
  const [adsSearched, setAdsSearched] = useState(false);
  const [adsSearching, setAdsSearching] = useState(false);

  // ── Fila Preditiva (Cmd 22) ──────────────────────────────────────────────
  function getAuthHeaders() {
    const token = localStorage.getItem("vendorai_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  // ── CNPJ/CNAE queries (Cmd 23) ───────────────────────────────────────────
  const cnaeListQuery = useQuery({
    queryKey: ["prospector-cnaes"],
    queryFn: async () => {
      const res = await fetch("/api/prospector/cnpj/cnaes", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar CNAEs");
      return res.json() as Promise<{ cnaes: Array<{ cnae: string; label: string; vertical: string; prioridade: number }> }>;
    },
    staleTime: 300_000,
  });

  const cnpjSearchMutation = useMutation({
    mutationFn: async (params: { cnae: string; uf?: string; municipio?: string; aberturaDias?: number; porte?: string }) => {
      const res = await fetch("/api/prospector/cnpj/search", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...params, limit: 20, tenantId }),
      });
      if (!res.ok) throw new Error("Falha na busca CNPJ");
      return res.json() as Promise<{ empresas: CnpjEmpresa[]; total: number; apiKeyRequired: boolean }>;
    },
    onSuccess: (data) => {
      setCnpjResultados(data.empresas);
      setCnpjSearched(true);
      setCnpjApiKeyRequired(data.apiKeyRequired);
    },
    onError: () => toast({ title: "Falha na busca CNPJ", variant: "destructive" }),
  });

  const cnpjProspectarMutation = useMutation({
    mutationFn: async (empresa: CnpjEmpresa) => {
      const res = await fetch("/api/prospector/cnpj/prospectar", {
        method: "POST",
        headers: getAuthHeaders(),
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
          tenantId,
        }),
      });
      if (!res.ok) throw new Error("Falha ao prospectar");
      return res.json() as Promise<{ leadId: string; merged: boolean; message?: string; isRecemAberta?: boolean; linkedInUrl?: string; decisorNome?: string | null }>;
    },
    onSuccess: (data, empresa) => {
      setCnpjProspectadoIds((prev) => new Set(prev).add(empresa.cnpj));
      if (data.merged) {
        toast({ title: data.message ?? "Lead já existe — dados mesclados" });
      } else {
        toast({ title: data.isRecemAberta ? "🎉 Lead recém-aberta criado com boost!" : "Lead CNPJ criado com sucesso!" });
      }
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
    },
    onError: () => toast({ title: "Falha ao prospectar empresa", variant: "destructive" }),
  });

  async function handleAdsSearch() {
    if (!adsSearchTerms.trim()) return;
    setAdsSearching(true);
    try {
      const res = await fetch("/api/prospector/ads/search", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ searchTerms: adsSearchTerms, limit: 20, tenantId }),
      });
      const data = await res.json() as { ads?: AdResult[]; error?: string };
      if (!res.ok) {
        toast({ title: data.error ?? "Falha na busca de anúncios", variant: "destructive" });
      } else {
        setAdsResultados(data.ads ?? []);
        setAdsSearched(true);
      }
    } finally {
      setAdsSearching(false);
    }
  }

  const filaQuery = useQuery({
    queryKey: ["prospector-fila", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/prospector/fila?limit=50", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar a fila");
      return res.json() as Promise<{
        leads: Array<{
          id: string;
          nome: string;
          empresa?: string;
          telefone?: string;
          endereco?: string;
          mercadoSegmento?: string;
          enrichmentStatus: string;
          propensityScore?: number;
          roiEstimate?: { volume_atendimentos_mes?: number; perda_estimada_mes?: number; ganho_potencial_mes?: number; ticket_estimado?: string };
          enrichmentData?: { digital?: Record<string, unknown>; growth?: Record<string, unknown> };
          priorityReason?: string;
          createdAt: string;
          events: Array<{ tipo: string; descricao: string }>;
        }>;
        autoDispatchThreshold: number;
        total: number;
      }>;
    },
    staleTime: 30_000,
  });

  const dispatchSdrMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await fetch(`/api/prospector/dispatch-sdr/${leadId}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao disparar SDR");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "SDR disparado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
    },
    onError: () => toast({ title: "Falha ao disparar SDR", variant: "destructive" }),
  });

  const dispatchTopMutation = useMutation({
    mutationFn: async (n: number) => {
      const res = await fetch("/api/prospector/dispatch-top", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ n }),
      });
      if (!res.ok) throw new Error("Falha ao disparar em lote");
      return res.json() as Promise<{ dispatched: number }>;
    },
    onSuccess: (data) => {
      toast({ title: `${data.dispatched} SDR(s) disparado(s)!` });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
    },
    onError: () => toast({ title: "Falha ao disparar em lote", variant: "destructive" }),
  });

  const discardMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await fetch(`/api/prospector/fila/discard/${leadId}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao descartar lead");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lead descartado da fila" });
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
    },
    onError: () => toast({ title: "Falha ao descartar", variant: "destructive" }),
  });

  function tenantIdField() {
    return isSuperAdmin ? { tenantId: tenantId || undefined } : {};
  }

  function onSearch() {
    if (atividade.trim().length < 2) {
      toast({ title: "Informe a atividade comercial", variant: "destructive" });
      return;
    }
    if (localidade.trim().length < 2) {
      toast({ title: "Informe a localidade", variant: "destructive" });
      return;
    }
    search.mutate(
      {
        data: {
          atividade: atividade.trim(),
          localidade: localidade.trim(),
          maxResults,
          ...tenantIdField(),
        },
      },
      {
        onSuccess: (res) => {
          setResults(res.results);
          setSearched(true);
          setEnrichment(null);
          setProspectedIndexes([]);
          setDuplicateIndexes([]);
          toast({
            title: res.total > 0 ? `${res.total} empresa(s) encontrada(s)` : "Nenhuma empresa encontrada",
            description: res.total === 0 ? "Tente outra atividade ou localidade." : undefined,
            variant: res.total === 0 ? "destructive" : undefined,
          });
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "";
          const isPermission = msg.includes("403") || msg.includes("permission") || msg.includes("PERMISSION");
          toast({
            title: "Falha na busca",
            description: isPermission
              ? "A chave do Google Places não tem permissão. Ative a 'Places API (New)' no Google Cloud Console e certifique-se de que o faturamento está habilitado no projeto."
              : msg || "Erro desconhecido. Tente novamente.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function onProspect(r: ProspectorSearchResult, index: number) {
    const nome = r.nomeEmpresa ?? "";
    if (nome.trim().length < 2) return;
    setProspectingIndex(index);
    setProspectStep("importing");
    setProspectDealId(null);
    enrich.mutate(
      {
        data: {
          nomeEmpresa: nome,
          endereco: r.endereco ?? undefined,
          ...tenantIdField(),
        },
      },
      {
        onSuccess: (res) => {
          setEnrichment(res.enrichment);
          if (!msgNomeEmpresa) setMsgNomeEmpresa(res.enrichment.nomeEmpresa ?? nome);
          const isDup = (res as any).isDuplicate as boolean | undefined;
          if (!res.saved) {
            setProspectStep("idle");
            toast({
              title: "Não virou lead",
              description: res.reason ?? "Empresa sem canal de contato.",
              variant: "destructive",
            });
          } else if (isDup) {
            setDuplicateIndexes((prev) => (prev.includes(index) ? prev : [...prev, index]));
            setProspectStep("idle");
            toast({
              title: "Lead já cadastrado",
              description: "Este contato já existe na sua base e não foi importado novamente.",
            });
          } else {
            setProspectedIndexes((prev) => (prev.includes(index) ? prev : [...prev, index]));
            const dealId = (res as any).dealId as string | null | undefined;
            setProspectDealId(dealId ?? null);
            setProspectStep("briefing");
            // Simula o tempo de geração do briefing no backend (~3s) e marca como done
            setTimeout(() => setProspectStep("done"), 3500);
          }
        },
        onError: (err) => {
          setProspectStep("idle");
          toast({
            title: "Falha ao prospectar",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
        onSettled: () => setProspectingIndex(null),
      },
    );
  }

  async function onExport() {
    setExporting(true);
    try {
      const csv = await prospectorExport(isSuperAdmin && tenantId ? { tenantId } : undefined);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prospector_leads.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Falha ao exportar CSV",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  function onGenerate() {
    generate.mutate(
      {
        data: {
          messageType,
          nomeEmpresa: msgNomeEmpresa.trim() || undefined,
          contexto: contexto.trim() || undefined,
          ...tenantIdField(),
        },
      },
      {
        onSuccess: (res) => {
          setGeneratedText(messageType === "email" ? res.email : res.whatsapp);
          toast({ title: "Mensagem gerada" });
        },
        onError: (err) => {
          toast({
            title: "Falha ao gerar mensagem",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" /> Prospector
          </h1>
          <p className="text-muted-foreground mt-1">
            Busque e enriqueça empresas e gere mensagens de primeiro contato com IA.
          </p>
        </div>
        <Button onClick={onExport} disabled={exporting} variant="outline">
          {exporting ? (
            <>
              <Spinner className="h-4 w-4 mr-2" /> Exportando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="busca">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="busca" className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> Google Places
          </TabsTrigger>
          <TabsTrigger value="cnpj" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" /> Busca CNPJ
          </TabsTrigger>
          <TabsTrigger value="anunciantes" className="flex items-center gap-1.5">
            <Megaphone className="h-4 w-4" /> Anunciantes
          </TabsTrigger>
          <TabsTrigger value="fila" className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> Fila
            {(filaQuery.data?.total ?? 0) > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none">
                {filaQuery.data!.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="aprovacoes" className="flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" /> Aprovações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="busca" className="mt-4 space-y-6">

      <ProspectorAutoConfig />

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant</CardTitle>
            <CardDescription>Como super admin, informe o tenantId alvo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="tenantId"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Busca por atividade + localidade ────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> Buscar empresas
            </CardTitle>
            <CardDescription>
              Informe a atividade comercial e a localidade para listar empresas (Google Places).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="atividade">Atividade comercial</Label>
              <Input
                id="atividade"
                placeholder="Ex: restaurantes, clínicas odontológicas"
                value={atividade}
                onChange={(e) => setAtividade(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearch();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="localidade">Localidade</Label>
              <Input
                id="localidade"
                placeholder="Ex: Curitiba, PR"
                value={localidade}
                onChange={(e) => setLocalidade(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearch();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxResults">
                Quantidade de leads a buscar <span className="text-muted-foreground font-normal">({maxResults})</span>
              </Label>
              <input
                id="maxResults"
                type="range"
                min={1}
                max={20}
                step={1}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full accent-primary h-2 rounded cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>10</span>
                <span>20</span>
              </div>
            </div>
            <Button onClick={onSearch} disabled={search.isPending} className="w-full">
              {search.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Buscando...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" /> Buscar empresas
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Geração de mensagem ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Gerar Mensagem
            </CardTitle>
            <CardDescription>Crie uma mensagem de primeiro contato com IA.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msgNomeEmpresa">Nome da empresa (opcional)</Label>
              <Input
                id="msgNomeEmpresa"
                placeholder="Ex: Padaria Bella Paulista"
                value={msgNomeEmpresa}
                onChange={(e) => setMsgNomeEmpresa(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contexto">Contexto (opcional)</Label>
              <Textarea
                id="contexto"
                placeholder="Ex: queremos oferecer nosso sistema de gestão..."
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <Button onClick={onGenerate} disabled={generate.isPending} className="w-full">
              {generate.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Gerar Mensagem
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Lista de empresas encontradas ───────────────────── */}
      {searched && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Empresas encontradas ({results.length})
            </CardTitle>
            <CardDescription>
              Clique em "Prospectar" para enriquecer com IA e criar o lead na pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma empresa encontrada. Tente outra atividade ou localidade.
              </p>
            ) : (
              <ul className="divide-y">
                {results.map((r, i) => {
                  const nome = r.nomeEmpresa ?? "";
                  const isProspecting = prospectingIndex === i && enrich.isPending;
                  const done = prospectedIndexes.includes(i);
                  const isDup = duplicateIndexes.includes(i);
                  return (
                    <li
                      key={`${nome}-${i}`}
                      className="py-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium truncate">{nome || "Sem nome"}</p>
                        {r.endereco && (
                          <p className="text-xs text-muted-foreground truncate">{r.endereco}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {r.telefone && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" /> {r.telefone}
                            </span>
                          )}
                          {typeof r.rating === "number" && (
                            <span className="flex items-center gap-1">
                              <Gauge className="h-3 w-3" /> {r.rating}
                              {typeof r.reviewCount === "number" ? ` (${r.reviewCount})` : ""}
                            </span>
                          )}
                          {r.siteOficial && (
                            <a
                              href={r.siteOficial}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline truncate max-w-[160px]"
                            >
                              site
                            </a>
                          )}
                        </div>
                      </div>
                      {isDup ? (
                        <Badge variant="secondary" className="shrink-0 gap-1">
                          <CheckCircle2 className="h-3 w-3 text-amber-500" /> Já importado
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={done ? "outline" : "default"}
                          disabled={enrich.isPending || done || nome.trim().length < 2}
                          onClick={() => onProspect(r, i)}
                          className="shrink-0"
                        >
                          {isProspecting ? (
                            <>
                              <Spinner className="h-4 w-4 mr-1" /> Prospectando...
                            </>
                          ) : done ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Lead criado
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 mr-1" /> Prospectar
                            </>
                          )}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Progresso da prospecção ──────────────────────────── */}
      {prospectStep !== "idle" && (
        <Card className={prospectStep === "done" ? "border-emerald-300 bg-emerald-50" : "border-primary/30"}>
          <CardContent className="py-4 space-y-2">
            {(() => {
              const stepIdx = { idle: -1, importing: 0, briefing: 2, done: 3 }[prospectStep];
              return [
                { idx: 0, label: "Importando lead..." },
                { idx: 1, label: "Adicionando ao funil..." },
                { idx: 2, label: "Gerando briefing com IA..." },
              ].map(({ idx, label }) => {
                const isDone = stepIdx > idx;
                const isActive = stepIdx === idx;
                const finalLabel = isDone && idx === 2 ? "✅ Lead adicionado ao CRM com briefing!" : label;
                return (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : isActive ? (
                      <Spinner className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />
                    )}
                    <span className={isDone ? "text-emerald-700" : isActive ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {finalLabel}
                    </span>
                  </div>
                );
              });
            })()}
            {prospectStep === "done" && (
              <div className="flex gap-2 pt-1">
                <a href="/negocios">
                  <Button size="sm" variant="default" className="gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" /> Ver no CRM
                  </Button>
                </a>
                <Button size="sm" variant="outline" onClick={() => setProspectStep("idle")} className="gap-1.5">
                  <XCircle className="h-3.5 w-3.5" /> Fechar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Resultados ──────────────────────────────────────── */}
      {enrichment && <EnrichmentResult data={enrichment} />}
      {generatedText && <MessageApproval key={generatedText} generatedText={generatedText} />}

      {!searched && !enrichment && !generatedText && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Os resultados de enriquecimento e mensagens aparecerão aqui.</p>
            <p className="text-xs mt-1 flex items-center justify-center gap-1">
              <XCircle className="h-3 w-3" /> Nenhum resultado ainda.
            </p>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        {/* ── Aba CNPJ ─────────────────────────────────────────── */}
        <TabsContent value="cnpj" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Busca por CNPJ/CNAE
              </CardTitle>
              <CardDescription>
                Encontre empresas reais da Receita Federal por atividade, cidade e data de abertura.
                Requer <code className="text-xs bg-muted px-1 rounded">CNPJ_API_KEY</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* CNAE selector */}
              <div className="space-y-1.5">
                <Label>Atividade (CNAE)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar atividade... ex: restaurante, clínica"
                    value={cnaeSearch}
                    onChange={(e) => setCnaeSearch(e.target.value)}
                    className="flex-1"
                  />
                </div>
                {cnaeListQuery.data && (
                  <div className="flex flex-wrap gap-1.5 mt-1 max-h-32 overflow-y-auto">
                    {cnaeListQuery.data.cnaes
                      .filter((c) =>
                        !cnaeSearch ||
                        c.label.toLowerCase().includes(cnaeSearch.toLowerCase()) ||
                        c.cnae.includes(cnaeSearch)
                      )
                      .map((c) => (
                        <button
                          key={c.cnae}
                          onClick={() => { setCnaeSelected(c.cnae); setCnaeSearch(c.label); }}
                          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                            cnaeSelected === c.cnae
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:bg-muted"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))
                    }
                  </div>
                )}
                {cnaeSelected && (
                  <p className="text-xs text-muted-foreground">CNAE selecionado: <code>{cnaeSelected}</code></p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Município</Label>
                  <Input placeholder="Ex: Chapecó" value={cnpjMunicipio} onChange={(e) => setCnpjMunicipio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>UF</Label>
                  <Input placeholder="Ex: SC" maxLength={2} value={cnpjUf} onChange={(e) => setCnpjUf(e.target.value.toUpperCase())} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Abertura</Label>
                  <Select value={cnpjAberturaDias} onValueChange={setCnpjAberturaDias}>
                    <SelectTrigger><SelectValue placeholder="Qualquer data" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Qualquer data</SelectItem>
                      <SelectItem value="30">Últimos 30 dias ⭐</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                      <SelectItem value="180">Últimos 6 meses</SelectItem>
                      <SelectItem value="365">Último ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Porte</Label>
                  <Select value={cnpjPorte} onValueChange={setCnpjPorte}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="MEI">MEI</SelectItem>
                      <SelectItem value="ME">ME (Microempresa)</SelectItem>
                      <SelectItem value="EPP">EPP (Pequena)</SelectItem>
                      <SelectItem value="DEMAIS">Demais</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!cnaeSelected || cnpjSearchMutation.isPending}
                onClick={() =>
                  cnpjSearchMutation.mutate({
                    cnae: cnaeSelected,
                    uf: cnpjUf || undefined,
                    municipio: cnpjMunicipio || undefined,
                    aberturaDias: cnpjAberturaDias ? Number(cnpjAberturaDias) : undefined,
                    porte: cnpjPorte || undefined,
                  })
                }
              >
                {cnpjSearchMutation.isPending ? (
                  <><Spinner className="h-4 w-4 mr-2" /> Buscando...</>
                ) : (
                  <><FileSearch className="h-4 w-4 mr-2" /> Buscar Empresas</>
                )}
              </Button>

              {/* API Key required warning */}
              {cnpjApiKeyRequired && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="py-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">CNPJ_API_KEY necessária</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Configure a variável de ambiente <code>CNPJ_API_KEY</code> com sua chave da
                        <a href="https://cnpja.com" target="_blank" rel="noopener noreferrer" className="underline ml-1">CNPJá API</a>
                        {" "}para buscar empresas por CNAE em massa (~R$ 30-100/mês).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {cnpjSearched && !cnpjApiKeyRequired && (
            <div className="space-y-3">
              {cnpjResultados.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>Nenhuma empresa encontrada. Tente ajustar os filtros.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{cnpjResultados.length} empresa(s) encontrada(s)</p>
                  {cnpjResultados.map((empresa, idx) => {
                    const abertura = empresa.dataAbertura ? new Date(empresa.dataAbertura) : null;
                    const diasAberto = abertura ? Math.floor((Date.now() - abertura.getTime()) / 86_400_000) : null;
                    const isRecemAberta = diasAberto != null && diasAberto <= 90;
                    const jaProspectado = cnpjProspectadoIds.has(empresa.cnpj);
                    const isProspectando = cnpjProspectandoIndex === idx;

                    return (
                      <Card key={empresa.cnpj} className={isRecemAberta ? "border-emerald-200 shadow-sm" : ""}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-start gap-2 flex-wrap">
                                <p className="font-semibold">{empresa.nomeFantasia || empresa.razaoSocial}</p>
                                {isRecemAberta && (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs gap-1">
                                    <CalendarDays className="h-3 w-3" /> Aberta há {diasAberto}d
                                  </Badge>
                                )}
                                {empresa.porte && (
                                  <Badge variant="outline" className="text-xs">{empresa.porte}</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{empresa.cnaeDescricao}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {empresa.municipio}/{empresa.uf}
                                {empresa.enderecoCompleto && ` — ${empresa.enderecoCompleto}`}
                              </p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                {empresa.telefone && (
                                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {empresa.telefone}</span>
                                )}
                                {empresa.email && (
                                  <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {empresa.email}</span>
                                )}
                                {empresa.socios[0] && (
                                  <span className="flex items-center gap-1 text-primary font-medium">
                                    <Users className="h-3 w-3" /> {empresa.socios[0].nome}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                CNPJ: {empresa.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              <Button
                                size="sm"
                                disabled={jaProspectado || isProspectando || cnpjProspectarMutation.isPending}
                                variant={jaProspectado ? "outline" : "default"}
                                onClick={() => {
                                  setCnpjProspectandoIndex(idx);
                                  cnpjProspectarMutation.mutate(empresa, {
                                    onSettled: () => setCnpjProspectandoIndex(null),
                                  });
                                }}
                              >
                                {jaProspectado ? (
                                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Prospectado</>
                                ) : isProspectando ? (
                                  <><Spinner className="h-3.5 w-3.5 mr-1" /> Salvando...</>
                                ) : (
                                  <><Zap className="h-3.5 w-3.5 mr-1" /> Prospectar</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Aba Anunciantes ────────────────────────────────────── */}
        <TabsContent value="anunciantes" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" /> Anunciantes Meta Ad Library
              </CardTitle>
              <CardDescription>
                Descubra empresas que estão investindo em anúncios no Instagram/Facebook.
                Empresas que anunciam têm verba — mas muitas perdem leads no atendimento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: clínica odontológica, restaurante, academia..."
                  value={adsSearchTerms}
                  onChange={(e) => setAdsSearchTerms(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdsSearch()}
                  className="flex-1"
                />
                <Button onClick={handleAdsSearch} disabled={adsSearching || !adsSearchTerms.trim()}>
                  {adsSearching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Usa Meta Ad Library (gratuita). Requer Instagram configurado como integração.
              </p>
            </CardContent>
          </Card>

          {adsSearched && (
            <div className="space-y-3">
              {adsResultados.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>Nenhum anunciante encontrado. Tente termos diferentes.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{adsResultados.length} anunciante(s) encontrado(s)</p>
                  {adsResultados.map((ad) => (
                    <Card key={ad.pageId} className="border-amber-100">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{ad.pageName}</p>
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                                Anunciando
                              </Badge>
                            </div>
                            {ad.startDate && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" /> Anunciando desde{" "}
                                {new Date(ad.startDate).toLocaleDateString("pt-BR")}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground italic">
                              Gancho SDR: "Vi que vocês estão anunciando no Instagram. Quantos leads do anúncio ficam sem resposta no WhatsApp?"
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {ad.snapshotUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={ad.snapshotUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver anúncio
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fila" className="mt-4 space-y-4">
          {/* ── Ações em lote + config ─────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Fila Preditiva
                  </CardTitle>
                  <CardDescription>
                    Leads ordenados por score de propensão. Score ≥ {filaQuery.data?.autoDispatchThreshold ?? 80} dispara SDR automaticamente.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => filaQuery.refetch()}
                    disabled={filaQuery.isFetching}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${filaQuery.isFetching ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => dispatchTopMutation.mutate(10)}
                    disabled={dispatchTopMutation.isPending || (filaQuery.data?.total ?? 0) === 0}
                  >
                    {dispatchTopMutation.isPending ? (
                      <><Spinner className="h-3.5 w-3.5 mr-1" /> Disparando...</>
                    ) : (
                      <><Zap className="h-3.5 w-3.5 mr-1" /> Disparar top 10</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* ── Lista de leads na fila ─────────────────────────── */}
          {filaQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Spinner className="h-5 w-5 mr-2" /> Carregando fila...
            </div>
          ) : filaQuery.isError ? (
            <Card className="border-destructive/30">
              <CardContent className="py-6 text-center text-destructive text-sm">
                Falha ao carregar a fila. Tente atualizar.
              </CardContent>
            </Card>
          ) : (filaQuery.data?.leads ?? []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Fila vazia</p>
                <p className="text-xs mt-1">Prospecte empresas para preencher a fila preditiva.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(filaQuery.data?.leads ?? []).map((lead) => {
                const score = lead.propensityScore ?? 0;
                const threshold = filaQuery.data?.autoDispatchThreshold ?? 80;
                const scoreColor = score >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : score >= 50 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-200";
                const scoreEmoji = score >= 80 ? "🟢" : score >= 50 ? "🟡" : "🔴";
                const roi = lead.roiEstimate;
                const isPending = lead.enrichmentStatus === "pending";
                const isEnriched = lead.enrichmentStatus === "enriched";
                const isScored = lead.enrichmentStatus === "scored";
                const growth = lead.enrichmentData?.growth ?? {};
                const digital = lead.enrichmentData?.digital ?? {};
                const hasBoostEvent = lead.events.length > 0;

                return (
                  <Card
                    key={lead.id}
                    className={`transition-all ${hasBoostEvent ? "border-primary/50 shadow-sm" : ""}`}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        {/* Score badge */}
                        <div className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 min-w-[64px] ${isPending ? "text-muted-foreground bg-muted border-muted-foreground/20" : scoreColor}`}>
                          {isPending ? (
                            <>
                              <Spinner className="h-4 w-4" />
                              <span className="text-xs mt-1">calc...</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xl font-bold leading-none">{score}</span>
                              <span className="text-xs">/100</span>
                              <span className="text-sm mt-1">{scoreEmoji}</span>
                            </>
                          )}
                        </div>

                        {/* Lead info */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold truncate">{lead.nome}</p>
                              {lead.mercadoSegmento && (
                                <p className="text-xs text-muted-foreground">{lead.mercadoSegmento}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 shrink-0">
                              {isPending && <Badge variant="secondary">Analisando...</Badge>}
                              {isEnriched && <Badge variant="outline">Enriquecido</Badge>}
                              {isScored && (
                                <Badge
                                  variant={score >= threshold ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {score >= threshold ? "Auto-dispatch" : "Aguardando"}
                                </Badge>
                              )}
                              {hasBoostEvent && (
                                <Badge className="bg-primary/10 text-primary border-primary/30 text-xs gap-1">
                                  <TrendingUp className="h-3 w-3" /> Boost ativo
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Priority reason */}
                          {lead.priorityReason && (
                            <p className="text-sm text-muted-foreground italic">
                              {lead.priorityReason}
                            </p>
                          )}

                          {/* Micro-events */}
                          {lead.events.map((ev) => (
                            <p key={ev.tipo} className="text-xs text-primary font-medium">
                              {ev.descricao}
                            </p>
                          ))}

                          {/* ROI */}
                          {roi?.perda_estimada_mes != null && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <BarChart3 className="h-3.5 w-3.5 text-destructive shrink-0" />
                              <span className="text-destructive font-medium">
                                Potencial recuperável: R$ {roi.perda_estimada_mes.toLocaleString("pt-BR")}/mês
                              </span>
                              {roi.ticket_estimado && (
                                <Badge variant="outline" className="text-xs ml-1">{roi.ticket_estimado}</Badge>
                              )}
                            </div>
                          )}

                          {/* Signals */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {lead.telefone && (
                              <span className="flex items-center gap-1">
                                <MessageCircle className="h-3 w-3" /> {lead.telefone}
                              </span>
                            )}
                            {lead.endereco && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {lead.endereco}
                              </span>
                            )}
                            {digital["tem_site"] === false && (
                              <span className="text-amber-600">Sem site</span>
                            )}
                            {digital["indicio_crm"] === false && (
                              <span className="text-amber-600">Sem CRM</span>
                            )}
                            {(growth as Record<string, unknown>)["multiplas_unidades"] === true && (
                              <span className="text-emerald-600">Múltiplas unidades</span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              disabled={dispatchSdrMutation.isPending || isPending}
                              onClick={() => dispatchSdrMutation.mutate(lead.id)}
                            >
                              {dispatchSdrMutation.isPending ? (
                                <><Spinner className="h-3.5 w-3.5 mr-1" /> Disparando...</>
                              ) : (
                                <><PlayCircle className="h-3.5 w-3.5 mr-1" /> Disparar SDR</>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              disabled={discardMutation.isPending}
                              onClick={() => discardMutation.mutate(lead.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Descartar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="aprovacoes" className="mt-4">
          <ProspectorAprovacoesContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
