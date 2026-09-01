import { ArrowRight, CheckCircle2, Layers3, Target } from "lucide-react";
import { useParams } from "wouter";
import {
  CANONICAL_LAUNCH_PACKS,
  MACRO_BLUEPRINTS,
  getLaunchPacksByMacrosegment,
  type MacrosegmentKey,
} from "./lp/launchPackData";

const MACRO_ORDER: MacrosegmentKey[] = [
  "varejo",
  "clinicas",
  "concessionarias",
  "distribuidoras",
  "servicos",
  "industrias",
];

const MACRO_EMOJI: Record<MacrosegmentKey, string> = {
  varejo: "🛍️",
  clinicas: "🩺",
  concessionarias: "🚗",
  distribuidoras: "🚚",
  servicos: "💼",
  industrias: "🏭",
};

function isMacro(value: string | undefined): value is MacrosegmentKey {
  return !!value && MACRO_ORDER.includes(value as MacrosegmentKey);
}

export default function MarketingVerticalsHub() {
  const { macro } = useParams<{ macro?: string }>();
  const selected = isMacro(macro) ? macro : undefined;

  if (selected) {
    const blueprint = MACRO_BLUEPRINTS[selected];
    const packs = getLaunchPacksByMacrosegment(selected);
    return (
      <div className="bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-gradient-to-b from-violet-950/50 to-slate-950 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <a href="/segmentos" className="text-sm text-cyan-300 hover:text-white">← Todos os mercados</a>
            <div className="mt-8 max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">{MACRO_EMOJI[selected]} {blueprint.label}</p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">VendorAI entende como esse mercado vende.</h1>
              <p className="mt-5 text-lg leading-relaxed text-slate-300">{blueprint.description}</p>
              <div className="mt-6 flex flex-wrap gap-2 text-sm text-slate-300">
                <span className="rounded-full border border-white/10 px-3 py-1.5">{packs.length} subnichos</span>
                <span className="rounded-full border border-white/10 px-3 py-1.5">LP específica por subnicho</span>
                <span className="rounded-full border border-white/10 px-3 py-1.5">Revenue Scout contextual</span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => (
              <a key={pack.slug} href={`/lp/${pack.slug}`} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-violet-400/40 hover:bg-white/[0.05]">
                <div className="text-3xl">{pack.emoji}</div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-violet-300">{pack.vertical}</p>
                <h2 className="mt-3 text-xl font-bold leading-snug">{pack.headline}</h2>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">{pack.subheadline}</p>
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-cyan-300">
                  Ver arquitetura da vertical <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 text-white">
      <section className="bg-gradient-to-b from-violet-950/60 via-slate-950 to-slate-950 px-4 py-20 text-center">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">VendorAI · Inteligência Vertical</p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">6 mercados. 50 subnichos. Uma inteligência comercial central.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">
            Não são cinquenta páginas com o nome trocado. Cada perfil possui dor, jornada, agentes, KPIs, criativos, palavras-chave e Revenue Scout próprios — todos ligados à mesma atribuição anúncio → lead → venda → receita.
          </p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><strong className="text-3xl">6</strong><p className="mt-1 text-xs text-slate-400">macrosegmentos</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><strong className="text-3xl">{CANONICAL_LAUNCH_PACKS.length}</strong><p className="mt-1 text-xs text-slate-400">subnichos oficiais</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><strong className="text-3xl">500</strong><p className="mt-1 text-xs text-slate-400">conceitos criativos potenciais</p></div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {MACRO_ORDER.map((key) => {
              const blueprint = MACRO_BLUEPRINTS[key];
              const count = getLaunchPacksByMacrosegment(key).length;
              return (
                <a key={key} href={`/segmentos/${key}`} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:-translate-y-1 hover:border-cyan-400/30">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl">{MACRO_EMOJI[key]}</span>
                    <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">{count} subnichos</span>
                  </div>
                  <h2 className="mt-5 text-2xl font-bold">{blueprint.label}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{blueprint.description}</p>
                  <div className="mt-6 space-y-2 text-sm text-slate-300">
                    <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-cyan-400" /> LPs e jornadas específicas</p>
                    <p className="flex gap-2"><Target className="mt-0.5 h-4 w-4 text-cyan-400" /> Campanhas orientadas à receita</p>
                    <p className="flex gap-2"><Layers3 className="mt-0.5 h-4 w-4 text-cyan-400" /> Memória por macro, subnicho e tenant</p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 font-semibold text-cyan-300">Explorar {blueprint.label} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
