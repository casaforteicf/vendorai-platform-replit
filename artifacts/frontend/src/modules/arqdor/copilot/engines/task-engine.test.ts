// ─── Task Engine — unit tests (P1-006) ────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateTasks, generateChecklist, computeProjectHealth, computeProgress } from './task-engine'
import type { ProjectContext } from '../../engines/aie/aie-types'

const EMPTY_CTX: ProjectContext = {
  id: 'empty-proj',
  name: 'Empty',
  objects: [],
  materials: [],
  relationships: [],
}

const COMPLETE_CTX: ProjectContext = {
  id: 'complete-proj',
  name: 'Complete',
  style: 'CONTEMPORARY',
  renderGoal: 'PRESENTATION',
  lightingType: 'MIXED',
  cameraAngle: 'THREE_QUARTER',
  dna: { harmony: 0.9, palette: ['#fff'] },
  objects: [
    { id: 'o1', name: 'Sofá', category: 'FURNITURE', material: 'Veludo', visualWeight: 0.8 },
    { id: 'o2', name: 'Mesa', category: 'FURNITURE', material: 'Carvalho', visualWeight: 0.6 },
    { id: 'o3', name: 'Luminária', category: 'LIGHTING', visualWeight: 0.3 },
  ],
  materials: [
    { id: 'm1', name: 'Veludo', category: 'TEXTILE', manufacturer: 'Moooi', finish: 'Mate', gloss: 5, palette: ['#1a1a2e'], usedByObjects: ['o1'] },
    { id: 'm2', name: 'Carvalho', category: 'WOOD', manufacturer: 'Portobello', finish: 'Natural', gloss: 20, palette: ['#c8a96e'], usedByObjects: ['o2'] },
  ],
  relationships: [],
}

describe('generateTasks', () => {
  it('returns tasks for an empty context', () => {
    const tasks = generateTasks(EMPTY_CTX)
    expect(tasks.length).toBeGreaterThan(0)
  })

  it('every task has required fields', () => {
    const tasks = generateTasks(EMPTY_CTX)
    for (const t of tasks) {
      expect(t).toHaveProperty('id')
      expect(t).toHaveProperty('label')
      expect(t).toHaveProperty('priority')
      expect(t).toHaveProperty('status')
    }
  })

  it('complete context produces fewer critical tasks', () => {
    const emptyTasks    = generateTasks(EMPTY_CTX).filter(t => t.priority === 'CRITICAL')
    const completeTasks = generateTasks(COMPLETE_CTX).filter(t => t.priority === 'CRITICAL')
    expect(emptyTasks.length).toBeGreaterThanOrEqual(completeTasks.length)
  })

  it('task ids are unique within a run', () => {
    const tasks = generateTasks(EMPTY_CTX)
    const ids = tasks.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('generateChecklist', () => {
  it('returns an array for any context', () => {
    expect(Array.isArray(generateChecklist(EMPTY_CTX))).toBe(true)
    expect(Array.isArray(generateChecklist(COMPLETE_CTX))).toBe(true)
  })

  it('items have required fields', () => {
    const items = generateChecklist(EMPTY_CTX)
    for (const item of items) {
      expect(item).toHaveProperty('area')
      expect(item).toHaveProperty('label')
      expect(item).toHaveProperty('status')
      expect(item).toHaveProperty('score')
      expect(item).toHaveProperty('icon')
    }
  })
})

describe('computeProjectHealth', () => {
  it('returns a health result', () => {
    const h = computeProjectHealth(EMPTY_CTX)
    expect(h).toHaveProperty('health')
    expect(h).toHaveProperty('score')
  })

  it('empty context is not EXCELENTE', () => {
    const h = computeProjectHealth(EMPTY_CTX)
    expect(h.health).not.toBe('EXCELENTE')
  })

  it('complete context scores higher than empty', () => {
    const empty    = computeProjectHealth(EMPTY_CTX)
    const complete = computeProjectHealth(COMPLETE_CTX)
    expect(complete.score).toBeGreaterThan(empty.score)
  })
})

describe('computeProgress', () => {
  it('returns 0–100 for any context', () => {
    const p1 = computeProgress(EMPTY_CTX)
    const p2 = computeProgress(COMPLETE_CTX)
    expect(p1).toBeGreaterThanOrEqual(0)
    expect(p1).toBeLessThanOrEqual(100)
    expect(p2).toBeGreaterThanOrEqual(0)
    expect(p2).toBeLessThanOrEqual(100)
  })

  it('complete context has higher progress than empty', () => {
    expect(computeProgress(COMPLETE_CTX)).toBeGreaterThan(computeProgress(EMPTY_CTX))
  })
})
