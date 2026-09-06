import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Target, WalletCards, CalendarDays, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

type MediaPlan = {
  id: string;
  conteudo?: {
    nomeCampanha?: string;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    periodoDias?: number;
    periodo?: {
      inicioEm?: string;
      fimEm?: string | null;
      aberto?: boolean;
      duracaoValor?: number;
      duracaoUnidade?: "horas" | "dias";
    };
    orcamento?: {
      valor: number;
      tipo: "total" | "diario" | "semanal" | "mensal";
      moeda: "BRL";
      gestao: "ia_autonoma";
      limiteRigido: true;
    };
    campanhas?: Array<{ id: string; nome: string; objetivo: string; publico: string; oferta: string }>;
  };
};

type ActiveBriefing = {
  tenantId?: string;
  campaignId?: string;
  campaignName?: string;
  marketingContext?: { campaignGoal?: string; audienceNiche?: string; audienceSegment?: string };
};

function formatPeriod(plan: MediaPlan | null) {
  const period = plan?.conteudo?.periodo;
  if (period?.inicioEm || period?.fimEm) {
    const start = period.inicioEm ? new Date(period.inicioEm).toLocaleDateString("pt-BR") : "agora";
    const end = period.aberto ? "sem data final" : period.fimEm ? new Date(period.fimEm).toLocaleDateString("pt-BR") : "a definir";
    return `${start} → ${end}`;
  }
  if (period?.duracaoValor && period.duracaoUnidade) return `${period.duracaoValor} ${period.duracaoUnidade}`;
  if (plan?.conteudo?.periodoDias) return `${plan.conteudo.periodoDias} dias`;
  return "Período definido no Plano de Mídia";
}

function budgetLabel(plan: MediaPlan | null) {
  const budget = plan?.conteudo?.orcamento;
  if (!budget) return "Teto financeiro definido no Plano de Mídia";
  const type = budget.tipo === "total" ? "total" : budget.tipo === "diario" ? "por dia" : budget.tipo === "semanal" ? "por semana" : "por mês";
  return `${budget.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ${type}`;
}

export function AdsMediaPlanContextBanner({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [briefing, setBriefing] = useState<ActiveBriefing | null>(null);

  const params = useMemo(() => new URLSearchParams(pathname.includes("?") ? pathname.split("?")[1] : ""), [pathname]);
  const source = params.get("from") || params.get("source");
  const isAds = pathname.split("?")[0] === "/ads";
  const visible = isAds && (source === "media-plan" || source === "media-calendar");

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    try {
      const raw = sessionStorage.getItem(ACTIVE_BRIEFING_KEY);
      setBriefing(raw ? JSON.parse(raw) as ActiveBriefing : null);
    } catch {
      setBriefing(null);
    }
    let cancelled = false;
    fetch(`/api/tenants/${tenantId}/media-plan`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("media-plan");
        return response.json() as Promise<MediaPlan | null>;
      })
      .then((data) => { if (!cancelled) setPlan(data); })
      .catch(() => { if (!cancelled) setPlan(null); });
    return () => { cancelled = true; };
  }, [visible, tenantId, token]);

  if (!visible) return null;

  const requestedCampaignId = params.get("campaignId") || briefing?.campaignId || "";
  const campaign = plan?.conteudo?.campanhas?.find((item) => item.id === requestedCampaignId)
    ?? plan?.conteudo?.campanhas?.[0];
  const approved = plan?.conteudo?.statusPlanejamento === "aprovado";

  return (
    <div className="px-4 pt-4 md:px-6">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={approved ? "bg-emerald-600" : ""}>{approved ? "Plano aprovado" : "Plano em revisão"}</Badge>
                <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />Origem: Plano de Mídia</Badge>
              </div>
              <p className="mt-2 font-semibold">{campaign?.nome || briefing?.campaignName || plan?.conteudo?.nomeCampanha || "Campanha de mídia paga"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{campaign?.objetivo || briefing?.marketingContext?.campaignGoal || "Direção estratégica preservada do planejamento aprovado."}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Orçamento protegido por teto rígido
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><WalletCards className="h-3 w-3" />Teto autorizado</p>
              <p className="mt-1 text-sm font-semibold">{budgetLabel(plan)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">A IA pode redistribuir dentro deste limite; não pode aumentá-lo.</p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />Período</p>
              <p className="mt-1 text-sm font-semibold">{formatPeriod(plan)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Qualquer extensão de prazo continua sujeita às regras do plano.</p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Público e oferta</p>
              <p className="mt-1 text-sm font-semibold">{campaign?.publico || briefing?.marketingContext?.audienceNiche || briefing?.marketingContext?.audienceSegment || "Público do plano"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{campaign?.oferta || "Oferta e mensagem herdadas do briefing aprovado."}</p>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">Publicar continua criando a campanha pausada quando aplicável; somente a ativação autorizada inicia gasto real. O Ads não cria um segundo orçamento paralelo: ele usa o teto oficial do Plano de Mídia.</p>
        </CardContent>
      </Card>
    </div>
  );
}
