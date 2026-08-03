// Aplica a cor de marca do tenant (tenants.corPrimaria) como tema do
// dashboard interno — sidebar, botões e destaques passam a usar a cor do
// lojista em vez da paleta padrão do Vendor.ai. A logo já tinha co-branding
// no header; isso estende o mesmo princípio pro resto da UI.
//
// Guarda-chuva: nunca mexe no wordmark "Vendor.ai" nem no rodapé
// "powered by Vendor.ai" — só nas variáveis CSS de cor de destaque.

const THEME_VARS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
] as const;

/** Converte hex (#RRGGBB ou #RGB) pro formato "H S% L%" usado nas CSS vars do tema. */
function hexToHslString(hex: string): string | null {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return `0 0% ${Math.round(l * 100)}%`;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Texto branco ou quase-preto por cima da cor, pela regra de contraste (luminância relativa). */
function contrastForeground(hex: string): string {
  const clean = hex.trim().replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "0 0% 100%";

  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(full.slice(0, 2), 16));
  const g = toLinear(parseInt(full.slice(2, 4), 16));
  const b = toLinear(parseInt(full.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Fundo claro -> texto quase-preto; fundo escuro -> texto branco
  return luminance > 0.55 ? "224 71% 4%" : "0 0% 100%";
}

/** Aplica a cor do tenant nas variáveis CSS de tema. Sem cor válida, não faz nada (mantém o padrão). */
export function applyTenantTheme(corPrimaria: string | null | undefined) {
  if (!corPrimaria) return;
  const hsl = hexToHslString(corPrimaria);
  if (!hsl) return;
  const fg = contrastForeground(corPrimaria);

  const root = document.documentElement.style;
  root.setProperty("--primary", hsl);
  root.setProperty("--primary-foreground", fg);
  root.setProperty("--ring", hsl);
  root.setProperty("--sidebar-primary", hsl);
  root.setProperty("--sidebar-primary-foreground", fg);
  root.setProperty("--sidebar-ring", hsl);
}

/** Remove o override e volta pro tema padrão do Vendor.ai (usado no logout/troca de tenant). */
export function resetTenantTheme() {
  const root = document.documentElement.style;
  for (const v of THEME_VARS) root.removeProperty(v);
}
