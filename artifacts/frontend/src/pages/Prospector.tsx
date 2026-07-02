import { useState } from "react";
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
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ProspectorAprovacoesContent } from "./ProspectorAprovacoes";

type ApprovalDecision = "approved" | "approved_edited" | "rejected";

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
        <TabsList>
          <TabsTrigger value="busca" className="flex items-center gap-1.5">
            <Search className="h-4 w-4" /> Busca
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

        <TabsContent value="aprovacoes" className="mt-4">
          <ProspectorAprovacoesContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
