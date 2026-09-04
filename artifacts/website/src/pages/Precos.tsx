import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2, RefreshCcw, TrendingUp } from "lucide-react";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";

const PT = {
  complete: "Vendor.ai completo",
  title: "Um plano só. Toda a tecnologia.",
  subtitle: "Sem níveis, sem funcionalidade travada por plano. Comece com 5 dias grátis e continue no ritmo que fizer sentido pra sua empresa.",
  country: "País",
  recommended: "Recomendado",
  subscription: "Assinatura",
  subscriptionTitle: "Comece grátis, siga crescendo",
  firstFiveDays: "5 primeiros dias",
  free: "Grátis",
  nextSixtyDays: "Próximos 60 dias",
  nextSixMonths: "6 meses seguintes",
  afterThat: "Depois disso",
  subscriptionBenefits: [
    "Sem contrato de fidelidade",
    "Cancele quando quiser",
    "Preço sobe só com o tempo de uso, não por decisão manual",
  ],
  startTrial: "Começar meus 5 dias grátis",
  onDemand: "Uso avulso",
  fiveDays: "/ 5 dias",
  onDemandDescription: "Sem assinatura, sem mensalidade. Ative 5 dias de acesso completo quando precisar e ative de novo depois — pague só quando usar.",
  onDemandBenefits: [
    "Mesma experiência completa",
    "Pagamento único por PIX ou cartão",
    "Compre quantas vezes quiser",
  ],
  activateFiveDays: "Ativar 5 dias por R$ 399,99",
  brlNotice: "Todos os valores desta página são cobrados em reais brasileiros (BRL).",
  optional: "Opcional",
  implementation: "Implantação e Suporte",
  implementationDescription: "Se preferir não configurar sozinho: conectamos seus canais, ajustamos os agentes de IA pro seu negócio e treinamos sua equipe. Cobrança única, quando você quiser.",
  dataTitle: "Seus dados não desaparecem quando o período termina",
  dataDescription: "Mesmo sem um período ativo, você continua consultando leads, conversas, propostas, relatórios e informações já registradas. Novas automações e envios ficam pausados até a próxima ativação.",
  startNow: "Começar agora",
  faqTitle: "Perguntas importantes",
  faq: [
    { q: "Qual a diferença entre assinatura e uso avulso?", a: "A assinatura é contínua: você entra na régua 497→990→1.490/mês e o acesso nunca para. O avulso é sob demanda: você compra blocos de 5 dias (R$ 399,99 cada) só quando for usar — sem cobrança recorrente." },
    { q: "Depois dos 5 dias grátis sou obrigado a contratar?", a: "Não. Você pode aguardar, comprar um bloco avulso de 5 dias ou seguir com a assinatura começando em R$ 497/mês." },
    { q: "Vou perder acesso aos meus dados?", a: "Não. As informações permanecem disponíveis para consulta. O sistema apenas pausa novas automações enquanto não houver um período ativo." },
    { q: "Existem versões com menos funcionalidades?", a: "Não. A experiência é completa nas duas modalidades; o que muda é só a forma de pagar pelo tempo de uso." },
    { q: "R$ 1.490/mês é o teto do preço?", a: "Sim, esse é o preço normal vigente após a régua promocional dos primeiros 8 meses — não sobe além disso por tempo de casa." },
  ],
} as const;

const ES = {
  complete: "Vendor.ai completo",
  title: "Un solo plan. Toda la tecnología.",
  subtitle: "Sin niveles ni funciones bloqueadas por plan. Empieza con 5 días gratis y continúa al ritmo que tenga sentido para tu empresa.",
  country: "País",
  recommended: "Recomendado",
  subscription: "Suscripción",
  subscriptionTitle: "Empieza gratis y sigue creciendo",
  firstFiveDays: "Primeros 5 días",
  free: "Gratis",
  nextSixtyDays: "Siguientes 60 días",
  nextSixMonths: "6 meses siguientes",
  afterThat: "Después",
  subscriptionBenefits: [
    "Sin contrato de permanencia",
    "Cancela cuando quieras",
    "El precio cambia solo según el tiempo de uso, no por una decisión manual",
  ],
  startTrial: "Empezar mis 5 días gratis",
  onDemand: "Uso por períodos",
  fiveDays: "/ 5 días",
  onDemandDescription: "Sin suscripción ni mensualidad. Activa 5 días de acceso completo cuando lo necesites y vuelve a activarlos después — paga solo cuando uses la plataforma.",
  onDemandBenefits: [
    "La misma experiencia completa",
    "Pago único con tarjeta; PIX disponible en Brasil",
    "Puedes comprarlo tantas veces como quieras",
  ],
  activateFiveDays: "Activar 5 días por R$ 399,99",
  brlNotice: "Todos los importes de esta página se cobran en reales brasileños (BRL). No se realiza conversión automática a moneda local.",
  optional: "Opcional",
  implementation: "Implementación y Soporte",
  implementationDescription: "Si prefieres no configurarlo por tu cuenta: conectamos tus canales, ajustamos los agentes de IA a tu negocio y capacitamos a tu equipo. Es un cobro único, cuando lo necesites.",
  dataTitle: "Tus datos no desaparecen cuando termina el período",
  dataDescription: "Aunque no tengas un período activo, puedes seguir consultando leads, conversaciones, propuestas, informes e información ya registrada. Las nuevas automatizaciones y envíos quedan pausados hasta la próxima activación.",
  startNow: "Empezar ahora",
  faqTitle: "Preguntas importantes",
  faq: [
    { q: "¿Cuál es la diferencia entre suscripción y uso por períodos?", a: "La suscripción es continua: sigues la escala 497→990→1.490 por mes y el acceso no se interrumpe. El uso por períodos es bajo demanda: compras bloques de 5 días (R$ 399,99 cada uno) solo cuando los necesitas, sin cobro recurrente." },
    { q: "¿Después de los 5 días gratis estoy obligado a contratar?", a: "No. Puedes esperar, comprar un bloque de 5 días o continuar con la suscripción desde R$ 497 por mes." },
    { q: "¿Voy a perder acceso a mis datos?", a: "No. La información permanece disponible para consulta. La plataforma solo pausa nuevas automatizaciones mientras no haya un período activo." },
    { q: "¿Existen versiones con menos funcionalidades?", a: "No. La experiencia es completa en las dos modalidades; lo único que cambia es la forma de pagar por el tiempo de uso." },
    { q: "¿R$ 1.490 por mes es el precio máximo?", a: "Sí. Ese es el precio normal vigente después de la escala promocional de los primeros 8 meses y no aumenta por antigüedad." },
  ],
} as const;

