import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useSavedVariations,
  STORAGE_KEY,
  MIGRATED_KEY,
  PRUNE_BATCH_SIZE,
  readLocalVariations,
  resetSyncInFlight,
  syncPendingVariations,
  persistVariations,
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
  resetSyncInFlight()
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

// ─── Scenario: localStorage wipe — server is the source of truth ──────────────

describe('localStorage wipe with server data intact', () => {
  it('restores variations from the server after a full localStorage clear', async () => {
    const serverVar = {
      id: 'srv-restore-1',
      name: 'Restored from server',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'Persisted on server',
      negativePrompt: '',
      estimatedTokens: 55,
      savedAt: new Date(1_700_000_002_000).toISOString(),
      notes: null,
    }

    // First mount: server returns data, hook caches it into localStorage
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [serverVar],
      }),
    )

    localStorage.setItem('vendorai_token', 'tok-abc')

    const { result, unmount } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Server data is in state and also written to localStorage
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('srv-restore-1')
    expect(storedVariations()[0].id).toBe('srv-restore-1')

    // ── Simulate the user clearing browser data ────────────────────────────────
    unmount()
    localStorage.clear()

    // Verify localStorage is truly empty
    expect(storedVariations()).toHaveLength(0)

    // Re-mount: server still has the data; provide a fresh token
    localStorage.setItem('vendorai_token', 'tok-abc')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [serverVar],
      }),
    )

    const { result: result2 } = renderHook(() => useSavedVariations())

    // Initial state (from empty localStorage) is empty — no flash of wrong data
    expect(result2.current.variations).toHaveLength(0)

    // After the server fetch settles, variations are fully restored
    await waitFor(() => expect(result2.current.syncing).toBe(false))

    expect(result2.current.variations).toHaveLength(1)
    expect(result2.current.variations[0].id).toBe('srv-restore-1')
    expect(result2.current.variations[0].name).toBe('Restored from server')

    // localStorage is repopulated with server data
    expect(storedVariations()).toHaveLength(1)
    expect(storedVariations()[0].id).toBe('srv-restore-1')
  })

  it('restores multiple variations from the server after localStorage is wiped', async () => {
    const serverVars = [
      {
        id: 'srv-multi-1',
        name: 'First',
        translator: 'midjourney',
        detail: 'low',
        prompt: 'First prompt',
        negativePrompt: '',
        estimatedTokens: 10,
        savedAt: new Date(1_700_000_003_000).toISOString(),
        notes: null,
      },
      {
        id: 'srv-multi-2',
        name: 'Second',
        translator: 'stable-diffusion',
        detail: 'high',
        prompt: 'Second prompt',
        negativePrompt: 'blurry',
        estimatedTokens: 30,
        savedAt: new Date(1_700_000_004_000).toISOString(),
        notes: null,
      },
    ]

    localStorage.setItem('vendorai_token', 'tok-abc')
    // Wipe localStorage without ever having cached anything
    localStorage.clear()
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => serverVars,
      }),
    )

    const { result } = renderHook(() => useSavedVariations())

    // Starts empty (localStorage was wiped)
    expect(result.current.variations).toHaveLength(0)

    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Both server variations are restored
    expect(result.current.variations).toHaveLength(2)
    const ids = result.current.variations.map(v => v.id)
    expect(ids).toContain('srv-multi-1')
    expect(ids).toContain('srv-multi-2')

    // localStorage is repopulated
    const stored = storedVariations()
    expect(stored).toHaveLength(2)
  })
})

// ─── Scenario: offline save promoted after 'online' event ─────────────────────

