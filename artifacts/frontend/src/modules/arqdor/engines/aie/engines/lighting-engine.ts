// ─── Lighting Engine ──────────────────────────────────────────────────────────
// Derives or builds a lighting profile from project context.

import type { ProjectContext, LightingProfile, LightingType, ColorTemperature, LightDirection } from '../aie-types'

const STYLE_TO_LIGHTING: Record<string, Partial<LightingProfile>> = {
  MINIMALISTA:   { primaryType:'NATURAL',    colorTemperature:'NEUTRAL', kelvin:5000, direction:'SIDE',   shadows:'SOFT'  },
  CONTEMPORANEO: { primaryType:'MIXED',      colorTemperature:'NEUTRAL', kelvin:4000, direction:'FRONT',  shadows:'SOFT'  },
  ESCANDINAVO:   { primaryType:'NATURAL',    colorTemperature:'WARM',    kelvin:3200, direction:'SIDE',   shadows:'SOFT'  },
  INDUSTRIAL:    { primaryType:'ARTIFICIAL', colorTemperature:'WARM',    kelvin:2700, direction:'AMBIENT',shadows:'HARD'  },
  JAPANDI:       { primaryType:'NATURAL',    colorTemperature:'WARM',    kelvin:3000, direction:'SIDE',   shadows:'SOFT'  },
  BOHO:          { primaryType:'MIXED',      colorTemperature:'WARM',    kelvin:2700, direction:'AMBIENT',shadows:'SOFT'  },
  LUXO:          { primaryType:'ARTIFICIAL', colorTemperature:'WARM',    kelvin:3000, direction:'AMBIENT',shadows:'SOFT'  },
  ORGANICO:      { primaryType:'NATURAL',    colorTemperature:'NEUTRAL', kelvin:5500, direction:'TOP',    shadows:'SOFT'  },
  CLASSICO:      { primaryType:'ARTIFICIAL', colorTemperature:'WARM',    kelvin:2700, direction:'FRONT',  shadows:'HARD'  },
}

export function runLightingEngine(ctx: ProjectContext): LightingProfile {
  const styleName = ctx.style?.name?.toUpperCase() ?? ''
  const preset    = STYLE_TO_LIGHTING[styleName] ?? {}

  const primaryType:       LightingType     = (ctx.lightingType as LightingType) || preset.primaryType || 'NATURAL'
  const colorTemperature:  ColorTemperature = preset.colorTemperature || 'NEUTRAL'
  const kelvin:            number           = preset.kelvin || 4000
  const direction:         LightDirection   = preset.direction || 'SIDE'
  const defined = !!(ctx.lightingType || ctx.style)

  // Score: defined + matched to style
  const score = defined
    ? (ctx.lightingType ? 85 : 65)
    : 30

  return {
    primaryType,
    colorTemperature,
    kelvin,
    direction,
    intensity: kelvin >= 5000 ? 'HIGH' : kelvin >= 3500 ? 'MEDIUM' : 'LOW',
    shadows: preset.shadows || 'SOFT',
    defined,
    score,
  }
}
