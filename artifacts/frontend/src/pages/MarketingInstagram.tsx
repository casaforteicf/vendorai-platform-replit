import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
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

  const { data: library } = useQuery<{ items: ContentLibraryItem[] }>({
    queryKey: ["content-library", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content/library`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: connection, isLoading: connectionLoading } = useQuery<InstagramConnection>({
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

  const { data: websiteConnection, isLoading: websiteLoading } = useQuery<WebsiteConnectionResponse>({
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

  const { data: calendar = [] } = useQuery<CalendarItem[]>({
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
    .filter((item) => item.type === "feed")
    .map((item) => {
      const v = item.variation as FeedVariation;
      return {
        id: item.id,
        label: `Feed — ${item.theme || new Date(item.savedAt).toLocaleDateString("pt-BR")}`,
        thumbnailUrl: v.imageUrl ?? v.imageUrls?.[0],
      };
    })
    .filter((d) => d.thumbnailUrl);

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
  const connected = Boolean(connection?.connected && connection?.publishReady !== false);
  const conversionUrl = websiteConnection?.connection?.siteUrl ?? null;

  const connectionReason = connection?.reason === "token_expired"
    ? "Token expirado"
    : connection?.reason === "token_invalid"
      ? "Token inválido"
      : connection?.reason === "account_mismatch"
        ? "Conta divergente"
        : connection?.reason === "missing_publish_credentials"
          ? "Permissão de publicação incompleta"
          : "Conta não conectada";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-28 pt-4 sm:px-4 md:p-6 md:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
            <Instagram className="h-5 w-5 shrink-0 text-muted-foreground" />
            Instagram
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Central de operação do canal: acompanhe conexão, fila de publicações, grade real e recomendações da IA. A criação continua no Gerador de Conteúdo.
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

      <Card className={connected ? "border-emerald-200" : "border-amber-200"}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {connected ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Conexão do Instagram</p>
                <Badge variant={connected ? "secondary" : "outline"}>
                  {connectionLoading ? "Verificando" : connected ? "Conectado" : "Atenção"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {connectionLoading
                  ? "Validando a conexão e as permissões de publicação."
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
              Corrigir conexão
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className={conversionUrl ? "border-blue-200 bg-blue-50/40" : "border-amber-300 bg-amber-50/50"}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {conversionUrl ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Destino de conversão</p>
                <Badge variant={conversionUrl ? "secondary" : "outline"}>
                  {websiteLoading ? "Verificando" : conversionUrl ? "Configurado" : "Atenção"}
                </Badge>
              </div>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {websiteLoading
                  ? "Localizando o site oficial deste tenant."
                  : conversionUrl
                    ? `Publicações sem URL própria recebem automaticamente: ${conversionUrl}`
                    : "Nenhum site oficial foi encontrado para este tenant. Cadastre o site antes de depender do Instagram para gerar tráfego."}
              </p>
            </div>
          </div>
          {conversionUrl ? (
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
              Configurar site
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" /> Próx. 7 dias</div>
            <p className="mt-2 text-2xl font-semibold">{upcoming.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" /> Em revisão</div>
            <p className="mt-2 text-2xl font-semibold">{inReview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Aprovados</div>
            <p className="mt-2 text-2xl font-semibold">{approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Library className="h-4 w-4" /> Biblioteca Feed</div>
            <p className="mt-2 text-2xl font-semibold">{draftOptions.length}</p>
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
            Fila do Planejamento de Mídia para o Instagram. Produção e revisão continuam centralizadas no Gerador de Conteúdo.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma publicação do Instagram prevista para os próximos 7 dias.
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

      <InstagramGridPreview tenantId={tenantId} draftOptions={draftOptions} />

      <LayoutIntelligenceCard tenantId={tenantId} />

      <HighlightCoverGenerator tenantId={tenantId} />

      <Card className="bg-muted/20">
        <CardContent className="p-4 text-xs leading-relaxed text-muted-foreground">
          Métricas de alcance, impressões, seguidores e engajamento só devem aparecer aqui quando houver dados reais de Instagram Insights autorizados pela conta. Esta tela não inventa indicadores quando a API não os disponibiliza.
        </CardContent>
      </Card>
    </div>
  );
}
