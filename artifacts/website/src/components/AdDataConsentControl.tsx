import { useEffect, useState } from "react";
import {
  getAdDataConsentState,
  setAdDataConsent,
} from "@/lib/launchAttribution";

function shouldHideControl(pathname: string): boolean {
  return pathname === "/demo" || pathname === "/privacy" || pathname === "/terms";
}

export function AdDataConsentControl() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getAdDataConsentState() === null);
  }, []);

  if (
    typeof window === "undefined" ||
    shouldHideControl(window.location.pathname) ||
    !visible
  ) {
    return null;
  }

  const choose = (granted: boolean) => {
    setAdDataConsent(granted);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur sm:px-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-xs leading-relaxed text-slate-600 sm:text-[13px]">
          <span className="font-semibold text-slate-900">Medição de campanhas (opcional)</span>
          {" — "}Use dados de conversão para melhorar anúncios na Meta e Google.{" "}
          <a href="/privacy" className="font-medium text-slate-700 underline hover:text-slate-950">
            Privacidade
          </a>
        </p>

        <div className="flex shrink-0 gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => choose(false)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            data-testid="btn-ad-data-decline"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            data-testid="btn-ad-data-allow"
          >
            Permitir
          </button>
        </div>
      </div>
    </div>
  );
}
