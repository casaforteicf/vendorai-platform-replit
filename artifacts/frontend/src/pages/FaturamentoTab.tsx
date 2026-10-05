import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetTenantSubscription,
  getGetTenantSubscriptionQueryKey,
  useListInvoices,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import type {
  Subscription,
  Invoice,
  InvoiceStatus,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  ExternalLink,
  FileText,
  Sparkles,
  Coins,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type CommercialPlan = {
  commercialKey: string;
  name: string;
  monthlyPriceBrl: number;
  includedVendorCreditsMonthly: number;
  unlimitedUsers: boolean;
  transactionFeeApplies?: boolean;
  bundle?: boolean;
  benefits: string[];
  displayOrder: number;
};

type CommercialUsageSnapshot = {
  usageUnit?: "vendor_credits";
  vendorCreditsBalance: number;
  vendorCredits?: {
    includedMonthly: number;
    includedUsed: number;
    includedRemaining: number;
    purchasedBalance: number;
    totalAvailable: number;
  };
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return "—"; }
}

function fmtCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "R$ —";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Config maps ─────────────────────────────────────────────────────────────────
const PLANO_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  starter:    { label: "Starter",    className: "bg-zinc-100 text-zinc-600 border-zinc-300",          icon: <FileText className="h-4 w-4" /> },
  growth:     { label: "Growth",     className: "bg-blue-100 text-blue-700 border-blue-200",           icon: <Sparkles className="h-4 w-4" /> },
  pme_plus:   { label: "PME+",       className: "bg-emerald-100 text-emerald-700 border-emerald-200",  icon: <Sparkles className="h-4 w-4" /> },
  enterprise: { label: "Enterprise", className: "bg-violet-100 text-violet-700 border-violet-200",    icon: <Sparkles className="h-4 w-4" /> },
};

