import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Sobre() {
  return (
    <div className="pb-24">
      {/* Hero */}
      <section className="bg-primary text-white py-24 px-4 text-center">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Nossa missão é dar superpoderes à área comercial brasileira
          </h1>
          <p className="text-xl text-primary-foreground/90">
            A tecnologia certa não deveria ser privilégio apenas das empresas com orçamentos gigantescos.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="prose prose-lg prose-slate mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">Como começamos</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              A VendorAI nasceu em 2023 para resolver um problema muito real: víamos times de vendas brasileiros perdendo negócios excelentes simplesmente por falta de acompanhamento adequado e ferramentas desconexas que não falavam português — nem no idioma, nem na cultura comercial.
            </p>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Enquanto ferramentas gringas focavam em processos americanos caros de cold email, nossos clientes queriam vender pelo WhatsApp. Queriam gerar boletos fáceis. Queriam cobrar por PIX.
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 mt-12">Nosso compromisso</h3>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Nossa missão é dar ao vendedor brasileiro o superpoder da Inteligência Artificial sem a complexidade excessiva de ferramentas enterprise internacionais. Acreditamos que a IA não veio para substituir o vendedor, mas para tirar dele o trabalho burocrático e repetitivo, permitindo foco total na conexão humana que fecha negócios.
            </p>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-16 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center max-w-4xl mx-auto">
            <div>
              <p className="text-5xl font-bold text-primary mb-2">2023</p>
              <p className="text-slate-600 font-medium">Ano de fundação</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-primary mb-2">100%</p>
              <p className="text-slate-600 font-medium">Brasileira</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-primary mb-2">24/7</p>
              <p className="text-slate-600 font-medium">Suporte dedicado</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 text-center px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Faça parte da nossa história</h2>
          <Button size="lg" className="h-14 px-8 text-lg" asChild data-testid="sobre-btn-contact">
            <Link href="/contato">Fale com nossa equipe</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
