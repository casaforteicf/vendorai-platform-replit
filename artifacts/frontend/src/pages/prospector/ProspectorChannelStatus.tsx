import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Instagram,
  Mail,
  MessageCircle,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type ChannelState = "active" | "limited" | "pending_setup" | "not_configured";

type ChannelStatus = {
  key: "whatsapp" | "email" | "instagram";
  label: string;
  priority: number;
  state: ChannelState;
  connected: boolean;
  autoExecutable: boolean;
  transport: string | null;
  detail: string;
  setupHref: string | null;
  readiness?: {
    sendApi: boolean;
    replyDomain: boolean;
    receivingVerified: boolean;
    signedWebhook: boolean;
  };
};

type ChannelStatusResponse = {
  priority: Array<"whatsapp" | "email" | "instagram">;
  channels: ChannelStatus[];
  summary: {
    executable: number;
    connected: number;
    coldOutreachReady: boolean;
  };
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const channelIcon = {
  whatsapp: MessageCircle,
  email: Mail,
  instagram: Instagram,
};

function stateLabel(state: ChannelState) {
  if (state === "active") return "Pronto";
  if (state === "limited") return "Limitado";
  if (state === "pending_setup") return "Aguardando configuração";
  return "Não configurado";
}

function stateClass(state: ChannelState) {
  if (state === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "limited") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "pending_setup") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function readinessLabel(label: string, ready: boolean) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {ready ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
      ) : (
        <AlertTriangle className="h-3 w-3 text-amber-600" />
      )}
      {label}
    </span>
  );
}

export default function ProspectorChannelStatus() {
  const query = useQuery({
    queryKey: ["prospector-channel-status"],
    queryFn: async () => {
      const response = await fetch("/api/prospector/channels/status", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar canais do Prospecctor");
      return response.json() as Promise<ChannelStatusResponse>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-7 text-sm text-muted-foreground">
          <Spinner className="mr-2 h-4 w-4" />
          Verificando canais de prospecção...
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Não foi possível verificar os canais agora. Nenhum canal será considerado pronto sem confirmação da API.
        </CardContent>
      </Card>
    );
  }

  const { channels, summary } = query.data;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Canais do Prospecctor
            </CardTitle>
            <CardDescription>
              Ordem automática atual: WhatsApp → E-mail → Instagram. Só entram na cadência canais realmente executáveis.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={summary.coldOutreachReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-800"}
          >
            {summary.coldOutreachReady ? "Prospecção automática disponível" : "Sem canal automático pronto"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 lg:grid-cols-3">
        {channels.map((channel) => {
          const Icon = channelIcon[channel.key];
          return (
            <div key={channel.key} className="rounded-xl border bg-background p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="rounded-lg bg-muted p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{channel.priority}. {channel.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {channel.transport ?? "Sem transporte conectado"}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={stateClass(channel.state)}>
                  {stateLabel(channel.state)}
                </Badge>
              </div>

              <p className="mt-3 min-h-10 text-xs leading-relaxed text-muted-foreground">
                {channel.detail}
              </p>

              {channel.key === "email" && channel.readiness ? (
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-muted/50 p-2.5">
                  {readinessLabel("Envio Resend", channel.readiness.sendApi)}
                  {readinessLabel("Domínio reply", channel.readiness.replyDomain)}
                  {readinessLabel("Receiving verificado", channel.readiness.receivingVerified)}
                  {readinessLabel("Webhook assinado", channel.readiness.signedWebhook)}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {channel.autoExecutable ? "Pode iniciar contato frio" : "Não inicia contato frio automaticamente"}
                </span>
                {channel.setupHref ? (
                  <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
                    <a href={channel.setupHref}>
                      <Settings2 className="mr-1 h-3.5 w-3.5" />
                      Configurar
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
