import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, RefreshCcw, Sparkles, Users } from "lucide-react";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";

type PlanCard = {
  name: string;
  price: string;
  suffix: string;
  eyebrow: string;
  description: string;
  benefits: string[];
  cta: string;
  featured?: boolean;
};

const PT = {
  title: "Comece grátis. Cresça quando precisar.",
  subtitle: "CRM completo para 1 usuário sem custo. Adicione equipe, módulos ou libere todo o ecossistema com Growth.",
  country: "País",
  plans: [
    {
      name: "Vendor CRM Free",
      price: "R$ 0",
      suffix: "/mês",
      eyebrow: "Entrada",
      description: "CRM completo para quem está começando sozinho. A limitação é de equipe, não de recursos essenciais do CRM.",
      benefits: ["1 usuário", "CRM completo", "Leads, contatos e pipeline", "Tarefas, histórico e dashboard", "30 assistências de IA/mês"],
      cta: "Começar grátis",
    },
    {
      name: "Vendor CRM Pro",
      price: "R$ 49,90",
      suffix: "/mês",
      eyebrow: "Equipe",
      description: "O mesmo CRM completo para pequenas equipes, com mais usuários e uma franquia maior de assistência de IA.",
      benefits: ["Até 5 usuários", "CRM completo", "100 assistências de IA/mês", "Módulos adicionais contratáveis", "Sem implantação obrigatória"],
      cta: "Ativar CRM Pro",
    },
    {
      name: "VendorAI Growth",
      price: "R$ 1.490",
      suffix: "/mês regular",
      eyebrow: "Ecossistema completo",
      description: "Todos os módulos padrão aplicáveis ao seu segmento, usuários ilimitados e franquias mensais de consumo.",
      benefits: ["Usuários ilimitados", "Módulos do segmento incluídos", "Franquias mensais por função", "Compra de capacidade adicional", "Upsell e automações integrados"],
      cta: "Conhecer o Growth",
      featured: true,
    },
  ] as PlanCard[],
  prepaid: "Growth por períodos",
  prepaidPrice: "R$ 399",
  prepaidSuffix: "/ +5 dias",
  prepaidDescription: "Você pode experimentar 5 dias grátis por mês. Quando precisar de mais tempo, compre blocos adicionais de 5 dias.",
  prepaidBenefits: ["5 dias gratuitos por mês", "Mesma experiência Growth durante o período", "Sem perder seus dados quando o período termina", "Compra avulsa por PIX ou cartão"],
  consumptionTitle: "Consumo simples para o cliente, preciso para o VendorAI",
  consumptionDescription: "O cliente vê quantidades reais — imagens, vídeos, prospects, renders e interações. Internamente, o VendorAI converte cada ação em Vendor Credits e acompanha o custo real por provedor.",
  consumptionExamples: ["300 conteúdos/mês", "100 imagens/mês", "10 vídeos/mês", "1.500 prospects/mês", "10.000 interações de agentes/mês", "30 renders/mês"],
  implementationTitle: "Implantação assistida opcional",
  implementationPrice: "R$ 1.890",
  implementationDescription: "O onboarding padrão continua autoguiado. A implantação humana inclui configuração, parametrização, integrações, usuários e treinamento.",
  faq: [
    ["O CRM Free é uma versão básica?", "Não. O CRM é completo para 1 usuário. Produtos especializados, como Prospector, Omnichannel, AI Team e marketing, são contratados separadamente."],
    ["O Growth limita usuários?", "Não. Growth possui usuários ilimitados. O controle econômico é feito pelas franquias das operações que geram custo ou automação relevante."],
    ["O que acontece quando uma franquia termina?", "O sistema avisa antes do limite e oferece compra de capacidade adicional. Os limites podem ser configurados por função."],
    ["Como sei quando vale migrar para Growth?", "O próprio VendorAI compara o valor dos módulos ativos com o Growth e mostra a economia quando a assinatura completa passa a ser mais vantajosa."],
  ],
} as const;