describe('offline save promoted after connectivity is restored', () => {
  it('posts the queued local-* item to the server and promotes its id on the online event', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    const serverAssignedId = 'srv-promoted-1'
    const serverResponse = {
      id: serverAssignedId,
      name: 'Offline variation',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'Offline prompt',
      negativePrompt: '',
      estimatedTokens: 7,
      savedAt: new Date(1_700_000_005_000).toISOString(),
      notes: null,
    }

    const fetchMock = vi
      .fn()
      // 1st call: GET on mount → network error (server is down)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // 2nd call: POST on save → network error (still offline)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // 3rd call: POST from syncPendingVariations triggered by 'online' event → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => serverResponse,
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Save while offline — POST will fail and variation keeps a local-* id
    await act(async () => {
      result.current.save(
        {
          translator: 'midjourney',
          detail: 'medium',
          prompt: 'Offline prompt',
          negativePrompt: '',
          estimatedTokens: 7,
        },
        'Offline variation',
      )
      // Let the async POST attempt settle
      await new Promise(r => setTimeout(r, 0))
    })

    // Variation is in state with a local-* id
    expect(result.current.variations).toHaveLength(1)
    const localId = result.current.variations[0].id
    expect(localId).toMatch(/^local-/)
    expect(result.current.variations[0].name).toBe('Offline variation')

    // localStorage also holds the local-* id
    expect(storedVariations()[0].id).toMatch(/^local-/)

    // Simulate connectivity being restored
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      // Let syncPendingVariations complete
      await new Promise(r => setTimeout(r, 0))
    })

    // The variation must be promoted: local-* id replaced with server-assigned id
    await waitFor(() =>
      expect(result.current.variations[0].id).toBe(serverAssignedId),
    )

    // Both state and localStorage reflect the server-assigned id
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe(serverAssignedId)
    expect(result.current.variations[0].name).toBe('Offline variation')

    const stored = storedVariations()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(serverAssignedId)

    // The old local-* id must be gone from localStorage
    expect(stored[0].id).not.toMatch(/^local-/)
  })

  it('promotes multiple queued local-* items when the server comes back', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    const makeServerResp = (id: string, name: string, ts: number) => ({
      id,
      name,
      translator: 'midjourney',
      detail: 'medium',
      prompt: `Prompt for ${name}`,
      negativePrompt: '',
      estimatedTokens: 5,
      savedAt: new Date(ts).toISOString(),
      notes: null,
    })

    const fetchMock = vi
      .fn()
      // GET on mount → down
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST for first save → down
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST for second save → down
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST from syncPendingVariations (first pending item) → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeServerResp('srv-a', 'First offline', 1_700_000_010_000),
      })
      // POST from syncPendingVariations (second pending item) → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeServerResp('srv-b', 'Second offline', 1_700_000_011_000),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Save two variations while offline
    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'Prompt for First offline', negativePrompt: '', estimatedTokens: 5 },
        'First offline',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'Prompt for Second offline', negativePrompt: '', estimatedTokens: 5 },
        'Second offline',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    // Both should be local-* at this point
    expect(result.current.variations).toHaveLength(2)
    expect(result.current.variations.every(v => v.id.startsWith('local-'))).toBe(true)

    // Connectivity restored
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // Wait for both promotions to complete
    await waitFor(() =>
      result.current.variations.every(v => !v.id.startsWith('local-')),
    )

    expect(result.current.variations).toHaveLength(2)
    const ids = result.current.variations.map(v => v.id)
    expect(ids).toContain('srv-a')
    expect(ids).toContain('srv-b')

    // localStorage must also be fully promoted
    const stored = storedVariations()
    expect(stored).toHaveLength(2)
    expect(stored.some(v => v.id.startsWith('local-'))).toBe(false)
  })

  it('pendingCount drops to 0 once all local-* items are promoted after the online event', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    const makeServerResp = (id: string, name: string, ts: number) => ({
      id,
      name,
      translator: 'midjourney',
      detail: 'medium',
      prompt: `Prompt for ${name}`,
      negativePrompt: '',
      estimatedTokens: 5,
      savedAt: new Date(ts).toISOString(),
      notes: null,
    })

    const fetchMock = vi
      .fn()
      // GET on mount → network error (server is down)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST for first save → network error (still offline)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST for second save → network error (still offline)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST from syncPendingVariations (first pending item) → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeServerResp('srv-pc-1', 'First pending', 1_700_000_020_000),
      })
      // POST from syncPendingVariations (second pending item) → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeServerResp('srv-pc-2', 'Second pending', 1_700_000_021_000),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Save two variations while offline
    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'Prompt for First pending', negativePrompt: '', estimatedTokens: 5 },
        'First pending',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'Prompt for Second pending', negativePrompt: '', estimatedTokens: 5 },
        'Second pending',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    // Both are local-* — badge should show 2 pending
    expect(result.current.pendingCount).toBe(2)
    expect(result.current.variations.every(v => v.id.startsWith('local-'))).toBe(true)

    // Connectivity restored — trigger the online event
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // Wait for all promotions to complete
    await waitFor(() => result.current.pendingCount === 0)

    // pendingCount must be 0 — badge should disappear
    expect(result.current.pendingCount).toBe(0)

    // Both variations carry server-assigned ids
    expect(result.current.variations).toHaveLength(2)
    expect(result.current.variations.every(v => !v.id.startsWith('local-'))).toBe(true)
    const ids = result.current.variations.map(v => v.id)
    expect(ids).toContain('srv-pc-1')
    expect(ids).toContain('srv-pc-2')

    // localStorage also has no local-* items left
    const stored = storedVariations()
    expect(stored.some(v => v.id.startsWith('local-'))).toBe(false)
  })

  it('badge count equals number of still-unpromoted items when sync partially succeeds (mixed 200/5xx/200)', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    // Seed 3 local-* items directly in localStorage so we don't have to
    // go through save() which would fire extra fetch calls.
    const local1 = makeVariation({ id: 'local-mix-1', name: 'Mix one', savedAt: 1_700_000_030_000 })
    const local2 = makeVariation({ id: 'local-mix-2', name: 'Mix two', savedAt: 1_700_000_031_000 })
    const local3 = makeVariation({ id: 'local-mix-3', name: 'Mix three', savedAt: 1_700_000_032_000 })
    seedLocalStorage([local1, local2, local3])

    const makeServerResp = (id: string, name: string, ts: number) => ({
      id,
      name,
      translator: 'midjourney',
      detail: 'medium',
      prompt: `Prompt for ${name}`,
      negativePrompt: '',
      estimatedTokens: 5,
      savedAt: new Date(ts).toISOString(),
      notes: null,
    })

    const fetchMock = vi
      .fn()
      // GET on mount → 5xx so we stay in local-only mode and skip migration
      .mockResolvedValueOnce({ ok: false, status: 503 })
      // syncPendingVariations: POST for local-mix-1 → success (promoted)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeServerResp('srv-mix-1', 'Mix one', 1_700_000_030_000),
      })
      // syncPendingVariations: POST for local-mix-2 → 5xx (stays local-*)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // syncPendingVariations: POST for local-mix-3 → success (promoted)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeServerResp('srv-mix-3', 'Mix three', 1_700_000_032_000),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // All three should be local-* at this point
    expect(result.current.pendingCount).toBe(3)
    expect(result.current.variations.every(v => v.id.startsWith('local-'))).toBe(true)

    // Simulate connectivity restored
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      // Give the for-loop in syncPendingVariations time to iterate all 3 items
      await new Promise(r => setTimeout(r, 0))
    })

    // Wait for the two successful promotions to land in state
    await waitFor(() => result.current.pendingCount === 1)

    // Exactly 1 pending item remains (local-mix-2, which got the 5xx)
    expect(result.current.pendingCount).toBe(1)
    expect(result.current.variations).toHaveLength(3)

    const ids = result.current.variations.map(v => v.id)

    // The two successful items carry server-assigned ids
    expect(ids).toContain('srv-mix-1')
    expect(ids).toContain('srv-mix-3')

    // The failed item still has a local-* id
    const stillPending = result.current.variations.filter(v => v.id.startsWith('local-'))
    expect(stillPending).toHaveLength(1)
    expect(stillPending[0].name).toBe('Mix two')

    // localStorage must mirror state exactly
    const stored = storedVariations()
    expect(stored).toHaveLength(3)
    const storedIds = stored.map(v => v.id)
    expect(storedIds).toContain('srv-mix-1')
    expect(storedIds).toContain('srv-mix-3')
    expect(stored.filter(v => v.id.startsWith('local-'))).toHaveLength(1)
    expect(stored.find(v => v.id.startsWith('local-'))?.name).toBe('Mix two')
  })

  it('leaves the variation as local-* when the server is still down after the online event', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    const fetchMock = vi
      .fn()
      // GET on mount → down
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST on save → down
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST from syncPendingVariations → still down
      .mockRejectedValueOnce(new TypeError('Network failure'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.save(
        { translator: 'midjourney', detail: 'low', prompt: 'Still offline', negativePrompt: '', estimatedTokens: 3 },
        'Still offline save',
      )
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.variations[0].id).toMatch(/^local-/)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // id must still be local-* — nothing changed
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toMatch(/^local-/)
    expect(storedVariations()[0].id).toMatch(/^local-/)
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

// ─── Scenario: badge hidden with mixed server + offline items after online ─────

describe('badge stays hidden after online event with mixed srv-* and local-* items', () => {
  it('pendingCount drops to 0 immediately once local-* items are promoted — srv-* items never count', async () => {
    // Seed a realistic mid-session localStorage state: two already-synced
    // server items and one item that was saved while offline
    const srvA = makeVariation({ id: 'srv-mix-1', name: 'Server item A', savedAt: 1_700_000_100_000 })
    const srvB = makeVariation({ id: 'srv-mix-2', name: 'Server item B', savedAt: 1_700_000_101_000 })
    const offlineItem = makeVariation({ id: 'local-mix-offline-1', name: 'Offline item', savedAt: 1_700_000_102_000 })
    seedLocalStorage([srvA, srvB, offlineItem])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const promotedServerResponse = {
      id: 'srv-mix-promoted-1',
      name: 'Offline item',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_102_000).toISOString(),
      notes: null,
    }

    const fetchMock = vi
      .fn()
      // GET on mount → network error (server is down mid-session)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST from syncPendingVariations triggered by 'online' → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => promotedServerResponse,
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Initial state: all 3 items loaded from localStorage
    expect(result.current.variations).toHaveLength(3)

    // Only the local-* item contributes to pendingCount — srv-* items never count
    expect(result.current.pendingCount).toBe(1)

    // Confirm the srv-* items are not treated as pending
    const srvIds = result.current.variations.filter(v => !v.id.startsWith('local-')).map(v => v.id)
    expect(srvIds).toContain('srv-mix-1')
    expect(srvIds).toContain('srv-mix-2')

    // Track every pendingCount value emitted during the promotion to verify no
    // unexpected intermediate state (e.g. badge should not jump from 1 to 2+)
    const pendingCounts: number[] = [result.current.pendingCount]

    // Simulate connectivity being restored
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // Wait for the local-* item to be promoted
    await waitFor(() => {
      pendingCounts.push(result.current.pendingCount)
      return result.current.pendingCount === 0
    })

    // pendingCount must reach 0 — badge disappears
    expect(result.current.pendingCount).toBe(0)

    // pendingCount must have gone 1 → 0 without any value > 1 (no flash upward)
    expect(Math.max(...pendingCounts)).toBe(1)

    // All 3 items still present; promoted item now carries server-assigned id
    expect(result.current.variations).toHaveLength(3)
    const finalIds = result.current.variations.map(v => v.id)
    expect(finalIds).toContain('srv-mix-1')
    expect(finalIds).toContain('srv-mix-2')
    expect(finalIds).toContain('srv-mix-promoted-1')

    // No local-* ids remain in state or localStorage
    finalIds.forEach(id => expect(id).not.toMatch(/^local-/))
    const stored = storedVariations()
    expect(stored).toHaveLength(3)
    stored.forEach(v => expect(v.id).not.toMatch(/^local-/))
  })

  it('pendingCount stays at the number of still-pending items when the server rejects the promotion with 5xx', async () => {
    // Seed a realistic state: two already-synced server items + one local-only item
    const srvA = makeVariation({ id: 'srv-reject-1', name: 'Server A', savedAt: 1_700_000_200_000 })
    const srvB = makeVariation({ id: 'srv-reject-2', name: 'Server B', savedAt: 1_700_000_201_000 })
    const pending = makeVariation({ id: 'local-reject-offline-1', name: 'Pending offline', savedAt: 1_700_000_202_000 })
    seedLocalStorage([srvA, srvB, pending])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const fetchMock = vi
      .fn()
      // GET on mount → network error (server was down)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // POST from syncPendingVariations triggered by 'online' → server rejects with 5xx
      .mockResolvedValueOnce({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // All 3 items loaded from localStorage; only the local-* one is pending
    expect(result.current.variations).toHaveLength(3)
    expect(result.current.pendingCount).toBe(1)

    // Simulate connectivity being restored
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // The POST returned 5xx — the local-* item was NOT promoted
    expect(result.current.pendingCount).toBe(1)

    // The item still carries its local-* id in both state and localStorage
    const localItems = result.current.variations.filter(v => v.id.startsWith('local-'))
    expect(localItems).toHaveLength(1)
    expect(localItems[0].id).toBe('local-reject-offline-1')
    expect(localItems[0].name).toBe('Pending offline')

    const storedLocal = storedVariations().filter(v => v.id.startsWith('local-'))
    expect(storedLocal).toHaveLength(1)
    expect(storedLocal[0].id).toBe('local-reject-offline-1')

    // The srv-* items are completely unaffected
    const srvItems = result.current.variations.filter(v => !v.id.startsWith('local-'))
    expect(srvItems).toHaveLength(2)
    const srvIds = srvItems.map(v => v.id)
    expect(srvIds).toContain('srv-reject-1')
    expect(srvIds).toContain('srv-reject-2')

    // Total count must be unchanged
    expect(result.current.variations).toHaveLength(3)
    expect(storedVariations()).toHaveLength(3)
  })
})

// ─── Scenario: badge stays hidden with clean server-synced list ───────────────

describe('pendingCount stays 0 when all items are server-assigned', () => {
  it('reports pendingCount === 0 on mount and keeps it 0 after the online event fires', async () => {
    // Seed localStorage with only server-assigned ids (no local-* prefix)
    const v1 = makeVariation({ id: 'srv-clean-1', name: 'Clean one' })
    const v2 = makeVariation({ id: 'srv-clean-2', name: 'Clean two' })
    seedLocalStorage([v1, v2])
    localStorage.setItem('vendorai_token', 'tok-abc')

    // GET on mount returns the same server variations — no pending items
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'srv-clean-1',
            name: 'Clean one',
            translator: 'midjourney',
            detail: 'medium',
            prompt: 'A beautiful building',
            negativePrompt: 'blurry, low quality',
            estimatedTokens: 42,
            savedAt: new Date(1_700_000_000_000).toISOString(),
            notes: null,
          },
          {
            id: 'srv-clean-2',
            name: 'Clean two',
            translator: 'midjourney',
            detail: 'medium',
            prompt: 'A beautiful building',
            negativePrompt: 'blurry, low quality',
            estimatedTokens: 42,
            savedAt: new Date(1_700_000_001_000).toISOString(),
            notes: null,
          },
        ],
      }),
    )

    const { result } = renderHook(() => useSavedVariations())

    // Badge must be hidden from the very first render (no local-* items in storage)
    expect(result.current.pendingCount).toBe(0)

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Still 0 after the server response is applied
    expect(result.current.pendingCount).toBe(0)

    // Simulate connectivity-restored event — syncPendingVariations should find no
    // local-* items and return early without making any additional fetch calls
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // Badge must remain hidden — no spurious flash
    expect(result.current.pendingCount).toBe(0)

    // All items keep their server-assigned ids
    const ids = result.current.variations.map(v => v.id)
    expect(ids).toContain('srv-clean-1')
    expect(ids).toContain('srv-clean-2')
    ids.forEach(id => expect(id).not.toMatch(/^local-/))
  })
})

