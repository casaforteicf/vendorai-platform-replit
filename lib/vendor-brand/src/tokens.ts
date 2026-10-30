export const VENDOR_BRAND = {
  name: "Vendor.ai",
  colors: {
    primary: "#2563EB",
    primaryStrong: "#1D4ED8",
    primarySoft: "#EFF6FF",
    info: "#0E7490",
    success: "#059669",
    warning: "#F59E0B",
    destructive: "#EF4444",
    ink: "#0F172A",
    canvas: "#F8FAFC",
    surface: "#FFFFFF",
    muted: "#64748B",
    border: "#E2E8F0",
    darkCanvas: "#0F172A",
    darkSurface: "#111827",
    darkMuted: "#94A3B8",
    darkBorder: "#1E293B",
  },
  typography: {
    interface: "Inter",
    display: "Rigter",
    editorial: "Malibu Sunday Serif",
    web: {
      body: 14,
      label: 13,
      h1: 24,
      h2: 20,
      h3: 17,
    },
    mobile: {
      body: 14,
      label: 13,
      pageTitle: 24,
      sectionTitle: 19,
      cardTitle: 16,
    },
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  logo: {
    light: "/logo-full-light.svg",
    dark: "/logo-full-dark.svg",
  },
} as const;

export type VendorBrand = typeof VENDOR_BRAND;
