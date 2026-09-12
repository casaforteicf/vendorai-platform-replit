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
  citationTitle: "Como citar e linkar o VendorAI",
  citationIntro: "Para matérias, páginas de parceiros, diretórios, comparativos e conteúdos editoriais, prefira uma descrição factual e um link direto para a página mais relacionada ao assunto.",
  shortLabel: "Descrição curta sugerida",
  shortCitation: "VendorAI é uma plataforma brasileira de CRM, vendas, marketing e agentes de IA que conecta a operação comercial do primeiro contato ao pós-venda e à próxima oportunidade de receita.",
  linkLabel: "Link institucional principal",
  linkText: "VendorAI — CRM, vendas e marketing com IA",
  productLinksLabel: "Links temáticos recomendados",
  citationNote: "Use links quando forem editorialmente relevantes. Não é necessário alterar atributos editoriais ou políticas de publicação para citar o VendorAI.",
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
  citationTitle: "Cómo citar y enlazar VendorAI",
  citationIntro: "Para artículos, páginas de socios, directorios, comparativas y contenidos editoriales, utiliza una descripción factual y un enlace directo a la página más relacionada con el tema.",
  shortLabel: "Descripción breve sugerida",
  shortCitation: "VendorAI es una plataforma brasileña de CRM, ventas, marketing y agentes de IA que conecta la operación comercial desde el primer contacto hasta la posventa y la próxima oportunidad de ingresos.",
  linkLabel: "Enlace institucional principal",
  linkText: "VendorAI — CRM, ventas y marketing con IA",
  productLinksLabel: "Enlaces temáticos recomendados",
  citationNote: "Utiliza enlaces cuando sean editorialmente relevantes. No es necesario cambiar las políticas editoriales de la publicación para citar VendorAI.",
  assetsTitle: "Activos oficiales",
  assetsText: "Para portadas, artículos, presentaciones y directorios, utiliza los archivos publicados en el dominio oficial.",
  contactTitle: "Contacto editorial e institucional",
  contactText: "Para información adicional, alianzas, entrevistas y validación de datos institucionales:",
  about: "Sobre VendorAI",
  site: "Sitio oficial",
  og: "Imagen oficial para compartir",
  icon: "Ícono oficial",
} as const;

const citationLinks = [
  ["VendorAI", "https://appvendorai.com/"],
  ["CRM com IA", "https://appvendorai.com/produtos/crm"],
  ["Agentes de IA", "https://appvendorai.com/produtos/agentes-ia"],
  ["Prospecção B2B com IA", "https://appvendorai.com/produtos/prospeccao"],
  ["Revenue Intelligence", "https://appvendorai.com/solucoes/revenue-intelligence"],
  ["CRM + WhatsApp", "https://appvendorai.com/solucoes/crm-whatsapp"],
] as const;

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

      <section className="border-y border-slate-200 bg-slate-950 px-4 py-16 text-white">
        <div className="container mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-400">Authority Kit</p>
          <h2 className="mt-3 text-3xl font-bold">{copy.citationTitle}</h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-300">{copy.citationIntro}</p>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="font-bold text-white">{copy.shortLabel}</h3>
              <p className="mt-3 leading-7 text-slate-300">{copy.shortCitation}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="font-bold text-white">{copy.linkLabel}</h3>
              <a href="https://appvendorai.com/" className="mt-3 block font-semibold text-orange-400 hover:text-orange-300">{copy.linkText}</a>
              <code className="mt-4 block overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300">https://appvendorai.com/</code>
            </div>
          </div>

          <h3 className="mt-10 text-xl font-bold">{copy.productLinksLabel}</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {citationLinks.map(([label, href]) => (
              <a key={href} href={href} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 transition hover:border-orange-500">
                <span className="block font-semibold text-white">{label}</span>
                <span className="mt-1 block break-all text-xs text-slate-400">{href}</span>
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-400">{copy.citationNote}</p>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#fffaf5] px-4 py-16">
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
