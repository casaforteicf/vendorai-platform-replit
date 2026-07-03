// ─── WorkspaceContext — P0-003 ─────────────────────────────────────────────────
// Bridge between the arqdor.ai workspace and the Vendor.ai platform.
// All arqdor modules consume this context — never import platform services directly.
// Uses real auth data from Vendor.ai (useAuth) — no hardcoded IDs.

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../../../../contexts/AuthContext'

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

// ─── Context ──────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const value = useMemo<WorkspaceContextValue>(() => {
    const userId   = user?.id        ?? ''
    const tenantId = user?.tenantId  ?? ''
    const perms    = permissionsForRole(user?.platformRole, user?.role)
    const isDemoEmail = user?.email?.includes('demo@') ?? false

    return {
      workspaceId:       `ws-${tenantId || 'arqdor'}`,
      tenantId,
      userId,
      teamId:            `team-${tenantId || 'arqdor'}`,
      tenantName:        user?.name ?? 'Workspace',
      permissions:       perms,
      hasPermission:     (p: WorkspacePermission) => perms.includes(p),
      activeProject:     null,
      activeEnvironment: isDemoEmail ? 'DEMO' : 'PRODUCTION',
      activeAgent:       ARCH_AGENT,
      hubs:              HUBS_CONNECTED,
    }
  }, [user])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
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
