export type RenderStudioPreset =
  | "facade_exterior_preserve"
  | "interior_layout_preserve"
  | "material_detail_enhancer"
  | "distortion_correction"
  | "camera_perspective_lock"
  | "joinery_precision"
  | "roof_openings_lock"
  | "lighting_realism"
  | "landscape_controlled"
  | "pool_water_fidelity"
  | "glass_mirror_fidelity"
  | "outdoor_gourmet_preserve"
  | "deck_pergola_preserve"
  | "wall_gate_fidelity"
  | "night_lighting_exterior"
  | "guardrail_glass_precision"
  | "ceiling_led_linear"
  | "ambient_boost"
  | "shadow_softening"
  | "exposure_lift_controlled";

export type RenderStudioVideoMovement =
  | "zoom_in_soft" | "zoom_out_soft" | "pan_left_soft" | "pan_right_soft"
  | "tilt_up_soft" | "tilt_down_soft" | "orbit_left_soft" | "orbit_right_soft"
  | "parallax_soft" | "cinematic_micro_movement";

export type RenderStudioImprovementMode = "improve" | "change-material" | "change-lighting";

export type RenderStudioSceneType = "interior" | "facade" | "outdoor" | "gourmet" | "pool";
export type RenderStudioProfile = "technical" | "premium" | "decorated";
export type RenderStudioVisualStyle = "original" | "contemporary" | "minimalist" | "provencal";
export type RenderStudioLightingProfile = "natural" | "balanced" | "more_light" | "warm" | "editorial" | "night";

export type RenderStudioCatalogItem = {
  id: string;
  nome: string;
  categoria: string;
  fornecedor?: string;
  imagens?: string[];
  propriedades?: Record<string, string>;
  preco?: number;
  referencia?: string;
};

export type RenderStudioApprovalRecord = {
  by: string;
  at: Date;
  note: string;
};

export type RenderStudioEventLogEntry = {
  id: string;
  type: string;
  label: string;
  timestamp: Date;
};

export type RenderStudioCanvasMode = "fit" | "1to1";

export type RenderStudioSelectionRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  id: string;
};

export type RenderStudioVersion = {
  id: string;
  url: string;
  label: string;
  parentVersionId?: string;
  operationType: "initial" | "material" | "lighting" | "improve" | "approved";
  createdAt: Date;
  selectionLabel?: string;
  materialId?: string;
  materialName?: string;
  approvedBy?: string;
  approvedAt?: Date;
  approvalNote?: string;
};

export type RenderStudioStep =
  | "projeto" | "ambiente" | "imagem" | "render"
  | "melhoria" | "versao" | "aprovar";

export const RENDER_STUDIO_STEPS: { id: RenderStudioStep; label: string; icon: string; hint: string }[] = [
  { id: "projeto",       label: "Projeto",       icon: "◈", hint: "Selecione ou crie um projeto no painel direito." },
  { id: "ambiente",      label: "Ambiente",      icon: "⬡", hint: "Escolha o tipo de ambiente: sala, quarto, cozinha…" },
  { id: "imagem",        label: "Imagem base",   icon: "⬜", hint: "Carregue uma foto do ambiente real (JPG/PNG/WEBP)." },
  { id: "render",        label: "Render IA",     icon: "✦", hint: "Clique em 'Gerar Render' no painel direito." },
  { id: "melhoria",      label: "Melhorar render", icon: "✦", hint: "Ajuste materiais, iluminação ou prompt sem perder a versão anterior." },
  { id: "versao",        label: "Versões",       icon: "⧉", hint: "Compare as versões geradas e escolha qual aprovar." },
  { id: "aprovar",       label: "Aprovar",       icon: "✓", hint: "Aprove a versão final do render. A especificação é um módulo separado." },
];

export function renderStudioStepIndex(step: RenderStudioStep) {
  return RENDER_STUDIO_STEPS.findIndex((item) => item.id === step);
}

export const RENDER_STUDIO_COLORS = {
  bg: "#F7F8FA", surface: "#FFFFFF", card: "#FFFFFF",
  border: "#E5E7EB", borderLight: "#D8DEE8",
  accent: "#F97316", accentHover: "#EA580C", accentMid: "#FB923C",
  accentGlow: "rgba(249,115,22,0.16)", accentText: "#C2410C",
  text: "#172033", muted: "#64748B", dim: "#94A3B8",
  green: "#10B981", greenDim: "rgba(16,185,129,0.12)",
  red: "#EF4444", amber: "#F59E0B",
  inputBg: "#FFFFFF", overlay: "rgba(247,248,250,0.92)",
} as const;
