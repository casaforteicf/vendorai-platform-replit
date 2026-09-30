import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositeWithOriginal, createRectMask } from "./arch-render-pipeline.js";

describe("compositeWithOriginal local edit", () => {
  it("preserva pixel a pixel tudo que estiver fora da máscara", async () => {
    const width = 10;
    const height = 10;

    const original = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 },
      },
    }).png().toBuffer();

    const generated = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 220, g: 30, b: 40, alpha: 1 },
      },
    }).png().toBuffer();

    // Seleciona somente o quadrado central 40%-60% em X/Y.
    const mask = await createRectMask([{ x: 40, y: 40, w: 20, h: 20 }], width, height);
    const result = await compositeWithOriginal(generated, original, mask);

    const [origRaw, genRaw, resultRaw, maskRaw] = await Promise.all([
      sharp(original).ensureAlpha().raw().toBuffer(),
      sharp(generated).ensureAlpha().raw().toBuffer(),
      sharp(result).ensureAlpha().raw().toBuffer(),
      sharp(mask).greyscale().raw().toBuffer(),
    ]);

    for (let i = 0; i < width * height; i += 1) {
      const offset = i * 4;
      const expected = (maskRaw[i] ?? 0) >= 128 ? genRaw : origRaw;
      expect(Array.from(resultRaw.subarray(offset, offset + 4))).toEqual(
        Array.from(expected.subarray(offset, offset + 4)),
      );
    }
  });
});
