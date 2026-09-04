import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MapPin, Mail, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getLaunchAttribution } from "@/lib/launchAttribution";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
const WHATSAPP_NUMBER = "5549988164436";

type FormState = "idle" | "loading" | "success";

const PT = {
  whatsappMessage: "Olá! Vim pelo site do VendorAI e quero falar com a equipe comercial.",
  defaultObjective: "Conhecer o VendorAI e avaliar implantação",
  sendError: "Erro ao enviar mensagem. Tente novamente.",
  fallbackError: "Tente novamente.",
  toastTitle: "Contato recebido!",
  toastDescription: "Sua empresa já entrou em aquecimento e nossa equipe dará continuidade pelo canal informado.",
  heroTitle: "Fale com Especialistas",
  heroDescription: "Conte um pouco sobre sua operação para que o primeiro contato já seja direcionado ao seu cenário.",
  formTitle: "Vamos entender sua empresa",
  formDescription: "Os dados abaixo entram no mesmo CRM comercial usado na demonstração e no trial, sem criar cadastros paralelos.",
  successTitle: "Recebemos seu contato.",
  successDescription: "Seu lead já está em aquecimento com o contexto informado. Se depois iniciar a demonstração ou o trial, o mesmo histórico poderá ser reaproveitado.",
  sendAnother: "Enviar outro contato",
  country: "País *",
  name: "Nome completo *",
  namePlaceholder: "João Silva",
  company: "Empresa *",
  companyPlaceholder: "Sua Empresa Ltda",
  email: "E-mail *",
  emailPlaceholder: "joao@empresa.com",
  whatsapp: "WhatsApp *",
  segment: "Segmento / nicho *",
  segmentPlaceholder: "Ex: materiais de construção",
  products: "Principais produtos ou serviços",
  productsPlaceholder: "O que sua empresa mais vende?",
  channel: "Principal canal de atendimento",
  select: "Selecione",
  phone: "Telefone",
  inPerson: "Presencial",
  others: "Outros",
  leads: "Leads / oportunidades por mês",
  upTo50: "Até 50",
  moreThan1000: "Mais de 1.000",
  objective: "O que você quer melhorar primeiro? *",
  objectivePlaceholder: "Ex: responder mais rápido, converter mais, automatizar follow-up",
  challenge: "Principal dificuldade hoje",
  challengePlaceholder: "Ex: leads esfriam antes do retorno do vendedor",
  urgency: "Quando pretende resolver isso?",
  now: "Agora",
  next30: "Nos próximos 30 dias",
  twoThreeMonths: "Em 2 a 3 meses",
  researching: "Apenas pesquisando",
  message: "Algo mais que precisamos saber?",
  messagePlaceholder: "Conte um pouco mais sobre seu processo comercial...",
  saving: "Salvando...",
  submit: "Quero falar com a VendorAI",
  otherChannels: "Outros canais",
  directWhatsapp: "WhatsApp Direto",
  fastService: "Atendimento rápido",
  headquarters: "Sede",
  countryContext: "País",
} as const;

const ES = {
  whatsappMessage: "¡Hola! Llegué por el sitio de VendorAI y quiero hablar con el equipo comercial.",
  defaultObjective: "Conocer VendorAI y evaluar la implementación",
  sendError: "No fue posible enviar el mensaje. Inténtalo nuevamente.",
  fallbackError: "Inténtalo nuevamente.",
  toastTitle: "¡Contacto recibido!",
  toastDescription: "Tu empresa ya entró en calentamiento y nuestro equipo continuará por el canal informado.",
  heroTitle: "Habla con Especialistas",
  heroDescription: "Cuéntanos un poco sobre tu operación para que el primer contacto ya esté orientado a tu realidad.",
  formTitle: "Queremos entender tu empresa",
  formDescription: "Los datos de abajo ingresan al mismo CRM comercial utilizado en la demostración y en la prueba, sin crear registros paralelos.",
  successTitle: "Recibimos tu contacto.",
  successDescription: "Tu lead ya está en calentamiento con el contexto informado. Si luego inicias la demostración o la prueba, podremos reutilizar el mismo historial.",
  sendAnother: "Enviar otro contacto",
  country: "País *",
  name: "Nombre completo *",
  namePlaceholder: "Juan Pérez",
  company: "Empresa *",
  companyPlaceholder: "Tu Empresa",
  email: "Correo electrónico *",
  emailPlaceholder: "juan@empresa.com",
  whatsapp: "WhatsApp *",
  segment: "Segmento / nicho *",
  segmentPlaceholder: "Ej.: materiales de construcción",
  products: "Principales productos o servicios",
  productsPlaceholder: "¿Qué vende principalmente tu empresa?",
  channel: "Principal canal de atención",
  select: "Selecciona",
  phone: "Teléfono",
  inPerson: "Presencial",
  others: "Otros",
  leads: "Leads / oportunidades por mes",
  upTo50: "Hasta 50",
  moreThan1000: "Más de 1.000",
  objective: "¿Qué quieres mejorar primero? *",
  objectivePlaceholder: "Ej.: responder más rápido, convertir más, automatizar seguimientos",
  challenge: "Principal dificultad actual",
  challengePlaceholder: "Ej.: los leads se enfrían antes de recibir respuesta",
  urgency: "¿Cuándo quieres resolverlo?",
  now: "Ahora",
  next30: "En los próximos 30 días",
  twoThreeMonths: "En 2 a 3 meses",
  researching: "Solo investigando",
  message: "¿Hay algo más que debamos saber?",
  messagePlaceholder: "Cuéntanos un poco más sobre tu proceso comercial...",
  saving: "Guardando...",
  submit: "Quiero hablar con VendorAI",
  otherChannels: "Otros canales",
  directWhatsapp: "WhatsApp Directo",
  fastService: "Atención rápida",
  headquarters: "Sede",
  countryContext: "País",
} as const;

