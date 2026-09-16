import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { assessMediaAudioUsage, normalizeMediaAudioRights } from "./media-rights.js";
import { buildGuidedAudioFilterGraph, type GuidedAudioIndexes } from "./guided-video-audio-filter.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

export type GuidedAudioKind = "music" | "voiceover" | "sound_effect" | "jingle" | "sonic_identity" | "other";

type AudioAsset = {
  id: string;
  role: string;
  source: string;
  storageUrl: string;
  mimeType: string | null;
  originalFilename: string;
  metadata: Record<string, unknown>;
  createdAt: string | Date | null;
};

type AudioSelection = {
  voiceover: AudioAsset | null;
  music: AudioAsset | null;
  sfx: AudioAsset | null;
  jingle: AudioAsset | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function audioKind(asset: AudioAsset): GuidedAudioKind {
  const kind = normalize(asset.metadata["audioKind"] ?? asset.role);
  if (kind === "music") return "music";
  if (kind === "voiceover" || kind === "voice") return "voiceover";
  if (kind === "sound_effect" || kind === "sfx") return "sound_effect";
  if (kind === "jingle") return "jingle";
  if (kind === "sonic_identity") return "sonic_identity";
  return "other";
}

function mediaInputs(context: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(context["mediaInputs"])
    ? (context["mediaInputs"] as unknown[]).map(record).filter((item) => Boolean(String(item["assetId"] ?? "").trim()))
    : [];
}

function assetIdForRole(inputs: Array<Record<string, unknown>>, roles: string[]): string {
  const wanted = new Set(roles);
  const item = inputs.find((candidate) => String(candidate["type"] ?? "") === "audio" && wanted.has(String(candidate["role"] ?? "")));
  return item ? String(item["assetId"] ?? "").trim() : "";
}

function rightsObject(asset: AudioAsset): Record<string, unknown> {
  return record(asset.metadata["rights"]);
}

function hasRights(asset: AudioAsset): boolean {
  return Object.keys(rightsObject(asset)).length > 0;
}

function automaticAssetAllowed(asset: AudioAsset): boolean {
  if (!hasRights(asset)) return false;
  return assessMediaAudioUsage(rightsObject(asset)).organicAllowed;
}

function rightsExplicitlyBlocked(asset: AudioAsset): boolean {
  return hasRights(asset) && !assessMediaAudioUsage(rightsObject(asset)).organicAllowed;
}

function scoreAsset(asset: AudioAsset, kind: GuidedAudioKind, keywords: string[]): number {
  let metadataText = "";
  try { metadataText = JSON.stringify(asset.metadata); } catch {}
  const haystack = normalize(`${asset.originalFilename} ${asset.role} ${metadataText}`);
  const overlap = keywords.reduce((score, keyword) => score + (haystack.includes(normalize(keyword)) ? 7 : 0), 0);
  const primary = asset.metadata["primary"] === true ? 18 : 0;
  const owned = asset.source === "upload" || asset.source === "imported" ? 8 : asset.source === "generated" ? 6 : 0;
  const exact = audioKind(asset) === kind ? 35 : 0;
  return overlap + primary + owned + exact;
}

function keywordsFor(context: Record<string, unknown>): string[] {
  const professional = record(context["professionalCreation"]);
  const profile = normalize(professional["profileId"]);
  const profileWords: Record<string, string[]> = {
    performance: ["energy", "energetic", "upbeat", "impact", "dynamic", "promo", "modern", "beat", "punch"],
    product: ["clean", "modern", "product", "positive", "demo", "fresh", "minimal", "commercial"],
    institutional: ["premium", "cinematic", "corporate", "elegant", "ambient", "trust", "refined", "brand"],
    educational: ["calm", "clear", "light", "corporate", "ambient", "friendly", "educational", "soft"],
    testimonial: ["documentary", "warm", "human", "authentic", "soft", "emotional", "natural"],
  };
  const base = profileWords[profile] ?? ["professional", "modern", "clean", "brand"];
  const promptTokens = normalize(`${context["prompt"] ?? ""} ${context["style"] ?? ""}`)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5)
    .slice(0, 20);
  return Array.from(new Set([...base, ...promptTokens]));
}

