import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Instagram, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstagramGridPreview, type DraftOption } from "@/components/InstagramGridPreview";
import { LayoutIntelligenceCard } from "@/components/LayoutIntelligenceCard";
import { HighlightCoverGenerator } from "@/components/HighlightCoverGenerator";

type FeedVariation = { caption: string; hashtags: string[]; imageUrl?: string; imageUrls?: string[] };
type ContentLibraryItem = {
  id: string;
  type: string;
  variation: FeedVariation | Record<string, unknown>;
  theme: string | null;
  savedAt: string;
};

export default function MarketingInstagram() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const { data: library } = useQuery<{ items: ContentLibraryItem[] }>({
    queryKey: ["content-library", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content/library`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  // Só Feed tem miniatura confiável pra prévia (Reels ainda não gera capa
  // própria, só a URL do vídeo — ver InstagramGridPreview.tsx).
  const draftOptions: DraftOption[] = (library?.items ?? [])
    .filter((item) => item.type === "feed")
    .map((item) => {
      const v = item.variation as FeedVariation;
      return {
        id: item.id,
        label: `Feed — ${item.theme || new Date(item.savedAt).toLocaleDateString("pt-BR")}`,
        thumbnailUrl: v.imageUrl ?? v.imageUrls?.[0],
      };
    })
    .filter((d) => d.thumbnailUrl);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-28 pt-4 sm:px-4 md:p-6 md:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight sm:text-lg">
            <Instagram className="h-5 w-5 shrink-0 text-muted-foreground" />
            Instagram
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Veja como a grade real está e teste um rascunho como próximo post antes de publicar.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/content")}
          className="w-full justify-center gap-1.5 sm:w-auto sm:shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Gerar conteúdo
        </Button>
      </div>

      <InstagramGridPreview tenantId={tenantId} draftOptions={draftOptions} />

      <LayoutIntelligenceCard tenantId={tenantId} />

      <HighlightCoverGenerator tenantId={tenantId} />

      <p className="pr-14 text-xs leading-relaxed text-muted-foreground sm:pr-0">
        Conta não conectada ou token expirado? Ajuste em Configurações → Integrações.
      </p>
    </div>
  );
}
