import { Link, useParams } from "wouter";
import { getBlogPost } from "@/data/blog-posts";
import { getExtraBlogPost } from "@/data/blog-posts-extra";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { renderMarkdown } from "@/lib/render-markdown";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ArrowLeft, MessageCircle, Languages, BadgeCheck, RefreshCw } from "lucide-react";
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
  updatedAt?: string | null;
}

const PT = {
  back: "Voltar ao blog",
  fallbackSeo: "Artigo | Vendor.ai",
  ctaTitle: "Veja funcionando na prática",
  ctaDesc: "Teste o atendimento automático com exemplos do seu próprio segmento, sem compromisso.",
  cta: "Experimentar grátis",
  languageNotice: "",
  by: "Por",
  author: "VendorAI",
  editorial: "Conteúdo editorial",
  updated: "Atualizado em",
} as const;

const ES = {
  back: "Volver al blog",
  fallbackSeo: "Artículo | VendorAI",
  ctaTitle: "Mira cómo funciona en la práctica",
  ctaDesc: "Prueba la atención automática con ejemplos de tu propio segmento, sin compromiso.",
  cta: "Probar gratis",
  languageNotice: "Este artículo forma parte de la biblioteca editorial original y todavía está disponible en portugués.",
  by: "Por",
  author: "VendorAI",
  editorial: "Contenido editorial",
  updated: "Actualizado el",
} as const;

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function sameCalendarDay(a?: string | null, b?: string | null) {
  if (!a || !b) return true;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
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

function EditorialMeta({ publishedAt, updatedAt, locale, copy }: { publishedAt?: string | null; updatedAt?: string | null; locale: string; copy: typeof PT | typeof ES }) {
  const showUpdated = Boolean(updatedAt && publishedAt && !sameCalendarDay(updatedAt, publishedAt));
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
      <Link href="/sobre" className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-primary transition-colors">
        <BadgeCheck className="h-4 w-4 text-primary" />
        {copy.by} {copy.author}
      </Link>
      <span className="text-slate-300">•</span>
      <span>{copy.editorial}</span>
      {publishedAt ? (
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <time dateTime={publishedAt}>{formatDate(publishedAt, locale)}</time>
        </span>
      ) : null}
      {showUpdated && updatedAt ? (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <RefreshCw className="h-3.5 w-3.5" />
          {copy.updated} <time dateTime={updatedAt}>{formatDate(updatedAt, locale)}</time>
        </span>
      ) : null}
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
  const staticPost = getBlogPost(slug ?? "") ?? getExtraBlogPost(slug ?? "");

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
            <EditorialMeta publishedAt={dynamicPost.publicadoEm} updatedAt={dynamicPost.updatedAt} locale={country.locale} copy={copy} />
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
          <EditorialMeta publishedAt={post.publishedAt} locale={country.locale} copy={copy} />
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">{post.title}</h1>
          <p className="text-lg text-slate-500 leading-relaxed">{post.summary}</p>
        </header>
        <div className="prose-slate space-y-5 border-t border-slate-100 pt-10">{renderMarkdown(post.body)}</div>
        <ArticleCta copy={copy} />
      </div>
    </article>
  );
}