// ─── Scenario: rename ─────────────────────────────────────────────────────────

describe('rename', () => {
  it('happy path: updates state and localStorage instantly, then sends PATCH to server', async () => {
    const v = makeVariation({ id: 'srv-rename-1', name: 'Original name' })
    seedLocalStorage([v])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const fetchSpy = vi
      .fn()
      // GET on mount → 5xx so existing localStorage is preserved
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // PATCH for the rename
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Rename is synchronous from the caller's perspective
    act(() => {
      result.current.rename('srv-rename-1', 'New name')
    })

    // State reflects the new name immediately (optimistic)
    expect(result.current.variations[0].name).toBe('New name')

    // localStorage is updated immediately too
    expect(storedVariations()[0].name).toBe('New name')

    // Wait for the async PATCH to be dispatched
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))

    const [patchUrl, patchInit] = fetchSpy.mock.calls[1] as [string, RequestInit]
    expect(patchUrl).toContain('/srv-rename-1')
    expect(patchInit.method).toBe('PATCH')
    expect(JSON.parse(patchInit.body as string)).toEqual({ name: 'New name' })
  })

  it('server failure: rename stays in local state when PATCH returns 5xx', async () => {
    const v = makeVariation({ id: 'srv-rename-2', name: 'Before rename' })
    seedLocalStorage([v])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 }) // GET on mount
        .mockResolvedValueOnce({ ok: false, status: 500 }), // PATCH → 5xx
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.rename('srv-rename-2', 'After rename')
      // Let the async PATCH attempt settle
      await new Promise(r => setTimeout(r, 0))
    })

    // State must still show the new name despite server failure
    expect(result.current.variations[0].name).toBe('After rename')

    // localStorage must also reflect the new name
    expect(storedVariations()[0].name).toBe('After rename')
  })

  it('local-* items skip the PATCH entirely (no server call for offline-saved items)', async () => {
    const v = makeVariation({ id: 'local-offline-1', name: 'Offline variation' })
    seedLocalStorage([v])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 }) // GET on mount
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    await act(async () => {
      result.current.rename('local-offline-1', 'Renamed offline')
      await new Promise(r => setTimeout(r, 0))
    })

    // State and localStorage show the new name
    expect(result.current.variations[0].name).toBe('Renamed offline')
    expect(storedVariations()[0].name).toBe('Renamed offline')

    // Only the initial GET was called — no PATCH for local-* items
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// ─── Scenario: concurrent-invocation guard ────────────────────────────────────

