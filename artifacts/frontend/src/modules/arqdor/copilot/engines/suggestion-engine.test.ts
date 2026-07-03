// ─── Suggestion Engine — unit tests (P1-006) ─────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateSuggestions } from './suggestion-engine'
import type { ProjectContext } from '../../engines/aie/aie-types'

const CTX_NO_STYLE: ProjectContext = {
  id: 'sug-test-1',
  name: 'No Style',
  objects: [],
  materials: [],
  relationships: [],
}

const CTX_WITH_OBJECTS: ProjectContext = {
  id: 'sug-test-2',
  name: 'Has Objects',
  style: 'INDUSTRIAL',
  objects: [
    { id: 'o1', name: 'Mesa de ferro', category: 'FURNITURE', visualWeight: 0.7 },
    { id: 'o2', name: 'Estante', category: 'FURNITURE', visualWeight: 0.4 },
    { id: 'o3', name: 'Poltrona', category: 'FURNITURE', visualWeight: 0.5 },
  ],
  materials: [],
  relationships: [],
}

describe('generateSuggestions', () => {
  it('returns an array', () => {
    expect(Array.isArray(generateSuggestions(CTX_NO_STYLE))).toBe(true)
  })

  it('every suggestion has required fields', () => {
    const sugs = generateSuggestions(CTX_NO_STYLE)
    for (const s of sugs) {
      expect(s).toHaveProperty('id')
      expect(s).toHaveProperty('text')
      expect(s).toHaveProperty('category')
      expect(s).toHaveProperty('impact')
      expect(s).toHaveProperty('status')
      expect(s.status).toBe('PENDING')
    }
  })

  it('impact is 0–100', () => {
    const sugs = generateSuggestions(CTX_NO_STYLE)
    for (const s of sugs) {
      expect(s.impact).toBeGreaterThanOrEqual(0)
      expect(s.impact).toBeLessThanOrEqual(100)
    }
  })

  it('suggestion ids are unique', () => {
    const sugs = generateSuggestions(CTX_NO_STYLE)
    const ids = sugs.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('context with objects generates at least one suggestion', () => {
    const sugs = generateSuggestions(CTX_WITH_OBJECTS)
    expect(sugs.length).toBeGreaterThan(0)
  })

  it('every suggestion has a why array', () => {
    const sugs = generateSuggestions(CTX_WITH_OBJECTS)
    for (const s of sugs) {
      expect(Array.isArray(s.why)).toBe(true)
      expect(s.why.length).toBeGreaterThan(0)
    }
  })
})
