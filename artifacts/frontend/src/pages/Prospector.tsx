import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useProspectorEnrich,
  useProspectorSearch,
  useProspectorGenerateMessage,
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
} from "lucide-react";

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

export default function Prospector() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.platformRole === "super_admin";

  const [tenantId, setTenantId] = useState(user?.tenantId ?? "");

  // Busca por atividade + localidade
  const [atividade, setAtividade] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [results, setResults] = useState<ProspectorSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [prospectingIndex, setProspectingIndex] = useState<number | null>(null);
  const [prospectedIndexes, setProspectedIndexes] = useState<number[]>([]);
  const [enrichment, setEnrichment] = useState<ProspectEnrichment | null>(null);
  const [exporting, setExporting] = useState(false);

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
          ...tenantIdField(),
        },
      },
      {
        onSuccess: (res) => {
          setResults(res.results);
          setSearched(true);
          setEnrichment(null);
          setProspectedIndexes([]);
          toast({
            title: res.total > 0 ? `${res.total} empresa(s) encontrada(s)` : "Nenhuma empresa encontrada",
            description: res.total === 0 ? "Tente outra atividade ou localidade." : undefined,
            variant: res.total === 0 ? "destructive" : undefined,
          });
        },
        onError: (err) => {
          toast({
            title: "Falha na busca",
            description: err instanceof Error ? err.message : undefined,
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
          if (!res.saved) {
            toast({
              title: "Não virou lead",
              description: res.reason ?? "Empresa sem canal de contato.",
              variant: "destructive",
            });
          } else {
            setProspectedIndexes((prev) => (prev.includes(index) ? prev : [...prev, index]));
            toast({
              title: res.isDuplicate
                ? "Lead já existia — vinculado na pipeline"
                : "Lead criado na pipeline",
              description: "Disponível em Leads para dar sequência no atendimento.",
            });
          }
        },
        onError: (err) => {
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
                    </li>
                  );
                })}
              </ul>
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
    </div>
  );
}
