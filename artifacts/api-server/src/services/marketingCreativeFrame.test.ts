import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderMarketingCreative } from "./marketingCreativeFrame.js";

async function solid(width = 800, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 120 } } }).jpeg().toBuffer();
}

describe("marketingCreativeFrame", () => {
  it("gera feed 1080x1080 com marca, headline e CTA", async () => {
    const out = await renderMarketingCreative({
      source: await solid(),
      format: "feed",
      brandName: "Hotel Teste",
      headline: "Pacote de férias 2027",
      cta: "Reserve agora",
      brandColor: "#dcd509",
    });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it("gera stories 1080x1920", async () => {
    const out = await renderMarketingCreative({
      source: await solid(720, 1600),
      format: "stories",
      brandName: "Hotel Teste",
      headline: "Fim de semana nas termas",
      cta: "Saiba mais",
      brandColor: "#112233",
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("não quebra com headline longa e sem logo", async () => {
    const out = await renderMarketingCreative({
      source: await solid(),
      format: "carousel",
      headline: "Uma experiência completa de descanso para toda a família com café da manhã incluso",
      cta: "Reserve agora!",
      brandColor: "#A78BFA",
    });
    expect(out.length).toBeGreaterThan(10_000);
  });
});
