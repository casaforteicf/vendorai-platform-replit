import { Globe2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MultilingualVoiceProfile } from "./MultilingualVoicePanel";

type Props = {
  voices: MultilingualVoiceProfile[];
};

const MARKET_LOCALES = [
  { code: "BR", label: "Brasil", locale: "pt-BR" },
  { code: "PY", label: "Paraguai", locale: "es-PY" },
  { code: "AR", label: "Argentina", locale: "es-AR" },
  { code: "UY", label: "Uruguai", locale: "es-UY" },
  { code: "BO", label: "Bolívia", locale: "es-BO" },
] as const;

function normalizeLocale(value: string): string {
  return value.trim().replace(/_/g, "-").toLowerCase();
}

function voiceLocale(voice: MultilingualVoiceProfile): string | null {
  const value = voice.metadata?.locale;
  return typeof value === "string" && value.trim() ? normalizeLocale(value) : null;
}

export default function AutomaticVoiceSelectionNotice({ voices }: Props) {
  const readyLocales = new Set(
    voices
      .filter((voice) => voice.status === "ready" && voice.reference_asset_id)
      .map(voiceLocale)
      .filter((value): value is string => Boolean(value)),
  );

  return (
    <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2 text-violet-300"><Sparkles className="h-4 w-4" /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Seleção inteligente de voz ativa</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200"><Globe2 className="h-3 w-3" /> Mercosul</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Ao gerar um vídeo, o Voice Engine prioriza automaticamente a referência do mesmo locale do mercado. Se ela não existir, usa uma voz compatível do mesmo idioma; a voz escolhida manualmente funciona como preferência/fallback.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MARKET_LOCALES.map((market) => {
          const ready = readyLocales.has(normalizeLocale(market.locale));
          return (
            <span key={market.code} className={cn("rounded-full border px-2 py-1 text-[10px]", ready ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.02] text-gray-500") }>
              {ready ? "✓" : "—"} {market.label} · {market.locale}
            </span>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-600">
        Prioridade: locale exato → variante compatível do mesmo idioma → voz preferida disponível. Isso evita usar, por exemplo, uma voz em português para uma campanha argentina quando já existe uma referência em espanhol.
      </p>
    </section>
  );
}
