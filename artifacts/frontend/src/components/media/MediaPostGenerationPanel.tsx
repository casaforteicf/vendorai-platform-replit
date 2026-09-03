import { ArrowLeft, ExternalLink, GitCompare, Megaphone, MessageSquare, Package, Send, Sparkles, Video } from "lucide-react";

type MediaType = "image" | "video" | "audio" | "document";

type MediaAsset = {
  id: string;
  type: MediaType;
  storageUrl: string;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Props = {
  asset: MediaAsset;
  originalAsset?: MediaAsset | null;
  mediaUrl: (storageUrl: string) => string;
  onInspectOriginal?: (assetId: string) => void;
  onNavigate: (route: string) => void;
};

function sourceAssetId(asset: MediaAsset): string | null {
  const value = asset.metadata?.sourceAssetId;
  return typeof value === "string" && value.trim() ? value : null;
}

const targets = [
  { id: "marketing", label: "Marketing", route: "/content", icon: Sparkles },
  { id: "campaign", label: "Campanha", route: "/campanhas-nova", icon: Megaphone },
  { id: "ads", label: "Anúncios", route: "/ads", icon: Send },
  { id: "catalog", label: "Catálogo", route: "/catalogo", icon: Package },
  { id: "conversation", label: "Conversas", route: "/conversations", icon: MessageSquare },
  { id: "video", label: "Studio de Vídeo", route: "/content-studio/video", icon: Video },
] as const;

export default function MediaPostGenerationPanel({ asset, originalAsset, mediaUrl, onInspectOriginal, onNavigate }: Props) {
  const parentId = sourceAssetId(asset);
  const isDerived = Boolean(parentId) || asset.source === "generated";

  function handoff(route: string, target: string) {
    const payload = {
      assetId: asset.id,
      type: asset.type,
      storageUrl: asset.storageUrl,
      originalFilename: asset.originalFilename ?? null,
      sourceAssetId: parentId,
      target,
      createdAt: new Date().toISOString(),
    };
    sessionStorage.setItem("vendorai_media_handoff", JSON.stringify(payload));
    const separator = route.includes("?") ? "&" : "?";
    onNavigate(`${route}${separator}mediaAssetId=${encodeURIComponent(asset.id)}&source=media-hub`);
  }

  return (
    <div className="mt-4 space-y-3">
      {isDerived && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" /> Resultado gerado
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Esta mídia é uma versão derivada. O original continua preservado na Biblioteca.</p>
          {originalAsset && onInspectOriginal && (
            <button type="button" onClick={() => onInspectOriginal(originalAsset.id)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao original
            </button>
          )}
        </div>
      )}

      {asset.type === "image" && originalAsset?.type === "image" && (
        <details className="rounded-xl border bg-background">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold"><GitCompare className="h-4 w-4 text-primary" /> Comparar original x resultado</summary>
          <div className="grid grid-cols-2 gap-2 border-t p-2">
            <div><p className="mb-1 text-center text-[10px] font-medium text-muted-foreground">Original</p><div className="aspect-square overflow-hidden rounded-lg bg-muted"><img src={mediaUrl(originalAsset.storageUrl)} alt="Original" className="h-full w-full object-cover" /></div></div>
            <div><p className="mb-1 text-center text-[10px] font-medium text-muted-foreground">Resultado</p><div className="aspect-square overflow-hidden rounded-lg bg-muted"><img src={mediaUrl(asset.storageUrl)} alt="Resultado" className="h-full w-full object-cover" /></div></div>
          </div>
        </details>
      )}

      <div className="rounded-xl border bg-background p-3">
        <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">Usar em</p><p className="mt-0.5 text-[10px] text-muted-foreground">Leve esta mídia para outro módulo sem fazer novo upload.</p></div><ExternalLink className="h-4 w-4 text-muted-foreground" /></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {targets.map(({ id, label, route, icon: Icon }) => (
            <button key={id} type="button" onClick={() => handoff(route, id)} className="flex min-h-10 items-center gap-2 rounded-lg border px-2.5 text-left text-[11px] font-medium hover:bg-muted">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
