export type CapabilityStatus = "active" | "beta" | "planned";

export type ModuleId =
  | "crm"
  | "contacts"
  | "conversations"
  | "catalog"
  | "orders"
  | "stock"
  | "projects"
  | "service"
  | "finance"
  | "marketing"
  | "routes"
  | "commission"
  | "portal"
  | "media"
  | "website"
  | "automation"
  | "ai";

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  status: CapabilityStatus;
  dependencies?: ModuleId[];
  capabilities: string[];
}

export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition> = {
  crm: { id: "crm", name: "CRM", status: "active", capabilities: ["leads", "pipeline", "opportunities"] },
  contacts: { id: "contacts", name: "Contatos", status: "active", capabilities: ["contacts", "customers"] },
  conversations: { id: "conversations", name: "Conversas", status: "active", capabilities: ["whatsapp", "instagram", "email"] },
  catalog: { id: "catalog", name: "Catálogo", status: "active", capabilities: ["products", "pricing", "media"] },
  orders: { id: "orders", name: "Pedidos", status: "active", capabilities: ["orders", "quotes"] },
  stock: { id: "stock", name: "Estoque", status: "active", capabilities: ["inventory", "availability"] },
  projects: { id: "projects", name: "Projetos", status: "active", capabilities: ["projects", "stages", "documents"] },
  service: { id: "service", name: "Atendimento", status: "active", capabilities: ["tickets", "assistance", "sla"] },
  finance: { id: "finance", name: "Financeiro", status: "active", capabilities: ["receivables", "collections", "cashflow"] },
  marketing: { id: "marketing", name: "Marketing", status: "active", capabilities: ["planner", "campaigns", "content", "ads", "performance"] },
  routes: { id: "routes", name: "Rotas", status: "active", capabilities: ["visits", "territories", "routing"] },
  commission: { id: "commission", name: "Comissões", status: "active", capabilities: ["commission-rules", "settlement"] },
  portal: { id: "portal", name: "Portal", status: "active", capabilities: ["customer-portal", "public-pages"] },
  media: { id: "media", name: "Mídias", status: "active", capabilities: ["photos", "videos", "audio", "documents", "curation"] },
  website: { id: "website", name: "Site & LP", status: "active", capabilities: ["website", "landing-page", "tracking"] },
  automation: { id: "automation", name: "Automação", status: "active", capabilities: ["trigger", "condition", "action"] },
  ai: { id: "ai", name: "IA", status: "active", capabilities: ["agents", "skills", "tools", "memory"] },
};

export type SkillId =
  | "marketing.strategy"
  | "marketing.campaign-planning"
  | "marketing.audience-intelligence"
  | "marketing.crm-marketing"
  | "marketing.copywriting"
  | "creative.direction"
  | "creative.design-review"
  | "creative.brand-guardian"
  | "creative.video-strategy"
  | "creative.video-script"
  | "marketing.analytics"
  | "marketing.experimentation"
  | "channel.meta-ads"
  | "channel.instagram-organic"
  | "channel.google-search"
  | "channel.google-pmax"
  | "channel.tiktok"
  | "channel.youtube"
  | "channel.linkedin"
  | "channel.whatsapp"
  | "channel.email";

export interface SkillDefinition {
  id: SkillId;
  name: string;
  domain: "marketing" | "creative" | "channel";
  status: CapabilityStatus;
  responsibilities: string[];
}