describe('syncPendingVariations in-flight guard', () => {
  it('deduplicates concurrent calls — only one POST is issued when online fires twice rapidly', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    const localItem = makeVariation({ id: 'local-dup-1', name: 'Dup check', savedAt: 1_700_000_400_000 })
    seedLocalStorage([localItem])

    const serverResponse = {
      id: 'srv-dup-1',
      name: 'Dup check',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_400_000).toISOString(),
      notes: null,
    }

    // The POST resolves slowly so both concurrent calls overlap while the first is in-flight
    let resolvePost!: () => void
    const slowPost = new Promise<{ ok: boolean; json: () => Promise<typeof serverResponse> }>(resolve => {
      resolvePost = () => resolve({ ok: true, json: async () => serverResponse })
    })

    const fetchMock = vi
      .fn()
      // Any POST call returns the slow promise
      .mockReturnValue(slowPost)
    vi.stubGlobal('fetch', fetchMock)

    const onPromoted = vi.fn()

    // Fire two concurrent invocations — the second must be a no-op
    const first = syncPendingVariations(onPromoted)
    const second = syncPendingVariations(onPromoted)

    // Resolve the in-flight POST
    resolvePost()
    await Promise.all([first, second])

    // Exactly one POST must have been made despite two invocations
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // onPromoted called exactly once — no duplicate promotion
    expect(onPromoted).toHaveBeenCalledTimes(1)
    expect(onPromoted).toHaveBeenCalledWith('local-dup-1', expect.objectContaining({ id: 'srv-dup-1' }))
  })

  it('rapid online events via the hook do not duplicate POSTs', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    const localItem = makeVariation({ id: 'local-rapid-1', name: 'Rapid', savedAt: 1_700_000_500_000 })
    seedLocalStorage([localItem])

    const serverResponse = {
      id: 'srv-rapid-1',
      name: 'Rapid',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_500_000).toISOString(),
      notes: null,
    }

    // POST resolves on next microtask (enough for both online events to queue before it completes)
    const fetchMock = vi
      .fn()
      // GET on mount → network error (offline)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // First POST → success
      .mockResolvedValueOnce({ ok: true, json: async () => serverResponse })
      // Second POST → should never be reached; if it is, the guard failed
      .mockResolvedValueOnce({ ok: true, json: async () => serverResponse })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Fire two rapid online events synchronously before the first sync can complete
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // Wait for the promoted id to land
    await waitFor(() => result.current.variations[0]?.id === 'srv-rapid-1')

    // Only one POST should have been issued (1 GET + 1 POST = 2 total)
    const postCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(postCalls).toHaveLength(1)

    // Variation is correctly promoted — no duplicate
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('srv-rapid-1')
    expect(storedVariations()[0].id).toBe('srv-rapid-1')
  })
})

