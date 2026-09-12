import { describe, expect, it } from "vitest";
import {
  buildMediaRetrievalPlan,
  rankMediaForScene,
  targetFormatForChannel,
  type MediaRetrievalAsset,
} from "./media-retrieval-director";

function asset(input: Partial<MediaRetrievalAsset> & Pick<MediaRetrievalAsset, "id">): MediaRetrievalAsset {
  return {
    id: input.id,
    type: input.type ?? "image",
    source: input.source ?? "upload",
    originalFilename: input.originalFilename ?? `${input.id}.jpg`,
    metadata: input.metadata ?? {},
    role: input.role ?? "source",
  };
}

describe("Media Retrieval Director", () => {
  it("mapeia os canais principais para o formato correto", () => {
    expect(targetFormatForChannel("Instagram / Reels")).toBe("9:16");
    expect(targetFormatForChannel("TikTok")).toBe("9:16");
    expect(targetFormatForChannel("YouTube")).toBe("16:9");
    expect(targetFormatForChannel("Site / Landing Page")).toBe("16:9");
  });

  it("prioriza mídia real, relevante, de qualidade e adequada ao formato", () => {
    const assets = [
      asset({
        id: "real-product",
        source: "upload",
        originalFilename: "janela-pvc-produto.jpg",
        metadata: {
          mediaIntelligence: {
            status: "ready",
            searchTags: ["janela", "pvc", "produto"],
            dimensions: { orientation: "portrait", width: 1080, height: 1920 },
            composition: { whitespaceSide: "left", activityGrid: [30, 40, 80, 28, 48, 88, 32, 45, 82] },
            subjects: { labels: ["produto"] },
            quality: { score: 94 },
            crops: [{ format: "9:16", subjectSafe: true }],
          },
        },
      }),
      asset({
        id: "generated-product",
        source: "generated",
        originalFilename: "janela-pvc-ai.jpg",
        metadata: {
          mediaIntelligence: {
            status: "ready",
            searchTags: ["janela", "pvc", "produto"],
            dimensions: { orientation: "portrait" },
            composition: { whitespaceSide: "left", activityGrid: [30, 40, 80, 28, 48, 88, 32, 45, 82] },
            quality: { score: 96 },
            crops: [{ format: "9:16", subjectSafe: true }],
          },
        },
      }),
      asset({
        id: "real-unrelated",
        source: "upload",
        originalFilename: "equipe-escritorio.jpg",
        metadata: {
          mediaIntelligence: {
            status: "ready",
            searchTags: ["equipe", "escritorio"],
            dimensions: { orientation: "landscape" },
            composition: { whitespaceSide: "right", activityGrid: [60, 62, 58, 64, 70, 66, 61, 63, 60] },
            quality: { score: 88 },
            crops: [{ format: "9:16", subjectSafe: false }],
          },
        },
      }),
    ];

    const ranked = rankMediaForScene(
      { visual: "close da janela de PVC mostrando o produto", fala: "Veja a janela de PVC instalada" },
      assets,
      { channel: "Instagram / Reels", textZone: "left" },
    );

    expect(ranked[0]?.assetId).toBe("real-product");
    expect(ranked[0]?.score ?? 0).toBeGreaterThan(ranked[1]?.score ?? 0);
    expect(ranked[0]?.reasons.some((reason) => reason.includes("mídia real"))).toBe(true);
  });

  it("não repete mídia quando monta um plano para várias cenas", () => {
    const assets = [
      asset({ id: "a", originalFilename: "produto detalhe.jpg", metadata: { mediaIntelligence: { searchTags: ["produto", "detalhe"], quality: { score: 90 } } } }),
      asset({ id: "b", originalFilename: "produto aplicacao.jpg", metadata: { mediaIntelligence: { searchTags: ["produto", "aplicacao"], quality: { score: 88 } } } }),
    ];

    const plan = buildMediaRetrievalPlan(
      [
        { visual: "produto em detalhe" },
        { visual: "produto em aplicação" },
      ],
      assets,
      { channel: "Instagram / Reels" },
    );

    expect(plan[0]?.assetId).toBeTruthy();
    expect(plan[1]?.assetId).toBeTruthy();
    expect(plan[0]?.assetId).not.toBe(plan[1]?.assetId);
  });
});
