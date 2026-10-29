import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LayoutGrid, ExternalLink, Play, Images } from "lucide-react";
import { cn } from "@/lib/utils";

type InstagramGridItem = {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  caption: string | null;
};

export type DraftOption = {
  id: string;
  label: string;
  thumbnailUrl?: string;
  mediaType?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
};

export function InstagramGridPreview({ tenantId, draftOptions }: { tenantId: string; draftOptions: DraftOption[] }) {
  const [previewDraftId, setPreviewDraftId] = useState<string>("none");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ connected: boolean; items: InstagramGridItem[] }>({
    queryKey: ["instagram-grid", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content/instagram-grid`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  const selectedDraft = draftOptions.find((d) => d.id === previewDraftId);

  // Grade real (mais recente primeiro, é como o Instagram mostra). Quando um
  // rascunho é selecionado pra preview, ele entra na posição 1 — é onde o
  // próximo post publicado realmente apareceria — empurrando o resto e
  // cortando o último ladrilho pra manter a grade em múltiplos de 3.
  const realItems = data?.items ?? [];
  const gridTiles: Array<{
    key: string;
    url: string | null;
    isPreview: boolean;
    mediaType?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
    permalink?: string | null;
  }> = selectedDraft
    ? [
        {
          key: "preview",
          url: selectedDraft.thumbnailUrl ?? null,
          isPreview: true,
          mediaType: selectedDraft.mediaType ?? "IMAGE",
        },
        ...realItems.slice(0, 11).map((item) => ({
          key: item.id,
          url: item.mediaType === "VIDEO" ? item.thumbnailUrl : item.mediaUrl,
          isPreview: false,
          mediaType: item.mediaType,
          permalink: item.permalink,
        })),
      ]
    : realItems.map((item) => ({
        key: item.id,
        url: item.mediaType === "VIDEO" ? item.thumbnailUrl : item.mediaUrl,
        isPreview: false,
        mediaType: item.mediaType,
        permalink: item.permalink,
      }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          Prévia da grade do Instagram
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Prévia do perfil em recorte 3:4 — teste um rascunho da Biblioteca na posição do próximo post antes de publicar.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {draftOptions.length > 0 && (
          <Select value={previewDraftId} onValueChange={setPreviewDraftId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Testar um rascunho como próximo post" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem prévia — só a grade atual</SelectItem>
              {draftOptions.map((draft) => (
                <SelectItem key={draft.id} value={draft.id}>
                  {draft.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-2 py-4 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível consultar a grade do Instagram. Isso não significa que a conta esteja desconectada.</p>
            <button type="button" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Consultando..." : "Tentar novamente"}</button>
          </div>
        ) : !data?.connected ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Instagram não conectado — conecte em Configurações → Integrações pra ver a grade real aqui.
          </p>
        ) : gridTiles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum post publicado ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1 max-w-md">
            {gridTiles.map((tile) => {
              const inner = (
                <div
                  className={cn(
                    "w-full overflow-hidden bg-muted/40 relative aspect-[3/4]",
                    tile.isPreview && "ring-2 ring-primary ring-offset-1",
                  )}
                >
                  {tile.url ? (
                    <img src={tile.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-[10px]">sem imagem</div>
                  )}
                  {tile.isPreview && (
                    <Badge className="absolute top-1 left-1 text-[9px] px-1 py-0 h-4">prévia</Badge>
                  )}
                  {tile.mediaType === "VIDEO" && (
                    <span className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white" title="Reel">
                      <Play className="h-3 w-3 fill-current" />
                    </span>
                  )}
                  {tile.mediaType === "CAROUSEL_ALBUM" && (
                    <span className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white" title="Carrossel">
                      <Images className="h-3 w-3" />
                    </span>
                  )}
                </div>
              );
              return tile.permalink ? (
                <a key={tile.key} href={tile.permalink} target="_blank" rel="noreferrer" className="group relative">
                  {inner}
                  <ExternalLink className="h-3 w-3 absolute bottom-1 right-1 text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                </a>
              ) : (
                <div key={tile.key}>{inner}</div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
