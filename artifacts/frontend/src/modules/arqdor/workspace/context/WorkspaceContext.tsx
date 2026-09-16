// ─── WorkspaceContext — P0-003 ─────────────────────────────────────────────────
// Bridge between the arqdor.ai workspace and the Vendor.ai platform.
// All arqdor modules consume this context — never import platform services directly.
// Uses real auth data from Vendor.ai (useAuth) — no hardcoded IDs.
//
// Two contexts are used intentionally:
//   WorkspaceContext      — full read-only value; updates when projectContext changes
//   SetProjectContextCtx  — stable setter only; never updates, no cascade rerenders

import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../../../../contexts/AuthContext'
import type { ProjectContext } from '../../engines/aie/aie-types'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type WorkspaceEnvironment = 'PRODUCTION' | 'STAGING' | 'DEMO'
export type WorkspacePermission  =
  | 'PROJECT_VIEW' | 'PROJECT_EDIT' | 'PROJECT_RENDER'
  | 'MATERIAL_SELECT' | 'LIBRARY_ACCESS' | 'MARKETPLACE_ACCESS'
  | 'CRM_LINK' | 'TASK_CREATE' | 'ANALYTICS_VIEW' | 'AGENT_INVOKE'
  | 'WORKFLOW_TRIGGER' | 'KNOWLEDGE_READ' | 'FILES_UPLOAD'

export interface ActiveProjectSummary {
  id:          string
  name:        string
  tenantId:    string
  crmLeadId?:  string
  crmDealId?:  string
  status:      'DRAFT' | 'IN_PROGRESS' | 'REVIEW' | 'APPROVED' | 'ARCHIVED'
}

export interface ActiveAgentSpec {
  id:       string
  name:     string
  role:     string
  vertical: 'ARCH'
  avatar:   string
}

export interface HubConnectionStatus {
  crm:           boolean
  knowledge:     boolean
  agents:        boolean
  workflows:     boolean
  marketplace:   boolean
  analytics:     boolean
  files:         boolean
  notifications: boolean
  tasks:         boolean
  billing:       boolean
}

export interface WorkspaceContextValue {
  // Identity
  workspaceId:       string
  tenantId:          string
  userId:            string
  teamId:            string
  tenantName:        string
  // Permissions
  permissions:       WorkspacePermission[]
  hasPermission:     (p: WorkspacePermission) => boolean
  // Active state
  activeProject:     ActiveProjectSummary | null
  activeEnvironment: WorkspaceEnvironment
  activeAgent:       ActiveAgentSpec | null
  // Full AIE project context — null when no project is loaded yet
  projectContext:    ProjectContext | null
  // Hub connections
  hubs:              HubConnectionStatus
}

// ─── Permission mapping ────────────────────────────────────────────────────────

const ALL_PERMISSIONS: WorkspacePermission[] = [
  'PROJECT_VIEW','PROJECT_EDIT','PROJECT_RENDER',
  'MATERIAL_SELECT','LIBRARY_ACCESS','MARKETPLACE_ACCESS',
  'CRM_LINK','TASK_CREATE','ANALYTICS_VIEW','AGENT_INVOKE',
  'WORKFLOW_TRIGGER','KNOWLEDGE_READ','FILES_UPLOAD',
]

const READ_PERMISSIONS: WorkspacePermission[] = [
  'PROJECT_VIEW','MATERIAL_SELECT','LIBRARY_ACCESS',
  'MARKETPLACE_ACCESS','ANALYTICS_VIEW','KNOWLEDGE_READ',
]

function permissionsForRole(
  platformRole: string | undefined,
  role: string | undefined,
): WorkspacePermission[] {
  if (platformRole === 'super_admin' || platformRole === 'tenant_admin' || role === 'admin') {
    return ALL_PERMISSIONS
  }
  return READ_PERMISSIONS
}

// ─── Arch agent spec ───────────────────────────────────────────────────────────

const ARCH_AGENT: ActiveAgentSpec = {
  id:       'agent-arq-copilot',
  name:     'Arquiteto IA',
  role:     'Copilot de projeto e renderização',
  vertical: 'ARCH',
  avatar:   '🏛️',
}

const HUBS_CONNECTED: HubConnectionStatus = {
  crm:           true,
  knowledge:     true,
  agents:        true,
  workflows:     true,
  marketplace:   true,
  analytics:     true,
  files:         true,
  notifications: true,
  tasks:         true,
  billing:       false,
}

// ─── Contexts ─────────────────────────────────────────────────────────────────

// Read context — changes when projectContext changes
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

// Setter context — stable forever; isolated so it never triggers cascade rerenders
type SetProjectContextFn = (ctx: ProjectContext | null) => void
const SetProjectContextCtx = createContext<SetProjectContextFn | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  // Starts null — ArqdorPage pushes the live project in via setProjectContext
  const [projectContext, setProjectContextState] = useState<ProjectContext | null>(null)

  // Stable setter — created once, never changes reference; safe to use in effect deps
  const setProjectContext = useCallback((ctx: ProjectContext | null) => {
    setProjectContextState(ctx)
  }, [])

  const value = useMemo<WorkspaceContextValue>(() => {
    const userId   = user?.id        ?? ''
    const tenantId = user?.tenantId  ?? ''
    const perms    = permissionsForRole(user?.platformRole, user?.role)
    const isDemoEmail = user?.email?.includes('demo@') ?? false

    const activeProject: ActiveProjectSummary | null = projectContext
      ? {
          id: projectContext.id,
          name: projectContext.name,
          tenantId,
          status: 'IN_PROGRESS',
        }
      : null

    return {
      workspaceId:       `ws-${tenantId || 'arqdor'}`,
      tenantId,
      userId,
      teamId:            `team-${tenantId || 'arqdor'}`,
      tenantName:        user?.name ?? 'Workspace',
      permissions:       perms,
      hasPermission:     (p: WorkspacePermission) => perms.includes(p),
      activeProject,
      activeEnvironment: isDemoEmail ? 'DEMO' : 'PRODUCTION',
      activeAgent:       ARCH_AGENT,
      projectContext,
      hubs:              HUBS_CONNECTED,
    }
  }, [user, projectContext])

  return (
    <SetProjectContextCtx.Provider value={setProjectContext}>
      <WorkspaceContext.Provider value={value}>
        {children}
      </WorkspaceContext.Provider>
    </SetProjectContextCtx.Provider>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

// Stable setter hook — safe to use in useEffect deps without causing cascade loops.
// Returns null when used outside WorkspaceProvider (e.g. standalone ArqdorPage).
export function useSetProjectContext(): SetProjectContextFn | null {
  return useContext(SetProjectContextCtx)
}

// ─── Convenience hooks ────────────────────────────────────────────────────────

export function useActiveProject() {
  return useWorkspace().activeProject
}

export function useActiveAgent() {
  return useWorkspace().activeAgent
}

export function useHubs() {
  return useWorkspace().hubs
}

export function useCan(permission: WorkspacePermission): boolean {
  return useWorkspace().hasPermission(permission)
}
