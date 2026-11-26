import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type PlanPayload = {
  conteudo?: {
    statusPlanejamento?: string;
    publicacaoOrganica?: { modo?: string } | null;
  } | null;
};

type Asset = { id: string; type: string; source?: string | null };
type Connection = { provider?: string; status?: string | null };
type Usage = { monthlyUsed?: number; monthlyLimit?: number };

type CheckItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  href: string;
  cta: string;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function MarketingReadinessChecklist({ tenantId }: { tenantId: string }) {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CheckItem[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;

    void (async () => {
      setLoading(true);
      const [planResponse, assetsResponse, connectionsResponse, usageResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders(), cache: "no-store" }).catch(() => null),
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=80`, { headers: authHeaders(), cache: "no-store" }).catch(() => null),
        fetch(`/api/tenants/${tenantId}/social-connections`, { headers: authHeaders(), cache: "no-store" }).catch(() => null),
        fetch(`/api/tenants/${tenantId}/content`, { headers: authHeaders(), cache: "no-store" }).catch(() => null),
      ]);

      const plan = planResponse?.ok ? await planResponse.json().catch(() => null) as PlanPayload | null : null;
      const assetsPayload = assetsResponse?.ok ? await assetsResponse.json().catch(() => ({})) as { assets?: Asset[] } : {};
      const connectionsPayload = connectionsResponse?.ok ? await connectionsResponse.json().catch(() => ({})) as { connections?: Connection[] } : {};
      const usage = usageResponse?.ok ? await usageResponse.json().catch(() => ({})) as Usage : {};

      if (!active) return;

      const planApproved = plan?.conteudo?.statusPlanejamento === "aprovado";
      const automatic = plan?.conteudo?.publicacaoOrganica?.modo === "automatico";
      const photos = (assetsPayload.assets ?? []).filter((asset) => asset.type === "image"
        && (asset.source === "upload" || asset.source === "imported")).length;
      const connections = (connectionsPayload.connections ?? []).filter((connection) => !connection.status || connection.status === "active").length;
      const used = Number(usage.monthlyUsed ?? 0);
      const limit = Number(usage.monthlyLimit ?? 0);
      const quotaOk = !limit || used < limit;

      setItems([
        {
          id: "plan",
          label: "Plano de Mídia aprovado",
          detail: planApproved ? "Estratégia e calendário liberados." : "Aprove o planejamento para liberar a produção.",
          ok: planApproved,
          href: "/content?tab=planejamento",
          cta: "Revisar plano",
        },
        {
          id: "publication",
          label: "Modo de publicação",
          detail: automatic ? "Publicação automática ativa após aprovação." : "Manual: as peças aprovadas aguardam publicação.",
          ok: automatic,
          href: "/content?tab=conteudos",
          cta: "Ativar automático",
        },
        {
          id: "photos",
          label: "Fotos do negócio na Biblioteca",
          detail: photos >= 2 ? `${photos} foto(s) disponíveis para montar vídeos.` : "Envie ao menos 2 fotos (upload/importação) para o fallback de vídeo.",
          ok: photos >= 2,
          href: "/midias",
          cta: "Abrir Biblioteca",
        },
        {
          id: "channels",
          label: "Canal conectado",
          detail: connections > 0 ? `${connections} conexão(ões) ativa(s).` : "Conecte Instagram/Meta para publicar.",
          ok: connections > 0,
          href: "/configuracoes",
          cta: "Conectar",
        },
        {
          id: "quota",
          label: "Cota de gerações",
          detail: quotaOk ? `${used}/${limit || "—"} usadas no período.` : "Cota do período esgotada; compre pacote ou aguarde a renovação.",
          ok: quotaOk,
          href: "/configuracoes",
          cta: "Ver plano",
        },
      ]);
      setLoading(false);
    })();

    return () => { active = false; };
  }, [tenantId]);

  if (!tenantId) return null;
  if (loading && items.length === 0) {
    return (
      <Card className="mb-3">
        <CardContent className="py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Verificando se o Marketing está pronto…
        </CardContent>
      </Card>
    );
  }

  const pending = items.filter((item) => !item.ok);
  const ready = items.length - pending.length;

  return (
    <Card className={pending.length > 0 ? "mb-3 border-amber-300 bg-amber-50/50" : "mb-3 border-emerald-300 bg-emerald-50/40"}>
      <CardContent className="py-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className={`h-4 w-4 ${pending.length ? "text-amber-700" : "text-emerald-700"}`} />
            <p className="text-sm font-semibold">Marketing pronto para rodar</p>
            <Badge variant="outline" className="text-[10px]">{ready}/{items.length} itens</Badge>
          </div>
          {pending.length > 0 && <span className="text-[11px] text-muted-foreground">Resolva os itens pendentes para evitar travar a produção</span>}
        </div>

        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border bg-background px-2.5 py-2 text-[11px]">
              <div className="flex items-start gap-1.5">
                {item.ok
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{item.label}</p>
                  <p className="mt-0.5 leading-snug text-muted-foreground">{item.detail}</p>
                  {!item.ok && (
                    <button type="button" onClick={() => navigate(item.href)} className="mt-1 inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
                      {item.cta}<ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
