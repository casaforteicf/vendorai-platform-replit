import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageCircle, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ContentAutopilotMediaPlanBanner } from "@/components/marketing/ContentAutopilotMediaPlanBanner";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

type ActiveBriefing = {
  tenantId?: string;
  campaignId?: string;
  campaignName?: string;
  marketingContext?: {
    nicheId?: string;
    nicheName?: string;
    productIds?: string[];
    productNames?: string[];
    businessVertical?: string;
    businessVerticalSlug?: string;
    audienceSegment?: string;
    audienceNiche?: string;
    campaignGoal?: string;
    locationCity?: string;
    locationState?: string;
    locationRegion?: string;
    projectName?: string;
    specificDetails?: string;
    mandatoryDifferentiators?: string;
    restrictions?: string;
    primaryKpi?: string;
    campaignId?: string;
    campaignName?: string;
  };
};

type ExecutionContext = {
  source?: string;
  tenantId?: string;
  mediaPlanId?: string;
  campaign?: {
    id?: string;
    nome?: string;
    objetivo?: string;
    produtoServico?: string;
    publico?: string;
    oferta?: string;
    mensagemCentral?: string;
    regiao?: string;
    kpiPrincipal?: string;
  };
  calendarItem?: {
    id?: string;
    temaSugerido?: string;
    tipo?: string;
    canal?: string;
    dataAgendada?: string;
  };
  marketingContext?: ActiveBriefing["marketingContext"];
};

function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function buildMessage(channel: "whatsapp" | "email", execution: ExecutionContext | null, briefing: ActiveBriefing | null) {
  const campaign = execution?.campaign;
  const context = execution?.marketingContext ?? briefing?.marketingContext;
  const theme = execution?.calendarItem?.temaSugerido;
  const offer = campaign?.oferta || context?.productNames?.join(", ") || "";
  const central = campaign?.mensagemCentral || context?.mandatoryDifferentiators || "";
  const objective = campaign?.objetivo || context?.campaignGoal || "";

  if (channel === "email") {
    return [
      theme ? `Assunto: ${theme.slice(0, 58)}` : `Assunto: ${campaign?.nome || briefing?.campaignName || "Novidades para você"}`,
      "",
      offer ? `Quero apresentar ${offer}.` : "Quero compartilhar uma oportunidade que pode fazer sentido para você.",
      central,
      objective ? `Objetivo desta comunicação: ${objective}.` : "",
      "",
      "Se fizer sentido, responda este e-mail para conversarmos.",
    ].filter(Boolean).join("\n");
  }

  return [
    theme || campaign?.nome || briefing?.campaignName || "Olá!",
    offer ? `Temos ${offer}.` : "",
    central,
    objective ? "Se fizer sentido para você, posso explicar os próximos passos por aqui." : "Posso te passar mais detalhes por aqui?",
  ].filter(Boolean).join(" ");
}

