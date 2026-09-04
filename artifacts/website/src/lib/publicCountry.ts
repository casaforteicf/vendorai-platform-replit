import { useEffect, useState } from "react";
import {
  MARKETING_VERTICALS,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";
import { localizeMarketingVertical } from "@workspace/vendor-brain/marketing-verticals-localization";

export const PUBLIC_COUNTRIES = {
  BR: { label: "Brasil", locale: "pt-BR", short: "BR", phone: "+55 49 99999-9999" },
  PY: { label: "Paraguay", locale: "es-PY", short: "PY", phone: "+595 981 234567" },
  AR: { label: "Argentina", locale: "es-AR", short: "AR", phone: "+54 9 11 1234-5678" },
  UY: { label: "Uruguay", locale: "es-UY", short: "UY", phone: "+598 99 123 456" },
  CL: { label: "Chile", locale: "es-CL", short: "CL", phone: "+56 9 1234 5678" },
} as const;

export type PublicCountryCode = keyof typeof PUBLIC_COUNTRIES;

const STORAGE_KEY = "vendorai_public_country";
const CHANGE_EVENT = "vendorai:public-country-change";

const SPANISH_PRESENTATION_REPLACEMENTS: Array<[string, string]> = [
  ["móveis planejados", "muebles a medida"],
  ["materiais de construção", "materiales de construcción"],
  ["gestão de carteira", "gestión de cartera"], ["gestão carteira", "gestión de cartera"],
  ["gestão de leads", "gestión de leads"], ["gestão leads", "gestión de leads"],
  ["gestão de atendimento", "gestión de atención"], ["gestão atendimento", "gestión de atención"],
  ["gestão de propostas", "gestión de propuestas"], ["gestão propostas", "gestión de propuestas"],
  ["gestão de distribuidores", "gestión de distribuidores"], ["gestão distribuidores", "gestión de distribuidores"],
  ["automação comercial", "automatización comercial"],
  ["automação de vendas", "automatización de ventas"], ["automação vendas", "automatización de ventas"],
  ["automação de atendimento", "automatización de atención"], ["automação atendimento", "automatización de atención"],
  ["automação de agenda", "automatización de agenda"], ["automação agenda", "automatización de agenda"],
  ["automação de marketing", "automatización de marketing"], ["automação marketing", "automatización de marketing"],
  ["aumentar recompra", "aumentar la recompra"],
  ["follow up orçamento", "seguimiento de cotización"],
  ["follow up propostas", "seguimiento de propuestas"],
  ["follow up cotação", "seguimiento de cotización"],
  ["loja de roupas", "tienda de ropa"], ["loja de móveis", "tienda de muebles"],
  ["loja construção", "tienda de construcción"], ["loja de carros", "tienda de autos"],
  ["distribuidora construção", "distribuidora de construcción"],
  ["orçamentos", "cotizaciones"],
  ["orçamento esquecido", "cotización olvidada"],
  ["orçamento acompanhado", "cotización acompañada"],
  ["proposta esquecida", "propuesta olvidada"],
  ["cliente sumiu", "cliente dejó de responder"],
  ["produto acabou", "producto se terminó"],
  ["histórico parado", "historial sin activar"],
  ["campanha genérica", "campaña genérica"],
  ["campanha contextual", "campaña contextual"],
  ["mapa da obra", "mapa de la obra"],
  ["tempo de resposta", "tiempo de respuesta"],
  ["tempo de decisão", "tiempo de decisión"],
  ["taxa de recompra", "tasa de recompra"],
  ["concessionárias", "concesionarias"], ["concessionária", "concesionaria"],
  ["indústria de", "industria de"], ["indústria ", "industria "],
  ["marcenaria", "carpintería"], ["contabilidade", "contabilidad"],
  ["advocacia", "servicios jurídicos"], ["joalheria", "joyería"], ["ótica", "óptica"],
  ["móveis", "muebles"], ["construção", "construcción"], ["eletrônicos", "electrónica"],
  ["caminhões", "camiones"], ["embalagens", "envases"], ["esquadrias", "aberturas"],
  ["fidelização", "fidelización"], ["automação", "automatización"], ["gestão", "gestión"],
  ["vendas", "ventas"], ["venda", "venta"], ["carteira", "cartera"],
  ["orçamento", "cotización"], ["cotação", "cotización"], ["cotações", "cotizaciones"],
  ["reposição", "reposición"], ["renovação", "renovación"], ["manutenção", "mantenimiento"],
  ["revisão", "revisión"], ["frequência", "frecuencia"], ["sazonalidade", "estacionalidad"],
  ["indicação", "referencia"], ["acessórios", "accesorios"], ["peças", "piezas"],
  ["ração", "alimento"], ["banho", "baño"], ["tosa", "peluquería"], ["vacina", "vacuna"],
  ["óculos solar", "gafas de sol"], ["ferragens", "herrajes"], ["chapas", "tableros"],
  ["acabamentos", "terminaciones"], ["puxadores", "tiradores"], ["folha", "nómina"],
  ["nova residência", "nueva residencia"], ["novo imóvel", "nuevo inmueble"],
  ["nova empresa", "nueva empresa"], ["nova equipe", "nuevo equipo"], ["nova unidade", "nueva unidad"],
  ["novo produto", "nuevo producto"], ["nova coleção", "nueva colección"], ["novo projeto", "nuevo proyecto"],
  ["nova aplicação", "nueva aplicación"], ["novo componente", "nuevo componente"], ["nova linha", "nueva línea"],
  ["novo lote", "nuevo lote"], ["nova peça", "nueva pieza"],
  ["relacionamento", "relación"], ["campanha", "campaña"], ["histórico", "historial"],
  ["produto", "producto"], ["projeto", "proyecto"], ["serviço", "servicio"],
  ["avaliação", "evaluación"], ["atendimento", "atención"], ["receita", "ingresos"],
  ["retenção", "retención"], ["reativação", "reactivación"], ["agendamentos", "citas"],
  ["comparecimento", "asistencia"], ["taxa", "tasa"], ["tempo", "tiempo"],
  ["acionar", "activar"], ["acompanhar", "acompañar"], ["antecipar", "anticipar"],
  ["lembrar", "recordar"], ["ofertar", "ofrecer"], ["reativar", "reactivar"],
  ["planejar", "planificar"], ["propor", "proponer"], ["lançar", "lanzar"], ["sinalizar", "señalar"],
  ["cotizacións", "cotizaciones"],
];

function polishSpanishPresentationText(value: string): string {
  let result = value;
  for (const [from, to] of SPANISH_PRESENTATION_REPLACEMENTS) {
    result = result.split(from).join(to);
    const capitalizedFrom = from.charAt(0).toUpperCase() + from.slice(1);
    const capitalizedTo = to.charAt(0).toUpperCase() + to.slice(1);
    result = result.split(capitalizedFrom).join(capitalizedTo);
  }
  return result;
}

function polishSpanishProfile(profile: MarketingVerticalProfile): MarketingVerticalProfile {
  const polish = (values: string[]) => values.map(polishSpanishPresentationText);
  return {
    ...profile,
    decisionMakers: polish(profile.decisionMakers),
    journey: polish(profile.journey),
    pipeline: polish(profile.pipeline),
    priorityAgents: polish(profile.priorityAgents),
    lp: {
      ...profile.lp,
      painMap: polish(profile.lp.painMap),
      timeline: profile.lp.timeline.map((step) => ({
        ...step,
        label: polishSpanishPresentationText(step.label),
        description: step.description ? polishSpanishPresentationText(step.description) : undefined,
      })),
    },
    revenueScout: {
      signals: polish(profile.revenueScout.signals),
      nextBestActions: polish(profile.revenueScout.nextBestActions),
    },
    googleIntentSeeds: polish(profile.googleIntentSeeds),
    creativeAngles: polish(profile.creativeAngles),
    kpis: polish(profile.kpis),
  };
}

function cloneVerticalProfile(profile: MarketingVerticalProfile): MarketingVerticalProfile {
  return {
    ...profile,
    decisionMakers: [...profile.decisionMakers],
    journey: [...profile.journey],
    pipeline: [...profile.pipeline],
    priorityAgents: [...profile.priorityAgents],
    lp: {
      ...profile.lp,
      painMap: [...profile.lp.painMap],
      timeline: profile.lp.timeline.map((step) => ({ ...step })),
      faq: [...profile.lp.faq],
    },
    revenueScout: {
      signals: [...profile.revenueScout.signals],
      nextBestActions: [...profile.revenueScout.nextBestActions],
    },
    googleIntentSeeds: [...profile.googleIntentSeeds],
    creativeAngles: [...profile.creativeAngles],
    kpis: [...profile.kpis],
  };
}

const ORIGINAL_MARKETING_VERTICALS = MARKETING_VERTICALS.map(cloneVerticalProfile);
let appliedMarketingLocale = "pt-BR";

function applyPublicMarketingLocale(locale: string) {
  if (appliedMarketingLocale === locale) return;

  ORIGINAL_MARKETING_VERTICALS.forEach((original, index) => {
    const localized = localizeMarketingVertical(original, locale);
    const presentation = locale.startsWith("es") ? polishSpanishProfile(localized) : localized;
    const target = MARKETING_VERTICALS[index];
    if (!target) return;
    Object.assign(target, cloneVerticalProfile(presentation));
  });

  appliedMarketingLocale = locale;
}

function isPublicCountryCode(value: string | null | undefined): value is PublicCountryCode {
  return Boolean(value && value in PUBLIC_COUNTRIES);
}

export function detectPublicCountry(): PublicCountryCode {
  if (typeof window === "undefined") return "BR";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isPublicCountryCode(stored)) return stored;

  const locale = window.navigator.language.toLowerCase();
  if (locale.includes("es-py")) return "PY";
  if (locale.includes("es-ar")) return "AR";
  if (locale.includes("es-uy")) return "UY";
  if (locale.includes("es-cl")) return "CL";
  return "BR";
}

