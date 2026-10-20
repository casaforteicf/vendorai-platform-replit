import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Instagram,
  Library,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstagramGridPreview, type DraftOption } from "@/components/InstagramGridPreview";
import { LayoutIntelligenceCard } from "@/components/LayoutIntelligenceCard";
import { HighlightCoverGenerator } from "@/components/HighlightCoverGenerator";

type FeedVariation = { caption: string; hashtags: string[]; imageUrl?: string; imageUrls?: string[] };
type ReelVariationPreview = {
  title?: string;
  videoUrl?: string;
  coverUrl?: string;
  coverOriginalUrl?: string;
  coverSource?: "upload" | "frame" | "ai";
  coverCrop?: { zoom: number; x: number; y: number };
  thumbOffsetMs?: number;
};
type ContentLibraryItem = {
  id: string;
  type: string;
  variation: FeedVariation | Record<string, unknown>;
  theme: string | null;
  savedAt: string;
};

type InstagramConnection = {
  connected: boolean;
  publishReady?: boolean;
  needsReconnect?: boolean;
  reason?: string;
  username?: string | null;
  tokenExpiresAt?: string | null;
  connectedAt?: string | null;
};

type WebsiteConnectionResponse = {
  connection?: {
    siteUrl?: string | null;
    status?: string;
    platformLabel?: string;
    source?: string;
  } | null;
};

