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

export function MediaAssetPicker({
  tenantId,
  open,
  onOpenChange,
  allowedTypes = ["image", "video", "audio", "document"],
  maxSelection = 1,
  title = "Escolher da Biblioteca",
  confirmLabel = "Usar mídia selecionada",
  onConfirm,
}: MediaAssetPickerProps) {
  const [assets, setAssets] = useState<MediaPickerAsset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
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
  }, [open, tenantId, allowedTypes.join("|")]);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setSearch("");
      setError("");
    }
  }, [open]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((asset) => [asset.originalFilename, asset.role, asset.source, asset.type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)));
  }, [assets, search]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, tipo ou origem..." className="pl-9" />
            </div>
            {maxSelection > 1 && visible.length > 0 && (
              <Button type="button" variant="outline" onClick={toggleAllVisible} className="shrink-0">
                {allVisibleSelected ? <CheckSquare className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
                {allVisibleSelected ? "Desmarcar todos" : `Selecionar todos (${visibleSelectionLimit})`}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando Biblioteca...</div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Nenhuma mídia compatível encontrada.</div>
          ) : (
            <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((asset) => {
                const active = selected.includes(asset.id);
                return (
                  <button key={asset.id} type="button" onClick={() => toggle(asset.id)} className={cn("overflow-hidden rounded-xl border bg-background text-left transition-all", active ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/40")}>
                    <div className="relative aspect-[4/3] bg-muted">
                      {asset.type === "image" ? <img src={mediaAssetUrl(asset.storageUrl)} alt={asset.originalFilename || "Mídia"} className="h-full w-full object-cover" /> : asset.type === "video" ? <video src={mediaAssetUrl(asset.storageUrl)} muted preload="metadata" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><TypeIcon type={asset.type} /></div>}
                      {active && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span>}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium">{asset.originalFilename || "Mídia sem nome"}</p>
                      <p className="mt-1 text-[11px] uppercase text-muted-foreground">{asset.type}{asset.role ? ` · ${asset.role}` : ""}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">{chosen.length} selecionada(s){maxSelection > 1 ? ` · limite ${maxSelection}` : ""}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="button" disabled={chosen.length === 0} onClick={() => { onConfirm(chosen); onOpenChange(false); }}>{confirmLabel}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
