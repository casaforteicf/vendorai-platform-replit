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
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Instagram className="h-5 w-5 text-muted-foreground" />
            Instagram
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Veja como a grade real está e teste um rascunho como próximo post antes de publicar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/content")} className="gap-1.5 shrink-0">
          <Sparkles className="h-3.5 w-3.5" />
          Gerar conteúdo
        </Button>
      </div>

      <InstagramGridPreview tenantId={tenantId} draftOptions={draftOptions} />

      <LayoutIntelligenceCard tenantId={tenantId} />

      <HighlightCoverGenerator tenantId={tenantId} />

      <p className="text-xs text-muted-foreground">
        Conta não conectada ou token expirado? Ajuste em Configurações → Integrações.
      </p>
    </div>
  );
}
