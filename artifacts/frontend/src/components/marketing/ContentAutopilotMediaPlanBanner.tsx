import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Search, ShieldCheck, Sparkles, Target } from "lucide-react";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

type MarketingContext = {
  audienceSegment?: string;
  audienceNiche?: string;
  campaignGoal?: string;
  productNames?: string[];
  mandatoryDifferentiators?: string;
  primaryKpi?: string;
  campaignName?: string;
};

type ActiveBriefing = {
  tenantId?: string;
  campaignId?: string;
  campaignName?: string;
  marketingContext?: MarketingContext;
};

type ExecutionContext = {
  source?: string;
  tenantId?: string;
  campaign?: {
    id?: string;
    nome?: string;
    objetivo?: string;
    produtoServico?: string;
    publico?: string;
    oferta?: string;
    mensagemCentral?: string;
    kpiPrincipal?: string;
  };
  calendarItem?: {
    tipo?: string;
    temaSugerido?: string;
    canal?: string;
    dataAgendada?: string;
  };
  marketingContext?: MarketingContext;
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

export function ContentAutopilotMediaPlanBanner({ pathname }: { pathname: string }) {
  const params = new URLSearchParams(pathname.includes("?") ? pathname.split("?")[1] : "");
  const source = params.get("from") || params.get("source");
  const isAutopilot = pathname.split("?")[0] === "/content-autopilot";
  if (!isAutopilot || (source !== "media-plan" && source !== "media-calendar")) return null;

  const briefing = readSession<ActiveBriefing>(ACTIVE_BRIEFING_KEY);
  const execution = readSession<ExecutionContext>(MEDIA_PLAN_EXECUTION_KEY);
  const context = execution?.marketingContext ?? briefing?.marketingContext;
  const campaign = execution?.campaign;
  const campaignName = campaign?.nome || briefing?.campaignName || context?.campaignName || "Campanha do Plano de Mídia";
  const theme = execution?.calendarItem?.temaSugerido || campaign?.mensagemCentral || context?.mandatoryDifferentiators || "Tema definido no plano";
  const audience = campaign?.publico || context?.audienceNiche || context?.audienceSegment || "Público definido no plano";
  const objective = campaign?.objetivo || context?.campaignGoal || "Objetivo definido no plano";
  const kpi = campaign?.kpiPrincipal || context?.primaryKpi || "KPI definido no plano";
  const product = campaign?.produtoServico || campaign?.oferta || context?.productNames?.join(", ") || "Produto/serviço do plano";

  return (
    <div className="px-4 pt-4 md:px-6">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-600">Direção do plano carregada</Badge>
                <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />Blog / SEO</Badge>
              </div>
              <p className="mt-2 font-semibold">{campaignName}</p>
              <p className="mt-1 text-sm text-muted-foreground">O Content Autopilot está executando o mesmo briefing do Plano de Mídia. Tema, público, objetivo e KPI permanecem vinculados à campanha.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Sem campanha paralela</div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border bg-background/80 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><FileText className="h-3 w-3" />Tema</p>
              <p className="mt-1 text-sm font-semibold">{theme}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{product}</p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Target className="h-3 w-3" />Público</p>
              <p className="mt-1 text-sm font-semibold">{audience}</p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Objetivo</p>
              <p className="mt-1 text-sm font-semibold">{objective}</p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Search className="h-3 w-3" />KPI / SEO</p>
              <p className="mt-1 text-sm font-semibold">{kpi}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Keywords, artigo e publicação seguem a direção aprovada.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
