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
export const PENDING_OWNER_KEY = 'arqdor_pending_owner'
export const API_BASE = '/api/arch/prompt-variations'
export const PRUNE_BATCH_SIZE = 5

/** Items pending sync for at least this many days turn amber. */
export const STALE_AMBER_DAYS = 1
/** Items pending sync for at least this many days turn red. */
export const STALE_RED_DAYS = 3

export type StalenessLevel = 'fresh' | 'amber' | 'red'

export interface StalenessInfo {
  label: string
  level: StalenessLevel
}

/** Returns a human-readable staleness label and urgency level for a pending local item. */
export function getStalenessInfo(savedAt: number, now = Date.now()): StalenessInfo {
  const ms = now - savedAt
  const hours = ms / (1000 * 60 * 60)
  const days = Math.floor(hours / 24)

  let level: StalenessLevel = 'fresh'
  if (hours >= STALE_RED_DAYS * 24) level = 'red'
  else if (hours >= STALE_AMBER_DAYS * 24) level = 'amber'

  let label: string
  if (days >= 1) {
    label = days === 1 ? 'Aguardando sync há 1 dia' : `Aguardando sync há ${days} dias`
  } else {
    const h = Math.floor(hours)
    label = h <= 0 ? 'Aguardando sync há pouco' : `Aguardando sync há ${h}h`
  }

  return { label, level }
}

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

/**
 * Decodes the JWT payload (no signature verification — used only for identity
 * comparison to detect cross-session localStorage bleed).
 */
export function getUserIdFromToken(): string | null {
  const token = getAuthToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1])) as Record<string, unknown>
    if (typeof payload.sub === 'string' && payload.sub) return payload.sub
    if (typeof payload.id === 'string' && payload.id) return payload.id
    if (typeof payload.email === 'string' && payload.email) return payload.email
    return null
  } catch {
    return null
  }
}

/**
 * Removes all unsynced variations belonging to a previous user.
 *
 * Evicts every item whose id starts with `local-` (pending sync) or `failed-`
 * (permanently rejected by the server) when the current user differs from the
 * owner who created them.  Both prefixes must be covered here because:
 *
 *   • `local-*` — saved offline; their name/notes live **inline** in the
 *     variation object (not in a separate queue), so evicting the item also
 *     discards any pending rename or notes edit.  If future code ever introduces
 *     a separate pending-rename or pending-notes queue in localStorage, that
 *     queue MUST also be cleared in this function to prevent cross-user bleed.
 *
 *   • `failed-*` — promoted from `local-*` after a 4xx rejection.  They are no
 *     longer in the retry queue but are still owned by the original user; without
 *     this guard they would flash to the next user who logs in on the same device.
 *
 * Call this before any sync operation so stale items are always evicted first.
 */
