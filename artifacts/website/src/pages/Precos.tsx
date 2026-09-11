import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2, RefreshCcw, TrendingUp } from "lucide-react";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";

const PT = {
  complete: "VendorAI Growth",
  title: "Um plano só. Toda a tecnologia.",
  subtitle: "Growth é o único plano VendorAI: acesso completo, sem limite de usuários e sem níveis escondendo funcionalidades.",
  country: "País",
  recommended: "Recomendado",
  subscription: "Assinatura contínua",
  subscriptionTitle: "Growth mensal",
  firstFiveDays: "5 dias iniciais",
  free: "Grátis",
  firstPaid30Days: "Primeiros 30 dias pagos",
  nextFiveMonths: "5 meses seguintes",
  afterThat: "Depois disso",
  subscriptionBenefits: [
    "Sem limite de usuários",
    "Todos os módulos Growth disponíveis",
    "Sem contrato de fidelidade",
    "Cancele quando quiser",
  ],
  startTrial: "Começar meus 5 dias grátis",
  onDemand: "Growth por períodos",
  fiveDays: "/ 5 dias",
  onDemandDescription: "Todo mês você pode ativar 5 dias grátis de acesso completo. Quando precisar de mais tempo, compre blocos adicionais de 5 dias por R$ 399,00.",
  onDemandBenefits: [
    "5 dias gratuitos por mês",
    "Mesma experiência completa do Growth",
    "Pagamento único por PIX ou cartão",
    "Compre novos blocos de 5 dias quando quiser",
  ],
  activateFiveDays: "Ativar Growth por 5 dias",
  brlNotice: "Todos os valores desta página são cobrados em reais brasileiros (BRL).",
  optional: "Opcional",
  implementation: "Implantação assistida",
  implementationDescription: "A implantação padrão é autoguiada pelo agente do VendorAI, sem custo adicional. Se sua empresa preferir apoio humano, fazemos configuração, integrações, parametrização e treinamento por uma cobrança única.",
  dataTitle: "Seus dados não desaparecem quando o período termina",
  dataDescription: "Mesmo sem um período ativo, você continua consultando leads, conversas, propostas, relatórios e informações já registradas. Novas automações e envios ficam pausados até a próxima ativação ou assinatura.",
  startNow: "Começar agora",
  faqTitle: "Perguntas importantes",
  faq: [
    { q: "Qual a diferença entre assinatura e uso por períodos?", a: "Na assinatura Growth, você tem 5 dias iniciais grátis, paga R$ 497 pelos primeiros 30 dias pagos, R$ 990/mês pelos 5 meses seguintes e R$ 1.490/mês depois. No uso por períodos, você tem 5 dias grátis por mês e pode adicionar blocos de 5 dias por R$ 399,00." },
    { q: "Os 5 dias grátis voltam todo mês?", a: "Sim, no modo por períodos existe um benefício gratuito de 5 dias por mês. Na assinatura contínua, os 5 dias gratuitos são a etapa inicial antes da primeira cobrança." },
    { q: "Existe limite de usuários?", a: "Não. O Growth não cobra usuário adicional e não possui limite comercial de usuários." },
    { q: "Preciso pagar implantação?", a: "Não. O onboarding padrão é autoguiado com apoio do agente. A implantação humana é opcional e custa R$ 1.890." },
    { q: "Vou perder acesso aos meus dados?", a: "Não. As informações permanecem disponíveis para consulta. A plataforma apenas pausa novas automações enquanto não houver um período ativo." },
  ],
} as const;

const ES = {
  complete: "VendorAI Growth",
  title: "Un solo plan. Toda la tecnología.",
  subtitle: "Growth es el único plan de VendorAI: acceso completo, sin límite de usuarios y sin niveles que oculten funciones.",
  country: "País",
  recommended: "Recomendado",
  subscription: "Suscripción continua",
  subscriptionTitle: "Growth mensual",
  firstFiveDays: "5 días iniciales",
  free: "Gratis",
  firstPaid30Days: "Primeros 30 días pagos",
  nextFiveMonths: "5 meses siguientes",
  afterThat: "Después",
  subscriptionBenefits: [
    "Sin límite de usuarios",
    "Todos los módulos Growth disponibles",
    "Sin contrato de permanencia",
    "Cancela cuando quieras",
  ],
  startTrial: "Empezar mis 5 días gratis",
  onDemand: "Growth por períodos",
  fiveDays: "/ 5 días",
  onDemandDescription: "Cada mes puedes activar 5 días gratis de acceso completo. Cuando necesites más tiempo, compra bloques adicionales de 5 días por R$ 399,00.",
  onDemandBenefits: [
    "5 días gratuitos por mes",
    "La misma experiencia completa de Growth",
    "Pago único con tarjeta; PIX disponible en Brasil",
    "Compra nuevos bloques de 5 días cuando quieras",
  ],
  activateFiveDays: "Activar Growth por 5 días",
  brlNotice: "Todos los importes de esta página se cobran en reales brasileños (BRL). No se realiza conversión automática a moneda local.",
  optional: "Opcional",
  implementation: "Implementación asistida",
  implementationDescription: "La implementación estándar es autoguiada por el agente de VendorAI, sin costo adicional. Si tu empresa prefiere apoyo humano, hacemos configuración, integraciones, parametrización y capacitación mediante un único pago.",
  dataTitle: "Tus datos no desaparecen cuando termina el período",
  dataDescription: "Aunque no tengas un período activo, puedes seguir consultando leads, conversaciones, propuestas, informes e información ya registrada. Las nuevas automatizaciones y envíos quedan pausados hasta la próxima activación o suscripción.",
  startNow: "Empezar ahora",
  faqTitle: "Preguntas importantes",
  faq: [
    { q: "¿Cuál es la diferencia entre suscripción y uso por períodos?", a: "En la suscripción Growth tienes 5 días iniciales gratis, pagas R$ 497 por los primeros 30 días pagos, R$ 990/mes durante los 5 meses siguientes y R$ 1.490/mes después. En el uso por períodos tienes 5 días gratis por mes y puedes añadir bloques de 5 días por R$ 399,00." },
    { q: "¿Los 5 días gratis vuelven cada mes?", a: "Sí, en el modo por períodos existe un beneficio gratuito de 5 días por mes. En la suscripción continua, los 5 días gratuitos son la etapa inicial antes del primer cobro." },
    { q: "¿Existe límite de usuarios?", a: "No. Growth no cobra usuarios adicionales y no tiene límite comercial de usuarios." },
    { q: "¿Debo pagar la implementación?", a: "No. El onboarding estándar es autoguiado con apoyo del agente. La implementación humana es opcional y cuesta R$ 1.890." },
    { q: "¿Voy a perder acceso a mis datos?", a: "No. La información permanece disponible para consulta. La plataforma solo pausa nuevas automatizaciones mientras no haya un período activo." },
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
              <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">{copy.firstPaid30Days}</span><span className="font-semibold text-slate-900">R$ 497</span></div>
              <div className="flex items-baseline justify-between"><span className="text-sm text-slate-500">{copy.nextFiveMonths}</span><span className="font-semibold text-slate-900">R$ 990/{isSpanish ? "mes" : "mês"}</span></div>
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
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">R$ 399,00 <span className="text-lg font-medium text-slate-500">{copy.fiveDays}</span></h2>
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
