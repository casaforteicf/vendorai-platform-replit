export type ProfessionalVideoMode = "duble" | "library_voiceover";

export type ProfessionalScene = {
  id: string;
  visual: string;
  fala: string;
  duracao: string;
  assetId: string;
  assetType: "image" | "video" | "";
  assetLabel: string;
};

export type ProfessionalMediaAsset = {
  id: string;
  type: string;
  role?: string | null;
  storageUrl?: string | null;
  storage_url?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProfessionalAudioKind = "music" | "voiceover" | "sound_effect" | "jingle" | "sonic_identity" | "other";

export type FidelitySnapshot = {
  score: number | null;
  visual: number | null;
  human: number | null;
  technical: number | null;
  confidence: "insufficient" | "provisional" | "validated";
  completeness: number;
  pendingChecks: string[];
};

export type ProfessionalGate = {
  publishReady: boolean;
  previewReady: boolean;
  blockers: string[];
  warnings: string[];
};

export function mediaUrl(raw: string): string {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  return raw;
}

export function assetUrl(asset: ProfessionalMediaAsset): string {
  return mediaUrl(asset.storageUrl ?? asset.storage_url ?? "");
}

export function assetLabel(asset: ProfessionalMediaAsset): string {
  return asset.originalFilename ?? asset.original_filename ?? `Mídia ${asset.id.slice(0, 8)}`;
}

function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function audioKind(asset: ProfessionalMediaAsset): ProfessionalAudioKind {
  const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
  const kind = normalized(metadata.audioKind ?? asset.role ?? "");
  if (kind === "music") return "music";
  if (kind === "voiceover" || kind === "voice") return "voiceover";
  if (kind === "sound_effect" || kind === "sfx") return "sound_effect";
  if (kind === "jingle") return "jingle";
  if (kind === "sonic_identity") return "sonic_identity";
  return "other";
}

export function scriptFromScenes(scenes: ProfessionalScene[]): string {
  return scenes.map((scene) => scene.fala.trim()).filter(Boolean).join(" ").trim();
}

export function scenesFromGeneration(data: unknown): ProfessionalScene[] {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const result = root.result && typeof root.result === "object" ? root.result as Record<string, unknown> : {};
  const variations = Array.isArray(result.variations) ? result.variations : [];
  const first = variations[0] && typeof variations[0] === "object" ? variations[0] as Record<string, unknown> : {};
  const rawScenes = Array.isArray(first.scenes) ? first.scenes : [];
  const parsed = rawScenes.map((raw, index) => {
    const scene = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      id: `scene-${Date.now()}-${index}`,
      visual: String(scene.visual ?? "").trim(),
      fala: String(scene.fala ?? scene.text ?? "").trim(),
      duracao: String(scene.duracao ?? "").trim() || "3s",
      assetId: "",
      assetType: "" as const,
      assetLabel: "",
    };
  }).filter((scene) => scene.fala || scene.visual);
  if (parsed.length) return parsed;

  const fallback = [first.hook, first.caption, first.cta].map((value) => String(value ?? "").trim()).filter(Boolean);
  return fallback.map((fala, index) => ({
    id: `scene-${Date.now()}-${index}`,
    visual: index === 0 ? "Abertura com imagem real da marca ou produto" : "Mídia real relacionada ao trecho",
    fala,
    duracao: index === fallback.length - 1 ? "4s" : "5s",
    assetId: "",
    assetType: "" as const,
    assetLabel: "",
  }));
}

function tokenSet(value: string): string[] {
  const stop = new Set(["para", "como", "com", "uma", "das", "dos", "por", "que", "seu", "sua", "de", "do", "da", "em", "no", "na", "mais", "video", "cena"]);
  return Array.from(new Set(normalized(value).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4 && !stop.has(word))));
}

