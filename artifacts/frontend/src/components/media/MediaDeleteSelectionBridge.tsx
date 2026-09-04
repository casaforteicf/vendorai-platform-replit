import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const AI_CACHE_KEY = "vendorai_media_ai_base_v1";

type MediaAsset = {
  id: string;
  type: string;
  storageUrl: string;
  originalFilename?: string | null;
};

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as CachedOverride;
      if (override?.id) return override.id;
    }
  } catch {
    // Ignora cache inválido.
  }

  try {
    const userRaw = localStorage.getItem(USER_CACHE_KEY);
    if (!userRaw) return "";
    const user = JSON.parse(userRaw) as CachedUser;
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
}

function mediaUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

function pathnameOf(value: string): string {
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value;
  }
}

function resolveAssetFromArticle(
  article: HTMLElement,
  assets: MediaAsset[],
  alreadyResolved: Set<string>,
): MediaAsset | null {
  const media = article.querySelector<HTMLImageElement | HTMLVideoElement>("img, video");
  const domPath = media?.src ? pathnameOf(media.src) : "";

  if (domPath) {
    const exact = assets.find((asset) => {
      if (alreadyResolved.has(asset.id)) return false;
      const candidates = [asset.storageUrl, mediaUrl(asset.storageUrl)].map(pathnameOf);
      return candidates.includes(domPath);
    });
    if (exact) return exact;
  }

  const filename = article.querySelector<HTMLElement>("p.truncate")?.textContent?.trim() ?? "";
  if (!filename) return null;
  return assets.find(
    (asset) => !alreadyResolved.has(asset.id) && (asset.originalFilename ?? "Mídia sem nome") === filename,
  ) ?? null;
}

function findSelectionToolbar(): HTMLElement | null {
  const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));
  const counter = spans.find((span) => /^\d+\s+selecionada\(s\)$/i.test(span.textContent?.trim() ?? ""));
  if (!counter) return null;
  const toolbar = counter.parentElement;
  return toolbar instanceof HTMLElement ? toolbar : null;
}

/**
 * Mantém a exclusão da Biblioteca de Mídias desacoplada do MediaCenter legado.
 * A seleção continua sendo controlada pela tela real; este bridge apenas lê os
 * cards selecionados, injeta a ação Excluir na mesma barra e usa o endpoint
 * tenant-scoped de exclusão permanente.
 */
export function MediaDeleteSelectionBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [tenantId, setTenantId] = useState(() => currentTenantId());
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const syncLocation = () => {
      setPathname(window.location.pathname);
      const nextTenant = currentTenantId();
      if (nextTenant) setTenantId(nextTenant);
    };
    syncLocation();
    const timer = window.setInterval(syncLocation, 400);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/midias" || !tenantId) {
      setAssets([]);
      setSelectedIds([]);
      setToolbar(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, {
          headers: authHeaders(),
        });
        const body = await response.json().catch(() => ({})) as { assets?: MediaAsset[] };
        if (!cancelled && response.ok) setAssets(Array.isArray(body.assets) ? body.assets : []);
      } catch {
        // A tela principal continua funcional mesmo se o bridge não conseguir sincronizar.
      }
    };

    void load();
    const refresh = () => void load();
    window.addEventListener("vendorai-media-library-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("vendorai-media-library-changed", refresh);
    };
  }, [pathname, tenantId]);

  useEffect(() => {
    if (pathname !== "/midias") return;

    const syncDomSelection = () => {
      const nextToolbar = findSelectionToolbar();
      setToolbar((current) => current === nextToolbar ? current : nextToolbar);

      if (!nextToolbar || assets.length === 0) {
        setSelectedIds((current) => current.length ? [] : current);
        return;
      }

      const articles = Array.from(document.querySelectorAll<HTMLElement>("main article.border-primary"));
      const resolved = new Set<string>();
      for (const article of articles) {
        const asset = resolveAssetFromArticle(article, assets, resolved);
        if (asset) resolved.add(asset.id);
      }
      const nextIds = Array.from(resolved).sort();
      setSelectedIds((current) => {
        const previous = [...current].sort();
        return previous.length === nextIds.length && previous.every((id, index) => id === nextIds[index])
          ? current
          : nextIds;
      });
    };

    syncDomSelection();
    const observer = new MutationObserver(syncDomSelection);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    const timer = window.setInterval(syncDomSelection, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [assets, pathname]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds],
  );

  const deleteSelected = async () => {
    if (!tenantId || selectedAssets.length === 0 || deleting) return;
    const count = selectedAssets.length;
    const confirmed = window.confirm(
      count === 1
        ? "Excluir permanentemente esta mídia? O arquivo será removido da Biblioteca e do armazenamento. Esta ação não pode ser desfeita."
        : `Excluir permanentemente ${count} mídias? Os arquivos serão removidos da Biblioteca e do armazenamento. Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      for (const asset of selectedAssets) {
        const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? `Falha ao excluir ${asset.originalFilename ?? "mídia"}`);
      }

      sessionStorage.removeItem(AI_CACHE_KEY);
      window.dispatchEvent(new Event("vendorai-media-library-changed"));
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir as mídias selecionadas.");
      setDeleting(false);
    }
  };

  if (pathname !== "/midias" || !toolbar || selectedAssets.length === 0) return null;

  return createPortal(
    <button
      type="button"
      disabled={deleting}
      onClick={() => void deleteSelected()}
      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-background px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
      title="Excluir permanentemente as mídias selecionadas"
    >
      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Excluir {selectedAssets.length > 1 ? `(${selectedAssets.length})` : ""}
    </button>,
    toolbar,
  );
}
