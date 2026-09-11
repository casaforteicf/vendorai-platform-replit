import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Clock, Users, Zap } from "lucide-react";
import { Link } from "wouter";
import {
  getAdDataConsentState,
  getLaunchAttribution,
  setAdDataConsent,
  type LaunchAttribution,
} from "@/lib/launchAttribution";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";
import {
  MARKETING_VERTICALS,
  resolveMarketingVertical,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";
import publicVerticalSlugs from "@/data/publicVerticalSlugs.json";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const CRM_BASE = (import.meta.env.VITE_CRM_URL || "https://app.appvendorai.com").replace(/\/$/, "");

type TrialForm = {
  countryCode: PublicCountryCode;
  nomeEmpresa: string;
  nomePessoa: string;
  email: string;
  senha: string;
  telefone: string;
  segmento: string;
  nicho: string;
  produtosServicos: string;
  clienteIdeal: string;
  objetivoPrincipal: string;
  dorPrincipal: string;
  canalPrincipal: string;
  regiaoAtuacao: string;
  volumeLeads: string;
  tamanhoEquipe: string;
  adDataConsent: boolean;
};

type EntryContext = {
  source: "vertical-lp" | "campaign" | "direct";
  intent?: string;
  verticalId?: string;
  verticalSlug?: string;
  verticalName?: string;
  macrosegment?: string;
  landingPageSlug?: string;
  entryUrl?: string;
};

const publicSlugOverrides = publicVerticalSlugs as Record<string, string>;

function publicSlugFor(profile: MarketingVerticalProfile): string {
  return publicSlugOverrides[profile.id] ?? profile.slug;
}

function profileFromLandingPageSlug(slug?: string): MarketingVerticalProfile | undefined {
  if (!slug) return undefined;
  return MARKETING_VERTICALS.find((profile) => publicSlugFor(profile) === slug);
}

function readEntryContext(): EntryContext {
  if (typeof window === "undefined") return { source: "direct" };

  const url = new URL(window.location.href);
  const verticalId = url.searchParams.get("vertical_id");
  const verticalValue = url.searchParams.get("vertical");
  const intent = url.searchParams.get("intent") ?? undefined;
  const attribution = getLaunchAttribution();

  let referrerUrl: URL | null = null;
  let referrerLpSlug: string | undefined;
  try {
    if (document.referrer) {
      referrerUrl = new URL(document.referrer);
      const match = referrerUrl.pathname.match(/^\/lp\/([^/?#]+)/);
      if (match?.[1]) referrerLpSlug = match[1];
    }
  } catch {
    referrerUrl = null;
  }

  const profile =
    (verticalId ? resolveMarketingVertical(verticalId) : undefined)
    ?? profileFromLandingPageSlug(referrerLpSlug)
    ?? (verticalValue ? resolveMarketingVertical(verticalValue) : undefined);

  const landingPageSlug = referrerLpSlug ?? attribution.landingPageSlug ?? (profile ? publicSlugFor(profile) : undefined);
  const entryUrl = referrerLpSlug && referrerUrl ? referrerUrl.toString() : attribution.pageUrl;
  const hasCampaign = Boolean(
    attribution.utmSource
      || attribution.utmMedium
      || attribution.utmCampaign
      || attribution.gclid
      || attribution.fbclid,
  );

  return {
    source: profile ? "vertical-lp" : hasCampaign ? "campaign" : "direct",
    intent: intent ?? (profile ? "demo" : undefined),
    verticalId: profile?.id,
    verticalSlug: profile?.slug,
    verticalName: profile?.name,
    macrosegment: profile?.macrosegment,
    landingPageSlug,
    entryUrl,
  };
}

function attributionWithEntryContext(context: EntryContext): LaunchAttribution {
  const attribution = getLaunchAttribution();
  return {
    ...attribution,
    ...(context.entryUrl ? { pageUrl: context.entryUrl } : {}),
    ...(context.landingPageSlug ? { landingPageSlug: context.landingPageSlug } : {}),
  };
}

const initialForm = (countryCode: PublicCountryCode): TrialForm => ({
  countryCode,
  nomeEmpresa: "",
  nomePessoa: "",
  email: "",
  senha: "",
  telefone: "",
  segmento: "",
  nicho: "",
  produtosServicos: "",
  clienteIdeal: "",
  objetivoPrincipal: "",
  dorPrincipal: "",
  canalPrincipal: "",
  regiaoAtuacao: "",
  volumeLeads: "",
  tamanhoEquipe: "",
  adDataConsent: getAdDataConsentState()?.granted ?? false,
});

const PT = {
  requiredStep1: "Preencha os campos obrigatórios para continuar",
  requiredStep2: "Conte um pouco mais sobre seu negócio",
  passwordRequired: "Crie uma senha para ativar seu teste",
  passwordMin: "A senha deve ter pelo menos 8 caracteres",
  accountError: "Erro ao criar conta",
  createdTitle: "Seu teste foi criado!",
  createdDescription: "Redirecionando para o VendorAI...",
  connectionError: "Erro de conexão",
  tryAgain: "Tente novamente.",
  defaultWarmMessage: "Iniciou o cadastro para o trial de 5 dias do VendorAI.",
  contextDetected: "Contexto reconhecido",
  contextDetectedText: (name: string) => `Você veio pela experiência de ${name}. O mesmo acesso VendorAI será preparado com esse contexto.`,
  details: {
    country: "País",
    segment: "Segmento",
    niche: "Nicho",
    products: "Produtos/serviços",
    idealCustomer: "Cliente ideal",
    objective: "Objetivo",
    pain: "Principal dificuldade",
    channel: "Canal principal",
    region: "Região",
    volume: "Volume aproximado de leads/mês",
    team: "Equipe comercial/atendimento",
  },
  featureTexts: [
    "VendorAI preparado para o seu segmento",
    "Até 3 usuários no teste",
    "Canais e automações para acompanhar seus leads",
    "5 dias de acesso completo",
  ],
  heroTitle: "Prepare o VendorAI para o seu negócio.",
  heroDescription: "Em poucos passos entendemos sua operação para que você não entre em um sistema vazio.",
  stepAria: "Etapa",
  stepTitles: ["Vamos conhecer você", "Personalize sua demonstração", "Ative seus 5 dias grátis"],
  stepDescriptions: [
    "Só o essencial agora. O restante será enriquecido conforme você avançar.",
    "Essas respostas ajudam a IA a preparar uma experiência relevante para sua empresa.",
    "Sem cobrança durante o teste. Sua configuração seguirá com você se decidir continuar.",
  ],
  country: "País *",
  company: "Nome da empresa *",
  companyPlaceholder: "Ex: Construtora Horizonte",
  name: "Seu nome *",
  namePlaceholder: "Ex: João Silva",
  whatsapp: "WhatsApp *",
  email: "E-mail *",
  segment: "Segmento *",
  segmentPlaceholder: "Ex: materiais de construção, seguros, piscinas",
  niche: "Nicho / especialidade",
  nichePlaceholder: "Ex: pisos e revestimentos",
  region: "Cidade / região de atuação",
  regionPlaceholder: "Ex: Chapecó e região",
  products: "O que sua empresa vende ou oferece? *",
  productsPlaceholder: "Principais produtos ou serviços",
  idealCustomer: "Quem é seu principal cliente?",
  idealCustomerPlaceholder: "Ex: construtoras, consumidor final, indústrias",
  objective: "O que você quer melhorar primeiro? *",
  objectivePlaceholder: "Ex: responder mais rápido e converter mais",
  pain: "Qual a maior dificuldade hoje? *",
  painPlaceholder: "Ex: leads esfriam antes do vendedor responder",
  mainChannel: "Canal principal",
  leadsMonth: "Leads / mês",
  team: "Equipe",
  select: "Selecione",
  phoneChannel: "Telefone",
  inPerson: "Presencial",
  others: "Outros",
  upTo50: "Até 50",
  moreThan1000: "Mais de 1.000",
  onePerson: "1 pessoa",
  moreThan50: "Mais de 50",
  readyTitle: "Pré-personalização pronta.",
  readyText: "Vamos usar seu segmento, oferta, objetivo e dificuldade para orientar seu primeiro acesso.",
  password: "Crie sua senha *",
  passwordPlaceholder: "Mínimo 8 caracteres",
  optional: "Opcional:",
  consent: "autorizo o VendorAI a usar dados de conversão e identificadores protegidos para medir e otimizar campanhas.",
  privacy: "Política de Privacidade",
  back: "Voltar",
  continue: "Continuar",
  creating: "Criando seu teste...",
  startTrial: "Começar meus 5 dias grátis",
  termsPrefix: "Ao criar a conta, você concorda com os",
  terms: "Termos de Uso",
  termsJoin: "e reconhece a",
  duringTrial: "Durante o teste você recebe:",
  freeTrial: "Os 5 dias são gratuitos e não há cobrança durante o teste.",
  contextNote: "As respostas desta etapa servem para pré-configurar a experiência e também ajudam nossa equipe a entender o contexto da sua empresa.",
} as const;

const ES = {
  requiredStep1: "Completa los campos obligatorios para continuar",
  requiredStep2: "Cuéntanos un poco más sobre tu negocio",
  passwordRequired: "Crea una contraseña para activar tu prueba",
  passwordMin: "La contraseña debe tener al menos 8 caracteres",
  accountError: "Error al crear la cuenta",
  createdTitle: "¡Tu prueba fue creada!",
  createdDescription: "Redirigiendo a VendorAI...",
  connectionError: "Error de conexión",
  tryAgain: "Inténtalo nuevamente.",
  defaultWarmMessage: "Inició el registro para la prueba de 5 días de VendorAI.",
  contextDetected: "Contexto reconocido",
  contextDetectedText: (name: string) => `Llegaste desde la experiencia de ${name}. El mismo acceso VendorAI se preparará con ese contexto.`,
  details: {
    country: "País",
    segment: "Segmento",
    niche: "Nicho",
    products: "Productos/servicios",
    idealCustomer: "Cliente ideal",
    objective: "Objetivo",
    pain: "Principal dificultad",
    channel: "Canal principal",
    region: "Región",
    volume: "Volumen aproximado de leads/mes",
    team: "Equipo comercial/atención",
  },
  featureTexts: [
    "VendorAI preparado para tu segmento",
    "Hasta 3 usuarios durante la prueba",
    "Canales y automatizaciones para acompañar tus leads",
    "5 días de acceso completo",
  ],
  heroTitle: "Prepara VendorAI para tu negocio.",
  heroDescription: "En pocos pasos entendemos tu operación para que no ingreses a un sistema vacío.",
  stepAria: "Paso",
  stepTitles: ["Queremos conocerte", "Personaliza tu demostración", "Activa tus 5 días gratis"],
  stepDescriptions: [
    "Solo lo esencial por ahora. El resto se enriquecerá a medida que avances.",
    "Estas respuestas ayudan a la IA a preparar una experiencia relevante para tu empresa.",
    "Sin cobro durante la prueba. Tu configuración continuará contigo si decides seguir.",
  ],
  country: "País *",
  company: "Nombre de la empresa *",
  companyPlaceholder: "Ej.: Comercial Horizonte",
  name: "Tu nombre *",
  namePlaceholder: "Ej.: Juan Pérez",
  whatsapp: "WhatsApp *",
  email: "Correo electrónico *",
  segment: "Segmento *",
  segmentPlaceholder: "Ej.: materiales de construcción, seguros, piscinas",
  niche: "Nicho / especialidad",
  nichePlaceholder: "Ej.: pisos y revestimientos",
  region: "Ciudad / región de actuación",
  regionPlaceholder: "Ej.: Asunción y alrededores",
  products: "¿Qué vende u ofrece tu empresa? *",
  productsPlaceholder: "Principales productos o servicios",
  idealCustomer: "¿Quién es tu principal cliente?",
  idealCustomerPlaceholder: "Ej.: constructoras, consumidor final, industrias",
  objective: "¿Qué quieres mejorar primero? *",
  objectivePlaceholder: "Ej.: responder más rápido y convertir más",
  pain: "¿Cuál es la mayor dificultad hoy? *",
  painPlaceholder: "Ej.: los leads se enfrían antes de recibir respuesta",
  mainChannel: "Canal principal",
  leadsMonth: "Leads / mes",
  team: "Equipo",
  select: "Selecciona",
  phoneChannel: "Teléfono",
  inPerson: "Presencial",
  others: "Otros",
  upTo50: "Hasta 50",
  moreThan1000: "Más de 1.000",
  onePerson: "1 persona",
  moreThan50: "Más de 50",
  readyTitle: "Prepersonalización lista.",
  readyText: "Usaremos tu segmento, oferta, objetivo y dificultad para orientar tu primer acceso.",
  password: "Crea tu contraseña *",
  passwordPlaceholder: "Mínimo 8 caracteres",
  optional: "Opcional:",
  consent: "autorizo a VendorAI a utilizar datos de conversión e identificadores protegidos para medir y optimizar campañas.",
  privacy: "Política de Privacidad",
  back: "Volver",
  continue: "Continuar",
  creating: "Creando tu prueba...",
  startTrial: "Comenzar mis 5 días gratis",
  termsPrefix: "Al crear la cuenta, aceptas los",
  terms: "Términos de Uso",
  termsJoin: "y reconoces la",
  duringTrial: "Durante la prueba recibes:",
  freeTrial: "Los 5 días son gratuitos y no hay cobro durante la prueba.",
  contextNote: "Las respuestas de esta etapa sirven para preconfigurar la experiencia y también ayudan a nuestro equipo a entender el contexto de tu empresa.",
} as const;

export default function Demo() {
  const { toast } = useToast();
  const { countryCode, setCountryCode, country, isSpanish } = usePublicCountry();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [entryContext] = useState<EntryContext>(() => readEntryContext());
  const [form, setForm] = useState<TrialForm>(() => initialForm(countryCode));
  const copy = isSpanish ? ES : PT;

  useEffect(() => {
    setForm((current) => current.countryCode === countryCode ? current : { ...current, countryCode });
  }, [countryCode]);

  useEffect(() => {
    if (!entryContext.verticalName) return;
    setForm((current) => current.segmento
      ? current
      : { ...current, segmento: entryContext.verticalName ?? current.segmento });
  }, [entryContext.verticalName]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, type, value } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : false;
    if (name === "adDataConsent" && type === "checkbox") setAdDataConsent(checked);
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value } as TrialForm));
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as PublicCountryCode;
    setCountryCode(next);
    setForm((current) => ({ ...current, countryCode: next }));
  };

  const captureWarmLead = async () => {
    if (!form.nomePessoa || !form.email || !form.nomeEmpresa) return;
    const attribution = attributionWithEntryContext(entryContext);
    const details = [
      `${copy.details.country}: ${country.label} (${form.countryCode})`,
      entryContext.verticalId && `Vertical ID: ${entryContext.verticalId}`,
      entryContext.intent && `Intenção de entrada: ${entryContext.intent}`,
      `Origem do acesso: ${entryContext.source}`,
      form.segmento && `${copy.details.segment}: ${form.segmento}`,
      form.nicho && `${copy.details.niche}: ${form.nicho}`,
      form.produtosServicos && `${copy.details.products}: ${form.produtosServicos}`,
      form.clienteIdeal && `${copy.details.idealCustomer}: ${form.clienteIdeal}`,
      form.objetivoPrincipal && `${copy.details.objective}: ${form.objetivoPrincipal}`,
      form.dorPrincipal && `${copy.details.pain}: ${form.dorPrincipal}`,
      form.canalPrincipal && `${copy.details.channel}: ${form.canalPrincipal}`,
      form.regiaoAtuacao && `${copy.details.region}: ${form.regiaoAtuacao}`,
      form.volumeLeads && `${copy.details.volume}: ${form.volumeLeads}`,
      form.tamanhoEquipe && `${copy.details.team}: ${form.tamanhoEquipe}`,
    ].filter(Boolean).join("\n");

    try {
      await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nomePessoa,
          email: form.email,
          telefone: form.telefone || undefined,
          empresa: form.nomeEmpresa,
          mensagem: details || copy.defaultWarmMessage,
          origem: entryContext.source === "vertical-lp" ? "lp_vertical_trial" : "trial_progressivo",
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
    } catch {
      // A captura comercial nunca deve bloquear o cadastro do trial.
    }
  };

  const goNext = async () => {
    if (step === 1) {
      if (!form.nomeEmpresa || !form.nomePessoa || !form.email || !form.telefone || !form.segmento) {
        toast({ title: copy.requiredStep1, variant: "destructive" });
        return;
      }
      await captureWarmLead();
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!form.produtosServicos || !form.objetivoPrincipal || !form.dorPrincipal) {
        toast({ title: copy.requiredStep2, variant: "destructive" });
        return;
      }
      await captureWarmLead();
      setStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
    if (!form.senha) {
      toast({ title: copy.passwordRequired, variant: "destructive" });
      return;
    }
    if (form.senha.length < 8) {
      toast({ title: copy.passwordMin, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await captureWarmLead();
      const attribution = attributionWithEntryContext(entryContext);
      const res = await fetch(`${API_BASE}/auth/demo-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: form.countryCode,
          nomeEmpresa: form.nomeEmpresa,
          nomePessoa: form.nomePessoa,
          email: form.email,
          senha: form.senha,
          telefone: form.telefone,
          segmento: form.segmento,
          nicho: form.nicho,
          produtosServicos: form.produtosServicos,
          clienteIdeal: form.clienteIdeal,
          objetivoPrincipal: form.objetivoPrincipal,
          dorPrincipal: form.dorPrincipal,
          canalPrincipal: form.canalPrincipal,
          regiaoAtuacao: form.regiaoAtuacao,
          volumeLeads: form.volumeLeads,
          tamanhoEquipe: form.tamanhoEquipe,
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || copy.accountError, variant: "destructive" });
        return;
      }

      toast({ title: copy.createdTitle, description: copy.createdDescription });
      const handoff = new URLSearchParams({ vendorai_token: data.token });
      if (data.tenant?.demoExpiresAt) handoff.set("demo_expires_at", data.tenant.demoExpiresAt);
      handoff.set("onboarding_empresa", form.nomeEmpresa);
      handoff.set("onboarding_segmento", form.segmento);
      handoff.set("onboarding_country", form.countryCode);
      if (form.nicho) handoff.set("onboarding_nicho", form.nicho);
      if (form.produtosServicos) handoff.set("onboarding_oferta", form.produtosServicos);
      if (form.objetivoPrincipal) handoff.set("onboarding_objetivo", form.objetivoPrincipal);
      if (form.dorPrincipal) handoff.set("onboarding_dor", form.dorPrincipal);
      if (form.canalPrincipal) handoff.set("onboarding_canal", form.canalPrincipal);
      if (entryContext.verticalId) handoff.set("onboarding_vertical_id", entryContext.verticalId);
      if (entryContext.verticalSlug) handoff.set("onboarding_vertical_slug", entryContext.verticalSlug);
      if (entryContext.verticalName) handoff.set("onboarding_vertical_name", entryContext.verticalName);
      if (entryContext.macrosegment) handoff.set("onboarding_macrosegment", entryContext.macrosegment);
      if (entryContext.intent) handoff.set("onboarding_intent", entryContext.intent);
      handoff.set("onboarding_source", entryContext.source);
      if (entryContext.landingPageSlug) handoff.set("onboarding_landing_page", entryContext.landingPageSlug);
      if (entryContext.entryUrl) handoff.set("onboarding_entry_url", entryContext.entryUrl);

      setTimeout(() => {
        window.location.href = `${CRM_BASE}/dashboard#${handoff.toString()}`;
      }, 900);
    } catch {
      toast({ title: copy.connectionError, description: copy.tryAgain, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [Sparkles, Users, Zap, Clock].map((icon, index) => ({ icon, text: copy.featureTexts[index]! }));

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-0" lang={country.locale}>
      <div className="bg-slate-900 px-4 py-12 md:py-16">
        <div className="container mx-auto text-center">
          <h1 className="mb-4 text-3xl font-bold text-white md:mb-6 md:text-5xl">{copy.heroTitle}</h1>
          <p className="mx-auto max-w-2xl text-base text-slate-300 md:text-xl">{copy.heroDescription}</p>
        </div>
      </div>

      <div className="container relative z-10 mx-auto -mt-6 px-3 md:-mt-8 md:px-4">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl md:grid-cols-5">
          <div className="p-5 sm:p-8 md:col-span-3 md:p-12">
            <div className="mb-6 flex items-center gap-2" aria-label={`${copy.stepAria} ${step} de 3`}>
              {[1, 2, 3].map((n) => (
                <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-slate-200"}`} />
              ))}
            </div>

            {entryContext.verticalName && step === 1 ? (
              <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                <strong>{copy.contextDetected}:</strong>{" "}{copy.contextDetectedText(entryContext.verticalName)}
              </div>
            ) : null}

            <h2 className="mb-2 text-2xl font-bold text-slate-900">{copy.stepTitles[step - 1]}</h2>
            <p className="mb-7 text-slate-500">{copy.stepDescriptions[step - 1]}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="countryCode">{copy.country}</Label>
                    <select id="countryCode" name="countryCode" value={form.countryCode} onChange={handleCountryChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                      {Object.entries(PUBLIC_COUNTRIES).map(([code, option]) => (
                        <option key={code} value={code}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nomeEmpresa">{copy.company}</Label>
                      <Input id="nomeEmpresa" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} placeholder={copy.companyPlaceholder} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nomePessoa">{copy.name}</Label>
                      <Input id="nomePessoa" name="nomePessoa" value={form.nomePessoa} onChange={handleChange} placeholder={copy.namePlaceholder} required />
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="telefone">{copy.whatsapp}</Label>
                      <Input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder={country.phone} required inputMode="tel" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{copy.email}</Label>
                      <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@empresa.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="segmento">{copy.segment}</Label>
                    <Input id="segmento" name="segmento" value={form.segmento} onChange={handleChange} placeholder={copy.segmentPlaceholder} required />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nicho">{copy.niche}</Label>
                      <Input id="nicho" name="nicho" value={form.nicho} onChange={handleChange} placeholder={copy.nichePlaceholder} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="regiaoAtuacao">{copy.region}</Label>
                      <Input id="regiaoAtuacao" name="regiaoAtuacao" value={form.regiaoAtuacao} onChange={handleChange} placeholder={copy.regionPlaceholder} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="produtosServicos">{copy.products}</Label>
                    <Input id="produtosServicos" name="produtosServicos" value={form.produtosServicos} onChange={handleChange} placeholder={copy.productsPlaceholder} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clienteIdeal">{copy.idealCustomer}</Label>
                    <Input id="clienteIdeal" name="clienteIdeal" value={form.clienteIdeal} onChange={handleChange} placeholder={copy.idealCustomerPlaceholder} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="objetivoPrincipal">{copy.objective}</Label>
                    <Input id="objetivoPrincipal" name="objetivoPrincipal" value={form.objetivoPrincipal} onChange={handleChange} placeholder={copy.objectivePlaceholder} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dorPrincipal">{copy.pain}</Label>
                    <Input id="dorPrincipal" name="dorPrincipal" value={form.dorPrincipal} onChange={handleChange} placeholder={copy.painPlaceholder} required />
                  </div>
                  <div className="grid gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="canalPrincipal">{copy.mainChannel}</Label>
                      <select id="canalPrincipal" name="canalPrincipal" value={form.canalPrincipal} onChange={handleChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">{copy.select}</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Site">Site</option>
                        <option value="Telefone">{copy.phoneChannel}</option>
                        <option value="Presencial">{copy.inPerson}</option>
                        <option value="Outros">{copy.others}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="volumeLeads">{copy.leadsMonth}</Label>
                      <select id="volumeLeads" name="volumeLeads" value={form.volumeLeads} onChange={handleChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">{copy.select}</option>
                        <option value="Até 50">{copy.upTo50}</option>
                        <option value="51 a 200">51 a 200</option>
                        <option value="201 a 500">201 a 500</option>
                        <option value="501 a 1.000">501 a 1.000</option>
                        <option value="Mais de 1.000">{copy.moreThan1000}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tamanhoEquipe">{copy.team}</Label>
                      <select id="tamanhoEquipe" name="tamanhoEquipe" value={form.tamanhoEquipe} onChange={handleChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">{copy.select}</option>
                        <option value="1 pessoa">{copy.onePerson}</option>
                        <option value="2 a 5">2 a 5</option>
                        <option value="6 a 15">6 a 15</option>
                        <option value="16 a 50">16 a 50</option>
                        <option value="Mais de 50">{copy.moreThan50}</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <strong>{copy.readyTitle}</strong> {copy.readyText}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="senha">{copy.password}</Label>
                    <Input id="senha" name="senha" type="password" value={form.senha} onChange={handleChange} placeholder={copy.passwordPlaceholder} required data-testid="input-senha" />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <input type="checkbox" name="adDataConsent" checked={form.adDataConsent} onChange={handleChange} className="mt-1 h-4 w-4 rounded border-slate-300" />
                    <span>
                      <strong className="font-medium text-slate-800">{copy.optional}</strong> {copy.consent}{" "}
                      <Link href="/privacy" className="underline hover:text-slate-900">{copy.privacy}</Link>.
                    </span>
                  </label>
                </>
              )}

              <div className="flex gap-3 pt-1">
                {step > 1 && (
                  <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep((current) => (current === 3 ? 2 : 1))} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> {copy.back}
                  </Button>
                )}
                {step < 3 ? (
                  <Button type="button" className="h-12 flex-1 font-bold" onClick={goNext}>
                    {copy.continue} <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                ) : (
                  <Button type="submit" className="h-12 flex-1 font-bold" disabled={loading} data-testid="btn-criar-demo">
                    {loading ? copy.creating : copy.startTrial}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </div>

              <p className="text-center text-xs text-slate-400">
                {copy.termsPrefix} <Link href="/terms" className="underline hover:text-slate-600">{copy.terms}</Link> {copy.termsJoin} <Link href="/privacy" className="underline hover:text-slate-600">{copy.privacy}</Link>.
              </p>
            </form>
          </div>

          <div className="flex flex-col justify-center bg-slate-900 p-8 text-white md:col-span-2 md:p-12">
            <h3 className="mb-6 text-xl font-bold">{copy.duringTrial}</h3>
            <ul className="space-y-4">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                    <feature.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-slate-200">{feature.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 space-y-4 border-t border-slate-700 pt-8">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-sm text-slate-300">{copy.freeTrial}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">{copy.contextNote}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
