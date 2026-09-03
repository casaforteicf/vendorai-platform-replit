import { useEffect, useState } from "react";

type MediaVideoAsset = {
  id: string;
  type: string;
  storageUrl: string;
  originalFilename?: string | null;
  mimeType?: string | null;
};

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function mediaUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

export function useMediaVideoHandoff({
  tenantId,
  setVideoFile,
  setVideoPreview,
  onLoaded,
}: {
  tenantId: string;
  setVideoFile: (file: File | null) => void;
  setVideoPreview: (url: string | null) => void;
  onLoaded?: (filename: string) => void;
}) {
  const [sourceMediaAssetId, setSourceMediaAssetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const mediaAssetId = new URLSearchParams(window.location.search).get("mediaAssetId")?.trim() ?? "";
    if (!tenantId || !mediaAssetId) return;

    let cancelled = false;
    let objectUrl = "";

    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=150`, {
          headers: authHeader(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Falha ao consultar a Biblioteca");

        const asset = (Array.isArray(data.assets) ? data.assets : []).find(
          (item: MediaVideoAsset) => item.id === mediaAssetId,
        ) as MediaVideoAsset | undefined;
        if (!asset || asset.type !== "video") {
          throw new Error("Vídeo não encontrado na Biblioteca deste tenant");
        }

        const fileResponse = await fetch(mediaUrl(asset.storageUrl), { headers: authHeader() });
        if (!fileResponse.ok) throw new Error("Não foi possível carregar o vídeo da Biblioteca");
        const blob = await fileResponse.blob();
        const filename = asset.originalFilename || "video-biblioteca.mp4";
        const file = new File([blob], filename, {
          type: asset.mimeType || blob.type || "video/mp4",
        });
        objectUrl = URL.createObjectURL(file);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setVideoFile(file);
        setVideoPreview(objectUrl);
        setSourceMediaAssetId(asset.id);
        onLoaded?.(filename);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar vídeo da Biblioteca");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenantId, setVideoFile, setVideoPreview, onLoaded]);

  return {
    sourceMediaAssetId,
    loading,
    error,
    clearSource: () => {
      setSourceMediaAssetId("");
      setError("");
    },
  };
}
