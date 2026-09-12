export type PortraitKeySide = 'right' | 'left'
export type PortraitContrast = 'medium' | 'high' | 'very-high'
export type PortraitShadowEdge = 'soft' | 'defined'
export type PortraitRimStrength = 'off' | 'subtle' | 'medium'
export type PortraitSaturation = 'medium' | 'high'
export type PortraitFinish = 'matte' | 'soft'

export type PortraitLightingConfig = {
  keySide: PortraitKeySide
  keyIntensity: number
  contrast: PortraitContrast
  shadowEdge: PortraitShadowEdge
  rimStrength: PortraitRimStrength
  preserveIdentity: boolean
  preserveHair: boolean
  ignoreOriginalLighting: boolean
  backgroundColor: string
  backgroundLabel: string
  saturation: PortraitSaturation
  finish: PortraitFinish
}

export type PortraitPreset = {
  id: string
  name: string
  description: string
  config: PortraitLightingConfig
}

export const DEFAULT_PORTRAIT_LIGHTING_CONFIG: PortraitLightingConfig = {
  keySide: 'right',
  keyIntensity: 88,
  contrast: 'high',
  shadowEdge: 'defined',
  rimStrength: 'subtle',
  preserveIdentity: true,
  preserveHair: true,
  ignoreOriginalLighting: true,
  backgroundColor: '#2D0B69',
  backgroundLabel: 'deep purple-indigo',
  saturation: 'high',
  finish: 'matte',
}

export const PORTRAIT_PRESETS: PortraitPreset[] = [
  {
    id: 'cinematic-indigo',
    name: 'Cinemático Indigo',
    description: 'Contraste alto, luz lateral e fundo roxo-indigo.',
    config: { ...DEFAULT_PORTRAIT_LIGHTING_CONFIG },
  },
  {
    id: 'chiaroscuro',
    name: 'Chiaroscuro',
    description: 'Sombra mais dramática com recorte fino no lado escuro.',
    config: {
      ...DEFAULT_PORTRAIT_LIGHTING_CONFIG,
      keyIntensity: 94,
      contrast: 'very-high',
      rimStrength: 'subtle',
      backgroundColor: '#19112E',
      backgroundLabel: 'dark violet-black',
      saturation: 'medium',
    },
  },
  {
    id: 'studio-premium',
    name: 'Studio Premium',
    description: 'Modelagem facial forte, porém com transição um pouco mais suave.',
    config: {
      ...DEFAULT_PORTRAIT_LIGHTING_CONFIG,
      keyIntensity: 78,
      contrast: 'medium',
      shadowEdge: 'soft',
      rimStrength: 'medium',
      backgroundColor: '#312E81',
      backgroundLabel: 'premium indigo',
    },
  },
]

const oppositeSide = (side: PortraitKeySide): PortraitKeySide => side === 'right' ? 'left' : 'right'

function contrastText(value: PortraitContrast) {
  if (value === 'very-high') return 'Very high contrast with strong dimensional separation.'
  if (value === 'medium') return 'Moderate-to-high cinematic contrast with visible shadow detail.'
  return 'High contrast with strong dimensional separation.'
}

function shadowText(value: PortraitShadowEdge) {
  return value === 'soft'
    ? 'Use a controlled but slightly softer transition between light and shadow while preserving facial depth.'
    : 'Use a clearly defined light-to-shadow edge across the face.'
}

function rimText(side: PortraitKeySide, strength: PortraitRimStrength) {
  if (strength === 'off') {
    return `Do not add a rim light on camera ${side}. Keep the shadow side dimensional using reflected detail only.`
  }
  const intensity = strength === 'medium' ? 'controlled medium' : 'subtle'
  return `Add a ${intensity} secondary edge light from camera ${side}. Create a thin rim highlight outlining the shadow-side jaw, neck, hair edge, and shoulder. The rim light must remain secondary and must not brighten the full shadow side.`
}

export function buildPortraitPrompt(config: PortraitLightingConfig): string {
  const keySide = config.keySide
  const shadowSide = oppositeSide(keySide)
  const identityRules = [
    config.preserveIdentity ? 'Preserve the exact facial identity, facial geometry, bone structure, eye shape, nose, mouth, jaw, age, and recognizable features.' : '',
    config.preserveHair ? 'Preserve the hairstyle, hairline, hair volume, and recognizable hair characteristics.' : '',
  ].filter(Boolean).join(' ')

  const originalLightRule = config.ignoreOriginalLighting
    ? 'Do not preserve or inherit the original lighting direction, luminance, highlights, shadows, exposure, or color cast from the reference image. Reconstruct the complete lighting structure from scratch.'
    : 'Use the reference lighting only as a weak starting point; the requested lighting setup below has priority.'

  return `Use the reference image strictly for facial identity and facial proportions. ${identityRules}

${originalLightRule}

LIGHTING SETUP
Create a premium cinematic studio portrait with two clearly distinguishable light sources.

PRIMARY LIGHT — CAMERA ${keySide.toUpperCase()}
- Strong directional key light from camera ${keySide}, intensity approximately ${Math.round(config.keyIntensity)}%.
- The ${keySide} side of the face must be visibly and clearly brighter than the ${shadowSide} side.
- Create a strong controlled highlight on the ${keySide} cheekbone, jawline, and side of the neck.
- Sculpt the facial structure with intentional directional light, not broad flat frontal illumination.

SHADOW SIDE — CAMERA ${shadowSide.toUpperCase()}
- Keep the ${shadowSide} side of the face visibly darker.
- Preserve realistic skin, eye, cheek, jaw, neck, and hair detail in the shadows.
- Do not crush the shadows into pure black.
- Maintain three-dimensional depth and separation across the face.
- ${shadowText(config.shadowEdge)}

SECONDARY EDGE LIGHT — CAMERA ${shadowSide.toUpperCase()}
- ${rimText(shadowSide, config.rimStrength)}

CONTRAST AND FACE
- ${contrastText(config.contrast)}
- Sculpted facial structure and realistic skin texture.
- Natural pores and detail; no plastic skin.
- No excessive beautification or facial reshaping.
- No flat lighting, no evenly illuminated face, no washed-out shadows, and no uncontrolled glow.

BACKGROUND
- Solid ${config.backgroundLabel} background (${config.backgroundColor}).
- ${config.saturation === 'high' ? 'Highly saturated.' : 'Moderately saturated.'}
- ${config.finish === 'matte' ? 'Matte finish.' : 'Soft studio finish.'}
- Uniform background with no objects, no scenery, no visible texture, and no distracting gradient.
- Maintain clean subject-to-background separation.

FINAL LOOK
Photorealistic premium cinematic studio portrait. Strong dimensional facial modeling, controlled highlights, deep but detailed shadows, professional studio lighting, sharp facial detail, and natural skin texture.

The final image must clearly communicate: brightly illuminated ${keySide} side + distinctly darker ${shadowSide} side${config.rimStrength === 'off' ? '' : ` + a controlled rim light on the ${shadowSide} shadow side`}.`
}
