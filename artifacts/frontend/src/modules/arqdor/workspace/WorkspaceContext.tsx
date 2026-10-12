import { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { storeEncryptedArqdorDraft } from '../../../lib/arqdorEncryptedVault'
import type { Project } from '../../../pages/arch/arqdor/domain/arqdor-domain-types'
import type { ArchProject } from '../../../pages/arch/arqdor-types'
import type { ProjectContext, ProjectObject, ProjectMaterial } from '../engines/aie/aie-types'

// ─── WorkspaceContext ─────────────────────────────────────────────────────────
// Holds the live ProjectContext for the currently open project.
// All modules (AIEDashboard, sidebar badge, etc.) read from here.
// Persists the context to the API so architects don't lose work on refresh.

const BASE = '/api'
const STORAGE_KEY = 'arqdor_workspace_project_id'
const SAVE_DEBOUNCE_MS = 2000
// Experimental ACL flow is disabled by default and must be enabled with the backend flag.
const USE_PROJECT_ACL = import.meta.env.VITE_MULTI08_PROJECT_ACL === 'true'
// Unencrypted IndexedDB prototype: use only in explicitly approved, non-sensitive test projects.
const USE_LOCAL_DRAFTS = USE_PROJECT_ACL && import.meta.env.VITE_MULTI09_LOCAL_DRAFTS === 'true'

export const EMPTY_PROJECT_CONTEXT: ProjectContext = {
  id: '',
  name: '',
  objects: [],
  materials: [],
}

function getToken(): string | null {
  return localStorage.getItem('vendorai_token')
}

function authHeaders() {
  const tok = getToken()
  return {
    'Content-Type': 'application/json',
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  }
}

export interface WorkspaceContextValue {
  projectCtx:     ProjectContext
  isRealProject:  boolean
  isInitializing: boolean
  setProjectCtx:  (ctx: ProjectContext) => void
  saving:         boolean
  loadError:      string | null
  saveError:      string | null
  unlockDraftSaving: (phrase: string) => void
  applyRecoveredDraft: (ctx: ProjectContext) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const identityRef = useRef<{ tenantId: string; userId: string } | null>(null)
  identityRef.current = user?.tenantId && user?.id ? { tenantId: user.tenantId, userId: user.id } : null
  const [projectCtx, setProjectCtxState] = useState<ProjectContext>(EMPTY_PROJECT_CONTEXT)
  const [isRealProject, setIsRealProject] = useState<boolean>(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialLoadDone = useRef(false)
  const remoteRevisionRef = useRef<string | null>(null)
  const saveInFlightRef = useRef(false)
  const latestPendingRef = useRef<ProjectContext | null>(null)
  const activeProjectRef = useRef<string | null>(null)
  const writeBlockedRef = useRef(false)
  const draftPhraseRef = useRef<string | null>(null)
  const authorizedDraftScopeRef = useRef<{ tenantId: string; userId: string; contextId: string; projectId: string } | null>(null)

  // ── Load on mount ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true

    const tok = getToken()
    if (!tok) return

    const storedId = localStorage.getItem(STORAGE_KEY)
    if (!storedId) return  // Nenhum projeto salvo — exibe tela de boas-vindas

    activeProjectRef.current = storedId
    setIsInitializing(true)
    fetch(`${BASE}/arqdor/projects/${encodeURIComponent(storedId)}${USE_PROJECT_ACL ? '/snapshot' : ''}`, { headers: authHeaders(), cache: 'no-store' })
      .then(async res => {
        if (res.status === 404 && !USE_PROJECT_ACL) {
          // Legacy-only behavior; an ACL 404 may indicate revoked membership.
          localStorage.removeItem(STORAGE_KEY)
          setLoadError(null) // show empty/welcome state, not an error
          return
        }
        if (!res.ok) {
          setLoadError('Não foi possível carregar o projeto salvo. Tente recarregar.')
          return
        }
        let ctx: ProjectContext
        try {
          const data = await res.json()
          if (USE_PROJECT_ACL) {
            if (!data || data.id !== storedId || !data.contextBlob || typeof data.revision !== 'string') {
              setLoadError('Resposta de projeto inválida. Salvamento bloqueado.')
              return
            }
            if (activeProjectRef.current !== storedId) return
            remoteRevisionRef.current = data.revision
            const identity = identityRef.current
            authorizedDraftScopeRef.current = identity ? {
              ...identity, contextId: 'arqdor-workspace', projectId: storedId,
            } : null
            ctx = data.contextBlob as ProjectContext
          } else {
            ctx = data as ProjectContext
          }
        } catch {
          // Non-JSON response (e.g. proxy HTML error page) — ignore silently
          return
        }
        if (ctx && typeof ctx === 'object' && ctx.id) {
          setProjectCtxState(ctx)
          setIsRealProject(true)
          localStorage.setItem(STORAGE_KEY, ctx.id)
        }
      })
      .catch(() => {
        setLoadError('Não foi possível carregar o projeto salvo.')
      })
      .finally(() => {
        setIsInitializing(false)
      })
  }, [])

  // ── Debounced, single-flight save (MULTI-08.4) ────────────────────────────
  // Keep the newest pending context while a request is in flight; never issue
  // overlapping writes using the same revision.
  const flushPending = useCallback(async () => {
    if (saveInFlightRef.current || writeBlockedRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    try {
      while (latestPendingRef.current && !writeBlockedRef.current) {
        const ctx = latestPendingRef.current
        latestPendingRef.current = null
        if (activeProjectRef.current !== ctx.id || !getToken()) {
          writeBlockedRef.current = true
          setSaveError('Sessão ou projeto alterado. Salvamento interrompido; preserve suas alterações.')
          break
        }
        const expectedRevision = remoteRevisionRef.current
        if (USE_LOCAL_DRAFTS) {
          const scope = authorizedDraftScopeRef.current
          const identity = identityRef.current
          const phrase = draftPhraseRef.current
          if (!scope || !identity || !phrase || scope.projectId !== ctx.id ||
              scope.userId !== identity.userId || scope.tenantId !== identity.tenantId || !expectedRevision) {
            writeBlockedRef.current = true
            setSaveError('Cofre bloqueado ou autorização inválida. Exporte o trabalho antes de sair.')
            break
          }
          try {
            await storeEncryptedArqdorDraft({
              scope, savedAt: new Date().toISOString(), content: ctx,
              change: { operationId: crypto.randomUUID(), projectId: ctx.id,
                baseRevision: expectedRevision, kind: 'geometry' },
            }, scope, { projectId: ctx.id, contextId: scope.contextId,
              revision: expectedRevision, capabilities: ['studio_2d'] }, phrase)
          } catch {
            writeBlockedRef.current = true
            setSaveError('Não foi possível confirmar a gravação criptografada. Exporte o projeto.')
            break
          }
        }
        if (USE_PROJECT_ACL && !expectedRevision) {
          writeBlockedRef.current = true
          setSaveError('Sem revisão autorizada para este projeto. Exporte suas alterações.')
          break
        }
        try {
          const response = await fetch(`${BASE}/arqdor/projects/${encodeURIComponent(ctx.id)}${USE_PROJECT_ACL ? '/member-conditional' : ''}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(USE_PROJECT_ACL ? { expectedRevision, contextBlob: ctx } : ctx),
          })
          if (response.status === 409 || response.status === 401 || response.status === 403) {
            writeBlockedRef.current = true
            setSaveError('Conflito de versão, sessão expirada ou acesso revogado. Exporte as alterações antes de sair.')
            break
          }
          if (!response.ok) throw new Error(`Save failed: HTTP ${response.status}`)
          if (USE_PROJECT_ACL) {
            const saved = await response.json() as { id?: string; revision?: string }
            if (saved.id !== ctx.id || typeof saved.revision !== 'string') throw new Error('Invalid acknowledgment')
            if (activeProjectRef.current !== ctx.id) {
              writeBlockedRef.current = true
              setSaveError('Projeto alterado durante o envio. Verifique a gravação antes de continuar.')
              break
            }
            remoteRevisionRef.current = saved.revision
          }
          if (!latestPendingRef.current) setSaveError(null)
        } catch {
          // Delivery may have reached the server: do NOT retry blindly.
          writeBlockedRef.current = true
          setSaveError('Não foi possível confirmar a gravação. Preserve ou exporte o projeto antes de sair.')
          break
        }
      }
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }, [])

  const persistCtx = useCallback((ctx: ProjectContext) => {
    if (!ctx.id?.trim() || !getToken()) {
      setSaveError('Projeto ou sessão inválidos. As alterações não foram enviadas.')
      return
    }
    if (activeProjectRef.current && activeProjectRef.current !== ctx.id) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      latestPendingRef.current = null
      remoteRevisionRef.current = null
      authorizedDraftScopeRef.current = null
      draftPhraseRef.current = null
      writeBlockedRef.current = USE_PROJECT_ACL
      setSaveError('Projeto alterado. Reabra-o para obter uma revisão autorizada antes de salvar.')
    }
    activeProjectRef.current = ctx.id
    if (writeBlockedRef.current) return
    latestPendingRef.current = ctx
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { void flushPending() }, SAVE_DEBOUNCE_MS)
  }, [flushPending])

  // ── Setter exposed to modules ───────────────────────────────────────────────
  // When the incoming context has the same ID as the current one (e.g. a partial
  // sync from arqState that only carries objects/materials), we MERGE rather than
  // replace, so fields like dna/style/renderGoal that live only in the persisted
  // blob are not clobbered. For a different project ID we always replace in full.
  const setProjectCtx = useCallback((incoming: ProjectContext) => {
    setProjectCtxState(prev => {
      const merged: ProjectContext =
        prev.id === incoming.id ? { ...prev, ...incoming } : incoming
      persistCtx(merged)
      return merged
    })
    setIsRealProject(true)
  }, [persistCtx])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  const unlockDraftSaving = useCallback((phrase: string) => {
    if (phrase.length < 12) return
    draftPhraseRef.current = phrase
    if (USE_LOCAL_DRAFTS && authorizedDraftScopeRef.current) writeBlockedRef.current = false
  }, [])
  const applyRecoveredDraft = useCallback((ctx: ProjectContext) => {
    if (!USE_LOCAL_DRAFTS || !ctx.id || activeProjectRef.current !== ctx.id ||
        !authorizedDraftScopeRef.current || saveInFlightRef.current) return
    // Local-only preview. A subsequent save requires the vault to be unlocked.
    setProjectCtxState(ctx)
    persistCtx(ctx)
  }, [persistCtx])
  const value = useMemo<WorkspaceContextValue>(
    () => ({ projectCtx, isRealProject, isInitializing, setProjectCtx, saving, loadError, saveError, unlockDraftSaving, applyRecoveredDraft }),
    [projectCtx, isRealProject, isInitializing, setProjectCtx, saving, loadError, saveError, unlockDraftSaving, applyRecoveredDraft],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaceProject(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaceProject must be used inside WorkspaceProvider')
  return ctx
}

// Legacy alias to avoid breaking existing imports if any
export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaceContext must be used inside WorkspaceProvider')
  return ctx
}

// ─── Adapter: domain Project → ProjectContext (AIE) ───────────────────────────
// Used when the workspace is initialized from the persisted domain project.

function parseLightingType(lightingMood: string): string {
  const m = lightingMood.toLowerCase()
  if (m.includes('natural')) return 'NATURAL'
  if (m.includes('artificial') || m.includes('led') || m.includes('track')) return 'ARTIFICIAL'
  if (m.includes('indirect') || m.includes('accent') || m.includes('embutid')) return 'INDIRECT'
  return 'MIXED'
}

export function adaptProjectToContext(project: Project): ProjectContext {
  const allObjects = project.environments.flatMap(env => env.architecturalObjects)

  const objects: ProjectObject[] = allObjects.map(obj => ({
    id:           obj.id,
    name:         obj.name,
    category:     obj.category,
    material:     obj.material?.name ?? undefined,
    finish:       obj.material?.finish ?? obj.finish ?? undefined,
    color:        obj.material?.color ?? obj.color ?? undefined,
    visualWeight: obj.confidence,
    designIntent: obj.description ? [obj.description] : undefined,
    componentId:  obj.componentId,
  }))

  const seenMaterials = new Set<string>()
  const materials: ProjectMaterial[] = []
  allObjects.forEach(obj => {
    const matName = obj.material?.name
    if (!matName || seenMaterials.has(matName)) return
    seenMaterials.add(matName)
    const usedBy = allObjects.filter(o => o.material?.name === matName).map(o => o.id)
    materials.push({
      id:            `mat-${matName.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`,
      name:          matName,
      category:      obj.category,
      manufacturer:  obj.material?.manufacturer ?? '',
      finish:        obj.material?.finish ?? obj.finish ?? '',
      gloss:         obj.material?.glossLevel ?? 20,
      palette:       obj.material?.color ? [obj.material.color] : [],
      usedByObjects: usedBy,
    })
  })

  const { dna, renderConfig } = project
  return {
    id:           project.id,
    name:         project.name,
    objects,
    materials,
    renderGoal:   dna.renderObjective || undefined,
    cameraAngle:  renderConfig.lens   || undefined,
    lightingType: parseLightingType(renderConfig.lightingMood),
    dna:          [dna.architecturalStyle, dna.designLanguage, dna.atmosphere].filter(Boolean).join(', ') || undefined,
    style: {
      name:         dna.architecturalStyle,
      designIntent: [dna.designLanguage, dna.atmosphere].filter(Boolean),
      palette:      dna.colorPalette,
      restrictions: [],
    },
  }
}

// ─── Adapter: ArchProject (page-level state) → ProjectContext (AIE) ───────────
// Used when ArqdorPage updates its internal project state. ArchProject uses
// Portuguese field names (nome, objetos, dna.estiloArquitetonico, etc.).

export function adaptArchProjectToContext(project: ArchProject): ProjectContext {
  const objects: ProjectObject[] = project.objetos.map(obj => ({
    id:           obj.id,
    name:         obj.nome,
    category:     obj.categoria,
    material:     obj.material?.nome || undefined,
    finish:       obj.material?.acabamento || undefined,
    color:        obj.material?.cor || undefined,
    visualWeight: obj.confianca,
    designIntent: obj.descricao ? [obj.descricao] : undefined,
  }))

  const seenMaterials = new Set<string>()
  const materials: ProjectMaterial[] = []
  project.objetos.forEach(obj => {
    const matName = obj.material?.nome
    if (!matName || seenMaterials.has(matName)) return
    seenMaterials.add(matName)
    const usedBy = project.objetos.filter(o => o.material?.nome === matName).map(o => o.id)
    materials.push({
      id:            `mat-${matName.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`,
      name:          matName,
      category:      obj.categoria,
      manufacturer:  obj.material?.fabricante ?? '',
      finish:        obj.material?.acabamento ?? '',
      gloss:         20,
      palette:       obj.material?.cor ? [obj.material.cor] : [],
      usedByObjects: usedBy,
    })
  })

  const { dna } = project
  return {
    id:        project.id,
    name:      project.nome,
    objects,
    materials,
    renderGoal: dna.objetivoRender || undefined,
    dna:        [dna.estiloArquitetonico, dna.linguagem, dna.atmosfera].filter(Boolean).join(', ') || undefined,
    style: {
      name:         dna.estiloArquitetonico,
      designIntent: [dna.linguagem, dna.atmosfera].filter(Boolean),
      palette:      dna.paletaCromatica,
      restrictions: [],
    },
  }
}
