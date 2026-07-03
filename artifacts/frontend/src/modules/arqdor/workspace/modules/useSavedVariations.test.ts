import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useSavedVariations,
  STORAGE_KEY,
  MIGRATED_KEY,
  PRUNE_BATCH_SIZE,
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

// ─── Scenario: localStorage quota exceeded ────────────────────────────────────

describe('localStorage quota exceeded', () => {
  it('sets storageError when localStorage.setItem throws on save', async () => {
    // No token — stays offline so we only exercise the localStorage path
    const { result } = renderHook(() => useSavedVariations())

    // Simulate quota-exceeded error for every write attempt
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEY) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    await act(async () => {
      result.current.save(
        {
          translator: 'midjourney',
          detail: 'medium',
          prompt: 'Prompt that exceeds quota',
          negativePrompt: '',
          estimatedTokens: 99,
        },
        'Full storage',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    // Variation is still in React state (optimistic update succeeded)
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].name).toBe('Full storage')

    // storageError must be surfaced to the UI
    expect(result.current.storageError).toBeTruthy()
    expect(result.current.storageError).toContain('Armazenamento local cheio')
  })

  it('clears storageError via clearStorageError', async () => {
    const { result } = renderHook(() => useSavedVariations())

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEY) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'low', prompt: 'p', negativePrompt: '', estimatedTokens: 1 },
        'Trigger error',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.storageError).toBeTruthy()

    act(() => {
      result.current.clearStorageError()
    })

    expect(result.current.storageError).toBeNull()
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

// ─── Scenario 5: pruneOldest ──────────────────────────────────────────────────

describe('pruneOldest', () => {
  // Helper: build N variations with strictly ordered timestamps so oldest/newest
  // are unambiguous. Timestamps start at BASE and increment by 1 000 each step.
  const BASE_TS = 1_700_000_000_000
  function makeVariations(count: number): SavedVariation[] {
    return Array.from({ length: count }, (_, i) =>
      makeVariation({
        id: `prune-var-${i + 1}`,
        name: `Variation ${i + 1}`,
        savedAt: BASE_TS + i * 1_000,
      }),
    )
  }

  it('removes only the oldest PRUNE_BATCH_SIZE variations and clears storageError on first successful batch', async () => {
    // 7 variations: IDs prune-var-1 (oldest) … prune-var-7 (newest)
    const variations = makeVariations(7)
    seedLocalStorage(variations)

    // Not authenticated so no server calls interfere
    const { result } = renderHook(() => useSavedVariations())

    // Trigger storageError by making setItem throw while a save is written
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEY) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'p', negativePrompt: '', estimatedTokens: 1 },
        'Overflow trigger',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.storageError).toBeTruthy()

    // Restore localStorage to working state so pruneOldest can persist
    vi.restoreAllMocks()

    // State now has 8 items: the 7 seeded + 1 from the save above.
    // The 5 items with the smallest savedAt values are prune-var-1 … prune-var-5.
    expect(result.current.variations).toHaveLength(8)

    act(() => {
      result.current.pruneOldest()
    })

    // (a) Only the PRUNE_BATCH_SIZE oldest are removed; 3 remain
    expect(result.current.variations).toHaveLength(8 - PRUNE_BATCH_SIZE)

    const remainingIds = result.current.variations.map(v => v.id)
    // Oldest 5 must be gone
    for (let i = 1; i <= PRUNE_BATCH_SIZE; i++) {
      expect(remainingIds).not.toContain(`prune-var-${i}`)
    }
    // The 2 newest seeded variations must still be present
    expect(remainingIds).toContain('prune-var-6')
    expect(remainingIds).toContain('prune-var-7')

    // (b) storageError must be cleared after the successful prune
    expect(result.current.storageError).toBeNull()

    // localStorage must reflect the pruned list
    const stored = storedVariations()
    expect(stored).toHaveLength(8 - PRUNE_BATCH_SIZE)
    expect(stored.map(v => v.id)).not.toContain('prune-var-1')
  })

  it('removes a second batch when the first batch persist still fails (two rounds needed)', async () => {
    // 11 variations: IDs prune-var-1 (oldest) … prune-var-11 (newest).
    // After removing the first batch of 5 → 6 remain → persist throws.
    // After removing the second batch of 5 → 1 remains → persist succeeds.
    const variations = makeVariations(11)
    seedLocalStorage(variations)

    const { result } = renderHook(() => useSavedVariations())

    // Capture the original setItem BEFORE spying so the delegate calls inside
    // the mock never recurse back into the spy.
    const originalSetItem = Storage.prototype.setItem

    // For STORAGE_KEY we throw on the first two calls (simulating storage still
    // full after removing the first batch) and succeed from the third onward.
    // Non-STORAGE_KEY writes (e.g. MIGRATED_KEY) are forwarded unchanged.
    let storageKeyCallCount = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key !== STORAGE_KEY) {
        originalSetItem.call(localStorage, key, value)
        return
      }
      storageKeyCallCount++
      // Call 1: useEffect write triggered by the save below → throw → storageError set
      // Call 2: first pruneOldest batch persist (7 items remain) → throw (still full)
      // Call 3+: second pruneOldest batch persist (2 items remain) → succeed
      if (storageKeyCallCount <= 2) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }
      originalSetItem.call(localStorage, key, value)
    })

    // Trigger storageError (call 1: setItem throws)
    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'p', negativePrompt: '', estimatedTokens: 1 },
        'Overflow trigger',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.storageError).toBeTruthy()

    // State: 12 items (11 seeded + 1 from save above, which is the newest)
    expect(result.current.variations).toHaveLength(12)

    // pruneOldest:
    //   round 1: removes prune-var-1…prune-var-5, tries to persist 7 items → throws (call 2)
    //   round 2: removes prune-var-6…prune-var-10, tries to persist 2 items → succeeds (call 3)
    act(() => {
      result.current.pruneOldest()
    })

    // (c) Two full batches (10 items) removed; 2 remain: prune-var-11 + the save trigger
    expect(result.current.variations).toHaveLength(12 - PRUNE_BATCH_SIZE * 2)

    const remainingIds = result.current.variations.map(v => v.id)
    for (let i = 1; i <= PRUNE_BATCH_SIZE * 2; i++) {
      expect(remainingIds).not.toContain(`prune-var-${i}`)
    }
    expect(remainingIds).toContain('prune-var-11')

    // storageError is cleared after the successful second-batch persist
    expect(result.current.storageError).toBeNull()
  })
})
