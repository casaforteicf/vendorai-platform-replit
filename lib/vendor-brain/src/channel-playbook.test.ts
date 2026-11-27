import { describe, expect, it } from "vitest";
import { channelKeyFor, channelRuleFor, validatePieceForChannel } from "./channel-playbook";

describe("channelKeyFor", () => {
  it("reconhece canais por nome", () => {
    expect(channelKeyFor("Instagram")).toBe("instagram");
    expect(channelKeyFor("Facebook Ads")).toBe("facebook");
    expect(channelKeyFor("Google")).toBe("google");
    expect(channelKeyFor("TikTok")).toBe("tiktok");
    expect(channelKeyFor("WhatsApp")).toBe("whatsapp");
    expect(channelKeyFor("LinkedIn")).toBe("linkedin");
    expect(channelKeyFor("YouTube")).toBe("youtube");
    expect(channelKeyFor("desconhecido")).toBeNull();
  });
});

describe("validatePieceForChannel", () => {
  it("aceita feed no Instagram", () => {
    expect(validatePieceForChannel({ canal: "Instagram", tipo: "feed" })).toEqual([]);
  });

  it("bloqueia formato fora do canal", () => {
    const issues = validatePieceForChannel({ canal: "TikTok", tipo: "feed" });
    expect(issues.map((issue) => issue.code)).toContain("formato_incompativel");
  });

  it("exige vídeo no Reel e no TikTok", () => {
    expect(validatePieceForChannel({ canal: "Instagram", tipo: "reels", hasVideo: false })[0]?.code).toBe("video_obrigatorio");
    expect(validatePieceForChannel({ canal: "TikTok", tipo: "tiktok", hasVideo: false })[0]?.code).toBe("video_obrigatorio");
    expect(validatePieceForChannel({ canal: "TikTok", tipo: "tiktok", hasVideo: true })).toEqual([]);
  });

  it("limita mídias do carrossel", () => {
    expect(validatePieceForChannel({ canal: "Instagram", tipo: "carrossel", mediaCount: 11 })[0]?.code).toBe("midias_demais");
  });

  it("exige destino no Google", () => {
    expect(validatePieceForChannel({ canal: "Google", tipo: "search_ad" })[0]?.code).toBe("destino_obrigatorio");
    expect(validatePieceForChannel({ canal: "Google", tipo: "search_ad", destination: "landing_page" })).toEqual([]);
  });

  it("expõe as regras do canal", () => {
    const rule = channelRuleFor("Instagram");
    expect(rule?.supportsClickableLink).toBe(false);
    expect(rule?.maxMedia).toBe(10);
  });
});
