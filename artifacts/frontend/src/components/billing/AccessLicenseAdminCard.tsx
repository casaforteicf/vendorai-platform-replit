import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Coins,
  CreditCard,
  Gauge,
  Layers3,
  Loader2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type LicenseStatus = {
  enrolled: boolean;
  mode: "legacy" | "prepaid" | "annual";
  status: "active" | "read_only" | "pending_contract";
  active: boolean;
  readOnly: boolean;
  accessEndsAt?: string | null;
  annualEndsAt?: string | null;
  freeAvailable?: boolean;
  remainingHours?: number;
  pass?: { days: number; price: number };
};

type Contract = {
  id: string;
  responsibleName: string;
  responsibleRole: string;
  responsibleEmail: string;
  status: string;
  termsVersion: string;
  acceptedAt?: string | null;
  monthlyAmount?: string | null;
};

type Purchase = {
  id: string;
  status: string;
  days: number;
  amount: string;
  paidAt?: string | null;
  createdAt?: string | null;
};

type AdminLicenseResponse = {
  license: LicenseStatus;
  purchases: Purchase[];
  contracts: Contract[];
};

type CommercialEntitlement = {
  id: string;
  commercialKey: string;
  source: "free" | "subscription" | "module" | "prepaid_pass" | "manual" | "promotion" | string;
  startsAt: string;
  endsAt?: string | null;
  active: boolean;
  metadata?: Record<string, unknown>;
};

type CommercialQuota = {
  metricKey: string;
  name: string;
  unitSingular: string;
  unitPlural: string;
  monthlyQuantity: number | null;
  usedQuantity: number;
  remainingQuantity: number | null;
  percentUsed: number | null;
  overageAllowed: boolean;
  vendorCreditsUsed: number;
};

type CommercialUsageResponse = {
  tenantId: string;
  commercialKey: string;
  entitlements: CommercialEntitlement[];
  vendorCreditsBalance: number;
  quotas: CommercialQuota[];
  enforcementMode: "measure_only" | string;
};

const COMMERCIAL_LABELS: Record<string, string> = {
  "vendor.crm.free": "Vendor CRM Free",
  "vendor.crm": "Vendor CRM",
  "vendor.growth": "VendorAI Growth",
  "vendor.growth.5d": "Growth +5 dias",
  "vendor.prospector": "Vendor Prospector",
  "vendor.omnichannel": "Vendor Omnichannel",
  "vendor.agenda": "Vendor Agenda",
  "vendor.ai_team": "Vendor AI Team",
  "vendor.revenue_scout": "Vendor Revenue Scout",
  "vendor.content_planner": "Vendor Content Planner",
  "vendor.content_studio": "Vendor Content Studio",
  "vendor.creative_studio": "Vendor Creative Studio",
  "vendor.sites_autopilot": "Vendor Sites & Autopilot",
  "vendor.ads": "Vendor Ads",
  "vendor.jarvis": "Vendor JARVIS",
  "vendor.proposals_catalog": "Vendor Propostas & Catálogo",
  "vendor.management": "Vendor Gestão",
  "vendor.praca_ai": "Praça.ai",
  "vendor.app_builder": "Vendor App Builder",
  "vendor.automations": "Vendor Automations",
  "vendor.bi_analytics": "Vendor BI & Analytics",
  "vendor.knowledge_ai": "Vendor Knowledge AI",
  "vendor.reputation": "Vendor Reputation",
  "vendor.arqdor": "arqdor.ai",
};