export function persistPublicCountry(countryCode: PublicCountryCode) {
  if (typeof window === "undefined") return;
  const locale = PUBLIC_COUNTRIES[countryCode].locale;
  applyPublicMarketingLocale(locale);
  window.localStorage.setItem(STORAGE_KEY, countryCode);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: countryCode }));
  document.documentElement.lang = locale;
}

export function usePublicCountry() {
  const [countryCode, setCountryCodeState] = useState<PublicCountryCode>(detectPublicCountry);
  const locale = PUBLIC_COUNTRIES[countryCode].locale;

  // The website consumes the canonical 50-profile array in many places. Applying
  // the presentation overlay synchronously here keeps those existing consumers
  // reactive without creating a second catalog or changing ids/slugs/pipelines.
  applyPublicMarketingLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;

    const sync = () => setCountryCodeState(detectPublicCountry());
    const onCustomChange = (event: Event) => {
      const next = (event as CustomEvent<PublicCountryCode>).detail;
      if (isPublicCountryCode(next)) setCountryCodeState(next);
    };

    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, onCustomChange);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, onCustomChange);
    };
  }, [locale]);

  function setCountryCode(next: PublicCountryCode) {
    persistPublicCountry(next);
    setCountryCodeState(next);
  }

  return {
    countryCode,
    setCountryCode,
    country: PUBLIC_COUNTRIES[countryCode],
    isSpanish: countryCode !== "BR",
  };
}