async function listAudioAssets(tenantId: string): Promise<AudioAsset[]> {
  const result = await pool.query(
    `SELECT id, role, source, storage_url, mime_type, original_filename, metadata, created_at
       FROM media_assets
      WHERE tenant_id = $1
        AND type = 'audio'
        AND storage_url LIKE '/objects/%'
      ORDER BY created_at DESC
      LIMIT 500`,
    [tenantId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    role: String(row.role ?? "source"),
    source: String(row.source ?? "upload"),
    storageUrl: String(row.storage_url ?? ""),
    mimeType: row.mime_type ? String(row.mime_type) : null,
    originalFilename: String(row.original_filename ?? row.id),
    metadata: record(row.metadata),
    createdAt: row.created_at ?? null,
  }));
}

function chooseBest(assets: AudioAsset[], kind: GuidedAudioKind, keywords: string[]): AudioAsset | null {
  const acceptableKinds = kind === "jingle" ? new Set<GuidedAudioKind>(["jingle", "sonic_identity"]) : new Set<GuidedAudioKind>([kind]);
  const ranked = assets
    .filter((asset) => acceptableKinds.has(audioKind(asset)))
    .filter(automaticAssetAllowed)
    .map((asset) => ({ asset, score: scoreAsset(asset, kind, keywords) }))
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.asset ?? null;
}

function selectedAsset(assets: AudioAsset[], id: string, expected: GuidedAudioKind | "jingle"): AudioAsset | null {
  if (!id) return null;
  const asset = assets.find((item) => item.id === id) ?? null;
  if (!asset) throw new Error(`Áudio ${id} não foi encontrado na Biblioteca`);
  const kind = audioKind(asset);
  const accepted = expected === "jingle" ? kind === "jingle" || kind === "sonic_identity" : kind === expected;
  if (!accepted) throw new Error(`O arquivo “${asset.originalFilename}” não é compatível com ${expected}`);
  if (expected === "music" && !hasRights(asset)) {
    throw new Error(`A trilha “${asset.originalFilename}” ainda não possui Passaporte de Direitos. Revise os direitos em Mídias antes de usar.`);
  }
  if (rightsExplicitlyBlocked(asset)) {
    throw new Error(`O áudio “${asset.originalFilename}” possui restrição de uso. Revise o Passaporte de Direitos em Mídias.`);
  }
  return asset;
}

async function materialize(asset: AudioAsset, tempPaths: string[]): Promise<string> {
  const file = await objectStorage.getObjectEntityFile(asset.storageUrl);
  const [buffer] = await file.download();
  if (!buffer.length) throw new Error(`O áudio “${asset.originalFilename}” está vazio`);
  const ext = asset.originalFilename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (asset.mimeType?.includes("wav") ? "wav" : "mp3");
  const path = join(tmpdir(), `guided-audio-${randomUUID()}.${ext}`);
  await writeFile(path, buffer);
  tempPaths.push(path);
  return path;
}

function audioMetadata(selection: AudioSelection) {
  return {
    voiceoverAssetId: selection.voiceover?.id ?? null,
    musicAssetId: selection.music?.id ?? null,
    sfxAssetId: selection.sfx?.id ?? null,
    jingleAssetId: selection.jingle?.id ?? null,
    ducking: Boolean(selection.voiceover && selection.music),
    loudnessTargetLufs: -16,
    truePeakDb: -1.5,
  };
}

function commonTerritories(selection: AudioSelection): { territories: string[]; resolved: boolean } {
  const sources = Object.values(selection).filter((asset): asset is AudioAsset => Boolean(asset));
  let common: Set<string> | null = null;
  for (const asset of sources) {
    if (!hasRights(asset)) continue;
    const rights = normalizeMediaAudioRights(rightsObject(asset));
    if (rights.territories.includes("*")) continue;
    const current = new Set(rights.territories);
    common = common === null ? current : new Set([...common].filter((territory) => current.has(territory)));
  }
  if (common === null) return { territories: ["*"], resolved: true };
  if (common.size === 0) return { territories: ["UNRESOLVED"], resolved: false };
  return { territories: Array.from(common).sort(), resolved: true };
}