export default function Contato() {
  const { toast } = useToast();
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { countryCode, setCountryCode, country, isSpanish } = usePublicCountry();
  const formRef = useRef<HTMLFormElement>(null);

  const copy = isSpanish ? ES : PT;
  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(copy.whatsappMessage)}`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    const fd = new FormData(e.currentTarget);
    const attribution = getLaunchAttribution();
    const mensagem = String(fd.get("mensagem") || "").trim();
    const objetivo = String(fd.get("objetivo") || "").trim();
    const desafio = String(fd.get("desafio") || "").trim();
    const canal = String(fd.get("canal") || "").trim();
    const produtos = String(fd.get("produtos") || "").trim();
    const countryContext = `${copy.countryContext}: ${country.label} (${countryCode})`;
    const descriptionWithCountry = mensagem ? `${countryContext}\n${mensagem}` : countryContext;

    const payload = {
      nome: String(fd.get("nome") || "").trim(),
      empresa: String(fd.get("empresa") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      telefone: String(fd.get("telefone") || "").trim(),
      segmento: String(fd.get("segmento") || "").trim(),
      descricaoNegocio: descriptionWithCountry,
      produtos: produtos || undefined,
      canaisVenda: canal ? [canal] : undefined,
      leadsPerMes: String(fd.get("leadsPerMes") || "").trim() || undefined,
      desafioPrincipal: desafio || mensagem || undefined,
      objetivo6meses: objetivo || copy.defaultObjective,
      urgencia: String(fd.get("urgencia") || "").trim() || undefined,
      ...attribution,
    };

    setFormState("loading");

    try {
      const res = await fetch(`${API_BASE}/public/vendorai/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { details?: Array<{ message?: string }> | string[]; error?: string };
        const details = Array.isArray(body.details)
          ? body.details.map((item) => typeof item === "string" ? item : item.message).filter(Boolean).join(", ")
          : "";
        throw new Error(details || body.error || copy.sendError);
      }

      setFormState("success");
      formRef.current?.reset();
      toast({ title: copy.toastTitle, description: copy.toastDescription });
    } catch (err: unknown) {
      setFormState("idle");
      setErrorMsg(err instanceof Error ? err.message : copy.fallbackError);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24" lang={country.locale}>
      <div className="bg-slate-900 px-4 py-12 md:py-16">
        <div className="container mx-auto text-center">
          <h1 className="mb-5 text-3xl font-bold text-white md:text-5xl">{copy.heroTitle}</h1>
          <p className="mx-auto max-w-2xl text-base text-slate-300 md:text-xl">{copy.heroDescription}</p>
        </div>
      </div>

      <div className="container relative z-10 mx-auto -mt-8 px-3 md:px-4">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl md:grid-cols-5">
          <div className="p-5 sm:p-8 md:col-span-3 md:p-12">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">{copy.formTitle}</h2>
            <p className="mb-7 text-sm text-slate-500">{copy.formDescription}</p>

            {formState === "success" ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-lg font-semibold text-slate-900">{copy.successTitle}</p>
                <p className="max-w-sm text-sm text-slate-500">{copy.successDescription}</p>
                <Button variant="outline" className="mt-2" onClick={() => setFormState("idle")}>{copy.sendAnother}</Button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" data-testid="form-contato-comercial">
                {errorMsg && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>}

                <div className="space-y-2">
                  <Label htmlFor="countryCode">{copy.country}</Label>
                  <select id="countryCode" value={countryCode} onChange={(e) => setCountryCode(e.target.value as PublicCountryCode)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {Object.entries(PUBLIC_COUNTRIES).map(([code, option]) => <option key={code} value={code}>{option.label}</option>)}
                  </select>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="nome">{copy.name}</Label><Input id="nome" name="nome" required placeholder={copy.namePlaceholder} data-testid="input-nome" /></div>
                  <div className="space-y-2"><Label htmlFor="empresa">{copy.company}</Label><Input id="empresa" name="empresa" required placeholder={copy.companyPlaceholder} data-testid="input-empresa" /></div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="email">{copy.email}</Label><Input id="email" name="email" type="email" required placeholder={copy.emailPlaceholder} data-testid="input-email" /></div>
                  <div className="space-y-2"><Label htmlFor="telefone">{copy.whatsapp}</Label><Input id="telefone" name="telefone" required inputMode="tel" placeholder={country.phone} data-testid="input-telefone" /></div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="segmento">{copy.segment}</Label><Input id="segmento" name="segmento" required placeholder={copy.segmentPlaceholder} /></div>
                  <div className="space-y-2"><Label htmlFor="produtos">{copy.products}</Label><Input id="produtos" name="produtos" placeholder={copy.productsPlaceholder} /></div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="canal">{copy.channel}</Label>
                    <select id="canal" name="canal" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{copy.select}</option><option value="WhatsApp">WhatsApp</option><option value="Instagram">Instagram</option><option value="Site">Site</option><option value="Telefone">{copy.phone}</option><option value="Presencial">{copy.inPerson}</option><option value="Outros">{copy.others}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leadsPerMes">{copy.leads}</Label>
                    <select id="leadsPerMes" name="leadsPerMes" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{copy.select}</option><option value="Até 50">{copy.upTo50}</option><option value="51 a 200">51 a 200</option><option value="201 a 500">201 a 500</option><option value="501 a 1.000">501 a 1.000</option><option value="Mais de 1.000">{copy.moreThan1000}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2"><Label htmlFor="objetivo">{copy.objective}</Label><Input id="objetivo" name="objetivo" required placeholder={copy.objectivePlaceholder} /></div>
                <div className="space-y-2"><Label htmlFor="desafio">{copy.challenge}</Label><Input id="desafio" name="desafio" placeholder={copy.challengePlaceholder} /></div>

                <div className="space-y-2">
                  <Label htmlFor="urgencia">{copy.urgency}</Label>
                  <select id="urgencia" name="urgencia" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">{copy.select}</option><option value="Agora">{copy.now}</option><option value="Nos próximos 30 dias">{copy.next30}</option><option value="Em 2 a 3 meses">{copy.twoThreeMonths}</option><option value="Apenas pesquisando">{copy.researching}</option>
                  </select>
                </div>

                <div className="space-y-2"><Label htmlFor="mensagem">{copy.message}</Label><Textarea id="mensagem" name="mensagem" placeholder={copy.messagePlaceholder} className="min-h-[100px]" data-testid="input-mensagem" /></div>

                <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={formState === "loading"} data-testid="btn-enviar-contato">
                  {formState === "loading" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.saving}</> : copy.submit}
                </Button>
              </form>
            )}
          </div>

          <div className="border-l border-slate-100 bg-slate-50 p-8 md:col-span-2 md:p-12">
            <h3 className="mb-8 text-xl font-bold text-slate-900">{copy.otherChannels}</h3>
            <div className="space-y-8">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10"><MessageCircle className="h-5 w-5 text-[#25D366]" /></div>
                <div><p className="font-bold text-slate-900">{copy.directWhatsapp}</p><p className="text-sm text-slate-500">{copy.fastService}</p></div>
              </a>

              <div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200"><Mail className="h-5 w-5 text-slate-600" /></div><div><p className="font-bold text-slate-900">E-mail</p><p className="text-sm text-slate-600">vendorai@appvendorai.com</p></div></div>

              <div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200"><MapPin className="h-5 w-5 text-slate-600" /></div><div><p className="font-bold text-slate-900">{copy.headquarters}</p><p className="text-sm text-slate-600">Chapecó, SC<br />Brasil</p></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
