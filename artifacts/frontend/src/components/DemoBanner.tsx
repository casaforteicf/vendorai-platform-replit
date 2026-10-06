import { Clock, ArrowRight, AlertTriangle, Sparkles, CreditCard, RefreshCw, CheckCircle2 } from "lucide-react";
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
  const { user } = useAuth();
  // user.tenantId já reflete o tenantOverride quando o logado é super_admin
  // (ver AuthContext) — não ler tenantOverride de novo aqui, sem checar o
  // role, evita herdar um override antigo preso no localStorage.
  const effectiveTenantId = user?.tenantId ?? "";
  const legacyDaysLeft = useMemo(() => getLegacyDemoDaysLeft(), []);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [renewal, setRenewal] = useState<RenewalState | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
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
    setRequestError(null);
    try {
      const res = await fetch("/api/trial/request-upgrade", { method: "POST", headers: authHeaders() });
      const body = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        setRequestError(body?.error || "Não foi possível enviar agora. Tente novamente.");
        return;
      }
      setTrial((current) => current ? { ...current, upgradeRequested: true } : current);
    } catch {
      setRequestError("Falha de conexão. Tente novamente.");
    } finally {
      setRequesting(false);
    }
  }

  if (renewalRequired) {
    const due = renewal?.dueAt ? new Date(renewal.dueAt).toLocaleDateString("pt-BR") : null;
    return (
      <div
        className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
        data-testid="subscription-renewal-warning"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Renovação pendente{due ? ` desde ${due}` : ""}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                Sua operação continua disponível. Regularize a cobrança ou peça uma nova verificação do Asaas.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
            {renewal.paymentUrl ? (
              <Button size="sm" asChild>
                <a href={renewal.paymentUrl} target="_blank" rel="noreferrer">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pagar no Asaas
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => loadRenewalState(true)} disabled={checkingPayment}>
              <RefreshCw className={`mr-2 h-4 w-4 ${checkingPayment ? "animate-spin" : ""}`} />
              {checkingPayment ? "Verificando..." : "Já paguei — verificar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isTrial && daysLeft === null) return null;

  const isUrgent = daysLeft !== null && daysLeft <= 2;
  const score = trial?.score ?? 0;

  return (
    <div className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 border-b ${
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
        <span className="font-medium shrink-0">
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
            {trial.upgradeRequested
              ? "Pedido recebido. O comercial foi avisado e a conta será preservada para a continuidade."
              : `${daysLeft === 0 ? "Trial encerrando." : `${daysLeft} dia(s) restante(s).`} ${trial.nextAction || ""}`}
          </span>
        )}
        {!isTrial && (
          <span className="hidden sm:inline opacity-80">Entre em contato para continuar usando o VendorAI.</span>
        )}
      </div>

      <div className="w-full sm:w-auto shrink-0">
        {isTrial ? (
          <Button
            size="sm"
            variant={trial.upgradeRequested ? "default" : "outline"}
            className={`w-full sm:w-auto shrink-0 h-9 text-xs font-semibold ${
              trial.upgradeRequested
                ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600 disabled:opacity-100 disabled:cursor-default"
                : isUrgent
                  ? "bg-red-600 text-white border-red-600 hover:bg-red-700 dark:bg-red-600 dark:text-white dark:border-red-600"
                  : "bg-orange-600 text-white border-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:text-white dark:border-orange-600"
            }`}
            onClick={requestUpgrade}
            disabled={requesting || trial.upgradeRequested}
          >
            {trial.upgradeRequested ? (
              <><CheckCircle2 className="w-4 h-4 mr-1.5" />Solicitação enviada</>
            ) : requesting ? (
              "Enviando..."
            ) : (
              <>Quero continuar<ArrowRight className="w-3 h-3 ml-1" /></>
            )}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full sm:w-auto shrink-0 h-9 text-xs" asChild>
            <a href="/demo/contact-sales">Falar com vendas<ArrowRight className="w-3 h-3 ml-1" /></a>
          </Button>
        )}
        {requestError && (
          <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300" role="alert">
            {requestError}
          </p>
        )}
      </div>
    </div>
  );
}
