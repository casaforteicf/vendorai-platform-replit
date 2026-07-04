import { useState, useEffect, useCallback, useRef } from 'react'
import type { TranslatorId, DetailLevel } from '../../engines/prompt-playwright/prompt-playwright'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedVariation {
  id: string
  name: string
  translator: TranslatorId
  detail: DetailLevel
  prompt: string
  negativePrompt: string
  estimatedTokens: number
  savedAt: number
  notes?: string
}

export interface ServerVariation {
  id: string
  name: string
  translator: string
  detail: string
  prompt: string
  negativePrompt: string
  estimatedTokens: number
  savedAt: string
  notes: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'arqdor_saved_prompt_variations'
export const MIGRATED_KEY = 'arqdor_prompt_variations_migrated'
export const API_BASE = '/api/arch/prompt-variations'
export const PRUNE_BATCH_SIZE = 5

// ─── Local-storage helpers ────────────────────────────────────────────────────

export function persistVariations(list: SavedVariation[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

export function readLocalVariations(): SavedVariation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedVariation[]) : []
  } catch {
    return []
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  return localStorage.getItem('vendorai_token')
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

export function fromServer(sv: ServerVariation): SavedVariation {
  return {
    id: sv.id,
    name: sv.name,
    translator: sv.translator as TranslatorId,
    detail: sv.detail as DetailLevel,
    prompt: sv.prompt,
    negativePrompt: sv.negativePrompt,
    estimatedTokens: sv.estimatedTokens,
    savedAt: new Date(sv.savedAt).getTime(),
    notes: sv.notes ?? undefined,
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  })
}

// ─── Reconciliation: push all local-* items to the server ────────────────────
// Reads directly from localStorage so it is safe to call from a stable callback
// with no dependency on React state.
//
// The in-flight guard prevents duplicate POSTs when the 'online' event fires
// multiple times in rapid succession (e.g. flaky connection) or when a save()
// success races with an incoming online event.

let syncInFlight = false

/** Reset the in-flight guard — intended for test teardown only. */
export function resetSyncInFlight(): void {
  syncInFlight = false
}

export async function syncPendingVariations(
  onPromoted: (localId: string, serverVariation: SavedVariation) => void,
): Promise<{ failedCount: number }> {
  if (syncInFlight) return { failedCount: 0 }

  const token = getAuthToken()
  if (!token) return { failedCount: 0 }

  const current = readLocalVariations()
  const pending = current.filter(v => v.id.startsWith('local-'))
  if (pending.length === 0) return { failedCount: 0 }

  syncInFlight = true
  let failedCount = 0
  try {
    for (const item of pending) {
      try {
        const res = await apiFetch('', {
          method: 'POST',
          body: JSON.stringify({
            name: item.name,
            translator: item.translator,
            detail: item.detail,
            prompt: item.prompt,
            negativePrompt: item.negativePrompt,
            estimatedTokens: item.estimatedTokens,
            notes: item.notes,
            savedAt: new Date(item.savedAt).toISOString(),
          }),
        })
        if (!res.ok) {
          failedCount++
          continue
        }
        const saved: ServerVariation = await res.json()
        onPromoted(item.id, fromServer(saved))
      } catch {
        // Still offline — count the rest as failed and abort
        failedCount += pending.filter(p => p.id.startsWith('local-')).length
        break
      }
    }
  } finally {
    syncInFlight = false
  }
  return { failedCount }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSavedVariations() {
  const [variations, setVariations] = useState<SavedVariation[]>(readLocalVariations)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const clearStorageError = useCallback(() => setStorageError(null), [])
  const clearSyncError = useCallback(() => setSyncError(null), [])

  // Persist to localStorage whenever variations change; surface quota errors.
  // Skip the very first render (data was just read from localStorage — no need to re-write it).
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const ok = persistVariations(variations)
    if (!ok) {
      setStorageError(
        'Armazenamento local cheio — variação salva apenas no servidor. Remova variações antigas para liberar espaço.',
      )
    }
  }, [variations])

