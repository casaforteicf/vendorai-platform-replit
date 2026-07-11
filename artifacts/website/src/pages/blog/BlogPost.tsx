import { Link, useParams } from "wouter";
import { getBlogPost } from "@/data/blog-posts";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { renderMarkdown } from "@/lib/render-markdown";
import { Calendar, ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = getBlogPost(slug ?? "");

  useSeoMeta({
    title: post?.metaTitle ?? "Artigo | Vendor.ai",
    description: post?.metaDescription,
  });

  if (!post) return <NotFound />;

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