// ─── Scenario: badge resets after second offline→online cycle (partial sync) ──

describe('badge count resets correctly after second online event following a partial sync', () => {
  it('pendingCount reaches 0 and both items get server ids after the second reconnection', async () => {
    // Seed two local-* items saved while the user was offline
    const item1 = makeVariation({
      id: 'local-cycle-1',
      name: 'First offline',
      savedAt: 1_700_000_300_000,
    })
    const item2 = makeVariation({
      id: 'local-cycle-2',
      name: 'Second offline',
      savedAt: 1_700_000_301_000,
    })
    seedLocalStorage([item1, item2])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const serverResp1 = {
      id: 'srv-cycle-1',
      name: 'First offline',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_300_000).toISOString(),
      notes: null,
    }
    const serverResp2 = {
      id: 'srv-cycle-2',
      name: 'Second offline',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_301_000).toISOString(),
      notes: null,
    }

    const fetchMock = vi
      .fn()
      // 1st call: GET on mount → network error (user is offline)
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // 2nd call: first 'online' event — POST for item1 → success
      .mockResolvedValueOnce({ ok: true, json: async () => serverResp1 })
      // 3rd call: first 'online' event — POST for item2 → 5xx (partial failure)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // 4th call: second 'online' event — POST for item2 (retry) → success
      .mockResolvedValueOnce({ ok: true, json: async () => serverResp2 })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Both local-* items are present and both count as pending
    expect(result.current.variations).toHaveLength(2)
    expect(result.current.pendingCount).toBe(2)

    // ── First 'online' event: item1 succeeds, item2 gets a 5xx ───────────────
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // item1 must be promoted; item2 still has its local-* id
    await waitFor(() => {
      const ids = result.current.variations.map(v => v.id)
      return ids.includes('srv-cycle-1') && ids.includes('local-cycle-2')
    })

    expect(result.current.pendingCount).toBe(1)
    expect(result.current.variations).toHaveLength(2)

    const afterFirstOnlineIds = result.current.variations.map(v => v.id)
    expect(afterFirstOnlineIds).toContain('srv-cycle-1')
    expect(afterFirstOnlineIds).toContain('local-cycle-2')

    // localStorage reflects the same partial state
    const storedAfterFirst = storedVariations()
    expect(storedAfterFirst).toHaveLength(2)
    const storedIdsAfterFirst = storedAfterFirst.map(v => v.id)
    expect(storedIdsAfterFirst).toContain('srv-cycle-1')
    expect(storedIdsAfterFirst).toContain('local-cycle-2')

    // ── User goes offline again (badge still shows 1 pending item) ────────────
    // No action needed — the local-cycle-2 item remains in state and storage.

    // ── Second 'online' event: the previously-failed item2 now succeeds ───────
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    // item2 must now be promoted — pendingCount drops to 0
    await waitFor(() => result.current.pendingCount === 0)

    expect(result.current.pendingCount).toBe(0)
    expect(result.current.variations).toHaveLength(2)

    const finalIds = result.current.variations.map(v => v.id)
    expect(finalIds).toContain('srv-cycle-1')
    expect(finalIds).toContain('srv-cycle-2')

    // No local-* ids remain anywhere
    finalIds.forEach(id => expect(id).not.toMatch(/^local-/))

    const storedFinal = storedVariations()
    expect(storedFinal).toHaveLength(2)
    storedFinal.forEach(v => expect(v.id).not.toMatch(/^local-/))
    const storedFinalIds = storedFinal.map(v => v.id)
    expect(storedFinalIds).toContain('srv-cycle-1')
    expect(storedFinalIds).toContain('srv-cycle-2')
  })
})

// ─── Scenario: online event fires while save POST is still in-flight ──────────

