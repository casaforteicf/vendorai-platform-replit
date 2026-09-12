import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTRAIT_LIGHTING_CONFIG,
  buildPortraitPrompt,
} from './portrait-prompt'

describe('portrait lighting prompt builder', () => {
  it('builds the cinematic indigo default with identity preservation', () => {
    const prompt = buildPortraitPrompt(DEFAULT_PORTRAIT_LIGHTING_CONFIG)

    expect(prompt).toContain('strictly for facial identity and facial proportions')
    expect(prompt).toContain('CAMERA RIGHT')
    expect(prompt).toContain('CAMERA LEFT')
    expect(prompt).toContain('deep purple-indigo')
    expect(prompt).toContain('Do not preserve or inherit the original lighting direction')
    expect(prompt).toContain('No flat lighting')
  })

  it('switches key and shadow sides when the primary light moves left', () => {
    const prompt = buildPortraitPrompt({
      ...DEFAULT_PORTRAIT_LIGHTING_CONFIG,
      keySide: 'left',
    })

    expect(prompt).toContain('PRIMARY LIGHT — CAMERA LEFT')
    expect(prompt).toContain('SHADOW SIDE — CAMERA RIGHT')
    expect(prompt).toContain('brightly illuminated left side + distinctly darker right side')
  })

  it('can disable the secondary rim light', () => {
    const prompt = buildPortraitPrompt({
      ...DEFAULT_PORTRAIT_LIGHTING_CONFIG,
      rimStrength: 'off',
    })

    expect(prompt).toContain('Do not add a rim light on camera left')
    expect(prompt).not.toContain('+ a controlled rim light on the left shadow side')
  })
})
