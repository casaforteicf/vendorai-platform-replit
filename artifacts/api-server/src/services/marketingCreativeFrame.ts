import sharp from "sharp";

/**
 * Camada de design determinística para criativos do Marketing.
 *
 * A IA gera a FOTOGRAFIA. Texto, CTA, cor e logo entram por código — assim não
 * há texto torto/embutido pela IA e a peça fica sempre na identidade do tenant.
 * Puro de rede (o logo é passado como buffer); o chamador resolve storage.
 */

export type CreativeFormat = "feed" | "stories" | "carousel";

export interface MarketingFrameInput {
  source: Buffer;
  format: CreativeFormat;
  brandName?: string | null;
  headline: string;
  cta: string;
  brandColor?: string | null;
  logo?: Buffer | null;
}

const WIDTH = 1080;

function heightFor(format: CreativeFormat): number {
  if (format === "stories") return 1920;
  return 1080;
}

function normalizeHex(value: string | null | undefined): string {
  const clean = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean : "#A78BFA";
}

function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!;
    if (last.length > maxChars - 1) lines[maxLines - 1] = `${last.slice(0, maxChars - 1).trimEnd()}…`;
  }
  return lines.length > 0 ? lines : [""];
}

function pillWidth(text: string, fontSize: number, width: number): number {
  return Math.min(width - 160, Math.max(220, Math.round(text.length * fontSize * 0.58) + 72));
}

export interface MarketingOverlayInput {
  format: CreativeFormat;
  brandName?: string | null;
  headline: string;
  cta: string;
  brandColor?: string | null;
  logo?: Buffer | null;
}

function overlaySvg(input: MarketingOverlayInput, height: number, hasLogo: boolean): Buffer {
  const width = WIDTH;
  const primary = normalizeHex(input.brandColor);
  const onPrimary = luminance(primary) > 150 ? "#111827" : "#FFFFFF";
  const brand = String(input.brandName ?? "").trim();
  const headline = String(input.headline ?? "").trim();
  const cta = String(input.cta ?? "").trim();

  const headlineSize = input.format === "stories" ? 72 : 64;
  const headlineLines = wrap(headline, input.format === "stories" ? 20 : 24, 3);
  const lineHeight = Math.round(headlineSize * 1.12);
  const headlineBlockHeight = headlineLines.length * lineHeight;
  const baseY = height - 150 - 96 - headlineBlockHeight;
  const headlineSvg = headlineLines
    .map((line, index) => `<text x="72" y="${baseY + index * lineHeight}" fill="#FFFFFF" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="${headlineSize}" font-weight="700">${escapeXml(line)}</text>`)
    .join("");

  const ctaTextSize = 40;
  const ctaWidth = pillWidth(cta, ctaTextSize, width);
  const ctaY = height - 150;
  const brandY = hasLogo ? 150 : 96;

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stop-color="#000000" stop-opacity="0" />
          <stop offset="0.78" stop-color="#000000" stop-opacity="0.55" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.82" />
        </linearGradient>
        <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0.42" />
          <stop offset="1" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)" />
      <rect width="100%" height="30%" fill="url(#top)" />
      ${brand && !hasLogo ? `<text x="72" y="${brandY}" fill="#FFFFFF" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="30" font-weight="700" letter-spacing="3">${escapeXml(brand.toUpperCase().slice(0, 42))}</text>` : ""}
      ${headlineSvg}
      <rect x="72" y="${ctaY}" width="${ctaWidth}" height="84" rx="42" fill="${primary}" />
      <text x="${72 + ctaWidth / 2}" y="${ctaY + 54}" text-anchor="middle" fill="${onPrimary}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="${ctaTextSize}" font-weight="700">${escapeXml(cta.slice(0, 34))}</text>
    </svg>
  `);
}

async function logoPng(logo?: Buffer | null): Promise<Buffer | null> {
  if (!logo) return null;
  try {
    return await sharp(logo).resize({ height: 96, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
}

/** Overlay transparente (PNG) com gradiente, marca, headline e CTA. */
export async function renderMarketingOverlay(input: MarketingOverlayInput): Promise<Buffer> {
  const height = heightFor(input.format);
  const logo = await logoPng(input.logo);
  const base = sharp(overlaySvg(input, height, Boolean(logo))).png();
  if (!logo) return base.toBuffer();
  return base
    .composite([{ input: logo, top: 48, left: 72 }])
    .png()
    .toBuffer();
}

/** Renderiza a peça final: foto + overlay de marca (PNG) + logo. */
export async function renderMarketingCreative(input: MarketingFrameInput): Promise<Buffer> {
  const height = heightFor(input.format);
  const overlay = await renderMarketingOverlay({
    format: input.format,
    brandName: input.brandName,
    headline: input.headline,
    cta: input.cta,
    brandColor: input.brandColor,
    logo: input.logo,
  });
  return sharp(input.source)
    .resize(WIDTH, height, { fit: "cover", position: "attention" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
