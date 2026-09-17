import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2, Layers3, RefreshCcw, Sparkles, TrendingUp, UserRound } from "lucide-react";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";
import {
  fetchPublicVendorProducts,
  formatCatalogPrice,
  type PublicCatalogProduct,
} from "@/lib/publicProductCatalog";

const PT = {
  eyebrow: "Escolha como crescer",
  title: "Comece grátis. Expanda quando precisar.",
  subtitle: "Use o CRM completo com 1 usuário sem mensalidade. Depois adicione módulos isolados ou migre para o Growth com usuários ilimitados e todo o ecossistema aplicável ao seu negócio.",
  country: "País",
  recommended: "Ecossistema completo",
  freeTitle: "Vendor CRM Free",
  freeDescription: "CRM completo para uma pessoa trabalhar de verdade, sem esconder as funções essenciais do CRM.",
  freeBenefits: ["1 usuário", "CRM completo", "Leads, contatos, pipeline e tarefas", "Histórico e gestão comercial", "Franquia mensal de IA"],
  startFree: "Começar grátis",
  modulesTitle: "Monte seu VendorAI",
  modulesDescription: "Compre somente os módulos que sua operação precisa. O próprio sistema sugere o próximo recurso conforme você usa o CRM.",
  modulesBenefits: ["Ativação por módulo", "Preço mensal por capacidade", "Upsell contextual dentro do sistema", "Migração para Growth quando ficar mais vantajoso"],
  growthTitle: "VendorAI Growth",
  growthDescription: "Todos os produtos padrão aplicáveis ao seu segmento, com usuários ilimitados. Gerações e automações de custo variável possuem franquias mensais claras.",
  growthBenefits: ["Usuários ilimitados", "Todos os módulos aplicáveis ao segmento", "Franquias mensais de IA e automação", "Compra de capacidade extra sem trocar de plano"],
  growthPeriods: "Growth por períodos",
  fiveDays: "/ 5 dias",
  periodDescription: "Todo mês você pode experimentar 5 dias de Growth gratuitamente. Quando precisar de mais tempo, compre blocos adicionais de 5 dias.",
  periodBenefits: ["5 dias gratuitos por mês", "Mesma experiência Growth durante o período", "Blocos adicionais por R$ 399", "Se o uso ficar frequente, migre para a assinatura mensal"],
  activateGrowth: "Experimentar Growth",
  implementation: "Implantação humana assistida",
  implementationDescription: "O onboarding padrão é autoguiado. Se sua empresa quiser configuração, integrações, parametrização e treinamento feitos com acompanhamento humano, a implantação é contratada separadamente.",
  usageTitle: "Você compra capacidade compreensível, não tokens técnicos",
  usageDescription: "O sistema mostra imagens, vídeos, prospects, renders, conteúdos e interações usadas. Vendor Credits e custos de provedores ficam por trás para controle de margem e consumo.",
  faqTitle: "Como funciona",
  faq: [
    { q: "O CRM Free é uma versão básica?", a: "Não. O CRM é completo para 1 usuário. A limitação comercial principal do Free é a quantidade de usuários e as franquias de recursos com custo variável." },
    { q: "O Growth tem limite de usuários?", a: "Não. O Growth possui usuários ilimitados. As franquias são da empresa e se aplicam somente a operações de custo variável, como geração de mídia, prospecção e automações." },
    { q: "Posso comprar um módulo sem assinar Growth?", a: "Sim. Os módulos podem ser contratados individualmente. Quando a soma ficar próxima do Growth, o sistema poderá mostrar a comparação automaticamente." },
    { q: "O que acontece quando a franquia termina?", a: "O uso normal do software continua. Para a função que atingiu a franquia, você poderá comprar capacidade adicional ou migrar para uma oferta mais adequada." },
  ],
} as const;

