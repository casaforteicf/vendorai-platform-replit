import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  description: "Marketing, prospecção, atendimento, CRM, pós-venda e inteligência de receita conectados por IA.",
  platform: "Plataforma",
  products: "Soluções",
  company: "Empresa",
  allProducts: "Todos os produtos",
  features: "Funcionalidades",
  plans: "Planos e Preços",
  blog: "Conteúdo e Blog",
  app: "Baixar app",
  crm: "CRM com IA",
  prospector: "Prospecção com IA",
  omnichannel: "Omnichannel",
  revenueScout: "Revenue Scout",
  jarvis: "JARVIS",
  agents: "Agentes de IA",
  about: "Sobre nós",
  contact: "Contato",
  partners: "Parceiros",
  privacy: "Privacidade",
  terms: "Termos de Uso",
  rights: "Todos os direitos reservados.",
  termsShort: "Termos de uso",
} as const;

const ES = {
  description: "Marketing, prospección, atención, CRM, posventa e inteligencia de ingresos conectados por IA.",
  platform: "Plataforma",
  products: "Soluciones",
  company: "Empresa",
  allProducts: "Todos los productos",
  features: "Funciones",
  plans: "Planes y precios",
  blog: "Contenido y Blog",
  app: "Descargar app",
  crm: "CRM con IA",
  prospector: "Prospección con IA",
  omnichannel: "Omnichannel",
  revenueScout: "Revenue Scout",
  jarvis: "JARVIS",
  agents: "Agentes de IA",
  about: "Nosotros",
  contact: "Contacto",
  partners: "Socios",
  privacy: "Privacidad",
  terms: "Términos de uso",
  rights: "Todos los derechos reservados.",
  termsShort: "Términos de uso",
} as const;

const linkClass = "transition-colors hover:text-orange-600";

export default function Footer() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <footer className="border-t border-slate-200 bg-[#fffaf5] py-12 text-slate-700 md:py-16">
      <div className="container mx-auto px-4">
        <div className="mb-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-lg font-bold text-white shadow-[0_8px_24px_rgba(249,115,22,0.20)]">V</div>
              <span className="text-xl font-bold tracking-tight text-slate-950">VendorAI</span>
            </div>
            <p className="mb-6 max-w-xs text-sm leading-6 text-slate-600">{copy.description}</p>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.platform}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/produtos" className={linkClass}>{copy.allProducts}</Link></li>
              <li><Link href="/funcionalidades" className={linkClass}>{copy.features}</Link></li>
              <li><Link href="/precos" className={linkClass}>{copy.plans}</Link></li>
              <li><Link href="/blog" className={linkClass}>{copy.blog}</Link></li>
              <li><Link href="/baixar-app" className={linkClass}>{copy.app}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.products}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/produtos/crm" className={linkClass}>{copy.crm}</Link></li>
              <li><Link href="/produtos/prospeccao" className={linkClass}>{copy.prospector}</Link></li>
              <li><Link href="/produtos/omnichannel" className={linkClass}>{copy.omnichannel}</Link></li>
              <li><Link href="/produtos/revenue-scout" className={linkClass}>{copy.revenueScout}</Link></li>
              <li><Link href="/produtos/jarvis" className={linkClass}>{copy.jarvis}</Link></li>
              <li><Link href="/produtos/agentes-ia" className={linkClass}>{copy.agents}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.company}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/sobre" className={linkClass}>{copy.about}</Link></li>
              <li><Link href="/contato" className={linkClass}>{copy.contact}</Link></li>
              <li><Link href="/parceiros" className={linkClass}>{copy.partners}</Link></li>
              <li><Link href="/privacy" className={linkClass}>{copy.privacy}</Link></li>
              <li><Link href="/terms" className={linkClass}>{copy.terms}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-slate-950">{copy.contact}</h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li><a href="mailto:vendorai@appvendorai.com" className={linkClass}>vendorai@appvendorai.com</a></li>
              <li>Florianópolis, SC — Brasil</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-orange-100 pt-8 text-sm text-slate-500 md:flex-row">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <p>&copy; 2026 VendorAI. {copy.rights}</p>
            <p className="text-xs text-slate-500">Windoor Serviços de Gerenciamento de Obras Ltda · CNPJ 59.623.589/0001-27</p>
          </div>
          <div className="flex gap-4">
            <Link href="/terms" className={linkClass}>{copy.termsShort}</Link>
            <Link href="/privacy" className={linkClass}>{copy.privacy}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