const ES = {
  ...PT,
  title: "Empieza gratis. Crece cuando lo necesites.",
  subtitle: "CRM completo para 1 usuario sin costo. Añade equipo, módulos o libera todo el ecosistema con Growth.",
  country: "País",
  plans: [
    { ...PT.plans[0], name: "Vendor CRM Free", eyebrow: "Entrada", description: "CRM completo para quien empieza solo. El límite está en el equipo, no en las funciones esenciales del CRM.", benefits: ["1 usuario", "CRM completo", "Leads, contactos y pipeline", "Tareas, historial y dashboard", "30 asistencias de IA/mes"], cta: "Empezar gratis" },
    { ...PT.plans[1], name: "Vendor CRM Pro", eyebrow: "Equipo", description: "El mismo CRM completo para pequeños equipos, con más usuarios y mayor franquicia de asistencia de IA.", benefits: ["Hasta 5 usuarios", "CRM completo", "100 asistencias de IA/mes", "Módulos adicionales disponibles", "Sin implementación obligatoria"], cta: "Activar CRM Pro" },
    { ...PT.plans[2], name: "VendorAI Growth", eyebrow: "Ecosistema completo", description: "Todos los módulos estándar aplicables a tu segmento, usuarios ilimitados y franquicias mensuales de consumo.", benefits: ["Usuarios ilimitados", "Módulos del segmento incluidos", "Franquicias mensuales por función", "Compra de capacidad adicional", "Upsell y automatizaciones integrados"], cta: "Conocer Growth", featured: true },
  ] as PlanCard[],
  prepaid: "Growth por períodos",
  prepaidSuffix: "/ +5 días",
  prepaidDescription: "Puedes probar 5 días gratis por mes. Cuando necesites más tiempo, compra bloques adicionales de 5 días.",
  prepaidBenefits: ["5 días gratis por mes", "Misma experiencia Growth durante el período", "Tus datos permanecen disponibles", "Compra única con tarjeta o PIX en Brasil"],
  consumptionTitle: "Consumo simple para el cliente, preciso para VendorAI",
  consumptionDescription: "El cliente ve cantidades reales — imágenes, videos, prospects, renders e interacciones. Internamente, VendorAI convierte cada acción en Vendor Credits y registra el costo real por proveedor.",
  consumptionExamples: ["300 contenidos/mes", "100 imágenes/mes", "10 videos/mes", "1.500 prospects/mes", "10.000 interacciones de agentes/mes", "30 renders/mes"],
  implementationTitle: "Implementación asistida opcional",
  implementationDescription: "El onboarding estándar sigue siendo autoguiado. La implementación humana incluye configuración, parametrización, integraciones, usuarios y capacitación.",
  faq: [
    ["¿CRM Free es una versión básica?", "No. El CRM es completo para 1 usuario. Productos especializados se contratan por separado."],
    ["¿Growth limita usuarios?", "No. Growth tiene usuarios ilimitados. El control económico se realiza mediante las franquicias de las operaciones con costo relevante."],
    ["¿Qué pasa cuando termina una franquicia?", "El sistema avisa antes del límite y permite comprar capacidad adicional."],
    ["¿Cuándo conviene migrar a Growth?", "VendorAI compara el valor de los módulos activos con Growth y muestra la economía cuando el plan completo se vuelve más conveniente."],
  ],
} as const;

export default function Precos() {
  const { countryCode, setCountryCode, country, isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <div className="min-h-screen bg-slate-50 pb-24" lang={country.locale}>
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-orange-300">VendorAI</p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{copy.title}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">{copy.subtitle}</p>
          <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-3">
            <label htmlFor="pricing-country" className="text-sm font-medium text-slate-300">{copy.country}</label>
            <select id="pricing-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)} className="h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white">
              {Object.entries(PUBLIC_COUNTRIES).map(([code, option]) => <option key={code} value={code}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {copy.plans.map((plan) => (
            <article key={plan.name} className={`relative rounded-[28px] border bg-white p-8 shadow-sm ${plan.featured ? "border-orange-400 ring-4 ring-orange-100" : "border-slate-200"}`}>
              {plan.featured ? <span className="absolute right-6 top-6 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold uppercase text-white">Growth</span> : null}
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${plan.featured ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-700"}`}>
                {plan.name.includes("Growth") ? <Sparkles className="h-6 w-6" /> : <Users className="h-6 w-6" />}
              </div>
              <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">{plan.eyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">{plan.name}</h2>
              <p className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">{plan.price} <span className="text-sm font-medium text-slate-500">{plan.suffix}</span></p>
              <p className="mt-4 min-h-[96px] text-sm leading-6 text-slate-600">{plan.description}</p>
              <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
                {plan.benefits.map((benefit) => <li key={benefit} className="flex gap-3 text-sm text-slate-700"><Check className="h-5 w-5 shrink-0 text-emerald-500" />{benefit}</li>)}
              </ul>
              <Button asChild variant={plan.featured ? "default" : "outline"} className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{plan.cta}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </article>
          ))}
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-[28px] border border-slate-200 bg-white p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><RefreshCcw className="h-6 w-6" /></div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.prepaid}</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">{copy.prepaidPrice} <span className="text-base font-medium text-slate-500">{copy.prepaidSuffix}</span></h2>
            <p className="mt-4 leading-7 text-slate-600">{copy.prepaidDescription}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">{copy.prepaidBenefits.map((item) => <li key={item} className="flex gap-3 text-sm text-slate-700"><Check className="h-5 w-5 shrink-0 text-emerald-500" />{item}</li>)}</ul>
          </article>
          <article className="rounded-[28px] border border-slate-200 bg-white p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.implementationTitle}</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">{copy.implementationPrice}</h2>
            <p className="mt-4 leading-7 text-slate-600">{copy.implementationDescription}</p>
          </article>
        </section>

        <section className="mt-8 rounded-[28px] bg-slate-950 p-8 text-white md:p-10">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{copy.consumptionTitle}</h2>
          <p className="mt-4 max-w-4xl leading-7 text-slate-300">{copy.consumptionDescription}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{copy.consumptionExamples.map((item) => <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-medium">{item}</div>)}</div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-3xl font-semibold text-slate-950">FAQ</h2>
          <div className="mt-8 space-y-4">{copy.faq.map(([q, a]) => <article key={q} className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-semibold text-slate-950">{q}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{a}</p></article>)}</div>
        </section>
      </main>
    </div>
  );
}
