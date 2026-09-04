import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, Clock, Users, Zap, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import {
  getAdDataConsentState,
  getLaunchAttribution,
  setAdDataConsent,
} from "@/lib/launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const CRM_BASE = (import.meta.env.VITE_CRM_URL || "https://app.appvendorai.com").replace(/\/$/, "");

const COUNTRY_OPTIONS = {
  BR: { label: "Brasil", locale: "pt-BR", phone: "+55 48 99999-9999" },
  PY: { label: "Paraguay", locale: "es-PY", phone: "+595 981 234567" },
  AR: { label: "Argentina", locale: "es-AR", phone: "+54 9 11 1234-5678" },
  UY: { label: "Uruguay", locale: "es-UY", phone: "+598 99 123 456" },
  CL: { label: "Chile", locale: "es-CL", phone: "+56 9 1234 5678" },
} as const;

type CountryCode = keyof typeof COUNTRY_OPTIONS;

function initialCountry(): CountryCode {
  if (typeof navigator === "undefined") return "BR";
  const locale = navigator.language.toLowerCase();
  if (locale.includes("es-py")) return "PY";
  if (locale.includes("es-ar")) return "AR";
  if (locale.includes("es-uy")) return "UY";
  if (locale.includes("es-cl")) return "CL";
  return "BR";
}

const PT = {
  required: "Preencha os campos principais para personalizarmos seu teste",
  saveError: "Não foi possível salvar seus dados",
  connectionError: "Erro de conexão",
  tryAgain: "Tente novamente.",
  passwordRequired: "Defina sua senha para iniciar o teste",
  passwordMin: "A senha deve ter pelo menos 8 caracteres",
  accountError: "Erro ao criar conta",
  createdTitle: "Seu teste foi criado!",
  createdDescription: "Abrindo uma plataforma já preparada para o seu negócio...",
  features: [
    "Plataforma completa e pré-configurada para seu segmento",
    "Até 3 usuários no teste",
    "Canais e automações para acompanhar seus leads",
    "5 dias de acesso completo",
  ],
  heroTitle: "Pare de deixar lead esfriar.",
  heroDescription: "Conte rapidamente como sua empresa vende e abra uma demonstração preparada para a sua realidade.",
  step1Title: "Personalizar meu teste",
  step2Title: "Criar meu acesso",
  step: "Etapa",
  of: "de",
  step1Description: "Essas respostas já entram no CRM e ajudam a plataforma a entender seu negócio antes da demo.",
  step2Description: "Seus dados já foram salvos. Agora basta definir a senha para iniciar os 5 dias.",
  country: "País *",
  company: "Nome da empresa *",
  companyPlaceholder: "Ex: Construtora Horizonte",
  name: "Seu nome *",
  namePlaceholder: "Ex: João Silva",
  email: "E-mail *",
  whatsapp: "WhatsApp *",
  instagram: "Instagram",
  region: "Cidade / região",
  regionPlaceholder: "Ex: Chapecó e região",
  segment: "Segmento / nicho *",
  segmentPlaceholder: "Ex: materiais de construção, seguros, autopeças...",
  products: "Principais produtos ou serviços",
  productsPlaceholder: "O que sua empresa mais vende?",
  leads: "Leads por mês",
  leadsPlaceholder: "Ex: 50, 200, 1000+",
  channels: "Canais usados",
  channelsPlaceholder: "WhatsApp, Instagram, site...",
  challenge: "Principal dificuldade comercial",
  challengePlaceholder: "Ex: demora no atendimento, follow-up, propostas...",
  objective: "Principal objetivo *",
  objectivePlaceholder: "Ex: aumentar conversão e não perder oportunidades",
  optional: "Opcional:",
  consent: "autorizo o VendorAI a usar dados de conversão e identificadores protegidos para medir e otimizar campanhas em plataformas de anúncios. A autorização pode ser revogada conforme a",
  privacy: "Política de Privacidade",
  saving: "Salvando e personalizando...",
  continue: "Continuar para criar meu acesso",
  warmPrefix: "já está em Aquecimento no CRM. Ao iniciar o teste, o mesmo lead seguirá para Demo/Trial sem perder o histórico.",
  password: "Crie sua senha *",
  passwordPlaceholder: "Mínimo 8 caracteres",
  adjust: "Ajustar respostas",
  creating: "Criando seu teste...",
  start: "Começar meus 5 dias grátis",
  termsPrefix: "Ao criar a conta, você concorda com os",
  terms: "Termos de Uso",
  termsJoin: "e reconhece a",
  duringTrial: "Durante o teste você recebe:",
  freeTrial: "Os 5 dias são gratuitos e não há cobrança durante o teste.",
  pricingPrefix: "Se decidir continuar:",
  pricing: "R$ 497/mês por 60 dias, depois R$ 990/mês por 6 meses.",
  pricingSuffix: "Ao final da promoção, segue o preço normal vigente.",
} as const;

