import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  title: "Nossa missão é dar superpoderes à área comercial brasileira",
  subtitle: "A tecnologia certa não deveria ser privilégio apenas das empresas com orçamentos gigantescos.",
  storyTitle: "Como começamos",
  story1: "A VendorAI nasceu em 2023 para resolver um problema muito real: víamos times de vendas brasileiros perdendo negócios excelentes simplesmente por falta de acompanhamento adequado e ferramentas desconexas que não falavam português — nem no idioma, nem na cultura comercial.",
  story2: "Enquanto ferramentas gringas focavam em processos americanos caros de cold email, nossos clientes queriam vender pelo WhatsApp. Queriam gerar boletos fáceis. Queriam cobrar por PIX.",
  commitmentTitle: "Nosso compromisso",
  commitment: "Nossa missão é dar ao vendedor brasileiro o superpoder da Inteligência Artificial sem a complexidade excessiva de ferramentas enterprise internacionais. Acreditamos que a IA não veio para substituir o vendedor, mas para tirar dele o trabalho burocrático e repetitivo, permitindo foco total na conexão humana que fecha negócios.",
  identityTitle: "Identidade oficial do VendorAI",
  identityText: "O VendorAI apresentado neste site é a plataforma brasileira de CRM, vendas, marketing, atendimento e agentes de IA publicada no domínio oficial appvendorai.com e operada por Windoor Serviços de Gerenciamento de Obras Ltda.",
  officialDomain: "Domínio oficial",
  operator: "Empresa operadora",
  registration: "CNPJ",
  founded: "Ano de fundação",
  origin: "Brasileira",
  support: "Suporte dedicado",
  ctaTitle: "Faça parte da nossa história",
  cta: "Fale com nossa equipe",
} as const;

const ES = {
  title: "Nuestra misión es dar superpoderes a los equipos comerciales con Inteligencia Artificial",
  subtitle: "La tecnología adecuada no debería ser un privilegio reservado a empresas con presupuestos gigantescos.",
  storyTitle: "Cómo comenzamos",
  story1: "VendorAI nació en Brasil en 2023 para resolver un problema muy real: equipos de ventas perdían excelentes negocios por falta de seguimiento y por usar herramientas desconectadas de su realidad comercial.",
  story2: "Mientras muchas herramientas internacionales fueron diseñadas alrededor de procesos complejos y costosos, nuestros clientes necesitaban vender y atender por los canales que realmente utilizan, especialmente WhatsApp, con una operación simple y conectada.",
  commitmentTitle: "Nuestro compromiso",
  commitment: "Nuestra misión es llevar la Inteligencia Artificial a la operación comercial sin la complejidad excesiva de las herramientas enterprise. Creemos que la IA no viene a sustituir al vendedor, sino a retirar tareas burocráticas y repetitivas para que las personas puedan concentrarse en las decisiones y relaciones que generan negocios.",
  identityTitle: "Identidad oficial de VendorAI",
  identityText: "VendorAI presentado en este sitio es la plataforma brasileña de CRM, ventas, marketing, atención y agentes de IA publicada en el dominio oficial appvendorai.com y operada por Windoor Serviços de Gerenciamento de Obras Ltda.",
  officialDomain: "Dominio oficial",
  operator: "Empresa operadora",
  registration: "CNPJ",
  founded: "Año de fundación",
  origin: "Empresa brasileña",
  support: "Soporte dedicado",
  ctaTitle: "Forma parte de nuestra historia",
  cta: "Habla con nuestro equipo",
} as const;

export default function Sobre() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <div className="pb-24">
      <section className="bg-primary text-white py-24 px-4 text-center">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">{copy.title}</h1>
          <p className="text-xl text-primary-foreground/90">{copy.subtitle}</p>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="prose prose-lg prose-slate mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">{copy.storyTitle}</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">{copy.story1}</p>
            <p className="text-slate-600 mb-6 leading-relaxed">{copy.story2}</p>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 mt-12">{copy.commitmentTitle}</h3>
            <p className="text-slate-600 mb-6 leading-relaxed">{copy.commitment}</p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">{copy.identityTitle}</h2>
          <p className="text-slate-600 leading-relaxed mb-8">{copy.identityText}</p>
          <dl className="grid gap-6 md:grid-cols-3">
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.officialDomain}</dt>
              <dd className="mt-2 font-semibold text-slate-900">appvendorai.com</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.operator}</dt>
              <dd className="mt-2 font-semibold text-slate-900">Windoor Serviços de Gerenciamento de Obras Ltda</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{copy.registration}</dt>
              <dd className="mt-2 font-semibold text-slate-900">59.623.589/0001-27</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="py-16 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center max-w-4xl mx-auto">
            <div><p className="text-5xl font-bold text-primary mb-2">2023</p><p className="text-slate-600 font-medium">{copy.founded}</p></div>
            <div><p className="text-5xl font-bold text-primary mb-2">100%</p><p className="text-slate-600 font-medium">{copy.origin}</p></div>
            <div><p className="text-5xl font-bold text-primary mb-2">24/7</p><p className="text-slate-600 font-medium">{copy.support}</p></div>
          </div>
        </div>
      </section>

      <section className="py-24 text-center px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">{copy.ctaTitle}</h2>
          <Button size="lg" className="h-14 px-8 text-lg" asChild data-testid="sobre-btn-contact">
            <Link href="/contato">{copy.cta}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