function masterRights(selection: AudioSelection) {
  const sources = Object.values(selection).filter((asset): asset is AudioAsset => Boolean(asset));
  const allHaveRights = sources.length > 0 && sources.every(hasRights);
  const rights = sources.filter(hasRights).map((asset) => normalizeMediaAudioRights(rightsObject(asset)));
  const assessments = sources.filter(hasRights).map((asset) => assessMediaAudioUsage(rightsObject(asset)));
  const territory = commonTerritories(selection);
  const organicAllowed = allHaveRights && territory.resolved && assessments.every((assessment) => assessment.organicAllowed);
  const paidAdsAllowed = organicAllowed && assessments.every((assessment) => assessment.paidAdsAllowed);
  const origins = new Set(rights.map((item) => item.origin));
  const expiresAt = rights
    .map((item) => item.expiresAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const attributionTexts = Array.from(new Set(rights.map((item) => item.attributionText).filter((value): value is string => Boolean(value))));
  const licenseReferences = Array.from(new Set(rights.map((item) => item.licenseReference).filter((value): value is string => Boolean(value))));
  const evidenceAssetIds = rights.map((item) => item.evidenceAssetId).filter((value): value is string => Boolean(value));
  return {
    status: allHaveRights ? (organicAllowed ? "cleared" : "restricted") : "pending",
    origin: origins.size === 1 ? Array.from(origins)[0] : "unknown",
    commercialUse: organicAllowed,
    paidAds: paidAdsAllowed,
    territories: territory.territories,
    expiresAt,
    attributionRequired: rights.some((item) => item.attributionRequired),
    attributionText: attributionTexts.length ? attributionTexts.join(" | ") : null,
    licenseReference: licenseReferences.length ? licenseReferences.join(" | ") : null,
    evidenceAssetId: evidenceAssetIds[0] ?? null,
  };
}

function selectionId(asset: AudioAsset | null): string | null {
  return asset?.id ?? null;
}

async function renderAudioMaster(input: {
  tenantId: string;
  userId?: string | null;
  title: string;
  duration: number;
  sceneCount: number;
  selection: AudioSelection;
}): Promise<{ assetId: string; projectId: string; metadata: ReturnType<typeof audioMetadata> }> {
  const tempPaths: string[] = [];
  const outputPath = join(tmpdir(), `guided-audio-master-${randomUUID()}.wav`);
  tempPaths.push(outputPath);
  let projectId = "";
  try {
    const args: string[] = ["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-t", input.duration.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
    const indexes: GuidedAudioIndexes = {};
    let nextIndex = 1;

    for (const [key, asset] of Object.entries(input.selection) as Array<[keyof AudioSelection, AudioAsset | null]>) {
      if (!asset) continue;
      const path = await materialize(asset, tempPaths);
      if (key === "music") args.push("-stream_loop", "-1");
      args.push("-i", path);
      indexes[key] = nextIndex;
      nextIndex += 1;
    }

    const duration = input.duration.toFixed(3);
    args.push(
      "-filter_complex", buildGuidedAudioFilterGraph({ duration: input.duration, sceneCount: input.sceneCount, indexes }),
      "-map", "[aout]",
      "-t", duration,
      "-c:a", "pcm_s16le",
      "-ar", "48000",
      "-ac", "2",
      outputPath,
    );

    await execFileAsync("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 });
    const output = await readFile(outputPath);
    if (!output.length) throw new Error("A masterização de áudio terminou sem gerar arquivo");

    const meta = audioMetadata(input.selection);
    projectId = await createProcessingMediaProject({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      title: `Master de áudio — ${input.title}`.slice(0, 120),
      operation: "guided_video_audio_master",
      kind: "audio",
      context: { duration: input.duration, sceneCount: input.sceneCount, ...meta },
    });
    const storageUrl = await objectStorage.savePrivateBuffer(output, "audio/wav", `guided-video-audio-${randomUUID()}.wav`);
    const registered = await registerGeneratedMediaOutput({
      tenantId: input.tenantId,
      projectId,
      userId: input.userId ?? null,
      storageUrl,
      mimeType: "audio/wav",
      fileSize: output.length,
      type: "audio",
      originalFilename: "guided-video-audio-master.wav",
      operation: "guided_video_audio_master",
      label: "Master de áudio automático",
      metadata: {
        audioKind: "other",
        audioMaster: true,
        generatedBy: "guided-video-audio-director-v2",
        durationSeconds: input.duration,
        ...meta,
        sourceAssetIds: [selectionId(input.selection.voiceover), selectionId(input.selection.music), selectionId(input.selection.sfx), selectionId(input.selection.jingle)].filter(Boolean),
        rights: masterRights(input.selection),
      },
    });
    return { assetId: registered.assetId, projectId, metadata: meta };
  } catch (error) {
    if (projectId) await setMediaProjectStatus(input.tenantId, projectId, "draft").catch(() => undefined);
    throw error;
  } finally {
    await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}

export async function prepareGuidedVideoAudio(input: {
  tenantId: string;
  userId?: string | null;
  title: string;
  context: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const professional = record(input.context["professionalCreation"]);
  if (professional["guided"] !== true) return input.context;
  if (professional["audioDirector"] && record(professional["audioDirector"])["masterAssetId"]) return input.context;

  const inputs = mediaInputs(input.context);
  const assets = await listAudioAssets(input.tenantId);
  const keywords = keywordsFor(input.context);
  const requestedJingleAssetId = String(professional["requestedJingleAssetId"] ?? "").trim();

  const manualVoiceId = assetIdForRole(inputs, ["voiceover"]);
  const manualMusicId = assetIdForRole(inputs, ["music"]);
  const manualSfxId = assetIdForRole(inputs, ["sfx"]);

  const voiceover = selectedAsset(assets, manualVoiceId, "voiceover");
  const music = manualMusicId ? selectedAsset(assets, manualMusicId, "music") : chooseBest(assets, "music", keywords);
  const sfx = manualSfxId ? selectedAsset(assets, manualSfxId, "sound_effect") : chooseBest(assets, "sound_effect", keywords);
  const jingle = requestedJingleAssetId ? selectedAsset(assets, requestedJingleAssetId, "jingle") : chooseBest(assets, "jingle", [...keywords, "brand", "logo", "sonic"]);

  const selection: AudioSelection = { voiceover, music, sfx, jingle };
  if (!voiceover && !music && !sfx && !jingle) {
    return {
      ...input.context,
      professionalCreation: {
        ...professional,
        audioDirector: { version: 2, automatic: true, status: "no_audio_available" },
      },
    };
  }

  const duration = Math.max(8, Math.min(120, Number(input.context["duration"] ?? 20) || 20));
  const sceneCount = Math.max(1, Math.min(12, Number(input.context["sceneCount"] ?? 1) || 1));
  const master = await renderAudioMaster({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    duration,
    sceneCount,
    selection,
  });

  const visualInputs = inputs.filter((item) => String(item["type"] ?? "") !== "audio");
  const currentEffects = record(input.context["effects"]);
  return {
    ...input.context,
    mediaInputs: [
      ...visualInputs,
      {
        assetId: master.assetId,
        type: "audio",
        role: "voiceover",
        importance: "preferred",
        order: 100,
        note: "Master de áudio montada automaticamente: voz/locução, trilha, ducking, efeitos e assinatura sonora quando disponíveis.",
      },
    ],
    effects: {
      ...currentEffects,
      beatSync: Boolean(music),
      bpm: Number(music?.metadata["bpm"] ?? currentEffects["bpm"] ?? 112) || 112,
    },
    professionalCreation: {
      ...professional,
      audioDirector: {
        version: 2,
        automatic: true,
        status: "ready",
        masterAssetId: master.assetId,
        masterProjectId: master.projectId,
        ...master.metadata,
      },
    },
  };
}
