import { useState, useEffect, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Zap,
  RefreshCw,
  Copy,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Config maps ───────────────────────────────────────────────────────────────
const PLANO_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  starter:    { label: "Starter",    className: "bg-zinc-100 text-zinc-600 border-zinc-300",         icon: <FileText className="h-4 w-4" /> },
  growth:     { label: "Growth",     className: "bg-blue-100 text-blue-700 border-blue-200",          icon: <Sparkles className="h-4 w-4" /> },
  enterprise: { label: "Enterprise", className: "bg-violet-100 text-violet-700 border-violet-200",   icon: <Sparkles className="h-4 w-4" /> },
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

// ── Subscription Card ─────────────────────────────────────────────────────────
function SubscriptionCard({ sub }: { sub: Subscription | null | undefined }) {
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
      </CardContent>
    </Card>
  );
}

// ── Invoice Table ─────────────────────────────────────────────────────────────
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

// ── Token Credits ─────────────────────────────────────────────────────────────
const PRESETS = [50, 100, 250, 500, 1000, 3000];
const CREDITS_PER_BRL = 50;

interface TokenPurchase {
  id: string;
  valor: string;
  credits: number;
  status: string;
  invoiceUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface PixData {
  encodedImage: string | null;
  payload: string | null;
  invoiceUrl: string | null;
}

function calcCredits(valor: number) {
  return Math.floor(valor * CREDITS_PER_BRL);
}

function TokenCreditsSection({ tenantId }: { tenantId: string }) {
  const [tokenCredits, setTokenCredits] = useState<number | null>(null);
  const [purchases, setPurchases] = useState<TokenPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedValor, setSelectedValor] = useState<number | null>(100);
  const [customValor, setCustomValor] = useState("");
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const [pixModal, setPixModal] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const fetchBalance = useCallback(async () => {
    if (!tenantId) return;
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/token-purchases`);
      if (!r.ok) return;
      const data = await r.json();
      setTokenCredits(data.tokenCredits ?? 0);
      setPurchases(data.purchases ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId, base]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const efectivoValor =
    selectedValor === 0
      ? parseFloat(customValor.replace(",", ".")) || 0
      : (selectedValor ?? 0);

  async function handleBuy() {
    if (efectivoValor < 20) {
      setBuyError("Valor mínimo é R$ 20,00");
      return;
    }
    setBuying(true);
    setBuyError(null);
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/token-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: efectivoValor }),
      });
      const data = await r.json();
      if (!r.ok) {
        setBuyError(data.error ?? "Erro ao criar cobrança");
        return;
      }
      setPixLoading(true);
      setPixModal(true);
      try {
        const pixR = await fetch(`${base}/api/tenants/${tenantId}/token-purchases/${data.id}/pix`);
        const pixJson = await pixR.json();
        setPixData({ ...pixJson, invoiceUrl: pixJson.invoiceUrl ?? data.invoiceUrl });
      } finally {
        setPixLoading(false);
      }
      await fetchBalance();
    } finally {
      setBuying(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusLabel: Record<string, { label: string; cls: string }> = {
    pending: { label: "Aguardando", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    paid:    { label: "Pago",       cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    failed:  { label: "Falhou",     cls: "bg-red-100 text-red-600 border-red-200" },
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">Créditos de IA</CardTitle>
            </div>
            {tokenCredits !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Saldo disponível</span>
                <span className="text-xl font-bold text-primary">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tokenCredits.toLocaleString("pt-BR")}
                </span>
                <span className="text-xs text-muted-foreground">créditos</span>
                <button onClick={fetchBalance} className="text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Selecione o valor de recarga. Os créditos são usados automaticamente pelas IAs do sistema.
            </p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setSelectedValor(v); setCustomValor(""); }}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    selectedValor === v && selectedValor !== 0
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-white border-gray-200 text-gray-700 hover:border-primary/50"
                  }`}
                >
                  <div className="font-semibold">
                    {v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] opacity-70 font-normal mt-0.5">
                    {calcCredits(v).toLocaleString("pt-BR")} créditos
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedValor(0)}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                  selectedValor === 0
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white border-gray-200 text-gray-700 hover:border-primary/50"
                }`}
              >
                Outro valor
              </button>
            </div>

            {/* Custom amount input */}
            {selectedValor === 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="space-y-1">
                  <Label>Valor personalizado (R$)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="20"
                      placeholder="Ex: 150"
                      value={customValor}
                      onChange={(e) => setCustomValor(e.target.value)}
                      className="w-36"
                    />
                    {parseFloat(customValor.replace(",", ".")) >= 20 && (
                      <span className="text-xs text-muted-foreground">
                        = {calcCredits(parseFloat(customValor.replace(",", "."))).toLocaleString("pt-BR")} créditos
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {buyError && <p className="text-sm text-red-500 mb-3">{buyError}</p>}

            <Button onClick={handleBuy} disabled={buying || efectivoValor < 20} className="gap-2">
              {buying
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX…</>
                : <><Zap className="h-4 w-4" /> Recarregar{efectivoValor >= 20
                    ? ` — ${efectivoValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })}`
                    : ""
                  }</>
              }
            </Button>
          </div>

          {/* Purchase history */}
          {!loading && purchases.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Histórico de recargas</p>
              <div className="divide-y rounded-lg border text-sm overflow-hidden">
                {purchases.map((p) => {
                  const cfg = statusLabel[p.status] ?? statusLabel.pending;
                  return (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <div className="flex items-center gap-3">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">
                            {Number(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.credits.toLocaleString("pt-BR")} créditos •{" "}
                            {format(new Date(p.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${cfg.cls}`}>{cfg.label}</Badge>
                        {p.status === "pending" && p.invoiceUrl && (
                          <a href={p.invoiceUrl} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                              <ExternalLink className="h-3 w-3" /> Pagar
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PIX Modal */}
      <Dialog open={pixModal} onOpenChange={setPixModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Pagar com PIX
            </DialogTitle>
          </DialogHeader>

          {pixLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : pixData ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Escaneie o QR code ou copie o código PIX abaixo. Os créditos são liberados automaticamente após o pagamento.
              </p>

              {pixData.encodedImage && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${pixData.encodedImage}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-lg border p-2 bg-white"
                  />
                </div>
              )}

              {pixData.payload && (
                <div className="space-y-1.5">
                  <Label>Código PIX (copia e cola)</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={pixData.payload}
                      className="text-xs font-mono bg-muted"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-3 flex-shrink-0"
                      onClick={() => handleCopy(pixData.payload!)}
                    >
                      {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {pixData.invoiceUrl && (
                <a href={pixData.invoiceUrl} target="_blank" rel="noreferrer" className="block">
                  <Button variant="outline" className="w-full gap-2">
                    <ExternalLink className="h-4 w-4" /> Abrir fatura no Asaas
                  </Button>
                </a>
              )}

              <p className="text-xs text-center text-muted-foreground">
                Após o pagamento, atualize a página para ver o saldo atualizado.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Não foi possível gerar o QR Code. Use o link da fatura.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Faturamento() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [activeFilter, setActiveFilter] = useState<InvoiceStatus | "todas">("todas");

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Acompanhe sua assinatura e histórico de faturas
        </p>
      </div>

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
        <SubscriptionCard sub={subscription} />
      )}

      {/* AI Credits recharge */}
      {tenantId && <TokenCreditsSection tenantId={tenantId} />}

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