const SUB_STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  trial:        { label: "Trial",        className: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  ativa:        { label: "Ativa",        className: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  inadimplente: { label: "Inadimplente", className: "bg-orange-100 text-orange-700 border-orange-200",   dot: "bg-orange-500" },
  cancelada:    { label: "Cancelada",    className: "bg-zinc-100 text-zinc-500 border-zinc-200",          dot: "bg-zinc-400" },
};

const INV_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pendente:  { label: "Pendente",  className: "bg-amber-100 text-amber-700 border-amber-200",     icon: <Clock className="h-3.5 w-3.5" /> },
  paga:      { label: "Paga",      className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  atrasada:  { label: "Atrasada",  className: "bg-red-100 text-red-600 border-red-200",            icon: <AlertCircle className="h-3.5 w-3.5" /> },
  cancelada: { label: "Cancelada", className: "bg-zinc-100 text-zinc-500 border-zinc-200",          icon: <XCircle className="h-3.5 w-3.5" /> },
};

const FORMA_LABEL: Record<string, string> = {
  pix:    "PIX",
  cartao: "Cartão",
  boleto: "Boleto",
};

const FILTER_TABS: Array<{ value: InvoiceStatus | "todas"; label: string }> = [
  { value: "todas",    label: "Todas" },
  { value: "pendente", label: "Pendente" },
  { value: "paga",     label: "Paga" },
  { value: "atrasada", label: "Atrasada" },
  { value: "cancelada",label: "Cancelada" },
];

// ── Subscription Card ────────────────────────────────────────────────────────────────
function SubscriptionCard({
  sub,
  credits,
}: {
  sub: Subscription | null | undefined;
  credits: CommercialUsageSnapshot["vendorCredits"] | null;
}) {
  if (!sub) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <CreditCard className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhuma assinatura ativa encontrada</p>
        </CardContent>
      </Card>
    );
  }

  const planoCfg = PLANO_CONFIG[sub.plano] ?? PLANO_CONFIG.starter;
  const statusCfg = SUB_STATUS_CONFIG[sub.status] ?? SUB_STATUS_CONFIG.ativa;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Assinatura Atual</CardTitle>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${statusCfg.dot}`} />
            <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
              {statusCfg.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Plano</p>
            <Badge variant="outline" className={`gap-1.5 text-sm ${planoCfg.className}`}>
              {planoCfg.icon}
              {planoCfg.label}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Valor Mensal</p>
            <p className="text-xl font-bold">{fmtCurrency(sub.valorMensal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Próxima Cobrança</p>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm font-medium">{fmtDate(sub.proximaCobranca)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cliente desde</p>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm font-medium">{fmtDate(sub.dataInicio)}</p>
            </div>
          </div>
        </div>

        {credits && (
          <div className="mt-5 rounded-xl border bg-muted/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-amber-600" />
                  Vendor Credits do seu plano
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Seu plano inclui <strong>{credits.includedMonthly.toLocaleString("pt-BR")} Vendor Credits por mês</strong>.
                  A franquia mensal renova com o plano; Credits comprados ficam separados como saldo adicional.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {credits.totalAvailable.toLocaleString("pt-BR")} disponíveis agora
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Incluídos/mês</p>
                <p className="text-lg font-bold">{credits.includedMonthly.toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Usados no mês</p>
                <p className="text-lg font-bold">{credits.includedUsed.toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Restantes da franquia</p>
                <p className="text-lg font-bold">{credits.includedRemaining.toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo comprado</p>
                <p className="text-lg font-bold">{credits.purchasedBalance.toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              Operações normais do sistema não consomem Vendor Credits. Eles são usados apenas em trabalho digital de IA,
              pesquisas/enriquecimentos, agentes, mídia, renders, vídeos e outras operações com custo variável.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Invoice Table ────────────────────────────────────────────────────────────────
function InvoiceTable({ invoices, isLoading }: { invoices: Invoice[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando faturas…
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <FileText className="h-10 w-10 opacity-25" />
        <p className="text-sm">Nenhuma fatura encontrada para este filtro</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card list */}
      <div className="md:hidden divide-y">
        {invoices.map((inv) => {
          const statusCfg = INV_STATUS_CONFIG[inv.status] ?? INV_STATUS_CONFIG.pendente;
          const isPendente = inv.status === "pendente";
          const hasLink = isPendente && !!inv.linkPagamento;
          return (
            <div key={inv.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">{fmtCurrency(inv.valor)}</p>
                  <p className="text-xs text-muted-foreground">Venc. {fmtDate(inv.dataVencimento)}</p>
                </div>
                <Badge variant="outline" className={`gap-1.5 text-xs shrink-0 ${statusCfg.className}`}>
                  {statusCfg.icon}
                  {statusCfg.label}
                </Badge>
              </div>
              {inv.formaPagamento && (
                <p className="text-xs text-muted-foreground">{FORMA_LABEL[inv.formaPagamento] ?? inv.formaPagamento}</p>
              )}
              {hasLink && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-9 text-xs gap-1.5 w-full"
                  onClick={() => window.open(inv.linkPagamento!, "_blank", "noopener")}
                >
                  <ExternalLink className="h-3 w-3" />
                  Pagar agora
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Forma Pagamento</TableHead>
            <TableHead>Data Pagamento</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const statusCfg = INV_STATUS_CONFIG[inv.status] ?? INV_STATUS_CONFIG.pendente;
            const isPendente = inv.status === "pendente";
            const hasLink = isPendente && !!inv.linkPagamento;

            return (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{fmtDate(inv.dataVencimento)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">
                  {fmtCurrency(inv.valor)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`gap-1.5 text-xs ${statusCfg.className}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {inv.formaPagamento ? FORMA_LABEL[inv.formaPagamento] ?? inv.formaPagamento : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {fmtDate(inv.dataPagamento)}
                </TableCell>
                <TableCell>
                  {hasLink && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => window.open(inv.linkPagamento!, "_blank", "noopener")}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Pagar agora
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}

