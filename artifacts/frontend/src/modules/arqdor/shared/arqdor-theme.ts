// ─── Arqdor Design System — P1-001 ───────────────────────────────────────────
// Single source of truth for all arqdor module colours, spacing, and tokens.
// Import this file instead of re-declaring const T = { ... } inline.

export const T = {
  // Backgrounds
  bg:      '#0d0b1e',
  surface: '#100e26',
  sidebar: '#0a0819',
  card:    'rgba(255,255,255,0.04)',

  // Borders
  border:  'rgba(255,255,255,0.07)',
  borderM: 'rgba(255,255,255,0.12)',

  // ARQDOR brand — technological emerald
  purple:  '#0f9f6e',
  purpleD: '#087a55',
  purpleL: '#35d399',
  purpleXL:'#8be8c0',

  // Text
  text:    'rgba(255,255,255,0.88)',
  textSub: 'rgba(255,255,255,0.60)',
  dim:     'rgba(255,255,255,0.38)',

  // Accent colours
  green:   '#4ade80',
  blue:    '#60a5fa',
  amber:   '#fbbf24',
  red:     '#f87171',

  // Spacing scale (px values as numbers for inline-style use)
  sp: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },

  // Border radius
  r: {
    sm:   4,
    md:   8,
    lg:   12,
    xl:   16,
    full: 9999,
  },

  // Typography sizes (px)
  fs: {
    xs:  10,
    sm:  11,
    md:  13,
    lg:  15,
    xl:  18,
    xxl: 22,
  },
} as const

export type ArqdorTheme = typeof T

// ─── PHX — Phoenix light theme (Project Phoenix) ─────────────────────────────
// Premium light palette: architectural white + technological emerald.
// Referências: Apple, Notion, Figma, Linear.
export const PHX = {
  // Backgrounds
  bg:      '#f7f5fc',   // lavender-tinted near-white
  surface: '#ffffff',
  card:    '#ffffff',
  sidebar: '#ffffff',
  muted:   '#f3f2f8',   // subtle section bg

  // Borders
  border:  'rgba(0,0,0,0.07)',
  borderM: 'rgba(0,0,0,0.12)',

  // Brand emerald — kept on legacy purple keys for compatibility
  purple:  '#0f9f6e',
  purpleD: '#087a55',
  purpleL: '#35d399',
  purpleXL:'#8be8c0',

  // Text
  text:    '#111827',
  textSub: '#6b7280',
  dim:     '#9ca3af',

  // Accents
  green:   '#16a34a',
  blue:    '#2563eb',
  amber:   '#d97706',
  red:     '#dc2626',
  cyan:    '#0891b2',
  teal:    '#0d9488',

  // Shadows
  shadow:  '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowM: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
  shadowL: '0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)',
  shadowXL:'0 20px 40px rgba(0,0,0,0.12)',
} as const

export type PhxTheme = typeof PHX
