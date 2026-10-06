[Reading 308 lines from start (total: 308 lines, 0 remaining)]

// ─── useArqProject ────────────────────────────────────────────────────────────
// Loads/saves the active workspace project to the API.
// Exposes: project, objects, materials + mutators that auto-sync to the server.

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProjectContext, ProjectObject, ProjectMaterial } from '../engines/aie/aie-types'

const BASE = '/api'

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

export interface ArqProjectMeta {
  id:              string
  titulo:          string
  clienteNome:     string | null
  clienteEmail?:   string | null
  clienteTelefone?:string | null
  leadId?:         string | null
  dealId?:         string | null
  status:          string | null
  tipoObra:        string | null
  areaM2:          string | null
  createdAt:       string
  updatedAt:       string
}

function normalizeClientValue(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function getClientScopeKey(project?: ArqProjectMeta | null): string | null {
  if (!project) return null
  if (project.leadId) return `lead:${project.leadId}`
  if (project.dealId) return `deal:${project.dealId}`

  const email = normalizeClientValue(project.clienteEmail)
  if (email) return `email:${email}`

  const phone = (project.clienteTelefone ?? '').replace(/\D/g, '')
  if (phone) return `phone:${phone}`

  const name = normalizeClientValue(project.clienteNome)
  return name ? `name:${name}` : null
}

function belongsToSameClient(a?: ArqProjectMeta | null, b?: ArqProjectMeta | null): boolean {
  const aKey = getClientScopeKey(a)
  const bKey = getClientScopeKey(b)
  return Boolean(aKey && bKey && aKey === bKey)
}

export interface ArqProjectState {
  loading:        boolean
  saving:         boolean
  error:          string | null
  projectId:      string | null
  projectMeta:    ArqProjectMeta | null
  objects:        ProjectObject[]
  materials:      ProjectMaterial[]

  // Project list
  projects:       ArqProjectMeta[]
  projectsLoading: boolean

  // Mutators
  createProject:  (titulo: string, tipoObra?: string) => Promise<string>
  selectProject:  (id: string) => Promise<void>
  saveObjects:    (objects: ProjectObject[]) => Promise<void>
  saveMaterials:  (materials: ProjectMaterial[]) => Promise<void>
  saveAieSnapshot:(ctx: ProjectContext, result: any) => Promise<void>
  getProjectContext: () => ProjectContext | null
}

export function useArqProject(): ArqProjectState {
  const [loading,         setLoading]        = useState(false)
  const [saving,          setSaving]         = useState(false)
  const [error,            setError]          = useState<string | null>(null)
  const [projectId,       setProjectId]      = useState<string | null>(null)
  const [projectMeta,     setProjectMeta]    = useState<ArqProjectMeta | null>(null)
  const [objects,         setObjects]        = useState<ProjectObject[]>([])
  const [materials,       setMaterials]      = useState<ProjectMaterial[]>([])
  const [projects,        setProjects]       = useState<ArqProjectMeta[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchProjects(clientProjectId?: string | null) {
    setProjectsLoading(true)
    setError(null)
    try {
      const query = clientProjectId ? `?clientProjectId=${encodeURIComponent(clientProjectId)}` : ''
      const res = await fetch(`${BASE}/arq/projects${query}`, { headers: authHeaders() })
      if (res.ok) {
        const data: ArqProjectMeta[] = await res.json()
        setProjects(data)
        return data
      }
      throw new Error('Não foi possível carregar os projetos.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os projetos.')
    }
    finally { setProjectsLoading(false) }
    return []
  }

  async function loadProject(id: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/arq/projects/${id}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Não foi possível carregar o projeto.')
      const data = await res.json()
      setProjectMeta(data.projeto as ArqProjectMeta)
      setProjectId(id)
      setObjects(
        (data.objects ?? []).map((o: any): ProjectObject => ({
          id:             o.objectClientId,
          name:           o.name,
          category:       o.category,
          material:       o.material ?? undefined,
          finish:         o.finish ?? undefined,
          color:          o.color ?? undefined,
          dimensions:     o.dimensions ?? undefined,
          position:       o.position ?? undefined,
          visualWeight:   o.visualWeight ?? undefined,
          designIntent:   o.designIntent ?? undefined,
          componentId:    o.componentId ?? undefined,
          manufacturerId: o.manufacturerId ?? undefined,
          locked:         o.locked ?? undefined,
        }))
      )
      setMaterials(
        (data.materials ?? []).map((m: any): ProjectMaterial => ({
          id:            m.materialClientId,
          name:          m.name,
          category:      m.category,
          manufacturer:  m.manufacturer ?? '',
          finish:        m.finish ?? '',
          gloss:         m.gloss ?? 0,
          palette:       m.palette ?? [],
          usedByObjects: m.usedByObjects ?? [],
        }))
      )
      localStorage.setItem('arq_last_project_id', id)
      window.dispatchEvent(new CustomEvent('arqdor:project-context', { detail: { projectId: id } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o projeto.')
    }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const stored = localStorage.getItem('arq_last_project_id')
    const requestedProjectId = new URLSearchParams(window.location.search).get('project_id')?.trim() || null
    fetchProjects(requestedProjectId ?? stored).then(list => {
      if (list.length === 0) return
      const target =
        requestedProjectId && list.find(p => p.id === requestedProjectId)
          ? requestedProjectId
          : stored && list.find(p => p.id === stored)
            ? stored
            : list[0].id
      loadProject(target)
    })
  }, [])

  async function createProject(titulo: string, tipoObra?: string): Promise<string> {
    const res = await fetch(`${BASE}/arq/projects`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ titulo, tipoObra }),
    })
    if (!res.ok) throw new Error('Erro ao criar projeto')
    const projeto = await res.json()
    const newProj: ArqProjectMeta = projeto
    setProjects(prev => [newProj, ...prev])
    await loadProject(newProj.id)
    return newProj.id
  }

  async function selectProject(id: string) {
    const target = projects.find(project => project.id === id)
    if (projectMeta && target && !belongsToSameClient(projectMeta, target)) {
      setError('Este projeto pertence a outro cliente. Troque o cliente antes de abrir o projeto.')
      return
    }
    await loadProject(id)
  }

  async function saveObjects(objs: ProjectObject[]) {
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`${BASE}/arq/projects/${projectId}/objects`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(objs.map(o => ({
          objectClientId:  o.id,
          name:            o.name,
          category:        o.category,
          material:        o.material,
          finish:          o.finish,
          color:           o.color,
          dimensions:      o.dimensions,
          position:        o.position,
          visualWeight:    o.visualWeight,
          designIntent:    o.designIntent,
          componentId:     o.componentId,
          manufacturerId:  o.manufacturerId,
          locked:          o.locked,
        }))),
      })
      if (!response.ok) throw new Error('Não foi possível salvar os objetos do projeto.')
      setObjects(objs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os objetos do projeto.')
    }
    finally { setSaving(false) }
  }

  async function saveMaterials(mats: ProjectMaterial[]) {
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`${BASE}/arq/projects/${projectId}/materials`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(mats.map(m => ({
          materialClientId: m.id,
          name:             m.name,
          category:         m.category,
          manufacturer:     m.manufacturer,
          finish:           m.finish,
          gloss:            m.gloss,
          palette:          m.palette,
          usedByObjects:    m.usedByObjects,
        }))),
      })
      if (!response.ok) throw new Error('Não foi possível salvar os materiais do projeto.')
      setMaterials(mats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os materiais do projeto.')
    }
    finally { setSaving(false) }
  }

  async function saveAieSnapshot(ctx: ProjectContext, result: any) {
    if (!projectId) return
    try {
      const response = await fetch(`${BASE}/arq/projects/${projectId}/aie-snapshots`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          scores: result.scores,
          fullResult: result,
          projectSnapshot: ctx,
        }),
      })
      if (!response.ok) throw new Error('Não foi possível salvar a análise inteligente do projeto.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a análise inteligente do projeto.')
    }
  }

  function getProjectContext(): ProjectContext | null {
    if (!projectMeta) return null
    return {
      id:       projectMeta.id,
      name:     projectMeta.titulo,
      objects,
      materials,
    }
  }

  const scopedProjects = projectMeta
    ? projects.filter(project => belongsToSameClient(projectMeta, project))
    : projects

  return {
    loading,
    saving,
    error,
    projectId,
    projectMeta,
    objects,
    materials,
    projects: scopedProjects,
    projectsLoading,
    createProject,
    selectProject,
    saveObjects,
    saveMaterials,
    saveAieSnapshot,
    getProjectContext,
  }
}
