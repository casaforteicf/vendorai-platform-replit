// ─── WorkspaceContext ──────────────────────────────────────────────────────────
// Bridge between the arqdor.ai workspace and the Vendor.ai platform.
// All arqdor modules consume this context — never import platform services directly.

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type WorkspaceEnvironment = 'PRODUCTION' | 'STAGING' | 'DEMO'
export type WorkspacePermission  =
  | 'PROJECT_VIEW' | 'PROJECT_EDIT' | 'PROJECT_RENDER'
  | 'MATERIAL_SELECT' | 'LIBRARY_ACCESS' | 'MARKETPLACE_ACCESS'
  | 'CRM_LINK' | 'TASK_CREATE' | 'ANALYTICS_VIEW' | 'AGENT_INVOKE'
  | 'WORKFLOW_TRIGGER' | 'KNOWLEDGE_READ' | 'FILES_UPLOAD'

export interface ActiveProjectSummary {
  id:        string
  name:      string
  tenantId:  string
  crmLeadId?:  string
  crmDealId?:  string
  status:    'DRAFT' | 'IN_PROGRESS' | 'REVIEW' | 'APPROVED' | 'ARCHIVED'
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

// ─── Defaults ──────────────────────────────────────────────────────────────────

const ALL_PERMISSIONS: WorkspacePermission[] = [
  'PROJECT_VIEW','PROJECT_EDIT','PROJECT_RENDER',
  'MATERIAL_SELECT','LIBRARY_ACCESS','MARKETPLACE_ACCESS',
  'CRM_LINK','TASK_CREATE','ANALYTICS_VIEW','AGENT_INVOKE',
  'WORKFLOW_TRIGGER','KNOWLEDGE_READ','FILES_UPLOAD',
]

const MOCK_ACTIVE_PROJECT: ActiveProjectSummary = {
  id:         'proj-alpha-001',
  name:       'Apartamento Alpha — Cozinha + Sala',
  tenantId:   'tenant-arq-001',
  crmLeadId:  'lead-001',
  crmDealId:  'deal-001',
  status:     'IN_PROGRESS',
}

const MOCK_ACTIVE_AGENT: ActiveAgentSpec = {
  id:       'agent-arq-001',
  name:     'Arquiteto IA',
  role:     'Copilot de projeto e renderização',
  vertical: 'ARCH',
  avatar:   '🏛️',
}

const MOCK_HUBS: HubConnectionStatus = {
  crm:           true,
  knowledge:     true,
  agents:        true,
  workflows:     true,
  marketplace:   true,
  analytics:     true,
  files:         true,
  notifications: true,
  tasks:         true,
  billing:       false,   // not yet wired for arqdor
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaceId:       'ws-arqdor-001',
    tenantId:          'tenant-arq-001',
    userId:            'user-arch-001',
    teamId:            'team-arch-001',
    tenantName:        'Estúdio Alpha Arquitetura',
    permissions:       ALL_PERMISSIONS,
    hasPermission:     (p: WorkspacePermission) => ALL_PERMISSIONS.includes(p),
    activeProject:     MOCK_ACTIVE_PROJECT,
    activeEnvironment: 'DEMO',
    activeAgent:       MOCK_ACTIVE_AGENT,
    hubs:              MOCK_HUBS,
  }), [])

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
