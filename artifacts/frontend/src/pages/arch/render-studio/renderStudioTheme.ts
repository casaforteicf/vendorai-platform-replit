import type { CSSProperties } from "react";

export const RENDER_STUDIO_THEME = {
  bg: "#F7F8FA", surface: "#FFFFFF", card: "#FFFFFF",
  border: "#E5E7EB", borderLight: "#D8DEE8",
  purple: "#F97316", purpleHov: "#EA580C", purpleMid: "#FB923C",
  purpleGlow: "rgba(249,115,22,0.16)", purpleText: "#C2410C",
  text: "#172033", muted: "#64748B", dim: "#94A3B8",
  green: "#10B981", greenDim: "rgba(16,185,129,0.12)",
  red: "#EF4444", amber: "#F59E0B",
  inputBg: "#FFFFFF", overlay: "rgba(247,248,250,0.92)",
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