describe('badge accuracy when online fires concurrently with an in-flight save POST', () => {
  it('pendingCount === 0 and only one copy of the item exists after both paths settle', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    // Deferred save POST — we resolve it after the online-triggered sync completes
    // so that both promoteLocal calls happen for the same local-* id.
    let resolveSavePost!: (value: { ok: boolean; json: () => Promise<unknown> }) => void
    const savePendingPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      resolve => {
        resolveSavePost = resolve
      },
    )

    const serverRespFromOnlineSync = {
      id: 'srv-race-online-1',
      name: 'Race item',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'Race prompt',
      negativePrompt: '',
      estimatedTokens: 5,
      savedAt: new Date(1_700_000_400_000).toISOString(),
      notes: null,
    }

    const serverRespFromSave = {
      id: 'srv-race-save-1',
      name: 'Race item',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'Race prompt',
      negativePrompt: '',
      estimatedTokens: 5,
      savedAt: new Date(1_700_000_400_000).toISOString(),
      notes: null,
    }

    const fetchMock = vi
      .fn()
      // 1st call: GET on mount → offline
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // 2nd call: POST from save → kept in-flight via the deferred promise
      .mockReturnValueOnce(savePendingPromise)
      // 3rd call: POST from syncPendingVariations triggered by 'online' → resolves first
      .mockResolvedValueOnce({
        ok: true,
        json: async () => serverRespFromOnlineSync,
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Save one item — the POST fires immediately but stays in-flight (deferred)
    act(() => {
      result.current.save(
        {
          translator: 'midjourney',
          detail: 'medium',
          prompt: 'Race prompt',
          negativePrompt: '',
          estimatedTokens: 5,
        },
        'Race item',
      )
    })

    // Optimistic update lands with a local-* id; badge shows 1 pending
    expect(result.current.variations).toHaveLength(1)
    const localId = result.current.variations[0].id
    expect(localId).toMatch(/^local-/)
    expect(result.current.pendingCount).toBe(1)

    // Fire 'online' while save POST is still pending.
    // syncPendingVariations reads localStorage, finds local-* item, POSTs it,
    // and receives srv-race-online-1 → calls promoteLocal.
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      // Allow syncPendingVariations to complete its POST and call promoteLocal
      await new Promise(r => setTimeout(r, 0))
    })

    // The online-triggered sync must have promoted the item already
    await waitFor(() =>
      result.current.variations.some(v => v.id === 'srv-race-online-1'),
    )

    // Now resolve the deferred save POST with a different server-assigned id.
    // promoteLocal will be called again for the same localId — it must be a no-op
    // because the item is already gone from state (no double-entry).
    await act(async () => {
      resolveSavePost({
        ok: true,
        json: async () => serverRespFromSave,
      })
      // Let the save callback's promoteLocal (and its follow-up syncPendingVariations) settle
      await new Promise(r => setTimeout(r, 0))
    })

    // ── Core assertions ────────────────────────────────────────────────────────

    // Badge must be clear — no local-* items remain
    expect(result.current.pendingCount).toBe(0)

    // Only ONE copy of the item must exist — no double-entry from the race
    expect(result.current.variations).toHaveLength(1)

    // The surviving item must carry a server-assigned id
    expect(result.current.variations[0].id).not.toMatch(/^local-/)

    // localStorage must mirror state exactly — one item, server-assigned id
    const stored = storedVariations()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).not.toMatch(/^local-/)
  })
})

// ─── Scenario: two rapid offline saves — first success triggers syncPending ───
//
// Race: save(item1) and save(item2) both fire deferred POSTs while offline.
// When POST #1 resolves it calls syncPendingVariations — which must skip item2
// because item2's own POST is still in-flight. Only ONE server record for each
// item must be created; final state has exactly 2 server-assigned items.

describe('two offline saves: syncPendingVariations skips the item whose POST is still in-flight', () => {
  it('produces exactly 2 server-assigned items and pendingCount === 0 after both POSTs settle', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    // Deferred POST controllers
    let resolvePost1!: (v: { ok: boolean; json: () => Promise<unknown> }) => void
    let resolvePost2!: (v: { ok: boolean; json: () => Promise<unknown> }) => void

    const post1Promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      r => { resolvePost1 = r },
    )
    const post2Promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      r => { resolvePost2 = r },
    )

    const serverResp1 = {
      id: 'srv-double-1',
      name: 'First offline',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'Prompt one',
      negativePrompt: '',
      estimatedTokens: 5,
      savedAt: new Date(1_700_000_500_000).toISOString(),
      notes: null,
    }

    const serverResp2 = {
      id: 'srv-double-2',
      name: 'Second offline',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'Prompt two',
      negativePrompt: '',
      estimatedTokens: 6,
      savedAt: new Date(1_700_000_501_000).toISOString(),
      notes: null,
    }

    const fetchMock = vi
      .fn()
      // 1st call: GET on mount → offline
      .mockRejectedValueOnce(new TypeError('Network failure'))
      // 2nd call: POST for item 1 — kept in-flight via deferred promise
      .mockReturnValueOnce(post1Promise)
      // 3rd call: POST for item 2 — kept in-flight via deferred promise
      .mockReturnValueOnce(post2Promise)
      // No further calls expected — syncPendingVariations must skip item 2
      // because its own POST was already in-flight when item 1's POST resolved.

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSavedVariations())

    // Wait for the mount-time GET to settle
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Save two items while offline — both dispatch deferred POSTs
    act(() => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'Prompt one', negativePrompt: '', estimatedTokens: 5 },
        'First offline',
      )
    })

    act(() => {
      result.current.save(
        { translator: 'midjourney', detail: 'medium', prompt: 'Prompt two', negativePrompt: '', estimatedTokens: 6 },
        'Second offline',
      )
    })

    // Both optimistic items are local-* at this point
    expect(result.current.variations).toHaveLength(2)
    expect(result.current.variations.every(v => v.id.startsWith('local-'))).toBe(true)
    expect(result.current.pendingCount).toBe(2)

    // Resolve POST #1 (item 1 succeeds).
    // This triggers syncPendingVariations — which must skip item 2 (its POST is still in-flight).
    await act(async () => {
      resolvePost1({ ok: true, json: async () => serverResp1 })
      // Give the success handler (promoteLocal + syncPendingVariations) time to run
      await new Promise(r => setTimeout(r, 0))
    })

    // Item 1 is promoted; item 2 still has its local-* id
    await waitFor(() =>
      result.current.variations.some(v => v.id === 'srv-double-1'),
    )

    expect(result.current.variations).toHaveLength(2)
    const idsAfterFirstSettle = result.current.variations.map(v => v.id)
    expect(idsAfterFirstSettle).toContain('srv-double-1')
    // Item 2 must still be local-* (not yet promoted)
    expect(idsAfterFirstSettle.some(id => id.startsWith('local-'))).toBe(true)
    expect(result.current.pendingCount).toBe(1)

    // Critically: fetch must have been called exactly 3 times so far
    // (1 GET + 1 POST item1 + 1 POST item2). If syncPendingVariations had
    // also posted item2, there would be a 4th call.
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Now resolve POST #2 (item 2's own save POST succeeds)
    await act(async () => {
      resolvePost2({ ok: true, json: async () => serverResp2 })
      await new Promise(r => setTimeout(r, 0))
    })

    // Both items must be promoted — pendingCount drops to 0
    await waitFor(() => result.current.pendingCount === 0)

    // ── Core assertions ──────────────────────────────────────────────────────

    // Exactly 2 items — no duplicate for item 2
    expect(result.current.variations).toHaveLength(2)

    // Both carry server-assigned ids
    const finalIds = result.current.variations.map(v => v.id)
    expect(finalIds).toContain('srv-double-1')
    expect(finalIds).toContain('srv-double-2')
    finalIds.forEach(id => expect(id).not.toMatch(/^local-/))

    // Badge is clear
    expect(result.current.pendingCount).toBe(0)

    // localStorage mirrors state exactly
    const stored = storedVariations()
    expect(stored).toHaveLength(2)
    const storedIds = stored.map(v => v.id)
    expect(storedIds).toContain('srv-double-1')
    expect(storedIds).toContain('srv-double-2')
    stored.forEach(v => expect(v.id).not.toMatch(/^local-/))

    // Total fetch calls: 1 GET + 1 POST each for item1 and item2 = 3.
    // Any extra call would mean syncPendingVariations incorrectly posted item2
    // a second time while its own POST was already in-flight.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