export function clearStaleLocalItems(): void {
  const userId = getUserIdFromToken()
  if (!userId) return

  const storedOwner = localStorage.getItem(PENDING_OWNER_KEY)
  if (storedOwner === userId) return

  // Different user (or first login on this device) — remove any local-* and
  // failed-* items left by the previous session before we attempt to sync.
  const current = readLocalVariations()
  const hasStale = current.some(v => v.id.startsWith('local-') || v.id.startsWith('failed-'))
  if (hasStale) {
    const cleaned = current.filter(
      v => !v.id.startsWith('local-') && !v.id.startsWith('failed-'),
    )
    persistVariations(cleaned)
  }

  // Stamp the new owner so subsequent syncs in this session are allowed.
  localStorage.setItem(PENDING_OWNER_KEY, userId)
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
//
// 4xx responses are treated as permanent failures: the item will never succeed
// regardless of retries, so onPermanentlyFailed is invoked instead of counting
// the item as a transient failedCount. 5xx / network errors remain transient.

let syncInFlight = false

/** Reset the in-flight guard — intended for test teardown only. */
export function resetSyncInFlight(): void {
  syncInFlight = false
}

export async function syncPendingVariations(
  onPromoted: (localId: string, serverVariation: SavedVariation) => void,
  inFlightIds?: ReadonlySet<string>,
  onPermanentlyFailed?: (localId: string) => void,
): Promise<{ failedCount: number; permanentlyFailedCount: number }> {
  if (syncInFlight) return { failedCount: 0, permanentlyFailedCount: 0 }

  const token = getAuthToken()
  if (!token) return { failedCount: 0, permanentlyFailedCount: 0 }

  // Drop any local-* items that belong to a previous user before syncing.
  clearStaleLocalItems()

  const current = readLocalVariations()
  const pending = current.filter(
    v => v.id.startsWith('local-') && !(inFlightIds?.has(v.id) ?? false),
  )
  if (pending.length === 0) return { failedCount: 0, permanentlyFailedCount: 0 }

  syncInFlight = true
  let failedCount = 0
  let permanentlyFailedCount = 0
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
          if (res.status >= 400 && res.status < 500) {
            // 4xx — client-side error, will never succeed; mark as permanently failed
            permanentlyFailedCount++
            onPermanentlyFailed?.(item.id)
          } else {
            // 5xx — transient server error; keep as retryable
            failedCount++
          }
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
  return { failedCount, permanentlyFailedCount }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSavedVariations() {
  const [variations, setVariations] = useState<SavedVariation[]>(() => {
    // Evict any local-* items belonging to a previous user before populating
    // initial state so stale offline saves never flash to the UI or get synced.
    clearStaleLocalItems()
    return readLocalVariations()
  })
  const [storageError, setStorageError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Track local-* IDs whose save POST is currently in-flight so that
  // syncPendingVariations can skip them and avoid posting the same item twice.
  const inFlightIds = useRef(new Set<string>())

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

  // Mark a local-* item as permanently failed by changing its id prefix to
  // failed-*. This removes it from the retry queue while keeping it visible so
  // the user is aware something went wrong.
  const markPermanentlyFailed = useCallback((localId: string) => {
    setVariations(prev => {
      const failedId = localId.replace(/^local-/, 'failed-')
      const next = prev.map(v => (v.id === localId ? { ...v, id: failedId } : v))
      persistVariations(next)
      return next
    })
  }, [])

  // Retry syncing any local-* items that were saved while the server was down.
  // Safe to call from an effect with an empty dependency array because it reads
  // localStorage directly instead of closing over the `variations` state value.
  // Returns a promise so callers can await the result if needed.
  const retryPendingSync = useCallback(async () => {
    const { failedCount } = await syncPendingVariations(
      promoteLocal,
      undefined,
      markPermanentlyFailed,
    )
    if (failedCount > 0) {
      setSyncError(
        failedCount === 1
          ? '1 variação offline não pôde ser sincronizada. Verifique sua conexão e tente novamente.'
          : `${failedCount} variações offline não puderam ser sincronizadas. Verifique sua conexão e tente novamente.`,
      )
    } else {
      setSyncError(null)
    }
  }, [promoteLocal, markPermanentlyFailed])

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
          // Migrate localStorage variations to server on first authenticated load.
          // Clear any local-* items from a previous session before migrating.
          clearStaleLocalItems()
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
          await syncPendingVariations(promoteLocal, undefined, markPermanentlyFailed)
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

      // Stamp the current user as the owner of pending items so a future login
      // by a different user triggers clearStaleLocalItems before any sync.
      const userId = getUserIdFromToken()
      if (userId) localStorage.setItem(PENDING_OWNER_KEY, userId)

      // Sync to server
      void (async () => {
        const token = getAuthToken()
        if (!token) return
        // Mark this item's POST as in-flight so syncPendingVariations skips it.
        inFlightIds.current.add(optimisticId)
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
            if (res.status >= 400 && res.status < 500) {
              // 4xx — permanent client-side error; remove from retry queue
              markPermanentlyFailed(optimisticId)
            }
            // 5xx — keep local-* id so the online listener can retry later
            return
          }
          const saved: ServerVariation = await res.json()
          // Replace optimistic item with server-assigned id
          promoteLocal(optimisticId, fromServer(saved))
          // Take the opportunity to push any other pending items now that the
          // server is reachable — exclude IDs still being synced by save() calls.
          void syncPendingVariations(promoteLocal, inFlightIds.current, markPermanentlyFailed)
        } catch {
          // Keep local copy; the online listener will retry
        } finally {
          inFlightIds.current.delete(optimisticId)
        }
      })()
    },
    [promoteLocal, markPermanentlyFailed],
  )

  const rename = useCallback((id: string, name: string) => {
    // Update in React state; the variations useEffect persists this inline in
    // the variation object (not in a separate queue).  For local-* items the
    // server call is skipped intentionally — the new name is included in the
    // POST body when syncPendingVariations eventually promotes the item.
    // IMPORTANT: if a separate pending-rename queue is ever introduced (e.g. to
    // retry renames after reconnection), clearStaleLocalItems MUST also clear
    // that queue to prevent cross-user bleed on shared devices.
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
    // Same invariant as rename: notes are stored inline in the variation object
    // so clearStaleLocalItems evicts them automatically with the parent item.
    // IMPORTANT: if a separate pending-notes queue is ever introduced, it MUST
    // also be cleared in clearStaleLocalItems to prevent cross-user bleed.
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

  // Only retryable offline items count toward the pending badge
  const pendingCount = variations.filter(v => v.id.startsWith('local-')).length

  // Permanently failed items (4xx rejection) — shown with a distinct indicator
  const permanentlyFailedCount = variations.filter(v => v.id.startsWith('failed-')).length

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
    permanentlyFailedCount,
    retryPendingSync,
  }
}
