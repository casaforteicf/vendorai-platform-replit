import { Clock, ArrowRight, AlertTriangle, Sparkles, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

type TrialStatus = {
  isTrial: boolean;
  status?: "active" | "suspended" | "cancelled";
  day?: number;
  daysRemaining?: number;
  score?: number;
  tier?: string;
  nextAction?: string;
  upgradeRequested?: boolean;
};

type RenewalState = {
  hasSubscription: boolean;
  subscriptionId?: string;
  plan?: string;
  status?: string;
  billingPhase?: string;
  billingProvider?: string | null;
  nextChargeAt?: string | null;
  dueAt?: string | null;
  actionRequired: boolean;
  accessMode: "normal" | "renewal_required";
  reason: "no_subscription" | "ok" | "payment_due" | "overdue";
  paymentStatus?: string | null;
  paymentUrl?: string | null;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function getLegacyDemoDaysLeft(): number | null {
  const raw = localStorage.getItem("vendorai_demo_expires_at");
  if (!raw) return null;
  const expires = new Date(raw).getTime();
  const now = Date.now();
  if (now >= expires) return 0;
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
}

export function DemoBanner() {
  const { user, tenantOverride } = useAuth();
  const effectiveTenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const legacyDaysLeft = useMemo(() => getLegacyDemoDaysLeft(), []);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [renewal, setRenewal] = useState<RenewalState | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("vendorai_token");
    if (!token) return;
    let alive = true;
    const load = () => {
      fetch("/api/trial/status", { headers: authHeaders() })
        .then(async (res) => res.ok ? res.json() : null)
        .then((data) => { if (alive && data) setTrial(data); })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  async function loadRenewalState(showProgress = false) {
    if (!effectiveTenantId) return;
    if (showProgress) setCheckingPayment(true);
    try {
      if (showProgress) {
        await fetch(`/api/tenants/${effectiveTenantId}/subscription/verify-payment`, {
          method: "POST",
          headers: authHeaders(),
        }).catch(() => null);
      }
      const response = await fetch(`/api/tenants/${effectiveTenantId}/subscription/renewal-state`, { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json() as RenewalState;
      setRenewal(data);
      if (!data.actionRequired && showProgress) window.location.reload();
    } catch {
      // Falha de rede não deve bloquear o produto por engano.
    } finally {
      if (showProgress) setCheckingPayment(false);
    }
  }

  useEffect(() => {
    if (!effectiveTenantId) return;
    let alive = true;
    const load = async () => {
      if (!alive) return;
      await loadRenewalState();
    };
    load();
    const id = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [effectiveTenantId]);

  const isTrial = trial?.isTrial === true;
  const daysLeft = isTrial ? (trial.daysRemaining ?? 0) : legacyDaysLeft;
  const renewalRequired = renewal?.actionRequired === true;

  async function requestUpgrade() {
    if (!isTrial || trial?.upgradeRequested || requesting) return;
    setRequesting(true);
    try {
      const res = await fetch("/api/trial/request-upgrade", { method: "POST", headers: authHeaders() });
      if (res.ok) setTrial((current) => current ? { ...current, upgradeRequested: true } : current);
    } finally {
      setRequesting(false);
    }
  }

  if (renewalRequired) {
    const due = renewal?.dueAt ? new Date(renewal.dueAt).toLocaleDateString("pt-BR") : null;
    return (
      <div className="fixed inset-0 z-[10000] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4" data-testid="subscription-renewal-gate">
        <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl p-6 md:p-8">
          <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-700 grid place-items-center mb-5 dark:bg-amber-950/40 dark:text-amber-300"><CreditCard className="h-6 w-6" /></div>
          <h2 className="text-2xl font-bold">Renove para continuar</h2>
          <p className="text-muted-foreground mt-2">Sua renovação do VendorAI está {renewal.reason === "overdue" ? "vencida" : "disponível para pagamento"}{due ? ` desde ${due}` : ""}. Assim que o Asaas confirmar o pagamento, o acesso é normalizado automaticamente.</p>

          <div className="rounded-xl border bg-muted/30 p-4 mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Plano</span><strong className="uppercase">{renewal.plan || "VendorAI"}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Pagamento</span><strong>Asaas</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Status</span><strong>{renewal.reason === "overdue" ? "Vencido" : "Aguardando pagamento"}</strong></div>
          </div>

          <div className="grid gap-2 mt-5">
            {renewal.paymentUrl ? (
              <Button size="lg" asChild><a href={renewal.paymentUrl} target="_blank" rel="noreferrer"><CreditCard className="h-4 w-4 mr-2" />Pagar agora no Asaas</a></Button>
            ) : (
              <Button size="lg" disabled><CreditCard className="h-4 w-4 mr-2" />Gerando cobrança...</Button>
            )}
            <Button size="lg" variant="outline" onClick={() => loadRenewalState(true)} disabled={checkingPayment}><RefreshCw className={`h-4 w-4 mr-2 ${checkingPayment ? "animate-spin" : ""}`} />{checkingPayment ? "Consultando Asaas..." : "Já paguei — verificar agora"}</Button>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground mt-5"><ShieldCheck className="h-4 w-4 shrink-0" /><span>O VendorAI não armazena os dados do cartão nesta tela. A cobrança e a confirmação financeira ficam no Asaas.</span></div>
        </div>
      </div>
    );
  }

  if (!isTrial && daysLeft === null) return null;

  const isUrgent = daysLeft !== null && daysLeft <= 2;
  const score = trial?.score ?? 0;

  return (
    <div className={`px-4 py-2.5 flex items-center justify-between gap-4 border-b ${
      isUrgent
        ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/40"
        : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40"
    }`} data-testid="trial-banner">
      <div className={`flex items-center gap-2 text-sm min-w-0 ${isUrgent ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
        {isTrial ? (
          <Sparkles className="w-4 h-4 shrink-0" />
        ) : isUrgent ? (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        ) : (
          <Clock className="w-4 h-4 shrink-0" />
        )}
        <span className="font-medium whitespace-nowrap">
          {isTrial
            ? `Dia ${trial.day ?? 1}/5 · Activation ${score}/100`
            : daysLeft === 0
              ? "Sua demo expira hoje."
              : daysLeft === 1
                ? "Sua demo expira em 1 dia."
                : `Sua demo expira em ${daysLeft} dias.`}
        </span>
        {isTrial && (
          <span className="hidden md:inline opacity-85 truncate">
            {daysLeft === 0 ? "Trial encerrando." : `${daysLeft} dia(s) restante(s).`} {trial.nextAction}
          </span>
        )}
        {!isTrial && (
          <span className="hidden sm:inline opacity-80">Entre em contato para continuar usando o VendorAI.</span>
        )}
      </div>

      {isTrial ? (
        <Button
          size="sm"
          variant="outline"
          className={`shrink-0 h-8 text-xs ${
            isUrgent
              ? "text-red-800 border-red-300 hover:bg-red-100 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-950"
              : "text-amber-800 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950"
          }`}
          onClick={requestUpgrade}
          disabled={requesting || trial.upgradeRequested}
        >
          {trial.upgradeRequested ? "Continuidade solicitada" : requesting ? "Enviando..." : "Quero continuar"}
          {!trial.upgradeRequested && <ArrowRight className="w-3 h-3 ml-1" />}
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs" asChild>
          <a href="/demo/contact-sales">Falar com vendas<ArrowRight className="w-3 h-3 ml-1" /></a>
        </Button>
      )}
    </div>
  );
}