export default function Precos() {
  const { countryCode, setCountryCode, country, isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <div className="min-h-screen bg-slate-50 pb-24" lang={country.locale}>
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{copy.complete}</p>
        <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{copy.title}</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">{copy.subtitle}</p>

        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-3">
          <label htmlFor="pricing-country" className="text-sm font-medium text-slate-300">{copy.country}</label>
          <select
            id="pricing-country"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)}
            className="h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white"
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, option]) => (
              <option key={code} value={code}>{option.label}</option>
            ))}
          </select>
        </div>
      </section>

      <main className="container mx-auto max-w-5xl px-4 py-16">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <article className="relative rounded-[28px] border border-blue-400 bg-white p-8 shadow-sm ring-4 ring-blue-100">
            <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{copy.recommended}</span>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><TrendingUp className="h-6 w-6" /></div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.subscription}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.subscriptionTitle}</h2>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-5">
              <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">{copy.firstFiveDays}</span><span className="font-semibold text-emerald-600">{copy.free}</span></div>
              <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">{copy.nextSixtyDays}</span><span className="font-semibold text-slate-900">R$ 497/{isSpanish ? "mes" : "mês"}</span></div>
              <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">{copy.nextSixMonths}</span><span className="font-semibold text-slate-900">R$ 990/{isSpanish ? "mes" : "mês"}</span></div>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-2"><span className="text-sm text-slate-500">{copy.afterThat}</span><span className="font-semibold text-slate-900">R$ 1.490/{isSpanish ? "mes" : "mês"}</span></div>
            </div>
            <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {copy.subscriptionBenefits.map((feature) => <li key={feature} className="flex gap-3 text-sm font-medium text-slate-700"><Check className="h-5 w-5 shrink-0 text-emerald-500" /> {feature}</li>)}
            </ul>
            <Button asChild className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.startTrial} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </article>

          <article className="relative rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><RefreshCcw className="h-6 w-6" /></div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.onDemand}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">R$ 399,99 <span className="text-lg font-medium text-slate-500">{copy.fiveDays}</span></h2>
            <p className="mt-4 min-h-[72px] leading-7 text-slate-600">{copy.onDemandDescription}</p>
            <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {copy.onDemandBenefits.map((feature) => <li key={feature} className="flex gap-3 text-sm font-medium text-slate-700"><Check className="h-5 w-5 shrink-0 text-emerald-500" /> {feature}</li>)}
            </ul>
            <Button asChild variant="outline" className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.activateFiveDays}</Link></Button>
          </article>
        </div>

        <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">{copy.brlNotice}</div>

        <section className="mt-10 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.optional}</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">{copy.implementation}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{copy.implementationDescription}</p>
            </div>
            <p className="shrink-0 text-3xl font-semibold tracking-[-0.03em] text-slate-950">R$ 1.890</p>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-500" /><h2 className="text-2xl font-semibold text-slate-950">{copy.dataTitle}</h2></div>
              <p className="mt-4 leading-7 text-slate-600">{copy.dataDescription}</p>
            </div>
            <Button size="lg" className="h-14 shrink-0 rounded-xl px-8" asChild><Link href="/demo">{copy.startNow}<ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.faqTitle}</h2>
          <div className="mt-8 space-y-4">
            {copy.faq.map((faq) => <article key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-semibold text-slate-950">{faq.q}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{faq.a}</p></article>)}
          </div>
        </section>
      </main>
    </div>
  );
}
