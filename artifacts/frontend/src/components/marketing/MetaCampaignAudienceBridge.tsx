import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Megaphone, ShieldCheck, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type CustomAudience = {
  audience_key: string;
  label: string;
  external_audience_id: string | null;
  status: string;
  eligible_count: number;
  synced_count: number;
  last_synced_at: string | null;
};

type AudienceResponse = { audiences: CustomAudience[] };

type MetaCampaign = {
  id: string;
  plataforma: string;
  externalCampaignId: string | null;
  itemLabel: string | null;
  vertical: string;
  status: string;
  orcamentoDiario?: string | number;
  segmentacao?: Record<string, unknown> | null;
  latestCreative?: { status?: string } | null;
};

type MediaAction = {
  action: "manter" | "reduzir" | "pausar" | "testar_criativo" | "escalar";
  label: string;
  reason: string;
  confidence: "baixa" | "media" | "alta";
  requiresApproval: boolean;
  suggestedBudgetChangePct: number | null;
};

type PerformanceRow = {
  key: string;
  label: string;
  score: number;
  roas: number | null;
  spend: number;
  leads: number;
  sales: number;
  mediaAction: MediaAction;
};

type PerformanceResponse = { rows: PerformanceRow[] };

type ApprovalResponse = {
  error?: string;
  action?: string;
  label?: string;
  before?: { status?: string; dailyBudget?: number; totalBudget?: number };
  after?: { status?: string; dailyBudget?: number; totalBudget?: number };
  requiresCreativeGeneration?: boolean;
  creativeGenerationEndpoint?: string | null;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function campaignAudienceKey(campaign: MetaCampaign) {
  const values = campaign.segmentacao?.["metaCustomAudiences"];
  if (!Array.isArray(values) || values.length === 0) return "";
  const last = values[values.length - 1];
  return last && typeof last === "object" ? String((last as Record<string, unknown>)["key"] ?? "") : "";
}

function campaignName(campaign: MetaCampaign) {
  return campaign.itemLabel || campaign.vertical || "Campanha Meta";
}

export function MetaCampaignAudienceBridge() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [audienceKey, setAudienceKey] = useState("");
  const [campaignId, setCampaignId] = useState("");

  const { data: audienceData, isLoading: loadingAudiences } = useQuery<AudienceResponse>({
    queryKey: ["meta-custom-audiences", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/meta-growth/custom-audiences`, { headers: authHeaders(token!) });
      if (!response.ok) throw new Error("Não foi possível carregar as audiências da Meta.");
      return response.json();
    },
    enabled: Boolean(tenantId && token),
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<MetaCampaign[]>({
    queryKey: ["ad-campaigns", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/ads/campaigns`, { headers: authHeaders(token!) });
      if (!response.ok) throw new Error("Não foi possível carregar as campanhas Meta.");
      return response.json();
    },
    enabled: Boolean(tenantId && token),
  });

  const { data: performance } = useQuery<PerformanceResponse>({
    queryKey: ["meta-audience-performance", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/meta-growth/audience-performance`, { headers: authHeaders(token!) });
      if (!response.ok) throw new Error("Não foi possível carregar as recomendações por audiência.");
      return response.json();
    },
    enabled: Boolean(tenantId && token),
  });

  const syncedAudiences = useMemo(
    () => (audienceData?.audiences ?? []).filter((audience) => audience.status === "synced" && audience.external_audience_id),
    [audienceData],
  );
  const drafts = useMemo(
    () => campaigns.filter((campaign) => campaign.plataforma === "meta" && !campaign.externalCampaignId),
    [campaigns],
  );
  const publishedMeta = useMemo(
    () => campaigns.filter((campaign) => campaign.plataforma === "meta" && campaign.externalCampaignId),
    [campaigns],
  );

  useEffect(() => {
    if (!audienceKey && syncedAudiences[0]?.audience_key) setAudienceKey(syncedAudiences[0].audience_key);
  }, [audienceKey, syncedAudiences]);

  useEffect(() => {
    if (!campaignId && drafts[0]?.id) setCampaignId(drafts[0].id);
  }, [campaignId, drafts]);

  const selectedCampaign = drafts.find((campaign) => campaign.id === campaignId) ?? null;
  const selectedAudience = syncedAudiences.find((audience) => audience.audience_key === audienceKey) ?? null;
  const creativeApproved = selectedCampaign?.latestCreative?.status === "aprovado";

  const publish = useMutation({
    mutationFn: async () => {
      if (!tenantId || !token || !audienceKey || !campaignId) throw new Error("Escolha a audiência e o rascunho Meta.");
      const response = await fetch(`/api/tenants/${tenantId}/meta-growth/custom-audiences/${encodeURIComponent(audienceKey)}/publish-campaign`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ campaignId }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível publicar o remarketing.");
      return payload;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Remarketing publicado pausado", description: "A Custom Audience substituiu os interesses amplos. Nenhum gasto foi ativado; use Ativar no card da campanha quando quiser começar." });
      setCampaignId("");
    },
    onError: (error: Error) => toast({ title: "Não foi possível preparar o remarketing", description: error.message, variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: async ({ row, campaign }: { row: PerformanceRow; campaign: MetaCampaign }) => {
      if (!tenantId || !token) throw new Error("Sessão inválida.");
      const response = await fetch(`/api/tenants/${tenantId}/meta-growth/audience-performance/${encodeURIComponent(row.key)}/approve`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ campaignId: campaign.id, action: row.mediaAction.action }),
      });
      const payload = await response.json().catch(() => ({})) as ApprovalResponse;
      if (!response.ok) throw new Error(payload.error || "Não foi possível executar a recomendação.");

      if (payload.requiresCreativeGeneration && payload.creativeGenerationEndpoint) {
        const creative = await fetch(payload.creativeGenerationEndpoint, { method: "POST", headers: authHeaders(token) });
        const creativePayload = await creative.json().catch(() => ({})) as { error?: string };
        if (!creative.ok) throw new Error(`A recomendação foi aprovada, mas o novo criativo não pôde ser gerado: ${creativePayload.error || "falha na geração"}`);
      }
      return { payload, row, campaign };
    },
    onSuccess: ({ payload, row, campaign }) => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      qc.invalidateQueries({ queryKey: ["meta-audience-performance", tenantId] });
      toast({
        title: `${row.mediaAction.label} executado`,
        description: payload.requiresCreativeGeneration
          ? `Novo criativo gerado para ${campaignName(campaign)} e deixado para revisão.`
          : `A decisão foi aplicada em ${campaignName(campaign)} e registrada no histórico com antes/depois.`,
      });
    },
    onError: (error: Error) => toast({ title: "Aprovação bloqueada", description: error.message, variant: "destructive" }),
  });

  function confirmApproval(row: PerformanceRow, campaign: MetaCampaign) {
    const pct = row.mediaAction.suggestedBudgetChangePct;
    const budget = pct == null ? "" : `\nVariação sugerida: ${pct > 0 ? "+" : ""}${pct}% no teto/orçamento restante.`;
    const confirmed = window.confirm(
      `Confirmar ${row.mediaAction.label} em ${campaignName(campaign)}?\n\n${row.mediaAction.reason}${budget}\n\nA ação será registrada com seu usuário, valores antes/depois e horário.`,
    );
    if (confirmed) approve.mutate({ row, campaign });
  }

  if (!tenantId || !token) return null;

  return (
    <div className="space-y-4 px-4 pt-4 md:px-6">
      <Card className="border-primary/25 bg-primary/[0.02]">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><p className="font-semibold">Remarketing Meta</p></div>
              <p className="mt-1 text-xs text-muted-foreground">Use uma Custom Audience já sincronizada em um rascunho Meta. O VendorAI publica pausado e troca interesses amplos pela audiência escolhida.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Gasto continua desligado</div>
          </div>

          {loadingAudiences || loadingCampaigns ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando audiências e rascunhos…</div>
          ) : syncedAudiences.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="font-medium">Nenhuma Custom Audience sincronizada ainda.</p>
              <p className="mt-1 text-xs text-muted-foreground">Vá em Marketing → Resultados → Custom Audiences na Meta e sincronize uma audiência primeiro.</p>
            </div>
          ) : drafts.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="font-medium">Nenhum rascunho Meta disponível.</p>
              <p className="mt-1 text-xs text-muted-foreground">Crie uma campanha Meta abaixo, gere e aprove o criativo. O rascunho aparecerá aqui para receber a audiência.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Audiência sincronizada</p>
                  <Select value={audienceKey} onValueChange={setAudienceKey}>
                    <SelectTrigger><SelectValue placeholder="Escolha a audiência" /></SelectTrigger>
                    <SelectContent>{syncedAudiences.map((audience) => <SelectItem key={audience.audience_key} value={audience.audience_key}>{audience.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {selectedAudience ? <p className="text-[11px] text-muted-foreground">{selectedAudience.eligible_count} leads elegíveis · {selectedAudience.synced_count} identificadores enviados</p> : null}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Rascunho Meta</p>
                  <Select value={campaignId} onValueChange={setCampaignId}>
                    <SelectTrigger><SelectValue placeholder="Escolha o rascunho" /></SelectTrigger>
                    <SelectContent>{drafts.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaignName(campaign)}</SelectItem>)}</SelectContent>
                  </Select>
                  {selectedCampaign ? <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Badge variant={creativeApproved ? "default" : "outline"}>{creativeApproved ? "Criativo aprovado" : "Criativo pendente"}</Badge><span>Rascunho sem gasto</span></div> : null}
                </div>
              </div>
              {!creativeApproved && selectedCampaign ? <p className="text-xs text-amber-700">Gere e aprove o criativo no card da campanha antes de publicar este remarketing.</p> : null}
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button size="sm" disabled={!audienceKey || !campaignId || !creativeApproved || publish.isPending} onClick={() => publish.mutate()}>
                  {publish.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}Publicar pausada com esta audiência
                </Button>
                <span className="text-[11px] text-muted-foreground">Localização e regras da campanha continuam valendo. O gasto só começa no botão Ativar da campanha.</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {(performance?.rows?.length ?? 0) > 0 ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><p className="font-semibold">Aprovar ações recomendadas</p></div>
                <p className="mt-1 text-xs text-muted-foreground">A recomendação é recalculada no clique. Se os dados mudarem, a execução é bloqueada para revisão.</p>
              </div>
              <Badge variant="outline">Histórico antes/depois</Badge>
            </div>

            <div className="space-y-2">
              {(performance?.rows ?? []).map((row) => {
                const eligibleCampaigns = publishedMeta.filter((campaign) => campaignAudienceKey(campaign) === row.key);
                return (
                  <div key={row.key} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{row.label}</p>
                          <Badge variant={row.mediaAction.action === "escalar" ? "default" : "outline"}>{row.mediaAction.label}</Badge>
                          <Badge variant="outline">Confiança {row.mediaAction.confidence}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{row.mediaAction.reason}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Score {row.score}/100 · ROAS {row.roas == null ? "—" : `${row.roas.toFixed(2)}x`} · {row.leads} leads · {row.sales} vendas</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                      {eligibleCampaigns.length ? eligibleCampaigns.map((campaign) => (
                        <Button key={campaign.id} size="sm" variant={row.mediaAction.action === "escalar" ? "default" : "outline"} disabled={approve.isPending} onClick={() => confirmApproval(row, campaign)}>
                          {approve.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                          Aprovar em {campaignName(campaign)}
                        </Button>
                      )) : <span className="text-xs text-muted-foreground">Nenhuma campanha publicada usa esta audiência neste momento.</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