// ── Tab Component ─────────────────────────────────────────────────────────────────
export function FaturamentoTab() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [activeFilter, setActiveFilter] = useState<InvoiceStatus | "todas">("todas");
  const [commercialUsage, setCommercialUsage] = useState<CommercialUsageSnapshot | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlan[]>([]);

  useEffect(() => {
    if (!tenantId) {
      setCommercialUsage(null);
      return;
    }

    let cancelled = false;
    const loadCommercialUsage = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/commercial-usage`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json() as CommercialUsageSnapshot;
        if (!cancelled) setCommercialUsage(data);
      } catch {
        // Faturamento continua funcional mesmo se a telemetria comercial estiver indisponível.
      }
    };

    void loadCommercialUsage();
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    const loadCommercialPlans = async () => {
      try {
        const response = await fetch("/api/commercial-plans", {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json() as { plans?: CommercialPlan[] };
        if (!cancelled) setCommercialPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch {
        // Comparador comercial é informativo e não bloqueia o faturamento.
      }
    };

    void loadCommercialPlans();
    return () => { cancelled = true; };
  }, []);

  const { data: subscription, isLoading: subLoading } = useGetTenantSubscription(tenantId, {
    query: {
      queryKey: getGetTenantSubscriptionQueryKey(tenantId),
      enabled: !!tenantId,
      retry: false,
    },
  });

  const { data: allInvoices = [], isLoading: invLoading } = useListInvoices(
    tenantId,
    undefined,
    {
      query: {
        queryKey: getListInvoicesQueryKey(tenantId),
        enabled: !!tenantId,
      },
    }
  );

  // Client-side filter
  const invoices =
    activeFilter === "todas"
      ? allInvoices
      : allInvoices.filter((inv) => inv.status === activeFilter);

  // Summary counts
  const counts: Record<InvoiceStatus, number> = {
    pendente:  allInvoices.filter((i) => i.status === "pendente").length,
    paga:      allInvoices.filter((i) => i.status === "paga").length,
    atrasada:  allInvoices.filter((i) => i.status === "atrasada").length,
    cancelada: allInvoices.filter((i) => i.status === "cancelada").length,
  };

  const hasPendingAlert = counts.atrasada > 0;

  return (
    <div className="space-y-6">
      {/* Alert for overdue */}
      {hasPendingAlert && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            Você tem {counts.atrasada} fatura{counts.atrasada > 1 ? "s" : ""} em atraso.
            Regularize para evitar a suspensão da conta.
          </p>
        </div>
      )}

      {/* Subscription card */}
      {subLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando assinatura…
          </CardContent>
        </Card>
      ) : (
        <SubscriptionCard sub={subscription} credits={commercialUsage?.vendorCredits ?? null} />
      )}

      {commercialPlans.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Planos e Vendor Credits incluídos</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Veja claramente a franquia mensal de cada produto. Todos os planos comerciais atuais têm usuários ilimitados.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {commercialPlans.map((plan) => (
                <div key={plan.commercialKey} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{plan.name}</p>
                      <p className="mt-1 text-lg font-bold">
                        {plan.monthlyPriceBrl === 0
                          ? "R$ 0/mês"
                          : plan.monthlyPriceBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + "/mês"}
                      </p>
                    </div>
                    {plan.bundle && <Badge>Completo</Badge>}
                  </div>
                  <div className="mt-3 rounded-lg bg-muted/35 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendor Credits incluídos</p>
                    <p className="mt-0.5 text-xl font-bold">
                      {plan.includedVendorCreditsMonthly.toLocaleString("pt-BR")}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">/mês</span>
                    </p>
                  </div>
                  <p className="mt-3 text-xs font-medium text-emerald-700">
                    {plan.unlimitedUsers ? "Usuários ilimitados" : "Usuários conforme contrato"}
                  </p>
                  {plan.transactionFeeApplies && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Taxa transacional aplicável.</p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
              Vendor Credits não são tokens técnicos de provedores. São a unidade comercial do Vendor.ai para trabalho digital de IA e operações com custo variável. Credits adicionais podem ser comprados sem trocar de plano.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(counts) as [InvoiceStatus, number][]).map(([status, count]) => {
          const cfg = INV_STATUS_CONFIG[status];
          return (
            <Card
              key={status}
              className={`cursor-pointer transition-all border ${
                activeFilter === status ? "ring-2 ring-primary ring-offset-1" : "hover:border-primary/30"
              }`}
              onClick={() => setActiveFilter(activeFilter === status ? "todas" : status)}
            >
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{cfg.label}</p>
                <p className="text-2xl font-bold mt-0.5">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Invoice list */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Faturas</CardTitle>
            {/* Filter tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveFilter(tab.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    activeFilter === tab.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.value !== "todas" && counts[tab.value as InvoiceStatus] > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                      {counts[tab.value as InvoiceStatus]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-3">
          <InvoiceTable invoices={invoices} isLoading={invLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
