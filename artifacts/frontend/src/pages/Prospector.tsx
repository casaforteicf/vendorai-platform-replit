import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useProspectorEnrich,
  useProspectorGenerateMessage,
  type ProspectEnrichment,
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
          {data.temContato ? (
            <Badge variant="default">Com contato</Badge>
          ) : (
            <Badge variant="secondary">Sem contato</Badge>
          )}
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

  // Enrichment form
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [endereco, setEndereco] = useState("");
  const [enrichment, setEnrichment] = useState<ProspectEnrichment | null>(null);

  // Message form
  const [messageType, setMessageType] = useState("whatsapp");
  const [msgNomeEmpresa, setMsgNomeEmpresa] = useState("");
  const [contexto, setContexto] = useState("");
  const [generatedText, setGeneratedText] = useState<string | null>(null);

  const enrich = useProspectorEnrich();
  const generate = useProspectorGenerateMessage();

  function tenantIdField() {
    return isSuperAdmin ? { tenantId: tenantId || undefined } : {};
  }

  function onEnrich() {
    if (nomeEmpresa.trim().length < 2) {
      toast({ title: "Informe o nome da empresa", variant: "destructive" });
      return;
    }
    enrich.mutate(
      {
        data: {
          nomeEmpresa: nomeEmpresa.trim(),
          endereco: endereco.trim() || undefined,
          ...tenantIdField(),
        },
      },
      {
        onSuccess: (data) => {
          setEnrichment(data);
          if (!msgNomeEmpresa) setMsgNomeEmpresa(data.nomeEmpresa ?? nomeEmpresa.trim());
          toast({ title: "Empresa enriquecida com sucesso" });
        },
        onError: (err) => {
          toast({
            title: "Falha ao enriquecer",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
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
          setGeneratedText(res.text);
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" /> Prospector
        </h1>
        <p className="text-muted-foreground mt-1">
          Busque e enriqueça empresas e gere mensagens de primeiro contato com IA.
        </p>
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
        {/* ── Busca / Enriquecimento ──────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> Busca & Enriquecimento
            </CardTitle>
            <CardDescription>
              Consulta dados públicos (Google Places) e gera insights com IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nomeEmpresa">Nome da empresa</Label>
              <Input
                id="nomeEmpresa"
                placeholder="Ex: Padaria Bella Paulista"
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endereco">Endereço / cidade (opcional)</Label>
              <Input
                id="endereco"
                placeholder="Ex: São Paulo, SP"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </div>
            <Button onClick={onEnrich} disabled={enrich.isPending} className="w-full">
              {enrich.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Enriquecendo...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" /> Buscar e Enriquecer
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

      {/* ── Resultados ──────────────────────────────────────── */}
      {enrichment && <EnrichmentResult data={enrichment} />}
      {generatedText && <MessageApproval key={generatedText} generatedText={generatedText} />}

      {!enrichment && !generatedText && (
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
