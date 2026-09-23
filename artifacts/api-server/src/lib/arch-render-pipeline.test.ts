import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validateArchitecturalStructure } from "./arch-render-pipeline";

async function facadeImage(offsetX = 0, mirrored = false) {
  const width = 900;
  const height = 600;
  const left = mirrored ? 900 - (120 + offsetX) - 500 : 120 + offsetX;
  const doorX = mirrored ? left + 70 : left + 350;
  const windowX = mirrored ? left + 310 : left + 90;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <rect x="${left}" y="190" width="500" height="260" fill="#f8fafc" stroke="#111827" stroke-width="8"/>
      <rect x="${left + 35}" y="135" width="430" height="55" fill="#e5e7eb" stroke="#111827" stroke-width="8"/>
      <rect x="${doorX}" y="285" width="80" height="165" fill="#cbd5e1" stroke="#111827" stroke-width="8"/>
      <rect x="${windowX}" y="255" width="140" height="95" fill="#dbeafe" stroke="#111827" stroke-width="8"/>
      <line x1="${left + 250}" y1="190" x2="${left + 250}" y2="450" stroke="#111827" stroke-width="5"/>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("Arqdor post-render structural QA", () => {
  it("accepts a render that preserves the facade structure", async () => {
    const source = await facadeImage();
    const result = await facadeImage(4);
    const validation = await validateArchitecturalStructure(source, result);

    expect(validation.valid).toBe(true);
    expect(validation.edgeCoverage).toBeGreaterThan(0.5);
  });

  it("rejects a strongly displaced facade", async () => {
    const source = await facadeImage();
    const result = await facadeImage(230);
    const validation = await validateArchitecturalStructure(source, result);

    expect(validation.valid).toBe(false);
  });

  it("flags horizontal mirroring when the asymmetric facade is flipped", async () => {
    const source = await facadeImage();
    const result = await facadeImage(0, true);
    const validation = await validateArchitecturalStructure(source, result);

    expect(validation.valid).toBe(false);
    expect(validation.mirroredCoverage).toBeGreaterThan(validation.edgeCoverage);
  });
});