// ─── Scenario: syncError / retryPendingSync ───────────────────────────────────

describe('syncError and retryPendingSync', () => {
  it('sets syncError when retryPendingSync receives a 5xx for a pending item', async () => {
    // Seed localStorage with a local-* item (saved while offline)
    const pending = makeVariation({ id: 'local-sync-err-1', name: 'Pending item' })
    seedLocalStorage([pending])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // GET on mount → 5xx (server unavailable, keeps local state)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // POST from retryPendingSync → 5xx
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // No error yet
    expect(result.current.syncError).toBeNull()

    // Trigger retry — server is still down
    await act(async () => {
      await result.current.retryPendingSync()
    })

    // syncError must be set with a human-readable message
    expect(result.current.syncError).toBeTruthy()
    expect(result.current.syncError).toContain('variação offline não pôde ser sincronizada')

    // Variations must be untouched
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('local-sync-err-1')
  })

  it('clears syncError when a subsequent retryPendingSync succeeds', async () => {
    const pending = makeVariation({ id: 'local-sync-recover-1', name: 'Will recover' })
    seedLocalStorage([pending])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const serverResponse = {
      id: 'srv-recovered-1',
      name: 'Will recover',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_000_000).toISOString(),
      notes: null,
    }

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // GET on mount → 5xx
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // POST from first retryPendingSync → 5xx (sets syncError)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // POST from second retryPendingSync → success (clears syncError)
        .mockResolvedValueOnce({ ok: true, json: async () => serverResponse }),
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // First retry fails → syncError should be set
    await act(async () => {
      await result.current.retryPendingSync()
    })
    expect(result.current.syncError).toBeTruthy()

    // Second retry succeeds → syncError should be cleared
    await act(async () => {
      await result.current.retryPendingSync()
    })
    expect(result.current.syncError).toBeNull()

    // The pending item should have been promoted to a server-assigned id
    await waitFor(() =>
      result.current.variations.some(v => v.id === 'srv-recovered-1'),
    )
    expect(result.current.variations[0].id).toBe('srv-recovered-1')
  })

  it('clearSyncError resets the error without touching variations', async () => {
    const pending = makeVariation({ id: 'local-clear-err-1', name: 'Keep me' })
    seedLocalStorage([pending])
    localStorage.setItem('vendorai_token', 'tok-abc')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // GET on mount → 5xx
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // POST from retryPendingSync → 5xx (sets syncError)
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    )

    const { result } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Trigger syncError
    await act(async () => {
      await result.current.retryPendingSync()
    })
    expect(result.current.syncError).toBeTruthy()

    // Clear the error
    act(() => {
      result.current.clearSyncError()
    })

    // Error is gone
    expect(result.current.syncError).toBeNull()

    // Variations are completely untouched
    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('local-clear-err-1')
    expect(result.current.variations[0].name).toBe('Keep me')
  })
})

// ─── Scenario: badge accuracy after page refresh (unmount + remount) ──────────
//
// Unmounting and remounting the hook is equivalent to a page refresh. These
// tests verify:
//  (a) local-* ids survive the remount because they are persisted in localStorage
//  (b) syncPendingVariations runs correctly on the first 'online' event after remount
//  (c) inFlightIds (a useRef) is re-initialized to an empty Set on every mount,
//      so an item that was in-flight at unmount time is never permanently locked out

