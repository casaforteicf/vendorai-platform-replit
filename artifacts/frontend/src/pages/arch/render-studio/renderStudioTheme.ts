import type { CSSProperties } from "react";

export const RENDER_STUDIO_THEME = {
  bg: "#171C1D", surface: "#232A2B", card: "#232A2B",
  border: "#384445", borderLight: "#465354",
  purple: "#059669", purpleHov: "#047857", purpleMid: "#10B981",
  purpleGlow: "rgba(5,150,105,0.16)", purpleText: "#047857",
  text: "#E8EFEB", muted: "#AAB8B2", dim: "#81938B",
  green: "#10B981", greenDim: "rgba(16,185,129,0.12)",
  red: "#EF4444", amber: "#F59E0B",
  inputBg: "#232A2B", overlay: "rgba(23,28,29,0.96)",
} as const;

export const renderStudioInputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  fontSize: 11,
  border: `1px solid ${RENDER_STUDIO_THEME.border}`,
  background: RENDER_STUDIO_THEME.inputBg,
  color: RENDER_STUDIO_THEME.text,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const RENDER_STUDIO_GLOBAL_STYLES = `
  *:focus-visible { outline: 2px solid #059669; outline-offset: 2px; border-radius: 4px; }
  button:disabled { pointer-events: none; }
  [aria-disabled="true"] { pointer-events: none; }
`;
