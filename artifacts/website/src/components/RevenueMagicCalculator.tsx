import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Calculator,
  CircleDollarSign,
  MessageCircleMore,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const SEGMENTS_PT = ["Varejo", "Distribuição / Atacado", "Serviços", "Clínica / Saúde", "Automotivo", "Construção / Obras", "Indústria / B2B", "Outro"];
const SEGMENTS_ES = ["Retail", "Distribución / Mayorista", "Servicios", "Clínica / Salud", "Automotriz", "Construcción / Obras", "Industria / B2B", "Otro"];

const SCENARIOS = {
  conservative: { recovery: 10, uplift: 10, reactivation: 1 },
  probable: { recovery: 20, uplift: 20, reactivation: 2 },
  expansion: { recovery: 30, uplift: 35, reactivation: 4 },
} as const;

type ScenarioKey = keyof typeof SCENARIOS;

type NumericFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  hint?: string;
  min?: number;
  max?: number;
};

function NumericField({ label, value, onChange, suffix, hint, min = 0, max }: NumericFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
        <span>{label}</span>
        {suffix && <span className="text-xs font-normal text-slate-400">{suffix}</span>}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = Math.max(min, Number(event.target.value) || 0);
          onChange(max == null ? next : Math.min(max, next));
        }}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      />
      {hint && <span className="mt-1.5 block text-xs leading-5 text-slate-400">{hint}</span>}
    </label>
  );
}

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function number(value: number, locale: string, digits = 0) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

const PT = {
  kicker: "FÓRMULA R³ VENDORAI",
  title: "Descubra onde sua operação pode estar deixando receita na mesa.",
  description: "Uma simulação completa de atendimento, vendas, mídia, follow-up e carteira. Ajuste os dados do seu negócio e compare o cenário atual com oportunidades de Recuperar, Converter e Reativar.",
  business: "1. Operação atual",
  businessDesc: "Como sua equipe atende e vende hoje.",
  acquisition: "2. Demanda e investimento",
  acquisitionDesc: "Quanto você investe para gerar oportunidades e quanto pretende investir.",
  scenario: "3. Cenário R³",
  scenarioDesc: "Hipóteses visíveis e ajustáveis — não são promessa de resultado.",
  results: "Diagnóstico ao vivo",
  segment: "Segmento",
  businessDays: "Dias úteis no mês",
  sellers: "Vendedores / atendentes",
  contactsDay: "Atendimentos por dia",
  salesDay: "Vendas por dia",
  ticket: "Ticket médio",
  margin: "Margem média",
  revenueDay: "Faturamento por dia",
  revenueMonth: "Faturamento por mês",
  currentMedia: "Investimento atual em marketing/mês",
  plannedMedia: "Investimento pretendido em marketing/mês",
  cpl: "Custo médio por lead (CPL)",
  followup: "Leads com follow-up estruturado",
  customerBase: "Clientes na base",
  repurchaseTicket: "Ticket médio de recompra / upsell",
  vendorCost: "Investimento VendorAI para o cálculo",
  scenarioNames: { conservative: "Conservador", probable: "Provável", expansion: "Expansão" },
  recovery: "Recuperar leads desassistidos",
  uplift: "Melhoria relativa de conversão",
  reactivation: "Reativação / recompra da base",
  currentRevenue: "Faturamento mensal informado",
  currentLeads: "Leads pagos estimados/mês",
  plannedLeads: "Leads com a mídia pretendida",
  coverage: "Cobertura de follow-up",
  impliedConversion: "Conversão operacional",
  contactsSeller: "Atendimentos por vendedor/dia",
  salesSeller: "Vendas por vendedor/dia",
  revenueSeller: "Faturamento por vendedor/mês",
  r1: "R¹ Recuperar",
  r1Desc: "Receita simulada ao recuperar parte dos leads pagos que hoje ficam sem follow-up estruturado.",
  r2: "R² Converter",
  r2Desc: "Receita simulada pela melhoria relativa de conversão sobre os leads que já recebem acompanhamento.",
  r3: "R³ Reativar",
  r3Desc: "Receita simulada por recompra, reativação ou expansão da carteira existente.",
  hiddenRevenue: "Receita Oculta R³",
  incrementalProfit: "Margem incremental simulada",
  vendorRoi: "ROI simulado sobre VendorAI",
  paybackSales: "Vendas extras para pagar o VendorAI",
  newMediaRevenue: "Receita estimada da mídia adicional",
  projectedRevenue: "Faturamento potencial do cenário",
  diagnosis: "Leitura do cenário",
  disclaimer: "Simulação matemática baseada apenas nos valores informados e nas hipóteses selecionadas. Não é previsão, garantia de faturamento, lucro ou recuperação. O resultado real depende de mercado, oferta, equipe, dados, execução e configuração.",
  cta: "Testar 5 dias grátis com meus dados",
  reset: "Restaurar exemplo",
  mediaInsight: "Antes de aumentar a mídia, compare quanto da demanda atual ainda está fora de um processo estruturado.",
  extraLeads: "Novos leads estimados com o aumento de mídia",
};

