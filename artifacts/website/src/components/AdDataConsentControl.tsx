import { useEffect, useState } from "react";
import {
  getAdDataConsentState,
  setAdDataConsent,
  type AdDataConsentState,
} from "@/lib/launchAttribution";

function shouldHideControl(pathname: string): boolean {
  return pathname === "/demo" || pathname === "/privacy" || pathname === "/terms";
}

export function AdDataConsentControl() {
  const [consent, setConsent] = useState<AdDataConsentState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const current = getAdDataConsentState();
    setConsent(current);
    setOpen(current === null);
  }, []);

  if (typeof window === "undefined" || shouldHideControl(window.location.pathname)) {
    return null;
  }

  const choose = (granted: boolean) => {
    const next = setAdDataConsent(granted);
    setConsent(next);
    setOpen(false);
  };

  if (!open && consent) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[100] rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow-lg backdrop-blur hover:text-slate-900"
        aria-label="Gerenciar preferência de medição de anúncios"
        data-testid="btn-ad-data-preferences"
      >
        Medição de anúncios: {consent.granted ? "ativa" : "desativada"}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-slate-900">Medição e otimização de campanhas</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Opcionalmente, você pode autorizar o VendorAI a usar dados de conversão e identificadores protegidos para medir e otimizar campanhas em plataformas como Meta e Google. Sua escolha não interfere no atendimento, na demonstração ou no teste gratuito.
          </p>
          <a href="/privacy" className="mt-1 inline-block text-xs font-medium text-slate-700 underline hover:text-slate-950">
            Política de Privacidade
          </a>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            data-testid="btn-ad-data-decline"
          >
            Não autorizar
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            data-testid="btn-ad-data-allow"
          >
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );
}