const ES = {
  required: "Completa los campos principales para personalizar tu prueba",
  saveError: "No fue posible guardar tus datos",
  connectionError: "Error de conexión",
  tryAgain: "Inténtalo nuevamente.",
  passwordRequired: "Define tu contraseña para iniciar la prueba",
  passwordMin: "La contraseña debe tener al menos 8 caracteres",
  accountError: "Error al crear la cuenta",
  createdTitle: "¡Tu prueba fue creada!",
  createdDescription: "Abriendo una plataforma preparada para tu negocio...",
  features: [
    "Plataforma completa y preconfigurada para tu segmento",
    "Hasta 3 usuarios durante la prueba",
    "Canales y automatizaciones para acompañar tus leads",
    "5 días de acceso completo",
  ],
  heroTitle: "No dejes que tus leads se enfríen.",
  heroDescription: "Cuéntanos rápidamente cómo vende tu empresa y abre una demostración preparada para tu realidad.",
  step1Title: "Personalizar mi prueba",
  step2Title: "Crear mi acceso",
  step: "Paso",
  of: "de",
  step1Description: "Estas respuestas ya ingresan al CRM y ayudan a la plataforma a entender tu negocio antes de la demo.",
  step2Description: "Tus datos ya fueron guardados. Ahora solo debes definir la contraseña para iniciar los 5 días.",
  country: "País *",
  company: "Nombre de la empresa *",
  companyPlaceholder: "Ej.: Comercial Horizonte",
  name: "Tu nombre *",
  namePlaceholder: "Ej.: Juan Pérez",
  email: "Correo electrónico *",
  whatsapp: "WhatsApp *",
  instagram: "Instagram",
  region: "Ciudad / región",
  regionPlaceholder: "Ej.: Asunción y alrededores",
  segment: "Segmento / nicho *",
  segmentPlaceholder: "Ej.: materiales de construcción, seguros, repuestos...",
  products: "Principales productos o servicios",
  productsPlaceholder: "¿Qué vende principalmente tu empresa?",
  leads: "Leads por mes",
  leadsPlaceholder: "Ej.: 50, 200, 1000+",
  channels: "Canales utilizados",
  channelsPlaceholder: "WhatsApp, Instagram, sitio web...",
  challenge: "Principal dificultad comercial",
  challengePlaceholder: "Ej.: demora en atención, seguimiento, propuestas...",
  objective: "Principal objetivo *",
  objectivePlaceholder: "Ej.: aumentar la conversión y no perder oportunidades",
  optional: "Opcional:",
  consent: "autorizo a VendorAI a utilizar datos de conversión e identificadores protegidos para medir y optimizar campañas en plataformas publicitarias. La autorización puede revocarse según la",
  privacy: "Política de Privacidad",
  saving: "Guardando y personalizando...",
  continue: "Continuar para crear mi acceso",
  warmPrefix: "ya está en calentamiento en el CRM. Al iniciar la prueba, el mismo lead pasará a Demo/Trial sin perder el historial.",
  password: "Crea tu contraseña *",
  passwordPlaceholder: "Mínimo 8 caracteres",
  adjust: "Ajustar respuestas",
  creating: "Creando tu prueba...",
  start: "Comenzar mis 5 días gratis",
  termsPrefix: "Al crear la cuenta, aceptas los",
  terms: "Términos de Uso",
  termsJoin: "y reconoces la",
  duringTrial: "Durante la prueba recibes:",
  freeTrial: "Los 5 días son gratuitos y no hay cobro durante la prueba.",
  pricingPrefix: "Si decides continuar, la promoción se factura en BRL:",
  pricing: "R$ 497/mes durante 60 días y luego R$ 990/mes durante 6 meses.",
  pricingSuffix: "Al finalizar la promoción, se aplica el precio normal vigente.",
} as const;