const ES = {
  eyebrow: "Elige cómo crecer",
  title: "Empieza gratis. Amplía cuando lo necesites.",
  subtitle: "Usa el CRM completo con 1 usuario sin mensualidad. Luego añade módulos o migra a Growth con usuarios ilimitados y el ecosistema aplicable a tu negocio.",
  country: "País",
  recommended: "Ecosistema completo",
  freeTitle: "Vendor CRM Free",
  freeDescription: "CRM completo para que una persona trabaje de verdad, sin ocultar las funciones esenciales.",
  freeBenefits: ["1 usuario", "CRM completo", "Leads, contactos, pipeline y tareas", "Historial y gestión comercial", "Franquicia mensual de IA"],
  startFree: "Empezar gratis",
  modulesTitle: "Arma tu VendorAI",
  modulesDescription: "Contrata solo los módulos que tu operación necesita. El sistema sugiere la siguiente capacidad según el uso.",
  modulesBenefits: ["Activación por módulo", "Precio mensual por capacidad", "Upsell contextual dentro del sistema", "Migración a Growth cuando resulte más conveniente"],
  growthTitle: "VendorAI Growth",
  growthDescription: "Todos los productos estándar aplicables a tu segmento, con usuarios ilimitados. Las operaciones de costo variable tienen franquicias mensuales claras.",
  growthBenefits: ["Usuarios ilimitados", "Todos los módulos aplicables al segmento", "Franquicias mensuales de IA y automatización", "Capacidad adicional sin cambiar de plan"],
  growthPeriods: "Growth por períodos",
  fiveDays: "/ 5 días",
  periodDescription: "Cada mes puedes probar 5 días de Growth gratis. Cuando necesites más tiempo, compra bloques adicionales de 5 días.",
  periodBenefits: ["5 días gratuitos por mes", "Misma experiencia Growth durante el período", "Bloques adicionales por R$ 399", "Si el uso se vuelve frecuente, migra a la suscripción mensual"],
  activateGrowth: "Probar Growth",
  implementation: "Implementación humana asistida",
  implementationDescription: "El onboarding estándar es autoguiado. Si tu empresa desea configuración, integraciones, parametrización y capacitación con acompañamiento humano, se contrata por separado.",
  usageTitle: "Compras capacidad comprensible, no tokens técnicos",
  usageDescription: "El sistema muestra imágenes, videos, prospects, renders, contenidos e interacciones usadas. Vendor Credits y costos de proveedores quedan detrás para control económico.",
  faqTitle: "Cómo funciona",
  faq: [
    { q: "¿CRM Free es una versión básica?", a: "No. El CRM es completo para 1 usuario. La limitación comercial principal es la cantidad de usuarios y las franquicias de recursos de costo variable." },
    { q: "¿Growth tiene límite de usuarios?", a: "No. Growth tiene usuarios ilimitados. Las franquicias son de la empresa y se aplican a operaciones con costo variable." },
    { q: "¿Puedo comprar un módulo sin Growth?", a: "Sí. Los módulos se contratan individualmente. Cuando la suma se acerque a Growth, el sistema puede mostrar la comparación automáticamente." },
    { q: "¿Qué pasa cuando termina una franquicia?", a: "El uso normal del software continúa. Para la función que alcanzó el límite puedes comprar capacidad adicional o migrar de oferta." },
  ],
} as const;

const FALLBACK = {
  growth: "R$ 1.490,00",
  fiveDays: "R$ 399,00",
  implementation: "R$ 1.890,00",
};

function benefits(items: readonly string[]) {
  return (
    <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
      {items.map((feature) => (
        <li key={feature} className="flex gap-3 text-sm font-medium text-slate-700">
          <Check className="h-5 w-5 shrink-0 text-emerald-500" /> {feature}
        </li>
      ))}
    </ul>
  );
}

