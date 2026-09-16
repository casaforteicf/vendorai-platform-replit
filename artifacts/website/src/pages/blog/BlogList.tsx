import { Link } from "wouter";
import { blogPosts } from "@/data/blog-posts";
import { extraBlogPosts } from "@/data/blog-posts-extra";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ArrowRight, Languages } from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

interface DynamicPost {
  slug: string;
  titulo: string;
  metaDescription: string | null;
  imagemCapaUrl: string | null;
  publicadoEm: string | null;
}

const PT = {
  seoTitle: "Blog | Vendor.ai — CRM com IA para WhatsApp",
  seoDescription: "Artigos sobre atendimento, vendas pelo WhatsApp, automação comercial e IA para pequenas e médias empresas brasileiras.",
  title: "Vendas, atendimento e IA para PMEs",
  subtitle: "Conteúdo prático sobre como vender mais e atender melhor pelo WhatsApp.",
  read: "Ler artigo completo",
  languageNotice: "",
} as const;

const ES = {
  seoTitle: "Blog | VendorAI — CRM con IA para ventas y atención",
  seoDescription: "Contenido sobre atención, ventas, automatización comercial e Inteligencia Artificial para pequeñas y medianas empresas.",
  title: "Ventas, atención e IA para PyMEs",
  subtitle: "Contenido práctico sobre cómo vender más, atender mejor y automatizar la operación comercial.",
  read: "Leer artículo completo",
  languageNotice: "La biblioteca editorial todavía está disponible principalmente en portugués. La interfaz ya acompaña tu idioma y los próximos contenidos podrán publicarse por locale.",
} as const;

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogList() {
  const { isSpanish, country } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  useSeoMeta({
    title: copy.seoTitle,
    description: copy.seoDescription,
  });

  const { data } = useQuery<{ posts: DynamicPost[] }>({
    queryKey: ["site-blog-dynamic-posts"],
    queryFn: () => fetch("/api/sites/vendorai/blog-data").then((r) => (r.ok ? r.json() : { posts: [] })),
    retry: false,
  });
  const dynamicPosts = data?.posts ?? [];

  const allPosts = [
    ...blogPosts.map((p) => ({ slug: p.slug, title: p.title, summary: p.summary, publishedAt: p.publishedAt, dynamic: false as const })),
    ...extraBlogPosts.map((p) => ({ slug: p.slug, title: p.title, summary: p.summary, publishedAt: p.publishedAt, dynamic: false as const })),
    ...dynamicPosts.map((p) => ({ slug: p.slug, title: p.titulo, summary: p.metaDescription ?? "", publishedAt: p.publicadoEm ?? new Date().toISOString(), dynamic: true as const })),
  ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">Blog</span>
          <h1 className="text-4xl font-bold text-slate-900 mb-4 leading-tight">{copy.title}</h1>
          <p className="text-lg text-slate-500">{copy.subtitle}</p>
          {isSpanish && copy.languageNotice ? (
            <div className="mt-6 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>{copy.languageNotice}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-10">
          {allPosts.map((post) => (
            <article key={post.slug} className="group border border-slate-200 rounded-2xl p-8 hover:border-primary/40 hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                <Calendar className="h-3.5 w-3.5" />
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, country.locale)}</time>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-primary transition-colors leading-snug">{post.title}</h2>
              <p className="text-slate-500 leading-relaxed mb-5">{post.summary}</p>
              <Link href={`/blog/${post.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all">
                {copy.read}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
