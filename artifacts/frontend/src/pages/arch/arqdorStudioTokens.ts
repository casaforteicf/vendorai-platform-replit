/**
 * Arqdor Studio 2.0 — shared visual primitives.
 * Opt-in token set: migrate each screen incrementally rather than forcing
 * a global theme across Vendor.ai or existing light-mode Arqdor pages.
 * Specification: docs/arqdor-studio-2-design-system.md.
 */
export const ARQDOR_STUDIO_TOKENS = {
  color: {
    canvas: "#171F22",
    surface: "#20282A",
    panel: "#263034",
    elevated: "#303A3D",
    border: "#3A4649",
    text: "#EEF2EF",
    muted: "#AAB8B5",
    accent: "#176D59",
    accentHover: "#21856C",
    selection: "#4AC59A",
    danger: "#EA7373",
  },
  typography: {
    family: 'Inter, "IBM Plex Sans", "Segoe UI", sans-serif',
    menu: 12,
    control: 12,
    parameter: 11,
    panelTitle: 13,
    sectionTitle: 15,
  },
  layout: {
    headerPx: 52,
    leftSidebarPx: 156,
    leftCollapsedPx: 56,
    rightPanelPx: 300,
    bottomPanelPx: 174,
  },
} as const;