export default function Demo() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [warmLeadId, setWarmLeadId] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    countryCode: initialCountry(),
    nomeEmpresa: "",
    nomePessoa: "",
    email: "",
    senha: "",
    telefone: "",
    instagram: "",
    segmento: "",
    cidadeRegiao: "",
    produtos: "",
    leadsPerMes: "",
    canaisVenda: "",
    desafioPrincipal: "",
    objetivo6meses: "",
    adDataConsent: getAdDataConsentState()?.granted ?? false,
  }));

  const isSpanish = form.countryCode !== "BR";
  const copy = isSpanish ? ES : PT;
  const country = COUNTRY_OPTIONS[form.countryCode];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const input = e.target as HTMLInputElement;
    if (name === "adDataConsent" && input.type === "checkbox") {
      setAdDataConsent(input.checked);
      setForm((f) => ({ ...f, adDataConsent: input.checked }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const captureWarmLead = async () => {
    if (!form.nomeEmpresa || !form.nomePessoa || !form.email || !form.telefone || !form.segmento || !form.objetivo6meses) {
      toast({ title: copy.required, variant: "destructive" });
      return false;
    }

    setLoading(true);
    try {
      const attribution = getLaunchAttribution();
      const canaisVenda = form.canaisVenda.split(",").map((item) => item.trim()).filter(Boolean);
      const redesSociais = form.instagram.trim() ? [form.instagram.trim()] : [];
      const res = await fetch(`${API_BASE}/public/vendorai/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nomePessoa,
          email: form.email,
          telefone: form.telefone,
          empresa: form.nomeEmpresa,
          segmento: form.segmento,
          countryCode: form.countryCode,
          descricaoNegocio: form.cidadeRegiao ? `${isSpanish ? "Ciudad/región" : "Cidade/região"}: ${form.cidadeRegiao}` : undefined,
          produtos: form.produtos,
          redesSociais,
          canaisVenda,
          leadsPerMes: form.leadsPerMes,
          desafioPrincipal: form.desafioPrincipal,
          objetivo6meses: form.objetivo6meses,
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || copy.saveError, variant: "destructive" });
        return false;
      }
      setWarmLeadId(data.leadId || null);
      setStep(2);
      return true;
    } catch {
      toast({ title: copy.connectionError, description: copy.tryAgain, variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      await captureWarmLead();
      return;
    }
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
      const attribution = getLaunchAttribution();
      const res = await fetch(`${API_BASE}/auth/trial-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeEmpresa: form.nomeEmpresa,
          nomePessoa: form.nomePessoa,
          email: form.email,
          senha: form.senha,
          telefone: form.telefone,
          countryCode: form.countryCode,
          warmLeadId,
          segmento: form.segmento,
          cidadeRegiao: form.cidadeRegiao,
          produtos: form.produtos,
          leadsPerMes: form.leadsPerMes,
          canaisVenda: form.canaisVenda,
          desafioPrincipal: form.desafioPrincipal,
          objetivo6meses: form.objetivo6meses,
          instagram: form.instagram,
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
      if (data.salesLeadId) handoff.set("sales_lead_id", data.salesLeadId);

      setTimeout(() => {
        window.location.href = `${CRM_BASE}/dashboard#${handoff.toString()}`;
      }, 900);
    } catch {
      toast({ title: copy.connectionError, description: copy.tryAgain, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [Sparkles, Users, Zap, Clock].map((icon, index) => ({ icon, text: copy.features[index]! }));

  return (
    <div className="min-h-screen bg-slate-50" lang={country.locale}>
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">{copy.heroTitle}</h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">{copy.heroDescription}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-5 border border-slate-100">
          <div className="p-8 md:p-12 md:col-span-3">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h2 className="text-2xl font-bold text-slate-900">{step === 1 ? copy.step1Title : copy.step2Title}</h2>
              <span className="text-xs font-semibold text-slate-500">{copy.step} {step} {copy.of} 2</span>
            </div>
            <p className="text-slate-500 mb-8">{step === 1 ? copy.step1Description : copy.step2Description}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {step === 1 ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="countryCode">{copy.country}</Label>
                    <select id="countryCode" name="countryCode" value={form.countryCode} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                      {Object.entries(COUNTRY_OPTIONS).map(([code, option]) => (
                        <option key={code} value={code}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2"><Label htmlFor="nomeEmpresa">{copy.company}</Label><Input id="nomeEmpresa" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} placeholder={copy.companyPlaceholder} required /></div>
                    <div className="space-y-2"><Label htmlFor="nomePessoa">{copy.name}</Label><Input id="nomePessoa" name="nomePessoa" value={form.nomePessoa} onChange={handleChange} placeholder={copy.namePlaceholder} required /></div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2"><Label htmlFor="email">{copy.email}</Label><Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@empresa.com" required /></div>
                    <div className="space-y-2"><Label htmlFor="telefone">{copy.whatsapp}</Label><Input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder={country.phone} required /></div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2"><Label htmlFor="instagram">{copy.instagram}</Label><Input id="instagram" name="instagram" value={form.instagram} onChange={handleChange} placeholder="@suaempresa" /></div>
                    <div className="space-y-2"><Label htmlFor="cidadeRegiao">{copy.region}</Label><Input id="cidadeRegiao" name="cidadeRegiao" value={form.cidadeRegiao} onChange={handleChange} placeholder={copy.regionPlaceholder} /></div>
                  </div>

                  <div className="space-y-2"><Label htmlFor="segmento">{copy.segment}</Label><Input id="segmento" name="segmento" value={form.segmento} onChange={handleChange} placeholder={copy.segmentPlaceholder} required /></div>
                  <div className="space-y-2"><Label htmlFor="produtos">{copy.products}</Label><Input id="produtos" name="produtos" value={form.produtos} onChange={handleChange} placeholder={copy.productsPlaceholder} /></div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2"><Label htmlFor="leadsPerMes">{copy.leads}</Label><Input id="leadsPerMes" name="leadsPerMes" value={form.leadsPerMes} onChange={handleChange} placeholder={copy.leadsPlaceholder} /></div>
                    <div className="space-y-2"><Label htmlFor="canaisVenda">{copy.channels}</Label><Input id="canaisVenda" name="canaisVenda" value={form.canaisVenda} onChange={handleChange} placeholder={copy.channelsPlaceholder} /></div>
                  </div>

                  <div className="space-y-2"><Label htmlFor="desafioPrincipal">{copy.challenge}</Label><Input id="desafioPrincipal" name="desafioPrincipal" value={form.desafioPrincipal} onChange={handleChange} placeholder={copy.challengePlaceholder} /></div>
                  <div className="space-y-2"><Label htmlFor="objetivo6meses">{copy.objective}</Label><Input id="objetivo6meses" name="objetivo6meses" value={form.objetivo6meses} onChange={handleChange} placeholder={copy.objectivePlaceholder} required /></div>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" name="adDataConsent" checked={form.adDataConsent} onChange={handleChange} className="mt-1 h-4 w-4 rounded border-slate-300" />
                    <span><strong className="font-medium text-slate-800">{copy.optional}</strong> {copy.consent} <Link href="/privacy" className="underline hover:text-slate-900">{copy.privacy}</Link>.</span>
                  </label>

                  <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
                    {loading ? copy.saving : copy.continue}<ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>{form.nomeEmpresa}</strong> {copy.warmPrefix}</div>
                  <div className="space-y-2"><Label htmlFor="senha">{copy.password}</Label><Input id="senha" name="senha" type="password" value={form.senha} onChange={handleChange} placeholder={copy.passwordPlaceholder} required autoFocus /></div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="button" variant="outline" className="h-12" onClick={() => setStep(1)} disabled={loading}><ArrowLeft className="mr-2 w-4 h-4" /> {copy.adjust}</Button>
                    <Button type="submit" className="h-12 flex-1 text-base font-bold" disabled={loading} data-testid="btn-criar-demo">{loading ? copy.creating : copy.start}<ArrowRight className="ml-2 w-5 h-5" /></Button>
                  </div>
                </>
              )}

              <p className="text-xs text-slate-400 text-center">{copy.termsPrefix} <Link href="/terms" className="underline hover:text-slate-600">{copy.terms}</Link> {copy.termsJoin} <Link href="/privacy" className="underline hover:text-slate-600">{copy.privacy}</Link>.</p>
            </form>
          </div>

          <div className="bg-slate-900 p-8 md:p-12 md:col-span-2 text-white flex flex-col justify-center">
            <h3 className="text-xl font-bold mb-6">{copy.duringTrial}</h3>
            <ul className="space-y-4">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><f.icon className="w-4 h-4 text-primary" /></div><span className="text-slate-200">{f.text}</span></li>
              ))}
            </ul>

            <div className="mt-8 pt-8 border-t border-slate-700 space-y-4">
              <div className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /><p className="text-sm text-slate-300">{copy.freeTrial}</p></div>
              <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">{copy.pricingPrefix} <strong className="text-white">{copy.pricing}</strong> {copy.pricingSuffix}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
