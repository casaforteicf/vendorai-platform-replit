export type MediaHandoffPayload = {
  assetId: string;
  type: "image" | "video" | "audio" | "document";
  storageUrl: string;
  originalFilename?: string | null;
  sourceAssetId?: string | null;
  target: string;
  createdAt: string;
};

const STORAGE_KEY = "vendorai_media_handoff";

export function readMediaHandoff(): MediaHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MediaHandoffPayload>;
    if (!value.assetId || !value.type || !value.storageUrl || !value.target) return null;
    return value as MediaHandoffPayload;
  } catch {
    return null;
  }
}

export function clearMediaHandoff(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