export const SKILL_REGISTRY: Record<SkillId, SkillDefinition> = {
  "marketing.strategy": { id: "marketing.strategy", name: "Strategy", domain: "marketing", status: "active", responsibilities: ["objectives", "positioning", "priorities", "channel-mix"] },
  "marketing.campaign-planning": { id: "marketing.campaign-planning", name: "Campaign Planning", domain: "marketing", status: "active", responsibilities: ["campaign-brief", "calendar", "kpis"] },
  "marketing.audience-intelligence": { id: "marketing.audience-intelligence", name: "Audience Intelligence", domain: "marketing", status: "active", responsibilities: ["segmentation", "intent", "audience-fit"] },
  "marketing.crm-marketing": { id: "marketing.crm-marketing", name: "CRM Marketing", domain: "marketing", status: "active", responsibilities: ["repurchase", "cross-sell", "upsell", "reactivation"] },
  "marketing.copywriting": { id: "marketing.copywriting", name: "Copywriting", domain: "marketing", status: "active", responsibilities: ["headline", "body-copy", "cta", "channel-adaptation"] },
  "creative.direction": { id: "creative.direction", name: "Creative Direction", domain: "creative", status: "active", responsibilities: ["concept", "composition", "visual-direction", "creative-brief"] },
  "creative.design-review": { id: "creative.design-review", name: "Design Review", domain: "creative", status: "beta", responsibilities: ["readability", "hierarchy", "composition", "channel-fit"] },
  "creative.brand-guardian": { id: "creative.brand-guardian", name: "Brand Guardian", domain: "creative", status: "beta", responsibilities: ["brand-compliance", "tone", "identity"] },
  "creative.video-strategy": { id: "creative.video-strategy", name: "Video Strategy", domain: "creative", status: "active", responsibilities: ["format", "hook", "story-arc"] },
  "creative.video-script": { id: "creative.video-script", name: "Video Script", domain: "creative", status: "active", responsibilities: ["script", "shots", "captions", "cta"] },
  "marketing.analytics": { id: "marketing.analytics", name: "Analytics", domain: "marketing", status: "active", responsibilities: ["performance", "diagnosis", "recommendations"] },
  "marketing.experimentation": { id: "marketing.experimentation", name: "Experimentation", domain: "marketing", status: "active", responsibilities: ["ab-tests", "hypotheses", "creative-rotation"] },
  "channel.meta-ads": { id: "channel.meta-ads", name: "Meta Ads", domain: "channel", status: "active", responsibilities: ["feed", "stories", "reels", "carousel", "paid-media"] },
  "channel.instagram-organic": { id: "channel.instagram-organic", name: "Instagram Organic", domain: "channel", status: "active", responsibilities: ["feed", "stories", "reels", "carousel"] },
  "channel.google-search": { id: "channel.google-search", name: "Google Search", domain: "channel", status: "active", responsibilities: ["intent", "keywords", "responsive-search-ads"] },
  "channel.google-pmax": { id: "channel.google-pmax", name: "Google Performance Max", domain: "channel", status: "beta", responsibilities: ["asset-groups", "audience-signals", "performance"] },
  "channel.tiktok": { id: "channel.tiktok", name: "TikTok", domain: "channel", status: "planned", responsibilities: ["native-video", "hooks", "paid-media"] },
  "channel.youtube": { id: "channel.youtube", name: "YouTube", domain: "channel", status: "planned", responsibilities: ["shorts", "video-ads", "long-form"] },
  "channel.linkedin": { id: "channel.linkedin", name: "LinkedIn", domain: "channel", status: "planned", responsibilities: ["b2b", "lead-gen", "professional-content"] },
  "channel.whatsapp": { id: "channel.whatsapp", name: "WhatsApp", domain: "channel", status: "active", responsibilities: ["templates", "reactivation", "relationship"] },
  "channel.email": { id: "channel.email", name: "Email", domain: "channel", status: "active", responsibilities: ["newsletter", "nurture", "reactivation"] },
};

export type ChannelId = "meta" | "instagram" | "google-search" | "google-pmax" | "tiktok" | "youtube" | "linkedin" | "whatsapp" | "email";

export interface ChannelDefinition {
  id: ChannelId;
  name: string;
  status: CapabilityStatus;
  intent: string;
  formats: string[];
  metrics: string[];
  skillIds: SkillId[];
}

export const CHANNEL_REGISTRY: Record<ChannelId, ChannelDefinition> = {
  meta: { id: "meta", name: "Meta Ads", status: "active", intent: "discovery-and-conversion", formats: ["feed", "stories", "reels", "carousel"], metrics: ["cpm", "ctr", "cpl", "cpa", "roas", "frequency"], skillIds: ["channel.meta-ads", "marketing.copywriting", "creative.direction", "marketing.analytics"] },
  instagram: { id: "instagram", name: "Instagram", status: "active", intent: "attention-and-relationship", formats: ["feed", "stories", "reels", "carousel"], metrics: ["reach", "retention", "saves", "shares", "engagement", "leads"], skillIds: ["channel.instagram-organic", "marketing.copywriting", "creative.direction"] },
  "google-search": { id: "google-search", name: "Google Search", status: "active", intent: "high-intent-demand-capture", formats: ["responsive-search-ad"], metrics: ["impressions", "ctr", "cpc", "conversion-rate", "cpa"], skillIds: ["channel.google-search", "marketing.copywriting", "marketing.analytics"] },
  "google-pmax": { id: "google-pmax", name: "Google Performance Max", status: "beta", intent: "cross-network-conversion", formats: ["text", "image", "video", "asset-group"], metrics: ["conversions", "conversion-value", "cpa", "roas"], skillIds: ["channel.google-pmax", "creative.direction", "marketing.analytics"] },
  tiktok: { id: "tiktok", name: "TikTok", status: "planned", intent: "native-discovery", formats: ["vertical-video"], metrics: ["hold-rate", "completion-rate", "ctr", "cpa"], skillIds: ["channel.tiktok", "creative.video-strategy", "creative.video-script"] },
  youtube: { id: "youtube", name: "YouTube", status: "planned", intent: "video-discovery-and-intent", formats: ["shorts", "in-stream", "video"], metrics: ["view-rate", "watch-time", "ctr", "conversions"], skillIds: ["channel.youtube", "creative.video-strategy", "creative.video-script"] },
  linkedin: { id: "linkedin", name: "LinkedIn", status: "planned", intent: "b2b-demand", formats: ["single-image", "video", "lead-gen"], metrics: ["ctr", "cpl", "lead-quality"], skillIds: ["channel.linkedin", "marketing.copywriting"] },
  whatsapp: { id: "whatsapp", name: "WhatsApp", status: "active", intent: "relationship-and-reactivation", formats: ["template", "text", "image", "video"], metrics: ["delivered", "read", "reply", "conversion"], skillIds: ["channel.whatsapp", "marketing.crm-marketing", "marketing.copywriting"] },
  email: { id: "email", name: "Email", status: "active", intent: "nurture-and-reactivation", formats: ["newsletter", "campaign", "transactional"], metrics: ["delivery", "open", "click", "reply", "conversion"], skillIds: ["channel.email", "marketing.copywriting", "marketing.analytics"] },
};

