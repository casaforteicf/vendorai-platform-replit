import { ArrowRight, CheckCircle2 } from "lucide-react";
import { VENDORAI_LP_OFFER } from "@workspace/vendor-brain";

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function LpCommercialOffer() {
  const offer = VENDORAI_LP_OFFER;
  const href = `/demo?intent=trial-5-dias&offer=${encodeURIComponent(offer.campaignCode)}`;

  return (
    <section id="oferta" className="border-y border-orange-200 bg-orange-50/70 px-4 py-20 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Condição desta landing page</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Teste primeiro. Depois escolha como continuar.</h2>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">
            A oferta atual mantém o acesso simples: teste completo por 5 dias e, depois, escolha Growth mensal ou blocos adicionais de uso.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <OfferCard kicker="Experiência inicial" value={`${offer.trialDays} dias grátis`} text="Acesso completo para validar o VendorAI na sua operação." />
          <OfferCard kicker="Growth contínuo" value={`${brl(offer.subscription.monthlyPriceBrl)}/mês`} text="Acesso contínuo ao ecossistema VendorAI, conforme os módulos aplicáveis ao seu segmento e as franquias contratadas." />
          <OfferCard kicker="Uso por períodos" value={`+${offer.prepaid.blockDays} dias por ${brl(offer.prepaid.blockPriceBrl)}`} text="Compre blocos adicionais quando precisar, preservando a mesma conta e os dados." />
        </div>

        <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm leading-6 text-slate-600">
          <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" />
          Sem sequência promocional intermediária: após o teste, a assinatura Growth é <strong>{brl(offer.subscription.monthlyPriceBrl)}/mês</strong>.
        </div>

        <div className="mt-8 flex justify-center">
          <a href={href} className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-7 py-3.5 text-sm font-bold text-white shadow-[0_12px_32px_rgba(249,115,22,.22)] transition hover:bg-orange-600">
            Testar {offer.trialDays} dias grátis <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function OfferCard({ kicker, value, text }: { kicker: string; value: string; text: string }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wide text-orange-600">{kicker}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