export function MessagingMediaPlanBridge({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [busy, setBusy] = useState<"whatsapp" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(pathname.includes("?") ? pathname.split("?")[1] : ""), [pathname]);
  const source = params.get("from") || params.get("source");
  const fromMediaPlan = source === "media-plan" || source === "media-calendar";
  const route = pathname.split("?")[0];

  if (route === "/content-autopilot" && fromMediaPlan) {
    return <ContentAutopilotMediaPlanBanner pathname={pathname} />;
  }

  const isMessagingView = route === "/content"
    && params.get("tab") === "campanhas"
    && params.get("view") === "organicas";
  const visible = isMessagingView && fromMediaPlan;

  if (!visible) return null;

  const briefing = readSession<ActiveBriefing>(ACTIVE_BRIEFING_KEY);
  const execution = readSession<ExecutionContext>(MEDIA_PLAN_EXECUTION_KEY);
  const context = execution?.marketingContext ?? briefing?.marketingContext;
  const campaign = execution?.campaign;
  const campaignName = campaign?.nome || briefing?.campaignName || context?.campaignName || "Campanha do Plano de Mídia";
  const audience = campaign?.publico || context?.audienceNiche || context?.audienceSegment || "Público definido no plano";
  const offer = campaign?.oferta || context?.productNames?.join(", ") || "Oferta definida no plano";
  const requestedType = execution?.calendarItem?.tipo;

  async function prepare(channel: "whatsapp" | "email") {
    if (!tenantId || !token) return;
    setBusy(channel);
    setError(null);
    try {
      const marketingContext = {
        nicheId: context?.nicheId || `media-plan:${campaign?.id || briefing?.campaignId || "campaign"}`,
        nicheName: context?.nicheName || audience,
        productIds: context?.productIds?.length ? context.productIds : [`custom:media-plan:${campaign?.id || briefing?.campaignId || "campaign"}`],
        productNames: context?.productNames?.length ? context.productNames : [offer],
        businessVertical: context?.businessVertical,
        businessVerticalSlug: context?.businessVerticalSlug,
        audienceSegment: context?.audienceSegment || audience,
        audienceNiche: context?.audienceNiche || audience,
        campaignGoal: context?.campaignGoal || campaign?.objetivo,
        locationCity: context?.locationCity,
        locationState: context?.locationState,
        locationRegion: context?.locationRegion || campaign?.regiao,
        projectName: context?.projectName || campaignName,
        specificDetails: context?.specificDetails || execution?.calendarItem?.temaSugerido,
        mandatoryDifferentiators: context?.mandatoryDifferentiators || campaign?.mensagemCentral,
        restrictions: context?.restrictions,
        primaryKpi: context?.primaryKpi || campaign?.kpiPrincipal,
        campaignId: campaign?.id || briefing?.campaignId,
        campaignName,
      };

      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          nome: `${campaignName} · ${channel === "whatsapp" ? "WhatsApp" : "E-mail"}`,
          tipo: channel,
          mensagem: buildMessage(channel, execution, briefing),
          segmentoFiltro: { marketingContext },
          status: "rascunho",
          agendadaPara: execution?.calendarItem?.dataAgendada || undefined,
        }),
      });
      const created = await response.json().catch(() => ({})) as { id?: string; error?: string };
      if (!response.ok || !created.id) throw new Error(created.error || "Não foi possível preparar a campanha.");

      const next = new URLSearchParams(params);
      next.set("campaignId", created.id);
      next.set("from", source || "media-plan");
      window.location.assign(`/content?${next.toString()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a campanha.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-4 pt-4 md:px-6">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-600">Direção do plano carregada</Badge>
                <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />WhatsApp / E-mail</Badge>
              </div>
              <p className="mt-2 font-semibold">{campaignName}</p>
              <p className="mt-1 text-sm text-muted-foreground">O rascunho usa o mesmo público, oferta, objetivo, KPI e regras do Plano de Mídia; você revisa antes de qualquer envio.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Nenhum envio é feito automaticamente</div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Público</p>
              <p className="mt-1 text-sm font-semibold">{audience}</p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Oferta / tema</p>
              <p className="mt-1 text-sm font-semibold">{execution?.calendarItem?.temaSugerido || offer}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{offer}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" onClick={() => void prepare("whatsapp")} disabled={Boolean(busy) || requestedType === "email"}>
              <MessageCircle className="mr-1.5 h-4 w-4" />{busy === "whatsapp" ? "Preparando…" : "Preparar WhatsApp"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void prepare("email")} disabled={Boolean(busy) || requestedType === "whatsapp"}>
              <Mail className="mr-1.5 h-4 w-4" />{busy === "email" ? "Preparando…" : "Preparar E-mail"}
            </Button>
            <span className="self-center text-[11px] text-muted-foreground">O rascunho é criado na Campanha existente e abre para revisão de mensagem, audiência e agendamento.</span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
