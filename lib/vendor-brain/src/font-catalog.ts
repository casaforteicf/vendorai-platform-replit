export type FontCategory =
  | "luxury"
  | "editorial"
  | "display"
  | "creative"
  | "script"
  | "serif"
  | "sans"
  | "decorative";

export type CreativeChannel =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "whatsapp"
  | "google-ads"
  | "website"
  | "landing-page"
  | "email";

export interface FontCatalogItem {
  id: string;
  family: string;
  sourceFile: string;
  category: FontCategory;
  tags: string[];
  recommendedChannels: CreativeChannel[];
  recommendedUse: Array<"brand" | "headline" | "subheadline" | "cta" | "caption" | "video-overlay">;
  priority: number;
}

const ALL_SOCIAL: CreativeChannel[] = [
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "linkedin",
  "whatsapp",
  "google-ads",
  "website",
  "landing-page",
  "email",
];

const SOCIAL_VIDEO: CreativeChannel[] = ["instagram", "tiktok", "facebook", "youtube"];

export const VENDORAI_FONT_CATALOG: FontCatalogItem[] = [
  { id: "rigter", family: "Rigter", sourceFile: "rigter.otf", category: "display", tags: ["tech", "brand", "bold", "modern"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline", "cta", "video-overlay"], priority: 100 },
  { id: "bevorden", family: "Bevorden", sourceFile: "bevorden-regular.otf", category: "display", tags: ["modern", "clean", "premium"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline", "subheadline", "cta"], priority: 96 },
  { id: "bevorden-oblique", family: "Bevorden Oblique", sourceFile: "bevorden-oblique.otf", category: "display", tags: ["dynamic", "premium", "editorial"], recommendedChannels: SOCIAL_VIDEO, recommendedUse: ["headline", "cta", "video-overlay"], priority: 90 },
  { id: "brennon", family: "Brennon", sourceFile: "brennon-regular.otf", category: "luxury", tags: ["luxury", "premium", "architecture", "fashion"], recommendedChannels: ["instagram", "facebook", "linkedin", "website", "landing-page", "email"], recommendedUse: ["brand", "headline", "subheadline"], priority: 98 },
  { id: "aelyn", family: "Aelyn", sourceFile: "PS-Aelyn-Regular.otf", category: "luxury", tags: ["elegant", "luxury", "editorial"], recommendedChannels: ["instagram", "facebook", "linkedin", "website", "landing-page"], recommendedUse: ["brand", "headline"], priority: 94 },
  { id: "asbigan", family: "Asbigan", sourceFile: "asbigan-regular.ttf", category: "serif", tags: ["editorial", "premium", "classic"], recommendedChannels: ["instagram", "facebook", "linkedin", "website", "landing-page", "email"], recommendedUse: ["headline", "subheadline"], priority: 88 },
  { id: "malibu-script", family: "Malibu Sunday Script", sourceFile: "MalibuSundayScript-ovPKx.ttf", category: "script", tags: ["lifestyle", "beauty", "human", "expressive"], recommendedChannels: ["instagram", "tiktok", "facebook", "youtube"], recommendedUse: ["headline", "video-overlay"], priority: 78 },
  { id: "malibu-serif", family: "Malibu Sunday Serif", sourceFile: "MalibuSundaySerif-gwMnE.ttf", category: "serif", tags: ["lifestyle", "editorial", "warm"], recommendedChannels: ["instagram", "facebook", "linkedin", "website"], recommendedUse: ["headline", "subheadline"], priority: 82 },
  { id: "mysteris-vintage", family: "Mysteris Vintage", sourceFile: "mysterisvintage-r933v.ttf", category: "decorative", tags: ["vintage", "craft", "food", "retro"], recommendedChannels: ["instagram", "tiktok", "facebook", "youtube"], recommendedUse: ["headline", "video-overlay"], priority: 74 },
  { id: "neattype", family: "Neattype", sourceFile: "neattype-regular.ttf", category: "sans", tags: ["clean", "digital", "social", "modern"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["headline", "subheadline", "cta", "caption", "video-overlay"], priority: 97 },
  { id: "qurova", family: "Qurova", sourceFile: "QurovaDEMO-Regular-BF67a5c637a5dc9.otf", category: "creative", tags: ["creative", "fashion", "social"], recommendedChannels: SOCIAL_VIDEO, recommendedUse: ["headline", "video-overlay"], priority: 76 },
  { id: "sooner", family: "Sooner", sourceFile: "sooner.otf", category: "display", tags: ["bold", "fast", "promo", "impact"], recommendedChannels: SOCIAL_VIDEO.concat(["google-ads"]), recommendedUse: ["headline", "cta", "video-overlay"], priority: 92 },
  { id: "that-appeal", family: "That Appeal", sourceFile: "ThatAppeal-FreeDemo-BF65b7880fefd18.otf", category: "creative", tags: ["fashion", "beauty", "editorial"], recommendedChannels: ["instagram", "tiktok", "facebook"], recommendedUse: ["headline", "brand"], priority: 73 },
  { id: "type-ultimate", family: "Type Ultimate", sourceFile: "type-ultimate-regular.otf", category: "display", tags: ["premium", "modern", "campaign"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline", "cta"], priority: 93 },
  { id: "type-ultimate-swashes", family: "Type Ultimate Swashes", sourceFile: "type-ultimate-swashes.otf", category: "decorative", tags: ["accent", "luxury", "editorial"], recommendedChannels: ["instagram", "facebook", "website"], recommendedUse: ["brand", "headline"], priority: 60 },
  { id: "bemirs", family: "Bemirs", sourceFile: "BemirsDemoVersionRegular-L360Z.ttf", category: "creative", tags: ["creative", "social", "headline"], recommendedChannels: SOCIAL_VIDEO, recommendedUse: ["headline", "video-overlay"], priority: 72 },
  { id: "matcha-cih", family: "Matcha Cih", sourceFile: "Matcha Cih.otf", category: "display", tags: ["logo", "brand", "premium"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline"], priority: 91 },
  { id: "bruleni", family: "Bruleni", sourceFile: "BruleniDemo-Regular.otf", category: "creative", tags: ["creative", "display", "social"], recommendedChannels: SOCIAL_VIDEO, recommendedUse: ["headline", "video-overlay"], priority: 68 },
  { id: "galigo", family: "Galigo", sourceFile: "Galigo.ttf", category: "display", tags: ["logo", "modern", "brand"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline", "cta"], priority: 89 },
  { id: "midstar", family: "Midstar", sourceFile: "Midstar.otf", category: "creative", tags: ["impact", "promo", "entertainment"], recommendedChannels: SOCIAL_VIDEO, recommendedUse: ["headline", "video-overlay"], priority: 83 },
  { id: "adobo", family: "Adobo", sourceFile: "adobo.ttf", category: "decorative", tags: ["food", "casual", "local"], recommendedChannels: ["instagram", "tiktok", "facebook", "whatsapp"], recommendedUse: ["headline"], priority: 65 },
  { id: "mageline", family: "Mageline", sourceFile: "mageline.otf", category: "script", tags: ["elegant", "beauty", "premium"], recommendedChannels: ["instagram", "facebook", "website", "landing-page"], recommendedUse: ["brand", "headline"], priority: 84 },
  { id: "wisteriano", family: "Wisteriano", sourceFile: "Wisteriano.otf", category: "script", tags: ["signature", "luxury", "personal"], recommendedChannels: ["instagram", "facebook", "website"], recommendedUse: ["brand", "headline"], priority: 80 },
  // Luxury font set provided by the user. Publish only after the corresponding WOFF2 assets and web licenses are verified.
  { id: "awaking", family: "Awaking", sourceFile: "awaking.otf", category: "luxury", tags: ["luxury", "architecture", "modern", "premium"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline", "subheadline"], priority: 95 },
  { id: "clarissa", family: "Clarissa", sourceFile: "clarissa.otf", category: "script", tags: ["elegant", "beauty", "luxury", "signature"], recommendedChannels: ["instagram", "facebook", "website", "landing-page"], recommendedUse: ["brand", "headline"], priority: 85 },
  { id: "manage", family: "Manage", sourceFile: "manage.otf", category: "display", tags: ["modern", "branding", "architecture", "premium"], recommendedChannels: ALL_SOCIAL, recommendedUse: ["brand", "headline", "subheadline", "cta"], priority: 90 },
  { id: "qualli", family: "Qualli", sourceFile: "qualli.otf", category: "luxury", tags: ["luxury", "architecture", "editorial", "elegant"], recommendedChannels: ["instagram", "facebook", "linkedin", "website", "landing-page"], recommendedUse: ["brand", "headline", "subheadline"], priority: 93 },
  { id: "orcish", family: "Orcish", sourceFile: "OrcishPersonalUse-lxm0y-BF6a9f92cf1fe43.ttf", category: "decorative", tags: ["gaming", "fantasy", "entertainment"], recommendedChannels: ["instagram", "tiktok", "youtube"], recommendedUse: ["headline", "video-overlay"], priority: 55 },
];

export const VENDORAI_PUBLISHED_FONT_IDS = [
  "rigter",
  "malibu-serif",
  "type-ultimate-swashes",
  "adobo",
  // Luxury families remain catalog candidates until licensed WOFF2 assets are committed.
] as const;

const PUBLISHED_FONT_SET = new Set<string>(VENDORAI_PUBLISHED_FONT_IDS);

export function isPublishedVendorFont(font: FontCatalogItem | string): boolean {
  return PUBLISHED_FONT_SET.has(typeof font === "string" ? font : font.id);
}

export function getPublishedVendorFonts(): FontCatalogItem[] {
  return VENDORAI_FONT_CATALOG.filter(isPublishedVendorFont);
}

export function getFontsForChannel(channel: string, tags: string[] = []): FontCatalogItem[] {
  const normalized = channel.toLowerCase() as CreativeChannel;
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

  return VENDORAI_FONT_CATALOG
    .filter(isPublishedVendorFont)
    .filter((font) => font.recommendedChannels.includes(normalized) || normalized === "website")
    .map((font) => ({
      font,
      score: font.priority + font.tags.reduce((sum, tag) => sum + (tagSet.has(tag) ? 12 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ font }) => font);
}

export function selectFontPair(channel: string, tags: string[] = []) {
  const fonts = getFontsForChannel(channel, tags);
  const heading = fonts[0] ?? getPublishedVendorFonts()[0] ?? VENDORAI_FONT_CATALOG[0];
  const body = fonts.find((font) => font.id !== heading.id && (font.category === "sans" || font.category === "serif")) ?? fonts[1] ?? heading;
  return { heading, body };
}
