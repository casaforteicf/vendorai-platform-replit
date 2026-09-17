import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Blocks, Check, Clock3, Loader2, Sparkles, Users } from "lucide-react";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type Quota = {
  metricKey: string;
  metricLabel: string;
  unitLabel: string;
  includedQuantity: string | number;
};

type CommercialProduct = {
  commercialKey: string | null;
  name: string;
  description: string;
  billingModel: string | null;
  publicSlug: string | null;
  monthlyPriceCents: number | null;
  oneTimePriceCents: number | null;
  maxUsers: number | null;
  unlimitedUsers: boolean;
  includedInGrowth: boolean;
  standalonePurchase: boolean;
  quotas: Quota[];
  metadata?: Record<string, unknown>;
};

const PT = {
  eyebrow: "Planos e módulos VendorAI",
  title: "Comece grátis. Adicione o que precisa. Cresça até o Growth.",
  subtitle: "O CRM é a porta de entrada. Depois você ativa módulos dentro do próprio sistema ou migra para o Growth quando fizer mais sentido.",
  country: "País",
  free: "CRM Free",
  freePrice: "Grátis",
  freeDescription: "CRM completo para uma pessoa operar de verdade. A limitação principal é 1 usuário, não uma versão reduzida do CRM.",
  freeBenefits: ["CRM completo", "1 usuário", "Sem cartão para começar", "Módulos premium opcionais"],
  startFree: "Começar grátis",
  pro: "CRM Pro",
  proDescription: "A evolução natural para empresas que começam a trabalhar em equipe e querem uma franquia maior de assistência de IA.",
  modulesTitle: "Ative módulos conforme a necessidade",
  modulesDescription: "Prospector, Omnichannel, AI Team, conteúdo, gestão, analytics e outros produtos podem ser contratados individualmente. Quando a soma se aproxima do Growth, o próprio sistema recomenda a migração.",
  growth: "VendorAI Growth",
  recommended: "Ecossistema completo",
  growthDescription: "Usuários ilimitados, todos os módulos padrão aplicáveis ao seu segmento e franquias mensais de operações com IA.",
  launch: "Régua de lançamento",
  firstFive: "5 dias iniciais",
  firstPaid: "Primeiros 30 dias pagos",
  nextMonths: "5 meses seguintes",
  regular: "Preço regular",
  prepaid: "Growth por períodos",
  prepaidDescription: "Todo mês você pode usar 5 dias gratuitos de Growth. Se precisar de mais tempo, compre blocos adicionais de 5 dias.",
  fiveDays: "+5 dias",
  quotaTitle: "Franquias Growth V1",
  quotaDescription: "Operações normais de CRM não entram na franquia. Medimos principalmente geração, automação, prospecção e processamento intensivo. Capacidade adicional poderá ser comprada por função.",
  unlimitedUsers: "Usuários ilimitados",
  segmentScope: "Todos os módulos padrão aplicáveis ao segmento",
  extraCapacity: "Capacidade adicional disponível sem trocar de plano",
  implementationTitle: "Implantação humana opcional",
  implementationDescription: "O onboarding padrão é autoguiado. Se sua empresa preferir apoio humano, configuração, integrações, parametrização e treinamento podem ser contratados separadamente.",
  loading: "Carregando catálogo comercial...",
  catalogFallback: "Os valores abaixo usam a tabela comercial atual. O checkout confirma o valor vigente.",
  brl: "Valores cobrados em reais brasileiros (BRL). Investimento em mídia, taxas transacionais, desenvolvimento personalizado e consumo excedente não estão incluídos na licença Growth.",
} as const;

