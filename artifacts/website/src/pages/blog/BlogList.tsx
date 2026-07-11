import { Link } from "wouter";
import { blogPosts } from "@/data/blog-posts";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { Calendar, ArrowRight } from "lucide-react";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogList() {
  useSeoMeta({
    title: "Blog | Vendor.ai — CRM com IA para WhatsApp",
    description:
      "Artigos sobre atendimento, vendas pelo WhatsApp, automação comercial e IA para pequenas e médias empresas brasileiras.",
  });

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Blog
          </span>
          <h1 className="text-4xl font-bold text-slate-900 mb-4 leading-tight">
            Vendas, atendimento e IA para PMEs
          </h1>
          <p className="text-lg text-slate-500">
            Conteúdo prático sobre como vender mais e atender melhor pelo WhatsApp.
          </p>
        </div>

        <div className="space-y-10">
          {blogPosts.map((post) => (
            <article
              key={post.slug}
              className="group border border-slate-200 rounded-2xl p-8 hover:border-primary/40 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                <Calendar className="h-3.5 w-3.5" />
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-primary transition-colors leading-snug">
                {post.title}
              </h2>
              <p className="text-slate-500 leading-relaxed mb-5">{post.summary}</p>
              <Link
                href={`/blog/${post.slug}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
              >
                Ler artigo completo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