describe('badge stays accurate after the hook is unmounted and remounted mid-sync', () => {
  it('local-* id survives remount and is promoted correctly on the next online event', async () => {
    // Seed a local-* item as if the user saved while offline before refreshing
    const offlineItem = makeVariation({
      id: 'local-refresh-1',
      name: 'Offline before refresh',
      savedAt: 1_700_000_600_000,
    })
    seedLocalStorage([offlineItem])
    localStorage.setItem('vendorai_token', 'tok-abc')

    const serverResponse = {
      id: 'srv-refresh-1',
      name: 'Offline before refresh',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_600_000).toISOString(),
      notes: null,
    }

    // First mount: server is unreachable — item stays as local-*
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Network failure')),
    )

    const { result, unmount } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    expect(result.current.variations).toHaveLength(1)
    expect(result.current.variations[0].id).toBe('local-refresh-1')
    expect(result.current.pendingCount).toBe(1)

    // ── Simulate a page refresh ───────────────────────────────────────────────
    unmount()

    // (a) local-* item survives unmount in localStorage
    expect(storedVariations()).toHaveLength(1)
    expect(storedVariations()[0].id).toBe('local-refresh-1')

    // ── Remount (new page load): GET still fails, but 'online' POST will succeed
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // GET on remount → still offline
        .mockRejectedValueOnce(new TypeError('Network failure'))
        // POST from syncPendingVariations triggered by 'online' → success
        .mockResolvedValueOnce({ ok: true, json: async () => serverResponse }),
    )

    const { result: result2 } = renderHook(() => useSavedVariations())

    // (a) local-* id is immediately visible from localStorage on the new mount
    expect(result2.current.variations).toHaveLength(1)
    expect(result2.current.variations[0].id).toBe('local-refresh-1')
    expect(result2.current.pendingCount).toBe(1)

    await waitFor(() => expect(result2.current.syncing).toBe(false))

    // Still pending after mount-time GET fails
    expect(result2.current.pendingCount).toBe(1)

    // ── (b) syncPendingVariations runs correctly on the 'online' event ────────
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    await waitFor(() => result2.current.pendingCount === 0)

    // Badge clears and item is promoted to the server-assigned id
    expect(result2.current.pendingCount).toBe(0)
    expect(result2.current.variations).toHaveLength(1)
    expect(result2.current.variations[0].id).toBe('srv-refresh-1')

    // localStorage is updated with the server id
    expect(storedVariations()[0].id).toBe('srv-refresh-1')
  })

  it('in-flight save at unmount does not permanently lock the item in inFlightIds after remount', async () => {
    localStorage.setItem('vendorai_token', 'tok-abc')

    // Deferred save POST that will still be in-flight when we unmount
    let resolveFirstPost!: (v: { ok: boolean; json: () => Promise<unknown> }) => void
    const firstPostPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      r => { resolveFirstPost = r },
    )

    const serverResponseFromRemount = {
      id: 'srv-remount-promoted-1',
      name: 'In-flight at unmount',
      translator: 'midjourney',
      detail: 'medium',
      prompt: 'A beautiful building',
      negativePrompt: 'blurry, low quality',
      estimatedTokens: 42,
      savedAt: new Date(1_700_000_700_000).toISOString(),
      notes: null,
    }

    // First mount: GET fails (offline), save POST is deferred (stays in-flight)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Network failure')) // GET on mount
        .mockReturnValueOnce(firstPostPromise),                  // save POST — kept pending
    )

    const { result, unmount } = renderHook(() => useSavedVariations())
    await waitFor(() => expect(result.current.syncing).toBe(false))

    // Save an item — POST fires but remains in-flight
    act(() => {
      result.current.save(
        {
          translator: 'midjourney',
          detail: 'medium',
          prompt: 'A beautiful building',
          negativePrompt: 'blurry, low quality',
          estimatedTokens: 42,
        },
        'In-flight at unmount',
      )
    })

    // Optimistic item is visible with a local-* id; its POST is still in-flight
    expect(result.current.variations).toHaveLength(1)
    const localId = result.current.variations[0].id
    expect(localId).toMatch(/^local-/)
    expect(result.current.pendingCount).toBe(1)

    // ── Unmount while POST is still in-flight ─────────────────────────────────
    // Simulates a page refresh before the save completes. The in-flight POST
    // is now orphaned; its promoteLocal will call setVariations on the unmounted
    // component (React no-op). Critically, the OLD inFlightIds ref is also gone.
    unmount()

    // The local-* item is still in localStorage (optimistic write persisted it)
    expect(storedVariations()).toHaveLength(1)
    expect(storedVariations()[0].id).toBe(localId)

    // ── Remount (new page load) ───────────────────────────────────────────────
    // (c) inFlightIds is a useRef — re-initialized to an empty Set on every mount.
    // The item must NOT be locked out; it should be visible and promotable.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Network failure'))           // GET on remount
        .mockResolvedValueOnce({ ok: true, json: async () => serverResponseFromRemount }), // POST on 'online'
    )

    const { result: result2 } = renderHook(() => useSavedVariations())

    // (c) Item is immediately present from localStorage; inFlightIds is empty
    expect(result2.current.variations).toHaveLength(1)
    expect(result2.current.variations[0].id).toBe(localId)
    expect(result2.current.pendingCount).toBe(1)

    await waitFor(() => expect(result2.current.syncing).toBe(false))

    // ── Fire 'online': item must be promoted, not permanently stuck ───────────
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await new Promise(r => setTimeout(r, 0))
    })

    await waitFor(() => result2.current.pendingCount === 0)

    expect(result2.current.pendingCount).toBe(0)
    expect(result2.current.variations[0].id).toBe('srv-remount-promoted-1')
    expect(storedVariations()[0].id).toBe('srv-remount-promoted-1')

    // Settle the dangling POST from the first mount — must be a no-op for the UI
    await act(async () => {
      resolveFirstPost({ ok: false, status: 503 })
      await new Promise(r => setTimeout(r, 0))
    })

    // State must be unchanged — no duplicate entry and no revert
    expect(result2.current.variations).toHaveLength(1)
    expect(result2.current.variations[0].id).toBe('srv-remount-promoted-1')
    expect(result2.current.pendingCount).toBe(0)
  })
})
