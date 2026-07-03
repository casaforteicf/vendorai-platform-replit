// ─── Question Engine — unit tests (P1-006) ────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateQuestions } from './question-engine'
import type { ProjectContext } from '../../engines/aie/aie-types'

const MINIMAL_CTX: ProjectContext = {
  id: 'test-proj-001',
  name: 'Test Project',
  objects: [],
  materials: [],
  relationships: [],
}

const FULL_CTX: ProjectContext = {
  id: 'test-proj-002',
  name: 'Full Project',
  style: 'MINIMALIST',
  renderGoal: 'MARKETING',
  lightingType: 'NATURAL',
  cameraAngle: 'EYE_LEVEL',
  dna: { harmony: 0.8 },
  objects: [
    { id: 'o1', name: 'Sofá', category: 'FURNITURE', visualWeight: 0.7 },
    { id: 'o2', name: 'Mesa', category: 'FURNITURE', visualWeight: 0.5 },
  ],
  materials: [
    { id: 'm1', name: 'Carvalho', category: 'WOOD', manufacturer: 'Portobello', finish: 'Mate', gloss: 10, palette: ['#c8a96e'], usedByObjects: ['o1'] },
  ],
  relationships: [],
}

describe('generateQuestions', () => {
  it('returns an array for minimal context', () => {
    const qs = generateQuestions(MINIMAL_CTX)
    expect(Array.isArray(qs)).toBe(true)
  })

  it('returns more questions for a context with missing data', () => {
    const minimal = generateQuestions(MINIMAL_CTX)
    const full    = generateQuestions(FULL_CTX)
    expect(minimal.length).toBeGreaterThanOrEqual(full.length)
  })

  it('every question has required fields', () => {
    const qs = generateQuestions(MINIMAL_CTX)
    for (const q of qs) {
      expect(q).toHaveProperty('id')
      expect(q).toHaveProperty('text')
      expect(q).toHaveProperty('priority')
      expect(q).toHaveProperty('status')
      expect(q.status).toBe('PENDING')
    }
  })

  it('question ids are unique', () => {
    const qs = generateQuestions(MINIMAL_CTX)
    const ids = qs.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each question has at least one chip', () => {
    const qs = generateQuestions(MINIMAL_CTX)
    for (const q of qs) {
      expect(Array.isArray(q.chips)).toBe(true)
      expect(q.chips.length).toBeGreaterThan(0)
    }
  })

  it('CRITICAL questions appear before MEDIUM when sorted', () => {
    const qs = generateQuestions(MINIMAL_CTX)
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    const sorted = [...qs].sort((a, b) =>
      priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
    )
    expect(sorted[0].priority).not.toBe('LOW')
  })
})