const ES = {
  eyebrow: "Planes y módulos VendorAI",
  title: "Empieza gratis. Añade lo que necesitas. Crece hasta Growth.",
  subtitle: "El CRM es la puerta de entrada. Luego activas módulos dentro del propio sistema o migras a Growth cuando sea más conveniente.",
  country: "País",
  free: "CRM Free",
  freePrice: "Gratis",
  freeDescription: "CRM completo para una persona. La limitación principal es 1 usuario, no una versión reducida del CRM.",
  freeBenefits: ["CRM completo", "1 usuario", "Sin tarjeta para empezar", "Módulos premium opcionales"],
  startFree: "Empezar gratis",
  pro: "CRM Pro",
  proDescription: "La evolución natural para empresas que empiezan a trabajar en equipo y quieren una franquicia mayor de asistencia con IA.",
  modulesTitle: "Activa módulos según la necesidad",
  modulesDescription: "Prospector, Omnichannel, AI Team, contenido, gestión, analytics y otros productos pueden contratarse individualmente. Cuando la suma se acerca a Growth, el sistema recomienda migrar.",
  growth: "VendorAI Growth",
  recommended: "Ecosistema completo",
  growthDescription: "Usuarios ilimitados, todos los módulos estándar aplicables a tu segmento y franquicias mensuales de operaciones con IA.",
  launch: "Escala de lanzamiento",
  firstFive: "5 días iniciales",
  firstPaid: "Primeros 30 días pagos",
  nextMonths: "5 meses siguientes",
  regular: "Precio regular",
  prepaid: "Growth por períodos",
  prepaidDescription: "Cada mes puedes usar 5 días gratuitos de Growth. Si necesitas más tiempo, compra bloques adicionales de 5 días.",
  fiveDays: "+5 días",
  quotaTitle: "Franquicias Growth V1",
  quotaDescription: "Las operaciones normales del CRM no consumen franquicia. Medimos principalmente generación, automatización, prospección y procesamiento intensivo. La capacidad adicional se podrá comprar por función.",
  unlimitedUsers: "Usuarios ilimitados",
  segmentScope: "Todos los módulos estándar aplicables al segmento",
  extraCapacity: "Capacidad adicional disponible sin cambiar de plan",
  implementationTitle: "Implementación humana opcional",
  implementationDescription: "El onboarding estándar es autoguiado. Configuración, integraciones, parametrización y capacitación humana pueden contratarse por separado.",
  loading: "Cargando catálogo comercial...",
  catalogFallback: "Los valores siguientes usan la tabla comercial actual. El checkout confirma el valor vigente.",
  brl: "Valores cobrados en reales brasileños (BRL). Inversión en medios, tasas transaccionales, desarrollo personalizado y consumo excedente no están incluidos en Growth.",
} as const;