  const importVariations = useCallback((items: unknown[]): number => {
    let importedCount = 0
    setVariations(prev => {
      const existingIds = new Set(prev.map(v => v.id))
      const toAdd: SavedVariation[] = []
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const id = typeof r.id === 'string' && r.id ? r.id : ''
        if (id && existingIds.has(id)) continue
        const newId = id || `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        existingIds.add(newId)
        toAdd.push({
          id: newId,
          name: typeof r.name === 'string' ? r.name : 'Importado',
          translator: (typeof r.translator === 'string' ? r.translator : 'flux-1.1') as TranslatorId,
          detail: (typeof r.detailLevel === 'string'
            ? r.detailLevel
            : typeof r.detail === 'string' ? r.detail : 'detalhado') as DetailLevel,
          prompt: typeof r.prompt === 'string' ? r.prompt : '',
          negativePrompt: typeof r.negativePrompt === 'string' ? r.negativePrompt : '',
          estimatedTokens: typeof r.estimatedTokens === 'number' ? r.estimatedTokens : 0,
          savedAt: typeof r.savedAt === 'string'
            ? new Date(r.savedAt).getTime() || Date.now()
            : typeof r.savedAt === 'number' ? r.savedAt : Date.now(),
          notes: typeof r.notes === 'string' ? r.notes : undefined,
        })
      }
      if (toAdd.length === 0) {
        importedCount = 0
        return prev
      }
      importedCount = toAdd.length
      const next = [...toAdd, ...prev]
      persistVariations(next)
      return next
    })
    return importedCount
  }, [])

  // Promote a single local-* item to its server-assigned ID
  const promoteLocal = useCallback((localId: string, serverVariation: SavedVariation) => {
    setVariations(prev => {
      const next = prev.map(existing =>
        existing.id === localId ? serverVariation : existing,
      )
      persistVariations(next)
      return next
    })
  }, [])

  // Retry syncing any local-* items that were saved while the server was down.
  // Safe to call from an effect with an empty dependency array because it reads
  // localStorage directly instead of closing over the `variations` state value.
  // Returns a promise so callers can await the result if needed.
  const retryPendingSync = useCallback(async () => {
    const { failedCount } = await syncPendingVariations(promoteLocal)
    if (failedCount > 0) {
      setSyncError(
        failedCount === 1
          ? '1 variação offline não pôde ser sincronizada. Verifique sua conexão e tente novamente.'
          : `${failedCount} variações offline não puderam ser sincronizadas. Verifique sua conexão e tente novamente.`,
      )
    } else {
      setSyncError(null)
    }
  }, [promoteLocal])

  // Load from server on mount (if authenticated)
  useEffect(() => {
    void (async () => {
      const token = getAuthToken()
      if (!token) return // not logged in — stay on localStorage

      setSyncing(true)
      try {
        const res = await apiFetch('')
        if (!res.ok) {
          // Server unavailable — attempt to promote any pending local-* items
          // once connectivity returns
          return
        }
        const serverData: ServerVariation[] = await res.json()
        const serverVariations = serverData.map(fromServer)

        if (serverVariations.length === 0) {
          // Migrate localStorage variations to server on first authenticated load
          const local = readLocalVariations()
          const alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === '1'
          if (local.length > 0 && !alreadyMigrated) {
            // Separate already-synced items from local-only items
            const localOnly = local.filter(v => v.id.startsWith('local-'))
            const payload = localOnly.map(v => ({
              name: v.name,
              translator: v.translator,
              detail: v.detail,
              prompt: v.prompt,
              negativePrompt: v.negativePrompt,
              estimatedTokens: v.estimatedTokens,
              notes: v.notes,
              savedAt: new Date(v.savedAt).toISOString(),
            }))
            if (payload.length > 0) {
              const migrateRes = await apiFetch('/bulk', {
                method: 'POST',
                body: JSON.stringify(payload),
              })
              if (migrateRes.ok) {
                localStorage.setItem(MIGRATED_KEY, '1')
                const migrated: ServerVariation[] = await migrateRes.json()
                const merged = migrated.map(fromServer)
                setVariations(merged)
                persistVariations(merged)
              }
            } else {
              localStorage.setItem(MIGRATED_KEY, '1')
            }
          }
        } else {
          // Server has data — use it as source of truth, then push any local-*
          // items that were saved while offline
          localStorage.setItem(MIGRATED_KEY, '1')
          setVariations(serverVariations)
          persistVariations(serverVariations)
          // Reconcile offline-saved items after restoring from server
          await syncPendingVariations(promoteLocal)
        }
      } catch {
        // Network failure — keep local state; online listener will retry
      } finally {
        setSyncing(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Retry whenever connectivity is restored after an offline period
  useEffect(() => {
    window.addEventListener('online', retryPendingSync)
    return () => window.removeEventListener('online', retryPendingSync)
  }, [retryPendingSync])

  const save = useCallback(
    (v: Omit<SavedVariation, 'id' | 'savedAt' | 'name'>, suggestedName: string) => {
      const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const item: SavedVariation = {
        ...v,
        id: optimisticId,
        name: suggestedName,
        savedAt: Date.now(),
      }

      // Optimistic local update
      setVariations(prev => [item, ...prev])

      // Sync to server
      void (async () => {
        const token = getAuthToken()
        if (!token) return
        try {
          const res = await apiFetch('', {
            method: 'POST',
            body: JSON.stringify({
              name: item.name,
              translator: item.translator,
              detail: item.detail,
              prompt: item.prompt,
              negativePrompt: item.negativePrompt,
              estimatedTokens: item.estimatedTokens,
              notes: item.notes,
              savedAt: new Date(item.savedAt).toISOString(),
            }),
          })
          if (!res.ok) return
          const saved: ServerVariation = await res.json()
          // Replace optimistic item with server-assigned id
          promoteLocal(optimisticId, fromServer(saved))
          // Take the opportunity to push any other pending items now that the
          // server is reachable
          void syncPendingVariations(promoteLocal)
        } catch {
          // Keep local copy; the online listener will retry
        }
      })()
    },
    [promoteLocal],
  )

  const rename = useCallback((id: string, name: string) => {
    setVariations(prev => prev.map((v): SavedVariation => (v.id === id ? { ...v, name } : v)))
    void (async () => {
      const token = getAuthToken()
      if (!token || id.startsWith('local-')) return
      try {
        await apiFetch(`/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      } catch {
        /* keep local */
      }
    })()
  }, [])

  const remove = useCallback((id: string) => {
    setVariations(prev => prev.filter(v => v.id !== id))
    void (async () => {
      const token = getAuthToken()
      if (!token || id.startsWith('local-')) return
      try {
        await apiFetch(`/${id}`, { method: 'DELETE' })
      } catch {
        /* keep local */
      }
    })()
  }, [])

  const updateNotes = useCallback((id: string, notes: string) => {
    setVariations(prev => prev.map((v): SavedVariation => (v.id === id ? { ...v, notes } : v)))
    void (async () => {
      const token = getAuthToken()
      if (!token || id.startsWith('local-')) return
      try {
        await apiFetch(`/${id}`, { method: 'PATCH', body: JSON.stringify({ notes }) })
      } catch {
        /* keep local */
      }
    })()
  }, [])

  const pendingCount = variations.filter(v => v.id.startsWith('local-')).length

  // Remove the oldest PRUNE_BATCH_SIZE variations repeatedly until persist succeeds
  // or the list is empty. Called by the UI when the user consents to free up space.
  const pruneOldest = useCallback(() => {
    setVariations(prev => {
      let remaining = [...prev].sort((a, b) => a.savedAt - b.savedAt)
      let pruned = [...prev]

      while (pruned.length > 0) {
        const toRemove = new Set(remaining.slice(0, PRUNE_BATCH_SIZE).map(v => v.id))
        pruned = pruned.filter(v => !toRemove.has(v.id))
        remaining = remaining.filter(v => !toRemove.has(v.id))
        if (persistVariations(pruned)) {
          setStorageError(null)
          return pruned
        }
      }

      // All removed — persist empty list
      persistVariations([])
      setStorageError(null)
      return []
    })
  }, [])

  return {
    variations,
    save,
    rename,
    remove,
    updateNotes,
    storageError,
    clearStorageError,
    syncError,
    clearSyncError,
    pruneOldest,
    syncing,
    importVariations,
    pendingCount,
    retryPendingSync,
  }
}
