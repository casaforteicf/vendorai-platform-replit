import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  getAdDataConsentState,
  setAdDataConsent,
} from "@/lib/launchAttribution";

export default function AdDataConsentBanner() {
  const [location] = useLocation();
  const [decided, setDecided] = useState(() => getAdDataConsentState() !== null);

  // /demo possui opt-in próprio no formulário. Termos/Privacidade não precisam
  // interromper leitura com uma escolha de mídia.
  if (
    decided ||
    location === "/demo" ||
    location === "/privacy" ||
    location === "/terms"
  ) {
    return null;
  }

  const choose = (granted: boolean) => {
    setAdDataConsent(granted);
    setDecided(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-slate-900">Medição de campanhas — opcional</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Podemos usar dados de conversão e identificadores protegidos para medir e melhorar campanhas em plataformas como Meta e Google. Essa autorização é opcional e não altera seu acesso ao VendorAI. Veja a{" "}
            <Link href="/privacy" className="underline hover:text-slate-900">Política de Privacidade</Link>.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Permitir medição
          </button>
        </div>
      </div>
    </div>
  );
}