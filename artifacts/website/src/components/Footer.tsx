import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-300 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                V
              </div>
              <span className="font-bold text-xl tracking-tight text-white">VendorAI</span>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              A plataforma de vendas com IA que transforma equipes comerciais.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Produto</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/funcionalidades" className="hover:text-white transition-colors">Funcionalidades</Link></li>
              <li><Link href="/precos" className="hover:text-white transition-colors">Planos e Preços</Link></li>
              <li><Link href="/funcionalidades#agentes" className="hover:text-white transition-colors">Agentes de IA</Link></li>
              <li><Link href="/funcionalidades#crm" className="hover:text-white transition-colors">CRM Completo</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Empresa</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/sobre" className="hover:text-white transition-colors">Sobre nós</Link></li>
              <li><Link href="/contato" className="hover:text-white transition-colors">Contato</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacidade</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Termos de Uso</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Contato</h4>
            <ul className="space-y-2 text-sm">
              <li>vendorai@appvendorai.com</li>
              <li>Florianópolis, SC — Brasil</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 text-sm text-slate-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col items-center md:items-start gap-1">
            <p>&copy; 2026 VendorAI. Todos os direitos reservados.</p>
            <p className="text-xs text-slate-600">
              Windoor Serviços de Gerenciamento de Obras Ltda · CNPJ 59.623.589/0001-27
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white transition-colors">Termos de uso</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacidade</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