export type AgentId = "business" | "sales" | "marketing" | "finance" | "support" | "operations" | "follow-up";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  scope: "platform" | "tenant";
  status: CapabilityStatus;
  moduleIds: ModuleId[];
  skillIds: SkillId[];
  defaultAutonomy: "read" | "recommend" | "prepare" | "execute-with-limits";
}

export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  business: { id: "business", name: "Business Agent", scope: "tenant", status: "planned", moduleIds: ["crm", "marketing", "finance", "service", "ai"], skillIds: ["marketing.analytics"], defaultAutonomy: "recommend" },
  sales: { id: "sales", name: "Sales Agent", scope: "tenant", status: "active", moduleIds: ["crm", "contacts", "conversations", "catalog", "orders", "ai"], skillIds: ["marketing.audience-intelligence", "marketing.crm-marketing"], defaultAutonomy: "prepare" },
  marketing: { id: "marketing", name: "Marketing Agent", scope: "tenant", status: "beta", moduleIds: ["marketing", "media", "website", "crm", "contacts", "catalog", "ai"], skillIds: ["marketing.strategy", "marketing.campaign-planning", "marketing.audience-intelligence", "marketing.crm-marketing", "marketing.copywriting", "creative.direction", "creative.design-review", "creative.brand-guardian", "creative.video-strategy", "creative.video-script", "marketing.analytics", "marketing.experimentation"], defaultAutonomy: "prepare" },
  finance: { id: "finance", name: "Finance Agent", scope: "tenant", status: "active", moduleIds: ["finance", "crm", "ai"], skillIds: [], defaultAutonomy: "recommend" },
  support: { id: "support", name: "Support Agent", scope: "tenant", status: "active", moduleIds: ["service", "conversations", "ai"], skillIds: [], defaultAutonomy: "prepare" },
  operations: { id: "operations", name: "Operations Agent", scope: "tenant", status: "beta", moduleIds: ["orders", "stock", "projects", "service", "routes", "ai"], skillIds: [], defaultAutonomy: "recommend" },
  "follow-up": { id: "follow-up", name: "Follow-up Agent", scope: "tenant", status: "active", moduleIds: ["crm", "conversations", "automation", "ai"], skillIds: ["marketing.copywriting"], defaultAutonomy: "prepare" },
};

export interface MarketingAgentContext {
  tenantId: string;
  verticalId?: string | null;
  userId?: string | null;
  page?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  campaignId?: string | null;
}

export interface MarketingAgentAutonomy {
  read: boolean;
  recommend: boolean;
  prepare: boolean;
  publishContent: boolean;
  publishAds: boolean;
  changeBudget: boolean;
  pauseCampaign: boolean;
}

export const DEFAULT_MARKETING_AGENT_AUTONOMY: MarketingAgentAutonomy = {
  read: true,
  recommend: true,
  prepare: true,
  publishContent: false,
  publishAds: false,
  changeBudget: false,
  pauseCampaign: false,
};

export function getChannelDefinition(channelId: ChannelId): ChannelDefinition {
  return CHANNEL_REGISTRY[channelId];
}

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  return AGENT_REGISTRY[agentId];
}

export function getModuleDefinition(moduleId: ModuleId): ModuleDefinition {
  return MODULE_REGISTRY[moduleId];
}
