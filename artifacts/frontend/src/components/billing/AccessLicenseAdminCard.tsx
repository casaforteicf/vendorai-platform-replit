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
  PlusCircle,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type CommercialProductOption = {
  commercialKey: string;
  name: string | null;
  offerKind: string;
  active: boolean;
};

type CommercialModelResponse = {
  products: CommercialProductOption[];
};

type TenantExpansionOpportunity = {
  kind: "cross_sell" | "upsell" | "full_package";
  commercialKey: string;
  name: string;
  score: number;
  reason: string;
  evidence: Record<string, unknown>;
  monthlyPrice: number | null;
};

type TenantExpansionResponse = {
  tenantId: string;
  fullPackageActive: boolean;
  currentProducts: string[];
  individualMonthlyValue?: number;
  growthPrice?: number | null;
  opportunities: TenantExpansionOpportunity[];
  recommendation?: string;
};

type ProvisioningPreview = {
  growthActive: boolean;
  effectiveProducts: Array<{
    commercialKey: string;
    includedVia: "direct_entitlement" | "growth" | string;
    segmentKeys: string[];
    moduleKeys: string[];
  }>;
  expectedNavModules: Array<{
    moduleKey: string;
    moduleName: string;
    sources: string[];
    persistedOverride: boolean | null;
    state: "expected" | "blocked_by_override" | string;
  }>;
  technicalCapabilities: Array<{ moduleKey: string; sources: string[]; note: string }>;
  conflicts: {
    blockedExpected: string[];
    enabledOutsideCommercialModel: string[];
  };
  recommendation: {
    enable: string[];
    reviewBeforeDisabling: string[];
    automaticChangesApplied: boolean;
  };
  mode: "preview_only" | string;
};

