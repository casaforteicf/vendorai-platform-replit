import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useSavedVariations,
  STORAGE_KEY,
  MIGRATED_KEY,
  readLocalVariations,
} from './useSavedVariations'
import type { SavedVariation } from './useSavedVariations'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeVariation(overrides: Partial<SavedVariation> = {}): SavedVariation {
  return {
    id: 'var-1',
    name: 'My variation',
    translator: 'midjourney',
    detail: 'medium',
    prompt: 'A beautiful building',
    negativePrompt: 'blurry, low quality',
    estimatedTokens: 42,
    savedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function seedLocalStorage(variations: SavedVariation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(variations))
}

function storedVariations(): SavedVariation[] {
  return readLocalVariations()
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ─── Scenario 1: API down on mount ────────────────────────────────────────────

describe('API down on mount', () => {
  it('keeps pre-existing localStorage variations in state when the request throws (network error)', async () => {
    const existing = makeVariation()
    seedLocalStorage([existing])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network failure')))

    const { result } = renderHook(() => useSavedVariations())

    // Initial state comes from localStorage immediately
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('var-1')

    // Wait for the async effect to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // State and localStorage must still show the existing variation
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('var-1')
    expect(storedVariations()).toHaveLength(1)
    expect(storedVariations()[0].id).toBe('var-1')
  })

  it('keeps pre-existing localStorage variations when the server returns 5xx on mount', async () => {
    const existing = makeVariation()
    seedLocalStorage([existing])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    const { result } = renderHook(() => useSavedVariations())

    await waitFor(() => expect(result.current.syncing).toBe(false))

    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('var-1')
    expect(storedVariations()[0].id).toBe('var-1')
  })

  it('does not wipe localStorage when the user is not authenticated', async () => {
    const existing = makeVariation()
    seedLocalStorage([existing])
    // No token set

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useSavedVariations())

    // No API call should be made
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.variations[0].id).toBe('var-1')
    expect(storedVariations()[0].id).toBe('var-1')
  })
})

// ─── Scenario 2: API returns 5xx on save ──────────────────────────────────────

describe('API returns 5xx on save', () => {
  it('optimistically adds the variation to local state even when POST returns 5xx', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // First call: GET on mount → 5xx (no existing server data)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // Second call: POST to save → 5xx
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.save(
        {
          translator: 'midjourney',
          detail: 'medium',
          prompt: 'Prompt text',
          negativePrompt: 'bad quality',
          estimatedTokens: 10,
        },
        'Test save',
      )
      // Let the async POST attempt settle
      await new Promise(r => setTimeout(r, 0))
    })

    // Variation must remain in state despite 5xx
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].name).toBe('Test save')
    expect(result.current.variations[0].prompt).toBe('Prompt text')

    // Must be persisted to localStorage
    const stored = storedVariations()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Test save')
  })

  it('keeps pre-existing variations intact when a new save POST fails', async () => {
    const existing = makeVariation()
    seedLocalStorage([existing])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 }) // GET on mount
        .mockResolvedValueOnce({ ok: false, status: 500 }), // POST to save
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.save(
        {
          translator: 'stable-diffusion',
          detail: 'high',
          prompt: 'New prompt',
          negativePrompt: '',
          estimatedTokens: 20,
        },
        'New variation',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    // Both old and new variations must be present
    expect(result.current.variations).toHaveLength(2)
    const names = result.current.variations.map(v => v.name)
    expect(names).toContain('My variation')
    expect(names).toContain('New variation')

    expect(storedVariations()).toHaveLength(2)
  })

  it('keeps the variation locally when the network throws during POST', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 }) // GET on mount
        .mockRejectedValueOnce(new TypeError('Network error')), // POST throws
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.save(
        {
          translator: 'midjourney',
          detail: 'low',
          prompt: 'Quick prompt',
          negativePrompt: '',
          estimatedTokens: 5,
        },
        'Offline save',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].name).toBe('Offline save')
    expect(storedVariations()[0].name).toBe('Offline save')
  })
})

// ─── Scenario 3: API returns 5xx on delete ────────────────────────────────────