const ES = {
  kicker: "FÓRMULA R³ VENDORAI",
  title: "Descubra dónde su operación puede estar dejando ingresos sobre la mesa.",
  description: "Una simulación completa de atención, ventas, medios, seguimiento y cartera. Ajuste los datos de su negocio y compare el escenario actual con oportunidades de Recuperar, Convertir y Reactivar.",
  business: "1. Operación actual",
  businessDesc: "Cómo su equipo atiende y vende hoy.",
  acquisition: "2. Demanda e inversión",
  acquisitionDesc: "Cuánto invierte para generar oportunidades y cuánto pretende invertir.",
  scenario: "3. Escenario R³",
  scenarioDesc: "Hipótesis visibles y ajustables — no son una promesa de resultados.",
  results: "Diagnóstico en vivo",
  segment: "Segmento",
  businessDays: "Días hábiles al mes",
  sellers: "Vendedores / agentes",
  contactsDay: "Atenciones por día",
  salesDay: "Ventas por día",
  ticket: "Ticket promedio",
  margin: "Margen promedio",
  revenueDay: "Facturación por día",
  revenueMonth: "Facturación por mes",
  currentMedia: "Inversión actual en marketing/mes",
  plannedMedia: "Inversión prevista en marketing/mes",
  cpl: "Costo promedio por lead (CPL)",
  followup: "Leads con seguimiento estructurado",
  customerBase: "Clientes en la base",
  repurchaseTicket: "Ticket promedio de recompra / upsell",
  vendorCost: "Inversión VendorAI para el cálculo",
  scenarioNames: { conservative: "Conservador", probable: "Probable", expansion: "Expansión" },
  recovery: "Recuperar leads desatendidos",
  uplift: "Mejora relativa de conversión",
  reactivation: "Reactivación / recompra de la base",
  currentRevenue: "Facturación mensual informada",
  currentLeads: "Leads pagos estimados/mes",
  plannedLeads: "Leads con la inversión prevista",
  coverage: "Cobertura de seguimiento",
  impliedConversion: "Conversión operativa",
  contactsSeller: "Atenciones por vendedor/día",
  salesSeller: "Ventas por vendedor/día",
  revenueSeller: "Facturación por vendedor/mes",
  r1: "R¹ Recuperar",
  r1Desc: "Ingreso simulado al recuperar parte de los leads pagos que hoy quedan sin seguimiento estructurado.",
  r2: "R² Convertir",
  r2Desc: "Ingreso simulado por la mejora relativa de conversión sobre los leads que ya reciben seguimiento.",
  r3: "R³ Reactivar",
  r3Desc: "Ingreso simulado por recompra, reactivación o expansión de la cartera existente.",
  hiddenRevenue: "Ingreso Oculto R³",
  incrementalProfit: "Margen incremental simulado",
  vendorRoi: "ROI simulado sobre VendorAI",
  paybackSales: "Ventas extra para pagar VendorAI",
  newMediaRevenue: "Ingreso estimado de la inversión adicional",
  projectedRevenue: "Facturación potencial del escenario",
  diagnosis: "Lectura del escenario",
  disclaimer: "Simulación matemática basada únicamente en los valores informados y las hipótesis seleccionadas. No es una previsión ni una garantía de facturación, beneficio o recuperación. El resultado real depende del mercado, oferta, equipo, datos, ejecución y configuración.",
  cta: "Probar 5 días gratis con mis datos",
  reset: "Restaurar ejemplo",
  mediaInsight: "Antes de aumentar la inversión en medios, compare cuánto de la demanda actual todavía está fuera de un proceso estructurado.",
  extraLeads: "Nuevos leads estimados con el aumento de inversión",
};

