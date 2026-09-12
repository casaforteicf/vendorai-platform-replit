import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  eyebrow: "Imprensa e Media Kit",
  title: "Informações oficiais para citar o VendorAI",
  subtitle: "Dados institucionais, descrição curta, produtos, identidade da marca e contato para imprensa, parceiros, diretórios e publicações.",
  boilerplateTitle: "Descrição oficial",
  boilerplate: "VendorAI é uma plataforma brasileira de CRM, vendas, marketing, atendimento e agentes de inteligência artificial que conecta geração de demanda, prospecção, conversas, pipeline, follow-up, pós-venda e inteligência de receita em uma única operação.",
  factsTitle: "Fatos oficiais",
  facts: [
    ["Marca", "VendorAI"],
    ["Domínio oficial", "appvendorai.com"],
    ["Fundação", "2023"],
    ["Mercado principal", "Brasil"],
    ["Empresa operadora", "Windoor Serviços de Gerenciamento de Obras Ltda"],
    ["CNPJ", "59.623.589/0001-27"],
  ],
  productsTitle: "Principais frentes do produto",
  products: [
    ["CRM com IA", "/produtos/crm"],
    ["Agentes de IA", "/produtos/agentes-ia"],
    ["Prospecção B2B com IA", "/produtos/prospeccao"],
    ["Revenue Scout", "/produtos/revenue-scout"],
    ["Omnichannel", "/produtos/omnichannel"],
    ["Marketing com IA", "/produtos/marketing"],
  ],
  namingTitle: "Uso correto da marca",
  naming: "A grafia oficial é VendorAI. Para diferenciar esta plataforma de outros produtos ou projetos com nomes semelhantes, use appvendorai.com como domínio de referência. Quando necessário, cite também a empresa operadora e o CNPJ informados nesta página.",
  assetsTitle: "Ativos oficiais",
  assetsText: "Para capas, matérias, apresentações e diretórios, use os arquivos publicados no domínio oficial.",
  contactTitle: "Contato editorial e institucional",
  contactText: "Para informações adicionais, parcerias, entrevistas e validação de dados institucionais:",
  about: "Sobre o VendorAI",
  site: "Site oficial",
  og: "Imagem oficial para compartilhamento",
  icon: "Ícone oficial",
} as const;

const ES = {
  eyebrow: "Prensa y Media Kit",
  title: "Información oficial para citar a VendorAI",
  subtitle: "Datos institucionales, descripción breve, productos, identidad de marca y contacto para prensa, socios, directorios y publicaciones.",
  boilerplateTitle: "Descripción oficial",
  boilerplate: "VendorAI es una plataforma brasileña de CRM, ventas, marketing, atención y agentes de inteligencia artificial que conecta generación de demanda, prospección, conversaciones, pipeline, seguimiento, posventa e inteligencia de ingresos en una sola operación.",
  factsTitle: "Datos oficiales",
  facts: [
    ["Marca", "VendorAI"],
    ["Dominio oficial", "appvendorai.com"],
    ["Fundación", "2023"],
    ["Mercado principal", "Brasil"],
    ["Empresa operadora", "Windoor Serviços de Gerenciamento de Obras Ltda"],
    ["CNPJ", "59.623.589/0001-27"],
  ],
  productsTitle: "Principales áreas del producto",
  products: [
    ["CRM con IA", "/produtos/crm"],
    ["Agentes de IA", "/produtos/agentes-ia"],
    ["Prospección B2B con IA", "/produtos/prospeccao"],
    ["Revenue Scout", "/produtos/revenue-scout"],
    ["Omnichannel", "/produtos/omnichannel"],
    ["Marketing con IA", "/produtos/marketing"],
  ],
  namingTitle: "Uso correcto de la marca",
  naming: "La grafía oficial es VendorAI. Para diferenciar esta plataforma de otros productos o proyectos con nombres similares, utiliza appvendorai.com como dominio de referencia. Cuando sea necesario, cita también la empresa operadora y el CNPJ informados en esta página.",
  assetsTitle: "Activos oficiales",
  assetsText: "Para portadas, artículos, presentaciones y directorios, utiliza los archivos publicados en el dominio oficial.",
  contactTitle: "Contacto editorial e institucional",
  contactText: "Para información adicional, alianzas, entrevistas y validación de datos institucionales:",
  about: "Sobre VendorAI",
  site: "Sitio oficial",
  og: "Imagen oficial para compartir",
  icon: "Ícono oficial",
} as const;

export default function Imprensa() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <div className="bg-white pb-24">
      <section className="border-b border-orange-100 bg-[#fffaf5] px-4 py-20 md:py-24">
        <div className="container mx-auto max-w-5xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-orange-600">{copy.eyebrow}</p>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">{copy.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">{copy.subtitle}</p>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="container mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <article className="rounded-3xl border border-slate-200 p-8 md:p-10">
            <h2 className="text-2xl font-bold text-slate-950">{copy.boilerplateTitle}</h2>
            <p className="mt-5 text-lg leading-8 text-slate-700">{copy.boilerplate}</p>
          </article>
          <aside className="rounded-3xl bg-slate-950 p-8 text-white md:p-10">
            <h2 className="text-2xl font-bold">{copy.namingTitle}</h2>
            <p className="mt-5 leading-7 text-slate-300">{copy.naming}</p>
          </aside>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-slate-950">{copy.factsTitle}</h2>
          <dl className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {copy.facts.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6">
                <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-2 font-semibold leading-6 text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-slate-950">{copy.productsTitle}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {copy.products.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-2xl border border-slate-200 p-6 font-semibold text-slate-900 transition hover:border-orange-300 hover:text-orange-600">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#fffaf5] px-4 py-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-slate-950">{copy.assetsTitle}</h2>
          <p className="mt-4 max-w-3xl text-slate-600">{copy.assetsText}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <a href="/opengraph.jpg" className="rounded-2xl border border-orange-200 bg-white p-6 font-semibold text-slate-900 hover:text-orange-600">{copy.og}</a>
            <a href="/apple-touch-icon.png" className="rounded-2xl border border-orange-200 bg-white p-6 font-semibold text-slate-900 hover:text-orange-600">{copy.icon}</a>
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="container mx-auto max-w-5xl rounded-3xl border border-slate-200 p-8 md:p-10">
          <h2 className="text-3xl font-bold text-slate-950">{copy.contactTitle}</h2>
          <p className="mt-4 text-slate-600">{copy.contactText}</p>
          <a className="mt-5 inline-block text-lg font-bold text-orange-600 hover:text-orange-700" href="mailto:vendorai@appvendorai.com">vendorai@appvendorai.com</a>
          <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/sobre" className="text-slate-700 hover:text-orange-600">{copy.about}</Link>
            <a href="https://appvendorai.com/" className="text-slate-700 hover:text-orange-600">{copy.site}</a>
          </div>
        </div>
      </section>
    </div>
  );
}
