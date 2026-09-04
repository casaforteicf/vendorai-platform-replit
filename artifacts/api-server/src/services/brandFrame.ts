import sharp from "sharp";

type BrandFrameOptions = {
  corPrimaria: string;
  logoUrl?: string | null;
  width?: number;
  height?: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 167, g: 133, b: 250 }; // fallback: roxo padrão da marca
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Escurece uma cor hex em `amount` (0-1) — usada pra gerar o segundo stop do gradiente a partir da cor primária do tenant. */
function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/**
 * Compõe um print/imagem crua dentro de uma moldura de marca: fundo em
 * gradiente derivado da cor primária do tenant, imagem original centralizada
 * com cantos arredondados e leve sombra, logo do tenant no rodapé quando
 * disponível. Pensado pra imagem que vai direto pro grid do Instagram (Feed),
 * onde um screenshot cru destoa visualmente do resto dos posts.
 *
 * Nunca lança por causa do logo (opcional, best-effort) — só lança se a
 * imagem de origem for inválida.
 */
export async function applyBrandFrame(sourceBuffer: Buffer, opts: BrandFrameOptions): Promise<Buffer> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1350; // 4:5 — proporção mais usada no Feed hoje na plataforma
  const primary = /^#[0-9a-fA-F]{3,6}$/.test(opts.corPrimaria || "") ? opts.corPrimaria : "#A78BFA";
  const secondary = darken(primary, 0.6);

  const backgroundSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primary}" />
          <stop offset="100%" stop-color="${secondary}" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
    </svg>`;
  const background = await sharp(Buffer.from(backgroundSvg)).png().toBuffer();

  // Área útil pra imagem original: padding proporcional, deixando espaço
  // extra embaixo pro logo quando existir.
  const pad = Math.round(width * 0.08);
  const logoReserve = opts.logoUrl ? Math.round(height * 0.09) : 0;
  const innerW = width - pad * 2;
  const innerMaxH = height - pad * 2 - logoReserve;

  const resizedShot = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: innerW, height: innerMaxH, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const shotMeta = await sharp(resizedShot).metadata();
  const shotW = shotMeta.width ?? innerW;
  const shotH = shotMeta.height ?? innerMaxH;

  const radius = Math.round(width * 0.02);
  const maskSvg = `<svg width="${shotW}" height="${shotH}" xmlns="http://www.w3.org/2000/svg"><rect width="${shotW}" height="${shotH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`;
  const roundedShot = await sharp(resizedShot)
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();

  const shotLeft = Math.round((width - shotW) / 2);
  const shotTop = Math.round(pad + (innerMaxH - shotH) / 2);

  // Sombra: retângulo arredondado preto translúcido, desenhado via SVG e
  // borrado — mais confiável que tentar escurecer o alpha da própria imagem.
  const shadowSvg = `<svg width="${shotW}" height="${shotH}" xmlns="http://www.w3.org/2000/svg"><rect width="${shotW}" height="${shotH}" rx="${radius}" ry="${radius}" fill="black" fill-opacity="0.35"/></svg>`;
  const shadow = await sharp(Buffer.from(shadowSvg)).blur(14).toBuffer();

  const composites = [
    { input: shadow, left: shotLeft, top: shotTop + 12 },
    { input: roundedShot, left: shotLeft, top: shotTop },
  ];

  if (opts.logoUrl) {
    try {
      const logoRes = await fetch(opts.logoUrl);
      if (logoRes.ok) {
        const logoBuf = Buffer.from(await logoRes.arrayBuffer());
        const logoTargetH = Math.round(logoReserve * 0.55);
        const resizedLogo = await sharp(logoBuf).resize({ height: logoTargetH, fit: "inside" }).png().toBuffer();
        const logoMeta = await sharp(resizedLogo).metadata();
        const logoW = logoMeta.width ?? logoTargetH;
        composites.push({
          input: resizedLogo,
          left: Math.round((width - logoW) / 2),
          top: height - pad - logoTargetH,
        });
      }
    } catch {
      // Logo é decoração opcional — nunca derruba a geração da moldura por causa dela.
    }
  }

  return sharp(background).composite(composites).jpeg({ quality: 90 }).toBuffer();
}
