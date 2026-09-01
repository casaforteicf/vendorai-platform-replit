import { Clock, ArrowRight, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";

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
  const legacyDaysLeft = useMemo(() => getLegacyDemoDaysLeft(), []);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

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

  const isTrial = trial?.isTrial === true;
  const daysLeft = isTrial ? (trial.daysRemaining ?? 0) : legacyDaysLeft;
  if (!isTrial && daysLeft === null) return null;

  const isUrgent = daysLeft !== null && daysLeft <= 2;
  const score = trial?.score ?? 0;

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
