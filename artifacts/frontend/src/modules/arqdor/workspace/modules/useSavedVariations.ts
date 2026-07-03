import { useState, useEffect, useCallback } from 'react'
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

// ─── Local-storage helpers ────────────────────────────────────────────────────

export function persistVariations(list: SavedVariation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // quota exceeded — silently skip
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSavedVariations() {
  const [variations, setVariations] = useState<SavedVariation[]>(readLocalVariations)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const clearStorageError = useCallback(() => setStorageError(null), [])

  const importVariations = useCallback((incoming: SavedVariation[]) => {
    setVariations(prev => {
      const existingIds = new Set(prev.map(v => v.id))
      const novel = incoming.filter(v => !existingIds.has(v.id))
      if (novel.length === 0) return prev
      const next = [...novel, ...prev]
      persistVariations(next)
      return next
    })
  }, [])

  // Load from server on mount (if authenticated)
  useEffect(() => {
    void (async () => {
      const token = getAuthToken()
      if (!token) return // not logged in — stay on localStorage

      setSyncing(true)
      try {
        const res = await apiFetch('')
        if (!res.ok) return
        const serverData: ServerVariation[] = await res.json()
        const serverVariations = serverData.map(fromServer)

        if (serverVariations.length === 0) {
          // Migrate localStorage variations to server on first authenticated load
          const local = readLocalVariations()
          const alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === '1'
          if (local.length > 0 && !alreadyMigrated) {
            const payload = local.map(v => ({
              name: v.name,
              translator: v.translator,
              detail: v.detail,
              prompt: v.prompt,
              negativePrompt: v.negativePrompt,
              estimatedTokens: v.estimatedTokens,
              notes: v.notes,
              savedAt: new Date(v.savedAt).toISOString(),
            }))
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
          }
        } else {
          // Server has data — use it as source of truth
          localStorage.setItem(MIGRATED_KEY, '1')
          setVariations(serverVariations)
          persistVariations(serverVariations)
        }
      } catch {
        // Network failure — keep local state
      } finally {
        setSyncing(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setVariations(prev => {
        const next = [item, ...prev]
        persistVariations(next)
        return next
      })

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
          setVariations(prev => {
            const next = prev.map(existing =>
              existing.id === optimisticId ? fromServer(saved) : existing,
            )
            persistVariations(next)
            return next
          })
        } catch {
          // Keep local copy
        }
      })()
    },
    [],
  )

  const rename = useCallback((id: string, name: string) => {
    setVariations(prev => {
      const next = prev.map((v): SavedVariation => (v.id === id ? { ...v, name } : v))
      persistVariations(next)
      return next
    })
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
    setVariations(prev => {
      const next = prev.filter(v => v.id !== id)
      persistVariations(next)
      return next
    })
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
    setVariations(prev => {
      const next = prev.map((v): SavedVariation => (v.id === id ? { ...v, notes } : v))
      persistVariations(next)
      return next
    })
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

  return {
    variations,
    save,
    rename,
    remove,
    updateNotes,
    storageError,
    clearStorageError,
    syncing,
    importVariations,
  }
}
