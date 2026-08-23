import { Link, useParams } from "wouter";
import { getBlogPost } from "@/data/blog-posts";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { renderMarkdown } from "@/lib/render-markdown";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";

interface DynamicPost {
  slug: string;
  titulo: string;
  metaDescription: string | null;
  conteudoHtml: string;
  imagemCapaUrl: string | null;
  publicadoEm: string | null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const staticPost = getBlogPost(slug ?? "");

  // Só busca o post dinâmico se não achou nos manuais — evita chamada de API à toa.
  const { data, isLoading } = useQuery<{ post: DynamicPost }>({
    queryKey: ["site-blog-dynamic-post", slug],
    queryFn: () => fetch(`/api/sites/vendorai/blog-data/${slug}`).then((r) => (r.ok ? r.json() : null)),
    enabled: !staticPost && !!slug,
    retry: false,
  });
  const dynamicPost = data?.post;

  useSeoMeta({
    title: staticPost?.metaTitle ?? (dynamicPost ? `${dynamicPost.titulo} | Vendor.ai` : "Artigo | Vendor.ai"),
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
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary transition-colors mb-10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao blog
          </Link>

          <header className="mb-10">
            {dynamicPost.publicadoEm && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                <Calendar className="h-3.5 w-3.5" />
                <time dateTime={dynamicPost.publicadoEm}>{formatDate(dynamicPost.publicadoEm)}</time>
              </div>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
              {dynamicPost.titulo}
            </h1>
          </header>

          <div
            className="prose-slate prose-headings:text-slate-900 prose-headings:font-bold prose-p:text-slate-700 prose-p:leading-relaxed prose-img:rounded-xl border-t border-slate-100 pt-10"
            dangerouslySetInnerHTML={{ __html: dynamicPost.conteudoHtml }}
          />

          <div className="mt-16 rounded-2xl bg-primary/5 border border-primary/20 p-8 text-center">
            <MessageCircle className="h-8 w-8 text-primary mx-auto mb-3" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Veja funcionando na prática
            </h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              Teste o atendimento automático com exemplos do seu próprio segmento, sem compromisso.
            </p>
            <Button asChild size="lg">
              <a href="/demo">Experimentar grátis</a>
            </Button>
          </div>
        </div>
      </article>
    );
  }

  const post = staticPost!;
  return (
    <article className="py-16 bg-white">
      <div className="container mx-auto px-4 max-w-2xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary transition-colors mb-10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao blog
        </Link>

        <header className="mb-10">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
            <Calendar className="h-3.5 w-3.5" />
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
            {post.title}
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed">{post.summary}</p>
        </header>

        <div className="prose-slate space-y-5 border-t border-slate-100 pt-10">
          {renderMarkdown(post.body)}
        </div>

        <div className="mt-16 rounded-2xl bg-primary/5 border border-primary/20 p-8 text-center">
          <MessageCircle className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Veja funcionando na prática
          </h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Teste o atendimento automático com exemplos do seu próprio segmento, sem compromisso.
          </p>
          <Button asChild size="lg">
            <a href="/demo">Experimentar grátis</a>
          </Button>
        </div>
      </div>
    </article>
  );
}
