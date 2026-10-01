export type SketchfabSearchItem = {
  uid: string;
  name: string;
  description: string | null;
  viewerUrl: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorUid: string | null;
  licenseLabel: string | null;
  licenseSlug: string | null;
  isDownloadable: boolean;
  vertexCount: number | null;
  faceCount: number | null;
};

const API = "https://api.sketchfab.com/v3";

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function searchSketchfabModels(query: string, limit = 24): Promise<SketchfabSearchItem[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL(`${API}/search`);
  url.searchParams.set("type", "models");
  url.searchParams.set("q", q);
  url.searchParams.set("downloadable", "true");
  url.searchParams.set("sort_by", "-likeCount");
  url.searchParams.set("count", String(Math.min(48, Math.max(1, limit))));

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VendorAI-Arqdor/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Sketchfab search failed (${response.status})`);
  }

  const payload = await response.json() as any;
  const rows = Array.isArray(payload?.results) ? payload.results : [];

  return rows.map((row: any): SketchfabSearchItem => {
    const images = Array.isArray(row?.thumbnails?.images) ? row.thumbnails.images : [];
    const thumb = images
      .filter((x: any) => typeof x?.url === "string")
      .sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0))[0]?.url ?? null;
    return {
      uid: String(row?.uid ?? ""),
      name: String(row?.name ?? "Modelo 3D"),
      description: textOrNull(row?.description),
      viewerUrl: textOrNull(row?.viewerUrl) ?? `https://sketchfab.com/3d-models/${row?.uid ?? ""}`,
      thumbnailUrl: textOrNull(thumb),
      authorName: textOrNull(row?.user?.displayName) ?? textOrNull(row?.user?.username),
      authorUid: textOrNull(row?.user?.uid),
      licenseLabel: textOrNull(row?.license?.label),
      licenseSlug: textOrNull(row?.license?.slug),
      isDownloadable: Boolean(row?.isDownloadable),
      vertexCount: Number.isFinite(Number(row?.vertexCount)) ? Number(row.vertexCount) : null,
      faceCount: Number.isFinite(Number(row?.faceCount)) ? Number(row.faceCount) : null,
    };
  }).filter((item: SketchfabSearchItem) => item.uid && item.isDownloadable);
}

export async function getSketchfabDownload(uid: string, accessToken: string) {
  const response = await fetch(`${API}/models/${encodeURIComponent(uid)}/download`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "VendorAI-Arqdor/1.0",
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Sketchfab download failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json() as Promise<{
    gltf?: { url?: string; size?: number; expires?: number };
    usdz?: { url?: string; size?: number; expires?: number };
  }>;
}