export function suggestAssetForScene(scene: ProfessionalScene, assets: ProfessionalMediaAsset[], usedIds: Set<string>): ProfessionalMediaAsset | null {
  const tokens = tokenSet(`${scene.visual} ${scene.fala}`);
  const ranked = assets
    .filter((asset) => (asset.type === "image" || asset.type === "video") && !usedIds.has(asset.id))
    .map((asset) => {
      let metadata = "";
      try { metadata = JSON.stringify(asset.metadata ?? {}); } catch {}
      const haystack = normalized(`${assetLabel(asset)} ${asset.role ?? ""} ${metadata}`);
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 2 : 0), 0)
        + (asset.source === "upload" || asset.source === "imported" ? 2 : 0)
        + (asset.source === "generated" ? -4 : 0);
      return { asset, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.asset ?? null;
}

export function fidelityFromIdentityPayload(data: unknown): FidelitySnapshot {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const identity = root.identity && typeof root.identity === "object" ? root.identity as Record<string, unknown> : {};
  const metadata = identity.metadata && typeof identity.metadata === "object" ? identity.metadata as Record<string, unknown> : {};
  const quality = metadata.qualityAnalysis && typeof metadata.qualityAnalysis === "object" ? metadata.qualityAnalysis as Record<string, unknown> : {};
  const fidelity = quality.fidelity && typeof quality.fidelity === "object" ? quality.fidelity as Record<string, unknown> : {};
  const components = fidelity.components && typeof fidelity.components === "object" ? fidelity.components as Record<string, unknown> : {};
  const deep = quality.deepFidelity && typeof quality.deepFidelity === "object" ? quality.deepFidelity as Record<string, unknown> : {};
  const deepScores = deep.scores && typeof deep.scores === "object" ? deep.scores as Record<string, unknown> : {};
  const numberOrNull = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const confidence = String(fidelity.confidence ?? quality.fidelityConfidence ?? "insufficient") as FidelitySnapshot["confidence"];
  return {
    score: numberOrNull(fidelity.score ?? quality.fidelityScore),
    visual: numberOrNull(components.visual ?? deepScores.visualScore),
    human: numberOrNull(components.human),
    technical: numberOrNull(components.technical ?? quality.technicalScore),
    confidence: confidence === "validated" || confidence === "provisional" ? confidence : "insufficient",
    completeness: Math.max(0, Math.min(100, Number(fidelity.completeness ?? quality.fidelityCompleteness ?? 0) || 0)),
    pendingChecks: Array.isArray(fidelity.pendingChecks) ? fidelity.pendingChecks.map(String) : [],
  };
}

export function professionalGate(input: {
  mode: ProfessionalVideoMode;
  fidelity: FidelitySnapshot | null;
  scriptApproved: boolean;
  scenes: ProfessionalScene[];
  selectedVisualCount: number;
  voiceReady: boolean;
  lipSyncReady: boolean;
  musicReady: boolean;
}): ProfessionalGate {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!input.scriptApproved) blockers.push("Roteiro ainda não foi aprovado");
  if (!input.scenes.length) blockers.push("Storyboard ainda não foi criado");

  if (input.mode === "library_voiceover") {
    if (input.scenes.length > 0 && input.selectedVisualCount < input.scenes.length) {
      blockers.push(`Selecione mídia real para todas as cenas (${input.selectedVisualCount}/${input.scenes.length})`);
    }
  } else if (input.selectedVisualCount === 0) {
    warnings.push("O vídeo ficará somente com o Dublê; adicione B-roll real quando houver material relevante");
  }

  if (!input.musicReady) warnings.push("Sem trilha selecionada; será usada a trilha padrão do Brand Video Kit quando disponível");

  if (input.mode === "duble") {
    if (!input.voiceReady) blockers.push("Motor de voz indisponível");
    if (!input.lipSyncReady) blockers.push("Motor de lip-sync indisponível");
    if (!input.fidelity) {
      blockers.push("Fidelity Score do Dublê ainda não foi carregado");
    } else {
      if ((input.fidelity.score ?? 0) < 85) blockers.push("Fidelity Score abaixo de 85/100");
      if ((input.fidelity.visual ?? 0) < 85) blockers.push("Fidelidade visual abaixo de 85/100");
      if (input.fidelity.human === null) blockers.push("Avaliação humana do Dublê ainda não foi concluída");
      else if (input.fidelity.human < 80) blockers.push("Avaliação humana abaixo de 80/100");
      if (input.fidelity.confidence !== "validated") blockers.push("Dublê ainda não está validado para publicação");
      if (input.fidelity.pendingChecks.length) warnings.push("Ainda existem verificações de fidelidade pendentes");
    }
  } else if (!input.voiceReady) {
    blockers.push("Motor de voz indisponível para gerar a locução");
  }

  const baseReady = input.scriptApproved && input.scenes.length > 0;
  const previewReady = input.mode === "duble"
    ? baseReady && input.voiceReady && input.lipSyncReady
    : baseReady && input.voiceReady && input.selectedVisualCount === input.scenes.length;

  return {
    publishReady: blockers.length === 0,
    previewReady,
    blockers,
    warnings,
  };
}