const SOURCE_LABELS: Record<string, string> = {
  free: "Free",
  subscription: "Assinatura",
  module: "Módulo comprado",
  prepaid_pass: "Pré-pago",
  manual: "Cortesia / override",
  promotion: "Promoção",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatMoney(value?: string | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function entitlementLabel(key: string) {
  return COMMERCIAL_LABELS[key] ?? key;
}

export function AccessLicenseAdminCard({ tenantId }: { tenantId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmEnrollment, setConfirmEnrollment] = useState(false);
  const queryKey = ["admin-access-license", tenantId];
  const commercialQueryKey = ["admin-commercial-access", tenantId];

  const licenseQuery = useQuery<AdminLicenseResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/access-license/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as AdminLicenseResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao consultar a licença");
      return result;
    },
    enabled: Boolean(tenantId && token),
  });

  const commercialQuery = useQuery<CommercialUsageResponse>({
    queryKey: commercialQueryKey,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/commercial-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as CommercialUsageResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao consultar acesso comercial");
      return result;
    },
    enabled: Boolean(tenantId && token),
    retry: false,
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/access-license/enroll", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tenantIds: [tenantId] }),
      });
      const result = await response.json() as { enrolled?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao matricular empresa");
      return result;
    },
    onSuccess: async () => {
      setConfirmEnrollment(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: commercialQueryKey }),
      ]);
      toast({ title: "Empresa matriculada no acesso pré-pago" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao matricular empresa",
      variant: "destructive",
    }),
  });

  const activateContract = useMutation({
    mutationFn: async (contractId: string) => {
      const response = await fetch(`/api/admin/access-license/contracts/${contractId}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao ativar contrato anual");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: commercialQueryKey }),
      ]);
      toast({ title: "Contrato anual ativado por 12 meses" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao ativar contrato",
      variant: "destructive",
    }),
  });

  const data = licenseQuery.data;
  const license = data?.license;
  const pendingContracts = data?.contracts.filter((contract) => contract.status === "pending_payment") ?? [];
  const paidPurchases = data?.purchases.filter((purchase) => purchase.status === "paid") ?? [];
  const commercial = commercialQuery.data;
  const entitlements = commercial?.entitlements ?? [];
  const hasGrowth = entitlements.some((item) => item.commercialKey === "vendor.growth");
  const hasFree = entitlements.some((item) => item.commercialKey === "vendor.crm.free");
  const currentAccessLabel = hasGrowth
    ? "Growth"
    : entitlements.length > 0
      ? entitlements.length === 1 && hasFree ? "CRM Free" : `${entitlements.length} produto(s)`
      : "Sem entitlement novo";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-5 w-5" /> Acesso, produtos e franquias
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Fonte comercial efetiva do tenant. Produtos e passes geram entitlements; módulos técnicos apenas refletem o acesso liberado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {commercial && (
              <Badge variant="outline" className={hasGrowth ? "border-orange-200 text-orange-700" : "border-blue-200 text-blue-700"}>
                {currentAccessLabel}
              </Badge>
            )}
            {license && (
              <Badge variant="outline" className={license.active ? "border-emerald-200 text-emerald-600" : "border-orange-200 text-orange-600"}>
                {license.mode === "legacy" ? "Legado — contínuo" : license.mode === "annual" ? "Contrato anual" : license.active ? "Pré-pago ativo" : "Somente leitura"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {licenseQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : licenseQuery.isError || !license ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <TriangleAlert className="h-4 w-4" />
            {licenseQuery.error instanceof Error ? licenseQuery.error.message : "Licença indisponível"}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Situação operacional</p>
                <p className="mt-1 text-sm font-medium">{license.active ? "Pode gerar atividades" : "Consulta somente"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Acesso até</p>
                <p className="mt-1 text-sm font-medium">{license.mode === "legacy" ? "Contínuo" : formatDate(license.accessEndsAt)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Benefício mensal</p>
                <p className="mt-1 text-sm font-medium">{license.mode !== "prepaid" ? "Não se aplica" : license.freeAvailable ? "5 dias disponíveis" : "Já utilizado"}</p>
              </div>
            </div>

            {!license.enrolled && (
              <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50/60 p-4">
                <div className="flex gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                  <p className="text-sm text-orange-900">
                    Esta empresa ainda está no acesso legado. Ao matricular no pré-pago, ficará somente leitura até ativar os 5 dias gratuitos do mês ou comprar acesso.
                  </p>
                </div>
                {!confirmEnrollment ? (
                  <Button variant="outline" size="sm" onClick={() => setConfirmEnrollment(true)}>
                    Matricular no pré-pago
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => enroll.mutate()} disabled={enroll.isPending}>
                      {enroll.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirmar mudança
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmEnrollment(false)} disabled={enroll.isPending}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-blue-600" /> Produtos com acesso efetivo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Mostra de onde cada acesso veio: Free, assinatura, módulo, passe, promoção ou cortesia.</p>
            </div>
            {commercial && (
              <Badge variant="outline" className="gap-1"><Coins className="h-3.5 w-3.5" /> {commercial.vendorCreditsBalance.toLocaleString("pt-BR")} Vendor Credits extras</Badge>
            )}
          </div>

          {commercialQuery.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : commercialQuery.isError ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              A camada comercial ainda não está disponível neste ambiente. O acesso legado continua intacto.
            </div>
          ) : entitlements.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Nenhum entitlement novo ativo. O tenant continua obedecendo às regras legadas até a migração comercial.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {entitlements.map((entitlement) => (
                <div key={entitlement.id} className="rounded-lg border bg-muted/15 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{entitlementLabel(entitlement.commercialKey)}</p>
                    <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[entitlement.source] ?? entitlement.source}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Desde {formatDate(entitlement.startsAt)} · {entitlement.endsAt ? `até ${formatDate(entitlement.endsAt)}` : "sem vencimento definido"}
                  </p>
                  {entitlement.commercialKey === "vendor.growth" && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-orange-700"><Users className="h-3.5 w-3.5" /> Usuários ilimitados</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {commercial && commercial.quotas.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-violet-600" /> Franquias do acesso atual</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Consumo em unidades que o cliente entende. Vendor Credits ficam como motor interno.</p>
                </div>
                <Badge variant="outline">{commercial.enforcementMode === "measure_only" ? "Somente medição" : commercial.enforcementMode}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {commercial.quotas.map((quota) => {
                  const limit = quota.monthlyQuantity;
                  const percent = quota.percentUsed == null ? 0 : Math.min(100, Math.max(0, quota.percentUsed));
                  return (
                    <div key={quota.metricKey} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{quota.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatQuantity(quota.usedQuantity)} {quota.usedQuantity === 1 ? quota.unitSingular : quota.unitPlural} usados
                            {limit == null ? " · sem franquia mensal" : ` de ${formatQuantity(limit)}`}
                          </p>
                        </div>
                        <span className="text-xs font-semibold">{quota.percentUsed == null ? "—" : `${quota.percentUsed.toFixed(0)}%`}</span>
                      </div>
                      {limit != null && (
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        <span>{quota.vendorCreditsUsed.toLocaleString("pt-BR")} credits medidos</span>
                        <span>{quota.overageAllowed ? "Excedente permitido" : "Sem excedente"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {pendingContracts.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium"><CalendarClock className="h-4 w-4" /> Aceites anuais aguardando efetivação</p>
              {pendingContracts.map((contract) => (
                <div key={contract.id} className="flex flex-col justify-between gap-3 rounded-lg border p-3 md:flex-row md:items-center">
                  <div className="text-sm">
                    <p className="font-medium">{contract.responsibleName} · {contract.responsibleRole}</p>
                    <p className="text-xs text-muted-foreground">{contract.responsibleEmail} · aceite em {formatDate(contract.acceptedAt)} · {formatMoney(contract.monthlyAmount)}/mês</p>
                  </div>
                  <Button size="sm" onClick={() => activateContract.mutate(contract.id)} disabled={activateContract.isPending}>
                    {activateContract.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Efetivar 12 meses
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        <Separator />
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> {paidPurchases.length} compra(s) paga(s)</span>
          <span>{data?.contracts.length ?? 0} aceite(s) anual(is)</span>
          {license?.remainingHours != null && license.mode !== "legacy" && <span>{license.remainingHours} hora(s) restantes</span>}
          {commercial && <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> {entitlements.length} entitlement(s) ativo(s)</span>}
        </div>
      </CardContent>
    </Card>
  );
}