type CalendarItem = {
  id: string;
  dataAgendada: string;
  temaSugerido: string;
  tipo: string;
  canal: string;
  status: string;
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function isInstagramItem(item: CalendarItem) {
  return item.canal.toLowerCase().includes("instagram");
}

function statusLabel(status: string) {
  const value = status.toLowerCase();
  if (value === "publicado") return "Publicado";
  if (value === "aprovado") return "Aprovado";
  if (value === "gerado") return "Em revisão";
  if (value === "recusado") return "Reprovado";
  if (value === "pulado") return "Pulado";
  return status.replaceAll("_", " ");
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function MarketingInstagram() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const { data: library, isPending: libraryPending, isError: libraryError } = useQuery<{ items: ContentLibraryItem[] }>({
    queryKey: ["content-library", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content/library`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  const {
    data: connection,
    isLoading: connectionLoading,
    isError: connectionError,
  } = useQuery<InstagramConnection>({
    queryKey: ["instagram-connection", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/instagram-connection`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  const {
    data: websiteConnection,
    isLoading: websiteLoading,
    isError: websiteError,
  } = useQuery<WebsiteConnectionResponse>({
    queryKey: ["instagram-conversion-destination", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content-autopilot/website-connection`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  const {
    data: calendar = [],
    isPending: calendarLoading,
    isError: calendarError,
  } = useQuery<CalendarItem[]>({
    queryKey: ["instagram-content-calendar", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content-calendar`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenantId,
  });

  const draftOptions: DraftOption[] = (library?.items ?? [])
    .filter((item) => item.type === "feed" || item.type === "reels")
    .map((item) => {
      const fallbackLabel = item.theme || new Date(item.savedAt).toLocaleDateString("pt-BR");
      if (item.type === "reels") {
        const v = item.variation as ReelVariationPreview;
        return {
          id: item.id,
          label: `Reel — ${fallbackLabel}`,
          thumbnailUrl: v.coverUrl,
          mediaType: "VIDEO" as const,
        };
      }

      const v = item.variation as FeedVariation;
      const imageUrls = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
      return {
        id: item.id,
        label: `${imageUrls.length > 1 ? "Carrossel" : "Feed"} — ${fallbackLabel}`,
        thumbnailUrl: imageUrls[0],
        mediaType: imageUrls.length > 1 ? "CAROUSEL_ALBUM" as const : "IMAGE" as const,
      };
    })
    .filter((d): d is DraftOption => Boolean(d.thumbnailUrl));

  const instagramCalendar = calendar.filter(isInstagramItem);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcoming = instagramCalendar
    .filter((item) => {
      if (item.status === "publicado" || item.status === "recusado" || item.status === "pulado") return false;
      const date = new Date(`${item.dataAgendada}T12:00:00`);
      return !Number.isNaN(date.getTime()) && date >= today && date <= nextWeek;
    })
    .sort((a, b) => a.dataAgendada.localeCompare(b.dataAgendada));

  const inReview = instagramCalendar.filter((item) => item.status === "gerado").length;
  const approved = instagramCalendar.filter((item) => item.status === "aprovado").length;
  const connected = !connectionError && Boolean(connection?.connected && connection?.publishReady !== false);
  const conversionUrl = websiteError ? null : websiteConnection?.connection?.siteUrl ?? null;

  const connectionReason = connection?.reason === "token_expired"
    ? "Token expirado"
    : connection?.reason === "token_invalid"
      ? "Token inválido"
      : connection?.reason === "account_mismatch"
        ? "Conta divergente"
        : connection?.reason === "missing_publish_credentials"
          ? "Permissão de publicação incompleta"
          : "Conta não conectada";

  const nextAction = connectionLoading
    ? {
        title: "Verificando conexão do Instagram",
        description: "Consultando as permissões de publicação. Aguarde a verificação antes de conectar outra conta.",
        button: "Abrir integrações",
        href: "/configuracoes?tab=integracoes",
        tone: "warning" as const,
      }
    : connectionError
    ? {
        title: "Verificar serviço do Instagram",
        description: "O VendorAI não conseguiu consultar a integração agora. Não trate isso como conta desconectada até a API responder novamente.",
        button: "Abrir integrações",
        href: "/configuracoes?tab=integracoes",
        tone: "warning" as const,
      }
    : !connected
      ? {
          title: "Conectar o Instagram",
          description: "Conecte a conta profissional para liberar publicação, fila e acompanhamento automático.",
          button: "Conectar Instagram",
          href: "/configuracoes?tab=integracoes",
          tone: "warning" as const,
        }
      : websiteLoading
        ? {
            title: "Verificando destino de conversão",
            description: "Consultando o site configurado para a empresa.",
            button: "Abrir configurações",
            href: "/configuracoes",
            tone: "warning" as const,
          }
        : websiteError
        ? {
            title: "Verificar destino de conversão",
            description: "A conexão do Instagram está pronta, mas o site oficial não pôde ser consultado agora.",
            button: "Abrir configurações",
            href: "/configuracoes",
            tone: "warning" as const,
          }
        : !conversionUrl
          ? {
              title: "Configurar destino de conversão",
              description: "Defina o site oficial do tenant para que o conteúdo gere tráfego para um destino real.",
              button: "Configurar destino",
              href: "/configuracoes",
              tone: "warning" as const,
            }
          : calendarLoading
            ? {
                title: "Carregando calendário",
                description: "Consultando a fila antes de sugerir uma nova publicação.",
                button: "Abrir Gerador",
                href: "/content",
                tone: "warning" as const,
              }
            : calendarError
            ? {
                title: "Verificar calendário",
                description: "Instagram e destino estão prontos, mas a fila de publicações não pôde ser carregada agora.",
                button: "Abrir Gerador",
                href: "/content",
                tone: "warning" as const,
              }
            : inReview > 0
              ? {
                  title: `Revisar ${inReview} conteúdo${inReview === 1 ? "" : "s"}`,
                  description: "Há conteúdo gerado aguardando sua revisão antes de seguir para publicação.",
                  button: "Revisar agora",
                  href: "/content",
                  tone: "attention" as const,
                }
              : upcoming.length === 0
                ? {
                    title: "Criar a próxima publicação",
                    description: "A operação está conectada, mas não há publicação prevista para os próximos 7 dias.",
                    button: "Gerar conteúdo",
                    href: "/content",
                    tone: "attention" as const,
                  }
                : {
                    title: "Operação pronta",
                    description: `${upcoming.length} publicaç${upcoming.length === 1 ? "ão" : "ões"} prevista${upcoming.length === 1 ? "" : "s"} para os próximos 7 dias.`,
                    button: "Ver fila",
                    href: "/content",
                    tone: "ready" as const,
                  };

  const nextActionClass = nextAction.tone === "ready"
    ? "border-emerald-200 bg-emerald-50/40"
    : nextAction.tone === "attention"
      ? "border-blue-200 bg-blue-50/40"
      : "border-amber-300 bg-amber-50/50";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-28 pt-4 sm:px-4 md:p-6 md:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
            <Instagram className="h-5 w-5 shrink-0 text-muted-foreground" />
            Instagram
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Conecte o canal, defina o destino, gere o conteúdo, revise e acompanhe a fila. Esta tela mostra o que está pronto e qual é o próximo passo.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/content")}
          className="w-full justify-center gap-1.5 sm:w-auto sm:shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Gerar conteúdo
        </Button>
      </div>

      <Card className={nextActionClass}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {nextAction.tone === "ready" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : nextAction.tone === "attention" ? (
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximo passo</p>
              <p className="mt-0.5 font-semibold">{nextAction.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{nextAction.description}</p>
            </div>
          </div>
          <Button size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto" onClick={() => setLocation(nextAction.href)}>
            {nextAction.button}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className={`rounded-lg border p-3 ${connectionError ? "border-amber-200" : connected ? "border-emerald-200" : ""}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {connected && !connectionError ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            1. Canal
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{connectionError ? "Não foi possível verificar" : connected ? "Instagram conectado" : "Conexão pendente"}</p>
        </div>
        <div className={`rounded-lg border p-3 ${websiteError ? "border-amber-200" : conversionUrl ? "border-emerald-200" : ""}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {conversionUrl && !websiteError ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            2. Conversão
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{websiteError ? "Não foi possível verificar" : conversionUrl ? "Destino configurado" : "Destino pendente"}</p>
        </div>
        <div className={`rounded-lg border p-3 ${calendarError ? "border-amber-200" : upcoming.length > 0 ? "border-emerald-200" : ""}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {!calendarError && upcoming.length > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
            3. Conteúdo
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{calendarError ? "Fila indisponível" : upcoming.length > 0 ? "Fila programada" : "Sem publicação próxima"}</p>
        </div>
      </div>

      <Card className={connectionError ? "border-amber-300" : connected ? "border-emerald-200" : "border-amber-200"}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {connected && !connectionError ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Conexão do Instagram</p>
                <Badge variant={connected && !connectionError ? "secondary" : "outline"}>
                  {connectionLoading ? "Verificando" : connectionError ? "Indisponível" : connected ? "Conectado" : "Atenção"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {connectionLoading
                  ? "Validando a conexão e as permissões de publicação."
                  : connectionError
                    ? "Não foi possível consultar a integração agora. Tente novamente quando o serviço estiver disponível."
                    : connected
                      ? `${connection?.username ? `@${connection.username} · ` : ""}publicação disponível${connection?.tokenExpiresAt ? ` · token válido até ${new Date(connection.tokenExpiresAt).toLocaleDateString("pt-BR")}` : ""}.`
                      : `${connectionReason}. Corrija a integração antes de depender de publicação automática.`}
              </p>
            </div>
          </div>
          {!connected && !connectionLoading && (
            <Button
              variant="outline"
              size="sm"
              className="w-full shrink-0 gap-1.5 sm:w-auto"
              onClick={() => setLocation("/configuracoes?tab=integracoes")}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {connectionError ? "Abrir integrações" : "Corrigir conexão"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className={websiteError ? "border-amber-300 bg-amber-50/50" : conversionUrl ? "border-blue-200 bg-blue-50/40" : "border-amber-300 bg-amber-50/50"}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {conversionUrl && !websiteError ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Destino de conversão</p>
                <Badge variant={conversionUrl && !websiteError ? "secondary" : "outline"}>
                  {websiteLoading ? "Verificando" : websiteError ? "Indisponível" : conversionUrl ? "Configurado" : "Atenção"}
                </Badge>
              </div>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {websiteLoading
                  ? "Localizando o site oficial deste tenant."
                  : websiteError
                    ? "Não foi possível consultar o site oficial agora. Isso não significa que o tenant esteja sem site configurado."
                    : conversionUrl
                      ? `Publicações sem URL própria recebem automaticamente: ${conversionUrl}`
                      : "Nenhum site oficial foi encontrado para este tenant. Cadastre o site antes de depender do Instagram para gerar tráfego."}
              </p>
            </div>
          </div>
          {conversionUrl && !websiteError ? (
            <a href={conversionUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir destino
              </Button>
            </a>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full shrink-0 gap-1.5 sm:w-auto"
              onClick={() => setLocation("/configuracoes")}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {websiteError ? "Abrir configurações" : "Configurar site"}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" /> Próx. 7 dias</div>
            <p className="mt-2 text-2xl font-semibold">{calendarError || calendarLoading ? "—" : upcoming.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" /> Em revisão</div>
            <p className="mt-2 text-2xl font-semibold">{calendarError || calendarLoading ? "—" : inReview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Aprovados</div>
            <p className="mt-2 text-2xl font-semibold">{calendarError || calendarLoading ? "—" : approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Library className="h-4 w-4" /> Biblioteca Feed</div>
            <p className="mt-2 text-2xl font-semibold">{libraryError || libraryPending ? "—" : draftOptions.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Próximas publicações
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Fila do Planejamento de Mídia para o Instagram. Abra qualquer item para revisar ou produzir no Gerador de Conteúdo.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {calendarLoading ? (
            <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Carregando publicações agendadas...</p>
          ) : calendarError ? (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Não foi possível carregar a fila agora.</p>
                <p className="mt-1 text-xs text-muted-foreground">O sistema não vai mostrar zero publicações quando a API estiver indisponível.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation("/content")}>Abrir Gerador</Button>
            </div>
          ) : upcoming.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Nenhuma publicação prevista para os próximos 7 dias.</p>
                <p className="mt-1 text-xs text-muted-foreground">Crie o próximo conteúdo e mantenha a operação ativa.</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setLocation("/content")}>
                <Sparkles className="h-3.5 w-3.5" />
                Criar publicação
              </Button>
            </div>
          ) : (
            upcoming.slice(0, 6).map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(item.dataAgendada)}</span>
                    <span>•</span>
                    <span>{item.tipo.replaceAll("_", " ")}</span>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{statusLabel(item.status)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium">{item.temaSugerido}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full shrink-0 justify-center sm:w-auto"
                  onClick={() => setLocation(`/content?calendarItemId=${encodeURIComponent(item.id)}`)}
                >
                  Abrir no Gerador
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {libraryPending ? (
        <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Carregando rascunhos da biblioteca...</p>
      ) : libraryError ? (
        <p role="alert" className="rounded-lg border border-amber-200 p-4 text-sm text-muted-foreground">Não foi possível consultar os rascunhos da biblioteca. Tente novamente após restabelecer a conexão.</p>
      ) : (
        <InstagramGridPreview tenantId={tenantId} draftOptions={draftOptions} />
      )}

      <LayoutIntelligenceCard tenantId={tenantId} />

      <HighlightCoverGenerator tenantId={tenantId} />

      <Card className="bg-muted/20">
        <CardContent className="p-4 text-xs leading-relaxed text-muted-foreground">
          Métricas de alcance, impressões, seguidores e engajamento só aparecem quando houver dados reais de Instagram Insights autorizados pela conta. O VendorAI não preenche indicadores com valores estimados.
        </CardContent>
      </Card>
    </div>
  );
}
