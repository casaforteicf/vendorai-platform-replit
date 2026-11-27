// Playbook por canal: regras objetivas de formato, mídia e destino.
// Fonte única para revisão, publicação e anúncios.

export type ChannelKey =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "google"
  | "whatsapp"
  | "site"
  | "email";

export type ChannelDestination = "landing_page" | "whatsapp" | "formulario_lead" | "site";

export interface ChannelRule {
  key: ChannelKey;
  label: string;
  formats: string[];
  requiresVideo: string[];
  supportsClickableLink: boolean;
  maxMedia: number;
  destinations: ChannelDestination[];
}

export interface ChannelIssue {
  code: "formato_incompativel" | "video_obrigatorio" | "midias_demais" | "destino_obrigatorio";
  message: string;
}

const RULES: Record<ChannelKey, ChannelRule> = {
  instagram: {
    key: "instagram",
    label: "Instagram",
    formats: ["feed", "stories", "reels", "carrossel"],
    requiresVideo: ["reels"],
    supportsClickableLink: false,
    maxMedia: 10,
    destinations: ["landing_page", "whatsapp", "formulario_lead"],
  },
  facebook: {
    key: "facebook",
    label: "Facebook",
    formats: ["feed", "stories", "reels", "carrossel"],
    requiresVideo: ["reels"],
    supportsClickableLink: true,
    maxMedia: 10,
    destinations: ["landing_page", "whatsapp", "formulario_lead"],
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    formats: ["tiktok"],
    requiresVideo: ["tiktok"],
    supportsClickableLink: false,
    maxMedia: 1,
    destinations: ["landing_page", "whatsapp"],
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    formats: ["linkedin_post", "feed", "carrossel"],
    requiresVideo: [],
    supportsClickableLink: true,
    maxMedia: 9,
    destinations: ["landing_page", "formulario_lead"],
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    formats: ["youtube_video", "youtube_short"],
    requiresVideo: ["youtube_video", "youtube_short"],
    supportsClickableLink: true,
    maxMedia: 1,
    destinations: ["landing_page", "site"],
  },
  google: {
    key: "google",
    label: "Google Ads",
    formats: ["search_ad", "display_ad", "performance_max"],
    requiresVideo: [],
    supportsClickableLink: true,
    maxMedia: 10,
    destinations: ["landing_page", "whatsapp", "formulario_lead", "site"],
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    formats: ["whatsapp"],
    requiresVideo: [],
    supportsClickableLink: true,
    maxMedia: 1,
    destinations: ["whatsapp"],
  },
  site: {
    key: "site",
    label: "Site/LP",
    formats: ["landing_page", "site"],
    requiresVideo: [],
    supportsClickableLink: true,
    maxMedia: 10,
    destinations: ["landing_page", "site"],
  },
  email: {
    key: "email",
    label: "E-mail",
    formats: ["email"],
    requiresVideo: [],
    supportsClickableLink: true,
    maxMedia: 1,
    destinations: ["landing_page", "site"],
  },
};

export function channelKeyFor(canal: string | null | undefined): ChannelKey | null {
  const value = String(canal ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("instagram") || value === "ig") return "instagram";
  if (value.includes("facebook") || value === "fb") return "facebook";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("youtube")) return "youtube";
  if (value.includes("google") || value.includes("adwords")) return "google";
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("site") || value.includes("lp") || value.includes("landing")) return "site";
  if (value.includes("email") || value.includes("e-mail")) return "email";
  return null;
}

export function channelRuleFor(canal: string | null | undefined): ChannelRule | null {
  const key = channelKeyFor(canal);
  return key ? RULES[key] : null;
}

export function validatePieceForChannel(input: {
  canal: string | null | undefined;
  tipo: string | null | undefined;
  mediaCount?: number | null;
  hasVideo?: boolean;
  destination?: ChannelDestination | null;
}): ChannelIssue[] {
  const rule = channelRuleFor(input.canal);
  if (!rule) return [];
  const tipo = String(input.tipo ?? "").toLowerCase();
  const issues: ChannelIssue[] = [];

  if (tipo && !rule.formats.includes(tipo)) {
    issues.push({
      code: "formato_incompativel",
      message: `${rule.label} não aceita o formato "${tipo}". Formatos: ${rule.formats.join(", ")}.`,
    });
  }
  if (rule.requiresVideo.includes(tipo) && input.hasVideo === false) {
    issues.push({
      code: "video_obrigatorio",
      message: `${rule.label} exige vídeo final nesta peça.`,
    });
  }
  const mediaCount = Number(input.mediaCount ?? 0);
  if (mediaCount > rule.maxMedia) {
    issues.push({
      code: "midias_demais",
      message: `${rule.label} aceita no máximo ${rule.maxMedia} mídia(s); a peça tem ${mediaCount}.`,
    });
  }
  if (rule.key === "google" && !input.destination) {
    issues.push({
      code: "destino_obrigatorio",
      message: "Anúncio no Google exige destino: landing page, WhatsApp ou formulário.",
    });
  }
  return issues;
}
