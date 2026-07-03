// ─── Workflow Engine — unit tests (P1-006) ────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildWorkflow } from './workflow-engine'
import type { ProjectContext } from '../../engines/aie/aie-types'

const BLANK_CTX: ProjectContext = {
  id: 'wf-test-blank',
  name: 'Blank',
  objects: [],
  materials: [],
  relationships: [],
}

const ADVANCED_CTX: ProjectContext = {
  id: 'wf-test-advanced',
  name: 'Advanced',
  style: 'SCANDINAVIAN',
  renderGoal: 'MARKETING',
  lightingType: 'NATURAL',
  cameraAngle: 'EYE_LEVEL',
  dna: { harmony: 0.85 },
  objects: [
    { id: 'o1', name: 'Sofá', category: 'FURNITURE', visualWeight: 0.7 },
  ],
  materials: [
    { id: 'm1', name: 'Linho', category: 'TEXTILE', manufacturer: 'HAY', finish: 'Natural', gloss: 5, palette: ['#f5f0e8'], usedByObjects: ['o1'] },
  ],
  relationships: [],
}

describe('buildWorkflow', () => {
  it('returns a workflow object', () => {
    const wf = buildWorkflow('INITIAL', BLANK_CTX)
    expect(wf).toHaveProperty('id')
    expect(wf).toHaveProperty('name')
    expect(wf).toHaveProperty('steps')
  })

  it('steps is a non-empty array', () => {
    const wf = buildWorkflow('INITIAL', BLANK_CTX)
    expect(Array.isArray(wf.steps)).toBe(true)
    expect(wf.steps.length).toBeGreaterThan(0)
  })

  it('every step has required fields', () => {
    const wf = buildWorkflow('INITIAL', BLANK_CTX)
    for (const step of wf.steps) {
      expect(step).toHaveProperty('id')
      expect(step).toHaveProperty('label')
      expect(step).toHaveProperty('status')
    }
  })

  it('blank context has first step active or pending', () => {
    const wf = buildWorkflow('INITIAL', BLANK_CTX)
    const statuses = wf.steps.map(s => s.status)
    const hasPending = statuses.some(s => s === 'PENDING' || s === 'ACTIVE')
    expect(hasPending).toBe(true)
  })

  it('advanced context has more completed steps than blank', () => {
    const blankWf    = buildWorkflow('INITIAL', BLANK_CTX)
    const advancedWf = buildWorkflow('INITIAL', ADVANCED_CTX)
    const blankDone    = blankWf.steps.filter(s => s.status === 'DONE').length
    const advancedDone = advancedWf.steps.filter(s => s.status === 'DONE').length
    expect(advancedDone).toBeGreaterThanOrEqual(blankDone)
  })

  it('step ids are unique within the workflow', () => {
    const wf = buildWorkflow('INITIAL', BLANK_CTX)
    const ids = wf.steps.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
