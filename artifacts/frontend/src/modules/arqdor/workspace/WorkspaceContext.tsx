import { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
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
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
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

  // ── Load on mount ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true

    const tok = getToken()
    if (!tok) return

    const storedId = localStorage.getItem(STORAGE_KEY)
    if (!storedId) return  // Nenhum projeto salvo — exibe tela de boas-vindas

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
            remoteRevisionRef.current = data.revision
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

  // ── Debounced save ──────────────────────────────────────────────────────────
  const persistCtx = useCallback((ctx: ProjectContext) => {
    const tok = getToken()
    if (!tok || !ctx.id?.trim()) {
      setSaveError('Projeto ou sessão inválidos. As alterações não foram enviadas.')
      return
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (USE_PROJECT_ACL && (!remoteRevisionRef.current || saveInFlightRef.current)) {
        setSaveError('Salvamento protegido indisponível ou ocupado. Preserve seu projeto antes de sair.')
        return
      }
      saveInFlightRef.current = true
      setSaving(true)
      try {
        const response = await fetch(`${BASE}/arqdor/projects/${encodeURIComponent(ctx.id)}${USE_PROJECT_ACL ? '/member-conditional' : ''}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(USE_PROJECT_ACL ? { expectedRevision: remoteRevisionRef.current, contextBlob: ctx } : ctx),
        })
        if (response.status === 409) {
          setSaveError('Conflito com outra sessão ou acesso revogado. Exporte seu projeto antes de sair.')
          return
        }
        if (!response.ok) throw new Error(`Save failed: HTTP ${response.status}`)
        if (USE_PROJECT_ACL) {
          const saved = await response.json() as { id?: string; revision?: string }
          if (saved.id !== ctx.id || typeof saved.revision !== 'string') throw new Error('Invalid save acknowledgment')
          remoteRevisionRef.current = saved.revision
        }
        setSaveError(null)
      } catch {
        // Do not pretend the server saved a draft when the network or API rejected it.
        setSaveError('Não foi possível salvar as alterações no servidor. Copie ou exporte seu trabalho antes de sair.')
      } finally {
        saveInFlightRef.current = false
        setSaving(false)
      }
    }, SAVE_DEBOUNCE_MS)
  }, [])

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

  const value = useMemo<WorkspaceContextValue>(
    () => ({ projectCtx, isRealProject, isInitializing, setProjectCtx, saving, loadError, saveError }),
    [projectCtx, isRealProject, isInitializing, setProjectCtx, saving, loadError, saveError],
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
