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

  // Brand purples
  purple:  '#7c3aed',
  purpleD: '#6d28d9',
  purpleL: '#a78bfa',
  purpleXL:'#c4b5fd',

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
