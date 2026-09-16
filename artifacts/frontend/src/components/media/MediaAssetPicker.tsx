import { useEffect, useMemo, useState } from "react";
import { AudioLines, Check, CheckSquare, FileText, Film, Image as ImageIcon, Loader2, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type MediaPickerType = "image" | "video" | "audio" | "document";

export type MediaPickerAsset = {
  id: string;
  type: MediaPickerType;
  role?: string | null;
  storageUrl: string;
  mimeType?: string | null;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MediaAssetPickerProps = {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedTypes?: MediaPickerType[];
  maxSelection?: number;
  initialSelectedIds?: string[];
  title?: string;
  confirmLabel?: string;
  onConfirm: (assets: MediaPickerAsset[]) => void;
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
}

export function mediaAssetUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

function TypeIcon({ type }: { type: MediaPickerType }) {
  const Icon = type === "image" ? ImageIcon : type === "video" ? Film : type === "audio" ? AudioLines : FileText;
  return <Icon className="h-8 w-8 text-muted-foreground" />;
}

function folderOf(asset: MediaPickerAsset) {
  const value = asset.metadata?.folderPath;
  return typeof value === "string" && value.trim() ? value.trim() : "Sem pasta";
}

function displayName(asset: MediaPickerAsset) {
  const explicit = asset.metadata?.displayName;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const raw = (asset.originalFilename || "Mídia sem nome").replace(/\.[^.]+$/, "");
  return raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function MediaAssetPicker({
  tenantId,
  open,
  onOpenChange,
  allowedTypes = ["image", "video", "audio", "document"],
  maxSelection = 1,
  initialSelectedIds = [],
  title = "Escolher da Biblioteca",
  confirmLabel = "Usar mídia selecionada",
  onConfirm,
}: MediaAssetPickerProps) {
  const [assets, setAssets] = useState<MediaPickerAsset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MediaPickerType>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected(initialSelectedIds.slice(0, maxSelection));
    fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders() })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar a Biblioteca de Mídias");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        const next = Array.isArray(body.assets) ? body.assets : [];
        setAssets(next.filter((asset: MediaPickerAsset) => allowedTypes.includes(asset.type)));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Falha ao carregar a Biblioteca");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, tenantId, allowedTypes.join("|"), initialSelectedIds.join("|"), maxSelection]);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setSearch("");
      setTypeFilter("all");
      setError("");
    }
  }, [open]);

  const typeCounts = useMemo(() => ({
    all: assets.length,
    image: assets.filter((asset) => asset.type === "image").length,
    video: assets.filter((asset) => asset.type === "video").length,
    audio: assets.filter((asset) => asset.type === "audio").length,
    document: assets.filter((asset) => asset.type === "document").length,
  }), [assets]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (typeFilter !== "all" && asset.type !== typeFilter) return false;
      if (!term) return true;
      const tags = Array.isArray(asset.metadata?.tags) ? asset.metadata?.tags : [];
      const haystack = [displayName(asset), asset.originalFilename, asset.role, asset.source, asset.type, folderOf(asset), ...tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [assets, search, typeFilter]);

  function toggle(assetId: string) {
    setSelected((current) => {
      if (current.includes(assetId)) return current.filter((id) => id !== assetId);
      if (maxSelection <= 1) return [assetId];
      if (current.length >= maxSelection) return current;
      return [...current, assetId];
    });
  }

  const chosen = assets.filter((asset) => selected.includes(asset.id));
  const visibleIds = visible.map((asset) => asset.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const visibleSelectionLimit = Math.min(maxSelection, visibleIds.length);

  function toggleAllVisible() {
    if (maxSelection <= 1 || visibleIds.length === 0) return;
    setSelected((current) => {
      if (allVisibleSelected) {
        const visibleSet = new Set(visibleIds);
        return current.filter((id) => !visibleSet.has(id));
      }
      const next = [...current];
      for (const id of visibleIds) {
        if (next.includes(id)) continue;
        if (next.length >= maxSelection) break;
        next.push(id);
      }
      return next;
    });
  }

  const filterOptions: Array<{ id: "all" | MediaPickerType; label: string }> = [
    { id: "all", label: "Tudo" },
    { id: "image", label: "Imagens" },
    { id: "video", label: "Vídeos" },
    { id: "audio", label: "Áudios" },
    { id: "document", label: "Documentos" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
            Selecione na Biblioteca as fotos, vídeos, documentos e referências que comprovam ou ilustram esta informação. A IA passa a usar os itens escolhidos junto com o texto cadastrado.
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, tag, pasta ou origem..." className="pl-9" />
            </div>
            {maxSelection > 1 && visible.length > 0 && (
              <Button type="button" variant="outline" onClick={toggleAllVisible} className="shrink-0">
                {allVisibleSelected ? <CheckSquare className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
                {allVisibleSelected ? "Desmarcar visíveis" : `Selecionar visíveis (${visibleSelectionLimit})`}
              </Button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTypeFilter(option.id)}
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", typeFilter === option.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}
              >
                {option.label} · {typeCounts[option.id]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando Biblioteca...</div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Nenhum item compatível encontrado.</div>
          ) : (
            <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((asset) => {
                const active = selected.includes(asset.id);
                return (
                  <button key={asset.id} type="button" onClick={() => toggle(asset.id)} className={cn("overflow-hidden rounded-xl border bg-background text-left transition-all", active ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/40")}>
                    <div className="relative aspect-[4/3] bg-muted">
                      {asset.type === "image" ? <img src={mediaAssetUrl(asset.storageUrl)} alt={displayName(asset)} className="h-full w-full object-cover" /> : asset.type === "video" ? <video src={mediaAssetUrl(asset.storageUrl)} muted preload="metadata" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><TypeIcon type={asset.type} /></div>}
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold capitalize text-white">{asset.type === "image" ? "Imagem" : asset.type === "video" ? "Vídeo" : asset.type === "audio" ? "Áudio" : "Documento"}</span>
                      {active && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-4 w-4" /></span>}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium">{displayName(asset)}</p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{folderOf(asset)}{asset.role ? ` · ${asset.role}` : ""}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground"><strong className="text-foreground">{chosen.length}</strong> selecionado(s){maxSelection > 1 ? ` · limite ${maxSelection}` : ""}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="button" onClick={() => { onConfirm(chosen); onOpenChange(false); }}>{confirmLabel}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