const INITIAL = {
  businessDays: 22,
  sellers: 5,
  contactsDay: 60,
  salesDay: 3,
  ticket: 4000,
  margin: 35,
  revenueDay: 12000,
  revenueMonth: 264000,
  currentMedia: 10500,
  plannedMedia: 15000,
  cpl: 35,
  followup: 40,
  customerBase: 800,
  repurchaseTicket: 2500,
  vendorCost: 990,
};

export default function RevenueMagicCalculator() {
  const { country, isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const segments = isSpanish ? SEGMENTS_ES : SEGMENTS_PT;
  const [segment, setSegment] = useState(segments[0]);
  const [businessDays, setBusinessDays] = useState(INITIAL.businessDays);
  const [sellers, setSellers] = useState(INITIAL.sellers);
  const [contactsDay, setContactsDay] = useState(INITIAL.contactsDay);
  const [salesDay, setSalesDay] = useState(INITIAL.salesDay);
  const [ticket, setTicket] = useState(INITIAL.ticket);
  const [margin, setMargin] = useState(INITIAL.margin);
  const [revenueDay, setRevenueDay] = useState(INITIAL.revenueDay);
  const [revenueMonth, setRevenueMonth] = useState(INITIAL.revenueMonth);
  const [currentMedia, setCurrentMedia] = useState(INITIAL.currentMedia);
  const [plannedMedia, setPlannedMedia] = useState(INITIAL.plannedMedia);
  const [cpl, setCpl] = useState(INITIAL.cpl);
  const [followup, setFollowup] = useState(INITIAL.followup);
  const [customerBase, setCustomerBase] = useState(INITIAL.customerBase);
  const [repurchaseTicket, setRepurchaseTicket] = useState(INITIAL.repurchaseTicket);
  const [vendorCost, setVendorCost] = useState(INITIAL.vendorCost);
  const [scenario, setScenario] = useState<ScenarioKey>("probable");
  const [recovery, setRecovery] = useState(SCENARIOS.probable.recovery);
  const [uplift, setUplift] = useState(SCENARIOS.probable.uplift);
  const [reactivation, setReactivation] = useState(SCENARIOS.probable.reactivation);

  const result = useMemo(() => {
    const safeSellers = Math.max(1, sellers);
    const days = Math.max(1, businessDays);
    const monthlyContacts = contactsDay * days;
    const monthlySales = salesDay * days;
    const informedRevenue = revenueMonth > 0 ? revenueMonth : revenueDay > 0 ? revenueDay * days : monthlySales * ticket;
    const closeRate = contactsDay > 0 ? Math.min(1, salesDay / contactsDay) : 0;
    const paidLeads = cpl > 0 ? currentMedia / cpl : 0;
    const plannedLeads = cpl > 0 ? plannedMedia / cpl : 0;
    const extraLeads = Math.max(0, plannedLeads - paidLeads);
    const followupRatio = Math.min(1, followup / 100);
    const uncoveredPaidLeads = paidLeads * (1 - followupRatio);

    const r1 = uncoveredPaidLeads * (recovery / 100) * closeRate * ticket;
    const r2 = paidLeads * followupRatio * closeRate * (uplift / 100) * ticket;
    const r3 = customerBase * (reactivation / 100) * repurchaseTicket;
    const hiddenRevenue = r1 + r2 + r3;
    const incrementalProfit = hiddenRevenue * (margin / 100);
    const roi = vendorCost > 0 ? ((incrementalProfit - vendorCost) / vendorCost) * 100 : 0;
    const contributionPerSale = ticket * (margin / 100);
    const paybackSales = contributionPerSale > 0 ? Math.ceil(vendorCost / contributionPerSale) : 0;
    const newMediaRevenue = extraLeads * closeRate * ticket;
    const projectedRevenue = informedRevenue + hiddenRevenue + newMediaRevenue;

    return {
      monthlyContacts,
      monthlySales,
      informedRevenue,
      closeRate,
      paidLeads,
      plannedLeads,
      extraLeads,
      uncoveredPaidLeads,
      contactsPerSeller: contactsDay / safeSellers,
      salesPerSeller: salesDay / safeSellers,
      revenuePerSeller: informedRevenue / safeSellers,
      r1,
      r2,
      r3,
      hiddenRevenue,
      incrementalProfit,
      roi,
      paybackSales,
      newMediaRevenue,
      projectedRevenue,
      uncoveredMediaValue: uncoveredPaidLeads * cpl,
    };
  }, [businessDays, sellers, contactsDay, salesDay, ticket, margin, revenueDay, revenueMonth, currentMedia, plannedMedia, cpl, followup, customerBase, repurchaseTicket, vendorCost, recovery, uplift, reactivation]);

  function applyScenario(key: ScenarioKey) {
    setScenario(key);
    setRecovery(SCENARIOS[key].recovery);
    setUplift(SCENARIOS[key].uplift);
    setReactivation(SCENARIOS[key].reactivation);
  }

  function reset() {
    setSegment(segments[0]);
    setBusinessDays(INITIAL.businessDays);
    setSellers(INITIAL.sellers);
    setContactsDay(INITIAL.contactsDay);
    setSalesDay(INITIAL.salesDay);
    setTicket(INITIAL.ticket);
    setMargin(INITIAL.margin);
    setRevenueDay(INITIAL.revenueDay);
    setRevenueMonth(INITIAL.revenueMonth);
    setCurrentMedia(INITIAL.currentMedia);
    setPlannedMedia(INITIAL.plannedMedia);
    setCpl(INITIAL.cpl);
    setFollowup(INITIAL.followup);
    setCustomerBase(INITIAL.customerBase);
    setRepurchaseTicket(INITIAL.repurchaseTicket);
    setVendorCost(INITIAL.vendorCost);
    applyScenario("probable");
  }

  const diagnosis = (() => {
    if (followup < 60) {
      return isSpanish
        ? `El principal punto de atención es el seguimiento: ${number(result.uncoveredPaidLeads, country.locale)} leads pagos estimados quedan fuera de una cobertura estructurada, asociados a ${money(result.uncoveredMediaValue, country.locale)} de adquisición.`
        : `O principal ponto de atenção é o follow-up: ${number(result.uncoveredPaidLeads, country.locale)} leads pagos estimados ficam fora de uma cobertura estruturada, associados a ${money(result.uncoveredMediaValue, country.locale)} de aquisição.`;
    }
    if (result.contactsPerSeller > 25) {
      return isSpanish
        ? `La operación concentra ${number(result.contactsPerSeller, country.locale, 1)} atenciones por vendedor/día. Automatización, priorización y enrutamiento pueden aliviar capacidad antes de ampliar el equipo.`
        : `A operação concentra ${number(result.contactsPerSeller, country.locale, 1)} atendimentos por vendedor/dia. Automação, priorização e roteamento podem aliviar capacidade antes de ampliar a equipe.`;
    }
    if (customerBase > result.paidLeads * 4) {
      return isSpanish
        ? `Su base instalada es grande frente al volumen mensual de adquisición. El mayor potencial del escenario puede estar en recompra, reactivación y expansión de cartera.`
        : `Sua base instalada é grande em relação ao volume mensal de aquisição. O maior potencial do cenário pode estar em recompra, reativação e expansão da carteira.`;
    }
    return isSpanish
      ? "El escenario muestra una operación relativamente equilibrada. Compare la mejora de conversión con el aumento de inversión antes de comprar más demanda."
      : "O cenário mostra uma operação relativamente equilibrada. Compare o ganho de conversão com o aumento de mídia antes de comprar mais demanda.";
  })();

  return (
    <section id="simulador-r3" className="border-y border-slate-200 bg-[#f7f7f5] py-20 md:py-28">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.17em] text-orange-700">
            <Sparkles className="h-4 w-4" /> {copy.kicker}
          </div>
          <h2 className="mt-5 text-4xl font-semibold tracking-[-0.045em] text-slate-950 md:text-6xl">{copy.title}</h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">{copy.description}</p>
        </div>

        <div className="mt-12 grid gap-7 xl:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><BriefcaseBusiness className="h-5 w-5" /></div>
                <div><h3 className="text-xl font-semibold text-slate-950">{copy.business}</h3><p className="mt-1 text-sm text-slate-500">{copy.businessDesc}</p></div>
              </div>
              <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">{copy.segment}</span>
                  <select value={segment} onChange={(e) => setSegment(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
                    {segments.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <NumericField label={copy.businessDays} value={businessDays} onChange={setBusinessDays} max={31} />
                <NumericField label={copy.sellers} value={sellers} onChange={setSellers} min={1} />
                <NumericField label={copy.contactsDay} value={contactsDay} onChange={setContactsDay} />
                <NumericField label={copy.salesDay} value={salesDay} onChange={setSalesDay} />
                <NumericField label={copy.ticket} value={ticket} onChange={setTicket} suffix="R$" />
                <NumericField label={copy.margin} value={margin} onChange={setMargin} suffix="%" max={100} />
                <NumericField label={copy.revenueDay} value={revenueDay} onChange={setRevenueDay} suffix="R$" />
                <NumericField label={copy.revenueMonth} value={revenueMonth} onChange={setRevenueMonth} suffix="R$" />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Target className="h-5 w-5" /></div>
                <div><h3 className="text-xl font-semibold text-slate-950">{copy.acquisition}</h3><p className="mt-1 text-sm text-slate-500">{copy.acquisitionDesc}</p></div>
              </div>
              <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <NumericField label={copy.currentMedia} value={currentMedia} onChange={setCurrentMedia} suffix="R$" />
                <NumericField label={copy.plannedMedia} value={plannedMedia} onChange={setPlannedMedia} suffix="R$" />
                <NumericField label={copy.cpl} value={cpl} onChange={setCpl} suffix="R$" />
                <NumericField label={copy.followup} value={followup} onChange={setFollowup} suffix="%" max={100} />
                <NumericField label={copy.customerBase} value={customerBase} onChange={setCustomerBase} />
                <NumericField label={copy.repurchaseTicket} value={repurchaseTicket} onChange={setRepurchaseTicket} suffix="R$" />
              </div>
              <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
                <div className="flex items-start gap-3"><CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" /><div><p className="text-sm font-semibold text-slate-900">{copy.mediaInsight}</p><p className="mt-1 text-sm text-slate-600">{copy.extraLeads}: <strong>{number(result.extraLeads, country.locale)}</strong></p></div></div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><TrendingUp className="h-5 w-5" /></div>
                <div><h3 className="text-xl font-semibold text-slate-950">{copy.scenario}</h3><p className="mt-1 text-sm text-slate-500">{copy.scenarioDesc}</p></div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5">
                {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
                  <button key={key} type="button" onClick={() => applyScenario(key)} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scenario === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{copy.scenarioNames[key]}</button>
                ))}
              </div>

              <div className="mt-7 grid gap-6 md:grid-cols-3">
                {[
                  [copy.recovery, recovery, setRecovery, 50],
                  [copy.uplift, uplift, setUplift, 60],
                  [copy.reactivation, reactivation, setReactivation, 15],
                ].map(([label, value, setter, max]) => (
                  <label key={String(label)} className="block rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-700">{String(label)}</span><strong className="text-orange-600">{Number(value)}%</strong></div>
                    <input type="range" min="0" max={Number(max)} value={Number(value)} onChange={(e) => { (setter as (v: number) => void)(Number(e.target.value)); setScenario("probable"); }} className="mt-4 w-full accent-orange-600" />
                  </label>
                ))}
              </div>

              <label className="mt-6 block max-w-md">
                <span className="mb-2 block text-sm font-medium text-slate-700">{copy.vendorCost}</span>
                <select value={vendorCost} onChange={(e) => setVendorCost(Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
                  <option value={399}>R$ 399 — bloco adicional de 5 dias</option>
                  <option value={497}>R$ 497 — primeiros 30 dias pagos</option>
                  <option value={990}>R$ 990 — próximos 5 meses</option>
                  <option value={1490}>R$ 1.490 — recorrência posterior</option>
                </select>
              </label>
            </div>
          </div>

          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="overflow-hidden rounded-[30px] bg-[#0b1220] text-white shadow-[0_28px_80px_rgba(15,23,42,0.20)]">
              <div className="border-b border-white/10 p-6 md:p-7">
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-orange-300">{copy.results}</p><p className="mt-1 text-sm text-slate-400">{segment}</p></div><Calculator className="h-6 w-6 text-orange-300" /></div>
              </div>

              <div className="p-6 md:p-7">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [copy.currentRevenue, money(result.informedRevenue, country.locale)],
                    [copy.currentLeads, number(result.paidLeads, country.locale)],
                    [copy.plannedLeads, number(result.plannedLeads, country.locale)],
                    [copy.impliedConversion, `${number(result.closeRate * 100, country.locale, 1)}%`],
                    [copy.contactsSeller, number(result.contactsPerSeller, country.locale, 1)],
                    [copy.salesSeller, number(result.salesPerSeller, country.locale, 1)],
                    [copy.revenueSeller, money(result.revenuePerSeller, country.locale)],
                    [copy.coverage, `${number(followup, country.locale)}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs leading-5 text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>
                  ))}
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    [copy.r1, copy.r1Desc, result.r1, "bg-orange-400"],
                    [copy.r2, copy.r2Desc, result.r2, "bg-blue-400"],
                    [copy.r3, copy.r3Desc, result.r3, "bg-emerald-400"],
                  ].map(([label, desc, value, bar]) => {
                    const share = result.hiddenRevenue > 0 ? (Number(value) / result.hiddenRevenue) * 100 : 0;
                    return <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-4"><p className="font-semibold">{String(label)}</p><p className="font-semibold">{money(Number(value), country.locale)}</p></div><p className="mt-1 text-xs leading-5 text-slate-500">{String(desc)}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, share)}%` }} /></div></div>;
                  })}
                </div>

                <div className="mt-6 rounded-[24px] border border-orange-400/20 bg-orange-400/[0.08] p-5">
                  <div className="flex items-center gap-2 text-orange-200"><Sparkles className="h-5 w-5" /><p className="text-sm font-semibold">{copy.hiddenRevenue}</p></div>
                  <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white">{money(result.hiddenRevenue, country.locale)}</p>
                  <p className="mt-2 text-xs text-slate-400">R¹ + R² + R³ no cenário selecionado</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-slate-500">{copy.incrementalProfit}</p><p className="mt-2 text-xl font-semibold">{money(result.incrementalProfit, country.locale)}</p></div>
                  <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-slate-500">{copy.vendorRoi}</p><p className={`mt-2 text-xl font-semibold ${result.roi >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{number(result.roi, country.locale, 0)}%</p></div>
                  <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-slate-500">{copy.paybackSales}</p><p className="mt-2 text-xl font-semibold">{result.paybackSales}</p></div>
                  <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-slate-500">{copy.newMediaRevenue}</p><p className="mt-2 text-xl font-semibold">{money(result.newMediaRevenue, country.locale)}</p></div>
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4"><p className="text-xs text-emerald-300">{copy.projectedRevenue}</p><p className="mt-1 text-2xl font-semibold text-white">{money(result.projectedRevenue, country.locale)}</p></div>

                <div className="mt-5 rounded-2xl border border-blue-400/15 bg-blue-400/[0.05] p-4"><div className="flex items-start gap-3"><BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" /><div><p className="text-sm font-semibold text-blue-100">{copy.diagnosis}</p><p className="mt-1 text-sm leading-6 text-slate-400">{diagnosis}</p></div></div></div>

                <p className="mt-5 text-[11px] leading-5 text-slate-500">{copy.disclaimer}</p>
                <Link href="/demo" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-500">{copy.cta}<ArrowRight className="h-4 w-4" /></Link>
                <button type="button" onClick={reset} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.05]"><RefreshCcw className="h-4 w-4" />{copy.reset}</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
