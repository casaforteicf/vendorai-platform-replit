import { Link, useParams } from "wouter";
import { getBlogPost } from "@/data/blog-posts";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { renderMarkdown } from "@/lib/render-markdown";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ArrowLeft, MessageCircle, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import { usePublicCountry } from "@/lib/publicCountry";

interface DynamicPost {
  slug: string;
  titulo: string;
  metaDescription: string | null;
  conteudoHtml: string;
  imagemCapaUrl: string | null;
  publicadoEm: string | null;
}

const PT = {
  back: "Voltar ao blog",
  fallbackSeo: "Artigo | Vendor.ai",
  ctaTitle: "Veja funcionando na prática",
  ctaDesc: "Teste o atendimento automático com exemplos do seu próprio segmento, sem compromisso.",
  cta: "Experimentar grátis",
  languageNotice: "",
} as const;

const ES = {
  back: "Volver al blog",
  fallbackSeo: "Artículo | VendorAI",
  ctaTitle: "Mira cómo funciona en la práctica",
  ctaDesc: "Prueba la atención automática con ejemplos de tu propio segmento, sin compromiso.",
  cta: "Probar gratis",
  languageNotice: "Este artículo forma parte de la biblioteca editorial original y todavía está disponible en portugués.",
} as const;

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function LanguageNotice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mb-8 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
      <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>{text}</p>
    </div>
  );
}

function ArticleCta({ copy }: { copy: typeof PT | typeof ES }) {
  return (
    <div className="mt-16 rounded-2xl bg-primary/5 border border-primary/20 p-8 text-center">
      <MessageCircle className="h-8 w-8 text-primary mx-auto mb-3" />
      <h3 className="text-xl font-bold text-slate-900 mb-2">{copy.ctaTitle}</h3>
      <p className="text-slate-500 mb-6 max-w-md mx-auto">{copy.ctaDesc}</p>
      <Button asChild size="lg"><a href="/demo">{copy.cta}</a></Button>
    </div>
  );
}

export default function BlogPost() {
  const { isSpanish, country } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const { slug } = useParams<{ slug: string }>();
  const staticPost = getBlogPost(slug ?? "");

  // O endpoint atual não expõe locale; buscamos o mesmo post canônico e
  // localizamos apenas o shell até o Content Autopilot ganhar conteúdo por locale.
  const { data, isLoading } = useQuery<{ post: DynamicPost }>({
    queryKey: ["site-blog-dynamic-post", slug],
    queryFn: () => fetch(`/api/sites/vendorai/blog-data/${slug}`).then((r) => (r.ok ? r.json() : null)),
    enabled: !staticPost && !!slug,
    retry: false,
  });
  const dynamicPost = data?.post;

  useSeoMeta({
    title: staticPost?.metaTitle ?? (dynamicPost ? `${dynamicPost.titulo} | VendorAI` : copy.fallbackSeo),
    description: staticPost?.metaDescription ?? dynamicPost?.metaDescription ?? undefined,
  });

  if (!staticPost && !dynamicPost) {
    if (isLoading) return null;
    return <NotFound />;
  }

  if (dynamicPost) {
    return (
      <article className="py-16 bg-white">
        <div className="container mx-auto px-4 max-w-2xl">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary transition-colors mb-10">
            <ArrowLeft className="h-3.5 w-3.5" />{copy.back}
          </Link>
          {isSpanish ? <LanguageNotice text={copy.languageNotice} /> : null}
          <header className="mb-10">
            {dynamicPost.publicadoEm && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                <Calendar className="h-3.5 w-3.5" />
                <time dateTime={dynamicPost.publicadoEm}>{formatDate(dynamicPost.publicadoEm, country.locale)}</time>
              </div>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">{dynamicPost.titulo}</h1>
          </header>
          <div className="prose-slate prose-headings:text-slate-900 prose-headings:font-bold prose-p:text-slate-700 prose-p:leading-relaxed prose-img:rounded-xl border-t border-slate-100 pt-10" dangerouslySetInnerHTML={{ __html: dynamicPost.conteudoHtml }} />
          <ArticleCta copy={copy} />
        </div>
      </article>
    );
  }

  const post = staticPost!;
  return (
    <article className="py-16 bg-white">
      <div className="container mx-auto px-4 max-w-2xl">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary transition-colors mb-10">
          <ArrowLeft className="h-3.5 w-3.5" />{copy.back}
        </Link>
        {isSpanish ? <LanguageNotice text={copy.languageNotice} /> : null}
        <header className="mb-10">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
            <Calendar className="h-3.5 w-3.5" />
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, country.locale)}</time>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">{post.title}</h1>
          <p className="text-lg text-slate-500 leading-relaxed">{post.summary}</p>
        </header>
        <div className="prose-slate space-y-5 border-t border-slate-100 pt-10">{renderMarkdown(post.body)}</div>
        <ArticleCta copy={copy} />
      </div>
    </article>
  );
}
