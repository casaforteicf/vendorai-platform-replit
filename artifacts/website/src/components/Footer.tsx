import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  description: "A plataforma de vendas com IA que transforma equipes comerciais.",
  product: "Produto",
  features: "Funcionalidades",
  plans: "Planos e Preços",
  aiAgents: "Agentes de IA",
  crm: "CRM Completo",
  company: "Empresa",
  about: "Sobre nós",
  contact: "Contato",
  privacy: "Privacidade",
  terms: "Termos de Uso",
  rights: "Todos os direitos reservados.",
  termsShort: "Termos de uso",
} as const;

const ES = {
  description: "La plataforma de ventas con IA que transforma equipos comerciales.",
  product: "Producto",
  features: "Funcionalidades",
  plans: "Planes y precios",
  aiAgents: "Agentes de IA",
  crm: "CRM completo",
  company: "Empresa",
  about: "Nosotros",
  contact: "Contacto",
  privacy: "Privacidad",
  terms: "Términos de uso",
  rights: "Todos los derechos reservados.",
  termsShort: "Términos de uso",
} as const;

export default function Footer() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <footer className="border-t border-slate-200 bg-[#fffaf5] py-12 text-slate-700 md:py-16">
      <div className="container mx-auto px-4">
        <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="col-span-1 md:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-lg font-bold text-white shadow-[0_8px_24px_rgba(249,115,22,0.20)]">
                V
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-950">VendorAI</span>
            </div>
            <p className="mb-6 text-sm leading-6 text-slate-600">{copy.description}</p>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.product}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/funcionalidades" className="transition-colors hover:text-orange-600">{copy.features}</Link></li>
              <li><Link href="/precos" className="transition-colors hover:text-orange-600">{copy.plans}</Link></li>
              <li><Link href="/funcionalidades#agentes" className="transition-colors hover:text-orange-600">{copy.aiAgents}</Link></li>
              <li><Link href="/funcionalidades#crm" className="transition-colors hover:text-orange-600">{copy.crm}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.company}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/sobre" className="transition-colors hover:text-orange-600">{copy.about}</Link></li>
              <li><Link href="/contato" className="transition-colors hover:text-orange-600">{copy.contact}</Link></li>
              <li><Link href="/privacy" className="transition-colors hover:text-orange-600">{copy.privacy}</Link></li>
              <li><Link href="/terms" className="transition-colors hover:text-orange-600">{copy.terms}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.contact}</h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>vendorai@appvendorai.com</li>
              <li>Florianópolis, SC — Brasil</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-orange-100 pt-8 text-sm text-slate-500 md:flex-row">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <p>&copy; 2026 VendorAI. {copy.rights}</p>
            <p className="text-xs text-slate-500">
              Windoor Serviços de Gerenciamento de Obras Ltda · CNPJ 59.623.589/0001-27
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/terms" className="transition-colors hover:text-orange-600">{copy.termsShort}</Link>
            <Link href="/privacy" className="transition-colors hover:text-orange-600">{copy.privacy}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