function moneyFromCents(cents: number | null | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function Precos() {
  const { countryCode, setCountryCode, country, isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const [products, setProducts] = useState<CommercialProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/public/commercial-products`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog_http_${response.status}`);
        return response.json() as Promise<{ products?: CommercialProduct[] }>;
      })
      .then((payload) => {
        if (active) setProducts(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const byKey = useMemo(() => new Map(products.map((product) => [product.commercialKey, product])), [products]);
  const crmPro = byKey.get("vendor_crm_pro");
  const growth = byKey.get("vendorai_growth");
  const growthPass = byKey.get("vendorai_growth_5d");
  const implementation = byKey.get("vendor_implementation");
  const growthQuotas = growth?.quotas ?? [];
  const moduleProducts = products.filter((product) =>
    product.standalonePurchase &&
    product.includedInGrowth &&
    product.billingModel === "subscription" &&
    !["vendorai_growth", "vendor_crm_pro"].includes(product.commercialKey ?? "") &&
    product.monthlyPriceCents != null,
  );

  const regularGrowthPrice = moneyFromCents(growth?.monthlyPriceCents) ?? "R$ 1.490,00";
  const passPrice = moneyFromCents(growthPass?.oneTimePriceCents) ?? "R$ 399,00";
  const crmProPrice = moneyFromCents(crmPro?.monthlyPriceCents) ?? "R$ 49,90";
  const implementationPrice = moneyFromCents(implementation?.oneTimePriceCents) ?? "R$ 1.890,00";

  return (
    <div className="min-h-screen bg-slate-50 pb-24" lang={country.locale}>
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-orange-300">{copy.eyebrow}</p>
        <h1 className="mx-auto max-w-5xl text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{copy.title}</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">{copy.subtitle}</p>
        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-3">
          <label htmlFor="pricing-country" className="text-sm font-medium text-slate-300">{copy.country}</label>
          <select id="pricing-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)} className="h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white">
            {Object.entries(PUBLIC_COUNTRIES).map(([code, option]) => <option key={code} value={code}>{option.label}</option>)}
          </select>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-14">
        {loading && <div className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{copy.loading}</div>}

        <div className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Users className="h-6 w-6" /></div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.free}</p>
            <h2 className="mt-2 text-4xl font-semibold text-slate-950">{copy.freePrice}</h2>
            <p className="mt-4 min-h-[96px] leading-7 text-slate-600">{copy.freeDescription}</p>
            <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {copy.freeBenefits.map((item) => <p key={item} className="flex gap-3 text-sm font-medium text-slate-700"><Check className="h-5 w-5 shrink-0 text-emerald-500" />{item}</p>)}
            </div>
            <Button asChild className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.startFree}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Blocks className="h-6 w-6" /></div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.pro}</p>
            <h2 className="mt-2 text-4xl font-semibold text-slate-950">{crmProPrice}<span className="ml-1 text-base font-medium text-slate-500">/{isSpanish ? "mes" : "mês"}</span></h2>
            <p className="mt-4 min-h-[96px] leading-7 text-slate-600">{copy.proDescription}</p>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <strong>{copy.modulesTitle}</strong><br />{copy.modulesDescription}
            </div>
            <Button asChild variant="outline" className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.startFree}</Link></Button>
          </article>

          <article className="relative rounded-[28px] border border-orange-400 bg-white p-7 shadow-sm ring-4 ring-orange-100">
            <span className="absolute right-5 top-5 rounded-full bg-orange-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{copy.recommended}</span>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Sparkles className="h-6 w-6" /></div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.growth}</p>
            <h2 className="mt-2 text-4xl font-semibold text-slate-950">{regularGrowthPrice}<span className="ml-1 text-base font-medium text-slate-500">/{isSpanish ? "mes" : "mês"}</span></h2>
            <p className="mt-4 leading-7 text-slate-600">{copy.growthDescription}</p>
            <div className="mt-5 space-y-2 rounded-2xl bg-orange-50 p-4 text-sm">
              <p className="font-semibold text-orange-950">{copy.launch}</p>
              <div className="flex justify-between"><span>{copy.firstFive}</span><strong className="text-emerald-700">{isSpanish ? "Gratis" : "Grátis"}</strong></div>
              <div className="flex justify-between"><span>{copy.firstPaid}</span><strong>R$ 497</strong></div>
              <div className="flex justify-between"><span>{copy.nextMonths}</span><strong>R$ 990/{isSpanish ? "mes" : "mês"}</strong></div>
              <div className="flex justify-between border-t border-orange-200 pt-2"><span>{copy.regular}</span><strong>{regularGrowthPrice}/{isSpanish ? "mes" : "mês"}</strong></div>
            </div>
            <div className="mt-5 space-y-2 text-sm font-medium text-slate-700">
              {[copy.unlimitedUsers, copy.segmentScope, copy.extraCapacity].map((item) => <p key={item} className="flex gap-2"><Check className="h-5 w-5 shrink-0 text-emerald-500" />{item}</p>)}
            </div>
            <Button asChild className="mt-7 w-full rounded-xl" size="lg"><Link href="/demo">{copy.startFree}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </article>
        </div>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-7 md:p-9">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Clock3 className="h-5 w-5" /></div>
              <h2 className="mt-5 text-2xl font-semibold text-slate-950">{copy.prepaid}</h2>
              <p className="mt-3 leading-7 text-slate-600">{copy.prepaidDescription}</p>
              <div className="mt-5 flex items-end gap-3"><span className="text-4xl font-semibold text-slate-950">{passPrice}</span><span className="pb-1 text-slate-500">{copy.fiveDays}</span></div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
              <h3 className="font-semibold text-slate-950">{copy.quotaTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy.quotaDescription}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {(growthQuotas.length ? growthQuotas : [
                  { metricKey: "content_generation", metricLabel: isSpanish ? "Contenidos IA" : "Conteúdos IA", unitLabel: "", includedQuantity: 300 },
                  { metricKey: "image_generation", metricLabel: isSpanish ? "Imágenes IA" : "Imagens IA", unitLabel: "", includedQuantity: 100 },
                  { metricKey: "video_generation", metricLabel: isSpanish ? "Videos IA" : "Vídeos IA", unitLabel: "", includedQuantity: 10 },
                  { metricKey: "prospect_enrichment", metricLabel: "Prospects", unitLabel: "", includedQuantity: 1500 },
                  { metricKey: "agent_interaction", metricLabel: isSpanish ? "Interacciones AI Team" : "Interações AI Team", unitLabel: "", includedQuantity: 10000 },
                  { metricKey: "render_generation", metricLabel: "Renders arqdor.ai", unitLabel: "", includedQuantity: 30 },
                ]).map((quota) => (
                  <div key={quota.metricKey} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                    <span className="text-slate-600">{quota.metricLabel}</span><strong className="text-slate-950">{Number(quota.includedQuantity).toLocaleString(isSpanish ? "es" : "pt-BR")}/{isSpanish ? "mes" : "mês"}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{copy.modulesTitle}</h2>
            <p className="mt-3 leading-7 text-slate-600">{copy.modulesDescription}</p>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(moduleProducts.length ? moduleProducts : [
              { commercialKey: "vendor_agenda", name: "Vendor Agenda", monthlyPriceCents: 1990 },
              { commercialKey: "vendor_knowledge_ai", name: "Vendor Knowledge AI", monthlyPriceCents: 9900 },
              { commercialKey: "vendor_omnichannel", name: "Vendor Omnichannel", monthlyPriceCents: 19900 },
              { commercialKey: "vendor_gestao", name: "Vendor Gestão", monthlyPriceCents: 29900 },
              { commercialKey: "vendor_prospector", name: "Vendor Prospector", monthlyPriceCents: 39900 },
              { commercialKey: "vendor_content_studio", name: "Vendor Content Studio", monthlyPriceCents: 39900 },
              { commercialKey: "vendor_ai_team", name: "Vendor AI Team", monthlyPriceCents: 49900 },
              { commercialKey: "vendor_revenue_scout", name: "Vendor Revenue Scout", monthlyPriceCents: 49900 },
            ] as Array<Pick<CommercialProduct, "commercialKey" | "name" | "monthlyPriceCents">>).map((product) => (
              <article key={product.commercialKey ?? product.name} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="font-semibold text-slate-950">{product.name}</p>
                <p className="mt-2 text-lg font-semibold text-orange-600">{moneyFromCents(product.monthlyPriceCents)}/{isSpanish ? "mes" : "mês"}</p>
                <p className="mt-2 text-xs font-medium text-emerald-700">{isSpanish ? "Incluido en Growth" : "Incluído no Growth"}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-7 md:p-9">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl"><h2 className="text-2xl font-semibold text-slate-950">{copy.implementationTitle}</h2><p className="mt-2 leading-7 text-slate-600">{copy.implementationDescription}</p></div>
            <p className="shrink-0 text-3xl font-semibold text-slate-950">{implementationPrice}</p>
          </div>
        </section>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">{products.length ? copy.brl : `${copy.catalogFallback} ${copy.brl}`}</div>
      </main>
    </div>
  );
}