type GrantSource = "free" | "subscription" | "module" | "manual" | "promotion";

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
  "vendor.praca": "Praça.ai",
  "vendor.app_builder": "Vendor App Builder",
  "vendor.automations": "Vendor Automations",
  "vendor.bi": "Vendor BI & Analytics",
  "vendor.knowledge": "Vendor Knowledge AI",
  "vendor.reputation": "Vendor Reputation",
  "arqdor.ai": "arqdor.ai",
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
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantCommercialKey, setGrantCommercialKey] = useState("");
  const [grantSource, setGrantSource] = useState<GrantSource>("manual");
  const [grantEndsAt, setGrantEndsAt] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const queryKey = ["admin-access-license", tenantId];
  const commercialQueryKey = ["admin-commercial-access", tenantId];
  const provisioningQueryKey = ["admin-commercial-provisioning-preview", tenantId];
  const expansionQueryKey = ["admin-revenue-scout-expansion", tenantId];

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

  const commercialModelQuery = useQuery<CommercialModelResponse>({
    queryKey: ["admin-commercial-model-options"],
    queryFn: async () => {
      const response = await fetch("/api/admin/commercial-model", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as CommercialModelResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao carregar produtos comerciais");
      return result;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const provisioningQuery = useQuery<ProvisioningPreview>({
    queryKey: provisioningQueryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/tenants/${tenantId}/commercial-provisioning-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as ProvisioningPreview & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao comparar provisionamento");
      return result;
    },
    enabled: Boolean(tenantId && token),
    retry: false,
  });


  const expansionQuery = useQuery<TenantExpansionResponse>({
    queryKey: expansionQueryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/tenants/${tenantId}/scout/expansion`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as TenantExpansionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao analisar expansão do tenant");
      return result;
    },
    enabled: Boolean(tenantId && token),
    retry: false,
  });

  const updateExpansionStatus = useMutation({
    mutationFn: async ({ recommendationId, status }: { recommendationId: string; status: "presented" | "accepted" | "rejected" }) => {
      const response = await fetch(`/api/admin/tenants/${tenantId}/scout/expansion/${recommendationId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao atualizar recomendação");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: expansionQueryKey });
      toast({ title: "Status da recomendação atualizado" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao atualizar recomendação",
      variant: "destructive",
    }),
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
        queryClient.invalidateQueries({ queryKey: provisioningQueryKey }),
        queryClient.invalidateQueries({ queryKey: expansionQueryKey }),
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
        queryClient.invalidateQueries({ queryKey: provisioningQueryKey }),
      ]);
      toast({ title: "Contrato anual ativado por 12 meses" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao ativar contrato",
      variant: "destructive",
    }),
  });

  const grantEntitlement = useMutation({
    mutationFn: async () => {
      if (!grantCommercialKey) throw new Error("Selecione um produto comercial.");
      const response = await fetch(`/api/admin/access-license/tenants/${tenantId}/entitlements`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          commercialKey: grantCommercialKey,
          source: grantSource,
          endsAt: grantEndsAt ? new Date(grantEndsAt).toISOString() : null,
          note: grantNote.trim() || undefined,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao liberar produto");
      return result;
    },
    onSuccess: async () => {
      setShowGrantForm(false);
      setGrantCommercialKey("");
      setGrantSource("manual");
      setGrantEndsAt("");
      setGrantNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commercialQueryKey }),
        queryClient.invalidateQueries({ queryKey: provisioningQueryKey }),
      ]);
      toast({ title: "Acesso comercial liberado" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao liberar produto",
      variant: "destructive",
    }),
  });

  const revokeEntitlement = useMutation({
    mutationFn: async (entitlementId: string) => {
      const response = await fetch(`/api/admin/access-license/tenants/${tenantId}/entitlements/${entitlementId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao revogar acesso");
      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commercialQueryKey }),
        queryClient.invalidateQueries({ queryKey: provisioningQueryKey }),
      ]);
      toast({ title: "Acesso comercial revogado" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao revogar acesso",
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
  const grantableProducts = (commercialModelQuery.data?.products ?? [])
    .filter((product) => product.active && !["service", "consumption_pack", "prepaid_pass"].includes(product.offerKind));
  const provisioning = provisioningQuery.data;
  const expansion = expansionQuery.data;

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
            <div className="flex flex-wrap gap-2">
              {commercial && (
                <Badge variant="outline" className="gap-1"><Coins className="h-3.5 w-3.5" /> {commercial.vendorCreditsBalance.toLocaleString("pt-BR")} Vendor Credits extras</Badge>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => setShowGrantForm((value) => !value)}>
                <PlusCircle className="mr-1.5 h-4 w-4" /> Liberar produto
              </Button>
            </div>
          </div>

          {showGrantForm && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <div className="grid gap-3 lg:grid-cols-4">
                <label className="space-y-1.5 text-xs font-medium">
                  Produto / plano
                  <select
                    value={grantCommercialKey}
                    onChange={(event) => setGrantCommercialKey(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                  >
                    <option value="">Selecionar...</option>
                    {grantableProducts.map((product) => (
                      <option key={product.commercialKey} value={product.commercialKey}>
                        {product.name ?? entitlementLabel(product.commercialKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  Origem do acesso
                  <select
                    value={grantSource}
                    onChange={(event) => setGrantSource(event.target.value as GrantSource)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                  >
                    <option value="manual">Cortesia / override</option>
                    <option value="promotion">Promoção</option>
                    <option value="module">Módulo comprado</option>
                    <option value="subscription">Assinatura</option>
                    <option value="free">Free</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  Válido até (opcional)
                  <Input type="datetime-local" value={grantEndsAt} onChange={(event) => setGrantEndsAt(event.target.value)} />
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  Observação
                  <Input value={grantNote} onChange={(event) => setGrantNote(event.target.value)} placeholder="Ex: cortesia comercial" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => grantEntitlement.mutate()} disabled={!grantCommercialKey || grantEntitlement.isPending}>
                  {grantEntitlement.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Confirmar liberação
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowGrantForm(false)} disabled={grantEntitlement.isPending}>Cancelar</Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Libera produto/plano que gera acesso contínuo. Growth +5 dias e serviços são controlados pelos fluxos próprios, não por override manual.</p>
            </div>
          )}

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
              {entitlements.map((entitlement) => {
                const adminGranted = entitlement.metadata?.adminGranted === true;
                return (
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
                    {adminGranted && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => revokeEntitlement.mutate(entitlement.id)}
                        disabled={revokeEntitlement.isPending}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Revogar liberação manual
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-orange-600" /> Revenue Scout — expansão da conta</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Oportunidades calculadas por uso e composição atual. O Scout recomenda; nenhuma ferramenta é liberada automaticamente.</p>
          </div>

          {expansionQuery.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : expansionQuery.isError ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Análise de expansão indisponível neste ambiente.</div>
          ) : expansion?.fullPackageActive ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm text-emerald-800">
              Tenant já está no pacote completo. O Revenue Scout não gera upsell de módulos individuais.
            </div>
          ) : !expansion?.opportunities?.length ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Ainda não há sinal forte de expansão. O Scout continuará usando uso real e composição de produtos como evidência.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {expansion.opportunities.slice(0, 6).map((opportunity) => (
                <div key={opportunity.commercialKey} className="rounded-lg border bg-muted/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{opportunity.name}</p>
                    <Badge variant="outline" className="text-[10px]">{opportunity.score}% fit</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{opportunity.reason}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge variant="secondary">{opportunity.kind === "full_package" ? "Pacote completo" : "Cross-sell"}</Badge>
                    <Badge variant="outline">{opportunity.status === "presented" ? "Apresentada" : opportunity.status === "accepted" ? "Aceita" : "Identificada"}</Badge>
                    {opportunity.monthlyPrice != null && <span className="text-muted-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(opportunity.monthlyPrice)}/mês</span>}
                  </div>
                  {opportunity.recommendationId && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {opportunity.status === "identified" && (
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateExpansionStatus.mutate({ recommendationId: opportunity.recommendationId!, status: "presented" })}>
                          Marcar apresentada
                        </Button>
                      )}
                      {opportunity.status !== "accepted" && (
                        <Button type="button" size="sm" className="h-7 text-xs" onClick={() => updateExpansionStatus.mutate({ recommendationId: opportunity.recommendationId!, status: "accepted" })}>
                          Aceita
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => updateExpansionStatus.mutate({ recommendationId: opportunity.recommendationId!, status: "rejected" })}>
                        Recusada
                      </Button>
                    </div>
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

        <Separator />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-emerald-600" /> Preview de provisionamento técnico</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Compara Produto → Entitlement → módulos esperados com overrides técnicos atuais. Nenhuma alteração é aplicada automaticamente.</p>
            </div>
            <Badge variant="outline">Preview somente</Badge>
          </div>

          {provisioningQuery.isLoading ? (
            <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : provisioningQuery.isError || !provisioning ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Preview ainda não disponível neste ambiente.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Produtos efetivos</p><p className="mt-1 text-xl font-semibold">{provisioning.effectiveProducts.length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Módulos de navegação esperados</p><p className="mt-1 text-xl font-semibold">{provisioning.expectedNavModules.length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Conflitos a revisar</p><p className={`mt-1 text-xl font-semibold ${provisioning.conflicts.blockedExpected.length > 0 ? "text-orange-700" : "text-emerald-700"}`}>{provisioning.conflicts.blockedExpected.length + provisioning.conflicts.enabledOutsideCommercialModel.length}</p></div>
              </div>

              <div className="rounded-lg border bg-muted/10 p-3">
                <p className="text-xs font-semibold">Módulos esperados pelo acesso comercial</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {provisioning.expectedNavModules.map((module) => (
                    <Badge key={module.moduleKey} variant={module.state === "blocked_by_override" ? "destructive" : "secondary"} className="text-[10px]">
                      {module.moduleName}{module.state === "blocked_by_override" ? " · bloqueado manualmente" : ""}
                    </Badge>
                  ))}
                </div>
              </div>

              {provisioning.technicalCapabilities.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold">Capacidades técnicas sem switch próprio</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{provisioning.technicalCapabilities.map((item) => <Badge key={item.moduleKey} variant="outline" className="font-mono text-[10px]">{item.moduleKey}</Badge>)}</div>
                </div>
              )}

              {(provisioning.conflicts.blockedExpected.length > 0 || provisioning.conflicts.enabledOutsideCommercialModel.length > 0) && (
                <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 text-xs text-orange-900">
                  {provisioning.conflicts.blockedExpected.length > 0 && <p><strong>Esperados, mas bloqueados por override:</strong> {provisioning.conflicts.blockedExpected.join(", ")}.</p>}
                  {provisioning.conflicts.enabledOutsideCommercialModel.length > 0 && <p className={provisioning.conflicts.blockedExpected.length > 0 ? "mt-1" : ""}><strong>Ativos fora do modelo comercial:</strong> {provisioning.conflicts.enabledOutsideCommercialModel.join(", ")}. Revisar antes de desligar.</p>}
                </div>
              )}
            </div>
          )}
        </div>

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
