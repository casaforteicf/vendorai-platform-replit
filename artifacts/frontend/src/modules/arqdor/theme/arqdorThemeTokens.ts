import type { ArqdorAccent, ArqdorThemePreference, ThemeTokenGroup } from "./arqdorThemeTypes";

export const ARQDOR_THEME_STORAGE_KEY = "arqdor.theme.preference";

export const DEFAULT_ARQDOR_THEME: ArqdorThemePreference = {
  mode: "light",
  accent: "violet",
  useDarkRenderWorkspace: true,
};

export const ARQDOR_ACCENT_COLORS: Record<ArqdorAccent, { label: string; light: string; dark: string; contrast: string }> = {
  violet:  { label: "Violeta ARQDOR",   light: "#7C3AED", dark: "#A78BFA", contrast: "#FFFFFF" },
  blue:    { label: "Azul técnico",     light: "#2563EB", dark: "#60A5FA", contrast: "#FFFFFF" },
  emerald: { label: "Verde aprovação",  light: "#059669", dark: "#34D399", contrast: "#FFFFFF" },
  amber:   { label: "Âmbar premium",   light: "#D97706", dark: "#FBBF24", contrast: "#111827" },
  rose:    { label: "Rose destaque",    light: "#E11D48", dark: "#FB7185", contrast: "#FFFFFF" },
  slate:   { label: "Neutro executivo", light: "#334155", dark: "#CBD5E1", contrast: "#FFFFFF" },
};

export const THEME_TOKEN_GROUPS: ThemeTokenGroup[] = [
  {
    name: "Base",
    description: "Cores principais de tela, texto e superfície.",
    tokens: [
      { token: "--arq-background", light: "#F7F7F8", dark: "#050607", usage: "Background principal do sistema." },
      { token: "--arq-foreground", light: "#0F172A", dark: "#F8FAFC", usage: "Texto principal." },
      { token: "--arq-muted",      light: "#64748B", dark: "#94A3B8", usage: "Texto secundário." },
      { token: "--arq-card",       light: "#FFFFFF",  dark: "#111318", usage: "Cards e painéis." },
      { token: "--arq-card-soft",  light: "#F8FAFC", dark: "#181B22", usage: "Áreas internas suaves." },
      { token: "--arq-border",     light: "#E5E7EB", dark: "#252A34", usage: "Bordas." },
    ],
  },
  {
    name: "Estados",
    description: "Feedback visual de sucesso, atenção, erro e informação.",
    tokens: [
      { token: "--arq-success", light: "#059669", dark: "#34D399", usage: "Aprovado, concluído." },
      { token: "--arq-warning", light: "#D97706", dark: "#FBBF24", usage: "Pendente, atenção." },
      { token: "--arq-danger",  light: "#E11D48", dark: "#FB7185", usage: "Erro, bloqueio, reprovação." },
      { token: "--arq-info",    light: "#2563EB", dark: "#60A5FA", usage: "Informação e status técnico." },
    ],
  },
  {
    name: "Render",
    description: "Área premium para imagem, preview, antes/depois e IA.",
    tokens: [
      { token: "--arq-render-bg",     light: "#0B0D12", dark: "#030405", usage: "Workspace de render." },
      { token: "--arq-render-card",   light: "#111827", dark: "#0B0D12", usage: "Cards de render/preview." },
      { token: "--arq-render-border", light: "#1F2937", dark: "#1E293B", usage: "Bordas escuras do render." },
      { token: "--arq-render-text",   light: "#F8FAFC", dark: "#F8FAFC", usage: "Texto sobre render." },
    ],
  },
];

export function getAccentVariables(accent: ArqdorAccent) {
  const item = ARQDOR_ACCENT_COLORS[accent] || ARQDOR_ACCENT_COLORS.violet;

  return {
    "--arq-accent":          item.light,
    "--arq-accent-dark":     item.dark,
    "--arq-accent-contrast": item.contrast,
  } as Record<string, string>;
}