describe('API returns 5xx on delete', () => {
  it('removes the variation from local state even when DELETE returns 5xx', async () => {
    const v1 = makeVariation({ id: 'srv-1', name: 'Keep' })
    const v2 = makeVariation({ id: 'srv-2', name: 'Delete me' })
    seedLocalStorage([v1, v2])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 }) // GET on mount
        .mockResolvedValueOnce({ ok: false, status: 500 }), // DELETE → 5xx
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.remove('srv-2')
      await new Promise(r => setTimeout(r, 0))
    })

    // Removed locally despite server failure
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('srv-1')

    // localStorage is also updated
    const stored = storedVariations()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('srv-1')
  })

  it('keeps remaining variations intact when network throws during DELETE', async () => {
    const v1 = makeVariation({ id: 'srv-10', name: 'Survivor' })
    const v2 = makeVariation({ id: 'srv-11', name: 'Gone' })
    seedLocalStorage([v1, v2])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 }) // GET on mount
        .mockRejectedValueOnce(new TypeError('Network error')), // DELETE throws
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.remove('srv-11')
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].name).toBe('Survivor')
    expect(storedVariations()).toHaveLength(1)
  })
})

// ─── Scenario 4: localStorage → server migration ──────────────────────────────

describe('localStorage to server migration', () => {
  it('migrates local variations to the server on first authenticated load when server is empty', async () => {
    const localVar = makeVariation({ id: 'local-old-1', name: 'Local gem' })
    seedLocalStorage([localVar])
    localStorage.setItem('vendorai_token', 'tok-abc')
    // Not yet migrated

    const serverIdAfterMigration = 'server-assigned-id-99'
    const migratedServerResponse = [
      {
        id: serverIdAfterMigration,
        name: 'Local gem',
        translator: 'midjourney',
        detail: 'medium',
        prompt: 'A beautiful building',
        negativePrompt: 'blurry, low quality',
        estimatedTokens: 42,
        savedAt: new Date(1_700_000_000_000).toISOString(),
        notes: null,
      },
    ]

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // GET on mount → empty server (first time)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        // POST /bulk → migration succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => migratedServerResponse,
        }),
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // State should contain the server-assigned id after migration
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe(serverIdAfterMigration)
    expect(result.current.variations[0].name).toBe('Local gem')

    // localStorage should be updated with the server-assigned id
    expect(storedVariations()[0].id).toBe(serverIdAfterMigration)

    // Migration flag must be set to prevent re-migration
    expect(localStorage.getItem(MIGRATED_KEY)).toBe('1')
  })

  it('does not re-migrate when the migration flag is already set', async () => {
    const localVar = makeVariation({ id: 'local-old-2', name: 'Already migrated' })
    seedLocalStorage([localVar])
    localStorage.setItem('vendorai_token', 'tok-abc')
    localStorage.setItem(MIGRATED_KEY, '1') // already migrated

    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Only one fetch call (the initial GET), no POST /bulk
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [[url]] = fetchSpy.mock.calls as [[string, ...unknown[]]][]
    expect(url).not.toContain('/bulk')

    // Local data is preserved as-is
    expect(result.current.variations[0].name).toBe('Already migrated')
  })

  it('keeps local data when migration POST fails with 5xx', async () => {
    const localVar = makeVariation({ id: 'local-fail-1', name: 'Unmigrated' })
    seedLocalStorage([localVar])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => [] }) // GET empty
        .mockResolvedValueOnce({ ok: false, status: 500 }), // POST /bulk fails
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Migration flag must NOT be set — retry is possible next time
    expect(localStorage.getItem(MIGRATED_KEY)).not.toBe('1')

    // Local data is still available
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('local-fail-1')
    expect(storedVariations()[0].id).toBe('local-fail-1')
  })

  it('uses server data as source of truth when the server already has variations', async () => {
    const localVar = makeVariation({ id: 'local-stale', name: 'Stale local' })
    seedLocalStorage([localVar])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const serverVar = {
      id: 'srv-fresh',
      name: 'Fresh server',
      translator: 'stable-diffusion',
      detail: 'high',
      prompt: 'Server prompt',
      negativePrompt: '',
      estimatedTokens: 100,
      savedAt: new Date(1_700_000_001_000).toISOString(),
      notes: null,
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [serverVar],
      }),
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Server data replaces local data
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('srv-fresh')
    expect(storedVariations()[0].id).toBe('srv-fresh')

    // Migration flag is set (server is the authority)
    expect(localStorage.getItem(MIGRATED_KEY)).toBe('1')
  })
})
