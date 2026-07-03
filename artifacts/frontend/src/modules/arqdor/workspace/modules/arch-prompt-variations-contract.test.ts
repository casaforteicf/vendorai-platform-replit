/**
 * Contract guard for arch/prompt-variations hooks.
 *
 * PromptPlaygroundModule.tsx imports these hook names directly from
 * @workspace/api-client-react.  If the OpenAPI operationId for any
 * /arch/prompt-variations endpoint is renamed, codegen regenerates the file
 * with new names and the import below fails to compile — surfacing the
 * regression before it reaches production.
 *
 * This test therefore acts as a named, explicit CI gate: it fails loudly if
 * any hook name drifts away from what the module expects.
 */
import { describe, it, expect } from 'vitest'
import {
  useListArchPromptVariations,
  useCreateArchPromptVariation,
  useUpdateArchPromptVariation,
  useDeleteArchPromptVariation,
  getListArchPromptVariationsQueryKey,
} from '@workspace/api-client-react'

describe('arch/prompt-variations hook contract — PromptPlaygroundModule.tsx expectations', () => {
  it('useListArchPromptVariations is a callable hook function', () => {
    expect(typeof useListArchPromptVariations).toBe('function')
  })

  it('useCreateArchPromptVariation is a callable mutation hook', () => {
    expect(typeof useCreateArchPromptVariation).toBe('function')
  })

  it('useUpdateArchPromptVariation is a callable mutation hook', () => {
    expect(typeof useUpdateArchPromptVariation).toBe('function')
  })

  it('useDeleteArchPromptVariation is a callable mutation hook', () => {
    expect(typeof useDeleteArchPromptVariation).toBe('function')
  })

  it('getListArchPromptVariationsQueryKey returns a stable query-key array', () => {
    expect(typeof getListArchPromptVariationsQueryKey).toBe('function')
    const key = getListArchPromptVariationsQueryKey()
    expect(Array.isArray(key)).toBe(true)
    expect(key.length).toBeGreaterThan(0)
  })
})
