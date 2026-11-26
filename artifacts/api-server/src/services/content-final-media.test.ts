import { describe, expect, it } from "vitest";
import {
  finalVideoUrlFromGeneration,
  generationHasFinalVideo,
  isVideoCalendarType,
} from "./content-final-media";

describe("isVideoCalendarType", () => {
  it("identifica formatos que exigem vídeo final", () => {
    expect(isVideoCalendarType("reels")).toBe(true);
    expect(isVideoCalendarType("tiktok")).toBe(true);
    expect(isVideoCalendarType("youtube_short")).toBe(true);
    expect(isVideoCalendarType("youtube_video")).toBe(true);
    expect(isVideoCalendarType("REELS")).toBe(true);
  });

  it("não exige vídeo para formatos estáticos", () => {
    expect(isVideoCalendarType("feed")).toBe(false);
    expect(isVideoCalendarType("carrossel")).toBe(false);
    expect(isVideoCalendarType("blog")).toBe(false);
    expect(isVideoCalendarType("")).toBe(false);
    expect(isVideoCalendarType(null)).toBe(false);
  });
});

describe("finalVideoUrlFromGeneration", () => {
  it("lê videoUrl e videoUrls das variações", () => {
    expect(finalVideoUrlFromGeneration({ variations: [{ videoUrl: "/objects/videos/a.mp4" }] })).toBe("/objects/videos/a.mp4");
    expect(finalVideoUrlFromGeneration({ variations: [{ videoUrls: ["", "/objects/videos/b.mp4"] }] })).toBe("/objects/videos/b.mp4");
  });

  it("usa o vídeo da automação como fallback", () => {
    expect(finalVideoUrlFromGeneration({ automation: { videoUrl: "/objects/videos/c.mp4" } })).toBe("/objects/videos/c.mp4");
  });

  it("retorna vazio quando só existe roteiro/foto", () => {
    expect(finalVideoUrlFromGeneration({ variations: [{ caption: "texto" }] })).toBe("");
    expect(finalVideoUrlFromGeneration(null)).toBe("");
  });
});

describe("generationHasFinalVideo", () => {
  it("aceita URL de vídeo ou asset final", () => {
    expect(generationHasFinalVideo({ variations: [{ videoUrl: "/objects/v.mp4" }] })).toBe(true);
    expect(generationHasFinalVideo({ automation: { videoAssetId: "asset-1" } })).toBe(true);
  });

  it("rejeita geração sem mídia final", () => {
    expect(generationHasFinalVideo({ variations: [{ hook: "gancho" }], automation: { status: "video_failed" } })).toBe(false);
  });
});