export default function Precos() {
  const { countryCode, setCountryCode, country, isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const [catalog, setCatalog] = useState<PublicCatalogProduct[]>([]);

  useEffect(() => {
    void fetchPublicVendorProducts().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  const bySku = useMemo(() => new Map(catalog.map((item) => [item.sku, item])), [catalog]);
  const price = (sku: string, fallback: string) => formatCatalogPrice(bySku.get(sku) ?? null) ?? fallback;
  const modules = catalog.filter((item) => item.product_type === "saas_addon" && !["vendor-growth-5d"].includes(item.sku)).slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50 pb-24" lang={country.locale}>
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{copy.eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{copy.title}</h1>
        <p className="mx-auto mt-6 max-w-4xl text-lg leading-8 text-slate-300 md:text-xl">{copy.subtitle}</p>
        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-3">
          <label htmlFor="pricing-country" className="text-sm font-medium text-slate-300">{copy.country}</label>
          <select id="pricing-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)} className="h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white">
            {Object.entries(PUBLIC_COUNTRIES).map(([code, option]) => <option key={code} value={code}>{option.label}</option>)}
          </select>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><UserRound className="h-6 w-6" /></div>
            <h2 className="mt-7 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.freeTitle}</h2>
            <p className="mt-3 text-3xl font-bold text-emerald-600">{price("vendor-crm-free", isSpanish ? "Gratis" : "Grátis")}</p>
            <p className="mt-4 min-h-[84px] leading-7 text-slate-600">{copy.freeDescription}</p>
            {benefits(copy.freeBenefits)}
            <Button asChild variant="outline" className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.startFree}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Layers3 className="h-6 w-6" /></div>
            <h2 className="mt-7 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.modulesTitle}</h2>
            <p className="mt-4 min-h-[84px] leading-7 text-slate-600">{copy.modulesDescription}</p>
            {benefits(copy.modulesBenefits)}
            {modules.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{modules.map((item) => <span key={item.sku} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{item.nome}</span>)}</div>}
            <Button asChild variant="outline" className="mt-7 w-full rounded-xl" size="lg"><Link href="/produtos">{isSpanish ? "Ver módulos" : "Ver módulos"}</Link></Button>
          </article>

          <article className="relative rounded-[28px] border border-blue-400 bg-white p-8 shadow-sm ring-4 ring-blue-100">
            <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{copy.recommended}</span>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><TrendingUp className="h-6 w-6" /></div>
            <h2 className="mt-7 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.growthTitle}</h2>
            <p className="mt-3 text-3xl font-bold text-slate-950">{price("vendor-growth-monthly", FALLBACK.growth)}<span className="text-base font-medium text-slate-500">/{isSpanish ? "mes" : "mês"}</span></p>
            <p className="mt-4 min-h-[84px] leading-7 text-slate-600">{copy.growthDescription}</p>
            {benefits(copy.growthBenefits)}
            <Button asChild className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.activateGrowth}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </article>
        </div>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="rounded-[28px] border border-slate-200 bg-white p-8">
            <div className="flex items-center gap-3"><RefreshCcw className="h-6 w-6 text-blue-600" /><h2 className="text-2xl font-semibold text-slate-950">{copy.growthPeriods}</h2></div>
            <p className="mt-4 text-3xl font-semibold">{price("vendor-growth-5d", FALLBACK.fiveDays)} <span className="text-base font-medium text-slate-500">{copy.fiveDays}</span></p>
            <p className="mt-4 leading-7 text-slate-600">{copy.periodDescription}</p>
            {benefits(copy.periodBenefits)}
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-8">
            <div className="flex items-center gap-3"><Sparkles className="h-6 w-6 text-violet-600" /><h2 className="text-2xl font-semibold text-slate-950">{copy.usageTitle}</h2></div>
            <p className="mt-4 leading-7 text-slate-600">{copy.usageDescription}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              {["Imagens", "Vídeos", "Prospects", "Renders", "Conteúdos", "Interações IA"].map((item) => <div key={item} className="rounded-xl bg-slate-50 px-4 py-3 font-medium text-slate-700">{item}</div>)}
            </div>
          </article>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{isSpanish ? "Opcional" : "Opcional"}</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">{copy.implementation}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{copy.implementationDescription}</p></div>
            <p className="shrink-0 text-3xl font-semibold tracking-[-0.03em] text-slate-950">{price("vendor-implementation-cash", FALLBACK.implementation)}</p>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-emerald-200 bg-emerald-50 p-8 md:p-10">
          <div className="flex gap-4"><CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-600" /><div><h2 className="text-xl font-semibold text-emerald-950">{isSpanish ? "Tu CRM no desaparece si no compras Growth" : "Seu CRM não desaparece se você não comprar Growth"}</h2><p className="mt-2 leading-7 text-emerald-900/80">{isSpanish ? "El CRM Free sigue disponible para 1 usuario. Los módulos y períodos Growth se activan según tu necesidad." : "O CRM Free continua disponível para 1 usuário. Módulos e períodos Growth são ativados conforme sua necessidade."}</p></div></div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.faqTitle}</h2>
          <div className="mt-8 space-y-4">{copy.faq.map((faq) => <article key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-semibold text-slate-950">{faq.q}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{faq.a}</p></article>)}</div>
        </section>
      </main>
    </div>
  );
}
