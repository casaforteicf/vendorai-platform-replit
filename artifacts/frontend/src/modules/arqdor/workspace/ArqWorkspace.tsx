// ─── ArqWorkspace — PROJECT PHOENIX: UX Redesign ─────────────────────────────
// Antes: dashboard de IA complexo, escuro, muitos menus.
// Depois: software premium para arquitetos. Figma + Notion + Linear.
//
// Princípios aplicados:
// • Esconder complexidade — usuário pensa em objetivos, não em módulos
// • Espaço em branco — menos elementos, mais impacto
// • Roxo como destaque único — nunca como fundo dominante
// • Fluxo linear — Criar → Inspirar → Renderizar → Melhorar → Especificar → Apresentar → Entregar
// • ✨ Gerar Render sempre visível — CTA principal nunca some
// • Linguagem humana — sem termos técnicos no UI

import { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react'
import { createContext, useContext, useMemo } from 'react'
import { ArqCopilot }            from '../copilot/ui/ArqCopilot'
import { WorkspaceProvider, useWorkspaceProject } from './WorkspaceContext'
import { useArqProject, type ArqProjectState } from '../hooks/useArqProject'
import { RenderProgressModal } from './project-experience/ProjectHomePhoenix'
import { computeNextAction }     from './project-experience/ProjectHome'
import { ArqCommandPalette }     from './ArqCommandPalette'
import { runAIE }                from '../engines/aie/aie-engine'
import { PHX, T }                from '../shared/arqdor-theme'
import type { ProjectContext }   from '../engines/aie/aie-types'
import { ArqdorThemeProvider } from '../theme/ArqdorThemeProvider'
import { ArqdorThemeToggle } from '../theme/ArqdorThemeToggle'

const IntegrationModule = lazy(() => import('./modules/IntegrationModule').then((m) => ({ default: m.IntegrationModule })))
const EcosystemModule = lazy(() => import('./modules/EcosystemModule').then((m) => ({ default: m.EcosystemModule })))
const KnowledgeModule = lazy(() => import('./modules/KnowledgeModule').then((m) => ({ default: m.KnowledgeModule })))
const OfficeModule = lazy(() => import('./modules/OfficeModule').then((m) => ({ default: m.OfficeModule })))
const LibraryModule = lazy(() => import('./modules/LibraryModule').then((m) => ({ default: m.LibraryModule })))
const PromptPlaygroundModule = lazy(() => import('./modules/PromptPlaygroundModule').then((m) => ({ default: m.PromptPlaygroundModule })))
const AIReviewModule = lazy(() => import('./modules/AIReviewModule').then((m) => ({ default: m.AIReviewModule })))
const AICorrectionsModule = lazy(() => import('./modules/AICorrectionsModule').then((m) => ({ default: m.AICorrectionsModule })))
const AIMemoryModule = lazy(() => import('./modules/AIMemoryModule').then((m) => ({ default: m.AIMemoryModule })))
const SettingsModule = lazy(() => import('./modules/SettingsModule').then((m) => ({ default: m.SettingsModule })))
const ArqHubView = lazy(() => import('../arqhub/ArqHubView').then((m) => ({ default: m.ArqHubView })))
const AIEnterpriseCore = lazy(() => import('./ai-enterprise/AIEnterpriseCore'))
const ProjectHomeV2 = lazy(() => import('./project-experience/ProjectHomeV2').then((m) => ({ default: m.ProjectHomeV2 })))
const SmartProjectModule = lazy(() => import('./modules/SmartProjectModule').then((m) => ({ default: m.SmartProjectModule })))
const SmartSpecModule = lazy(() => import('./modules/SmartSpecModule').then((m) => ({ default: m.SmartSpecModule })))
const SpecificationStudio = lazy(() => import('./specification-studio/SpecificationStudio').then((m) => ({ default: m.SpecificationStudio })))
const ProductionStudio = lazy(() => import('./production-studio/ProductionStudio'))
const ExecutiveBudgetStudio = lazy(() => import('./executive-budget-studio/ExecutiveBudgetStudio'))
const ProcurementStudio = lazy(() => import('./procurement-studio/ProcurementStudio'))
const MarketplaceEnterprise = lazy(() => import('./marketplace-enterprise/MarketplaceEnterprise'))
const ClientExperience = lazy(() => import('./client-experience/ClientExperience'))
const OperationsCenter = lazy(() => import('./operations-center/OperationsCenter'))
const AutomationAuditCenter = lazy(() => import('./operations-center/automation-audit/AutomationAuditCenter'))
const AICommandIntelligence = lazy(() => import('./operations-center/ai-command-intelligence/AICommandIntelligence'))
const ExecutiveCockpit = lazy(() => import('./operations-center/executive-command/ExecutiveCockpit'))
const DigitalTwinCenter = lazy(() => import('./bim-digital-twin/DigitalTwinCenter'))
const ConstructionHub = lazy(() => import('./construction-hub/ConstructionHub'))
const SmartBuildingCenter = lazy(() => import('./iot-smart-building/SmartBuildingCenter'))
const FacilityManagementCenter = lazy(() => import('./facility-management/FacilityManagementCenter'))
const IntegrationHub = lazy(() => import('./integration-hub/IntegrationHub'))
const DataSyncCenter = lazy(() => import('./integration-hub/data-sync/DataSyncCenter'))
const UnifiedCopilotCenter = lazy(() => import('./integration-hub/unified-copilot/UnifiedCopilotCenter'))
const MigrationAuditCenter = lazy(() => import('./integration-hub/migration-audit/MigrationAuditCenter'))
const MockApiInventoryCenter = lazy(() => import('./integration-hub/mock-api-inventory/MockApiInventoryCenter'))
const BudgetDisciplinesProposal = lazy(() => import('./executive-budget/disciplines/BudgetDisciplinesProposal'))
const AlignedStudioShell = lazy(() => import('./ux-alignment/AlignedStudioShell'))
const ReleaseCandidateCenter = lazy(() => import('./release-candidate/ReleaseCandidateCenter'))
const LaunchStudio = lazy(() => import('./launch-studio/LaunchStudio'))
const PilotOperationsStudio = lazy(() => import('./pilot-operations-studio/PilotOperationsStudio'))
const RevenueOperationsStudio = lazy(() => import('./revenue-operations-studio/RevenueOperationsStudio'))
const BillingSubscriptionStudio = lazy(() => import('./billing-subscription-studio/BillingSubscriptionStudio'))
const TenantAdminProvisioningStudio = lazy(() => import('./tenant-admin-provisioning-studio/TenantAdminProvisioningStudio'))
const IntegrationAutomationStudio = lazy(() => import('./integration-automation-studio/IntegrationAutomationStudio'))
const SystemConsolidationStudio = lazy(() => import('./system-consolidation-studio/SystemConsolidationStudio'))
const ThemeSystemStudio = lazy(() => import('./theme-system/ThemeSystemStudio'))
const RealRenderGalleryStudio = lazy(() => import('./real-render-gallery/RealRenderGalleryStudio'))
const RealSpecificationCatalogStudio = lazy(() => import('./real-specification-catalog/RealSpecificationCatalogStudio'))
const RealBudgetEngineStudio = lazy(() => import('./real-budget-engine/RealBudgetEngineStudio'))
const ClientPortalApprovalStudio = lazy(() => import('./client-portal-approval/ClientPortalApprovalStudio'))
const ProductionProcurementExecutionStudio = lazy(() => import('./production-procurement-execution/ProductionProcurementExecutionStudio'))
const PostSaleDeliverySuccessStudio = lazy(() => import('./post-sale-delivery-success/PostSaleDeliverySuccessStudio'))
const SystemConsolidationQAStudio = lazy(() => import('./system-consolidation-qa/SystemConsolidationQAStudio'))

// ─── Types ────────────────────────────────────────────────────────────────────
export type ModuleId =
  | 'home'
  | 'projeto' | 'biblioteca' | 'prompt' | 'render' | 'renders' | 'cliente'
  | 'especificacao'
  | 'ai-review' | 'correcoes' | 'memoria' | 'config'
  | 'arqhub' | 'ai-intel' | 'ai-enterprise' | 'ai' | 'integracao-legado' | 'ecosystem' | 'knowledge' | 'office'
  | 'orcamento' | 'orcamento-pro'
  | 'ux-alignment'
  | 'specification' | 'especificacao-produto'
  | 'production' | 'producao' | 'production-studio'
  | 'budget'
  | 'procurement' | 'compras'
  | 'marketplace' | 'arq-marketplace'
  | 'client' | 'portal-cliente'
  | 'operations' | 'command-center' | 'operacoes'
  | 'automation-audit' | 'audit' | 'automacoes'
  | 'ai-command' | 'ai-intelligence' | 'cerebro-ia'
  | 'executive' | 'executive-command' | 'cockpit'
  | 'bim' | 'digital-twin' | 'twin'
  | 'construction' | 'obra' | 'construction-hub'
  | 'iot' | 'smart-building' | 'building'
  | 'facility' | 'facility-management' | 'manutencao'
  | 'integration' | 'integration-hub'
  | 'data-sync' | 'api-connectors' | 'event-bus'
  | 'unified-copilot' | 'copilot' | 'ai-copilot'
  | 'migration' | 'migration-audit' | 'mock-migration'
  | 'mock-api-inventory' | 'mock-inventory' | 'api-inventory'
  | 'release' | 'release-candidate' | 'rc'
  | 'launch' | 'go-to-market' | 'gtm'
  | 'pilot' | 'pilots' | 'pilot-operations'
  | 'revenue' | 'revops' | 'revenue-operations'
  | 'billing' | 'subscriptions' | 'billing-subscription'
  | 'tenant-admin' | 'provisioning' | 'saas-admin'
  | 'integrations' | 'automation' | 'integration-automation'
  | 'consolidation' | 'system-consolidation' | 'real-integration'
  | 'real-render-gallery' | 'render-gallery' | 'post-render'
  | 'real-specification' | 'spec-catalog' | 'spec-objects'
  | 'real-budget' | 'orcamento-real' | 'budget-engine'
  | 'client-portal-approval' | 'proposal-delivery' | 'portal-aprovacao'
  | 'execution' | 'production-procurement'
  | 'post-sale' | 'pos-venda' | 'delivery-success' | 'customer-success' | 'success'
  | 'system-consolidation-qa' | 'qa' | 'system-qa' | 'consolidation-qa'
  | 'theme-system' | 'appearance' | 'aparencia' | 'dark-mode'

export type JourneyId = 'create' | 'design' | 'visualize' | 'deliver' | 'business'

// ─── Flow steps — nova navegação por objetivos ──────────────────────────────
// "O usuário nunca deve pensar em módulos. Ele deve pensar em objetivos."
interface FlowStep {
  id:      string
  icon:    string
  label:   string
  sublabel:string
  primary: ModuleId
  extras:  ModuleId[]
  color:   string
}

const FLOW_STEPS: FlowStep[] = [
  { id:'criar',       icon:'✦',  label:'Projeto',      sublabel:'Cliente e projeto', primary:'home',          extras:['projeto'],                          color: PHX.purple },
  { id:'inspirar',    icon:'🖼️', label:'Inspirar',    sublabel:'Biblioteca',        primary:'biblioteca',    extras:[],                                   color: PHX.blue   },
  { id:'renderizar',  icon:'✨', label:'Renderizar',   sublabel:'Visualização IA',   primary:'renders',       extras:['prompt'],                           color: PHX.purple },
  { id:'melhorar',    icon:'🔄', label:'Melhorar',    sublabel:'Versões e aprovação',primary:'correcoes',     extras:['ai-review','memoria'],              color: PHX.amber  },
  { id:'especificar', icon:'📋', label:'Especificar', sublabel:'Memorial técnico',  primary:'especificacao', extras:[],                                   color: '#16a34a'  },
  { id:'orcamento',   icon:'💰', label:'Orçamento',   sublabel:'Budget executivo',  primary:'orcamento',     extras:['orcamento-pro'],                    color: '#0369a1'  },
  { id:'apresentar',  icon:'👤', label:'Proposta',    sublabel:'Apresentar ao cliente',primary:'cliente',     extras:[],                                   color: PHX.cyan   },
  { id:'entregar',    icon:'📦', label:'Entregar',    sublabel:'Obra e entrega',    primary:'office',        extras:[],                                   color: '#0d9488'  },
]

// Legado — mantido para keyboard shortcuts e command palette
const MODULE_MAP_INTERNAL: Record<ModuleId, { icon:string; label:string }> = {
  'home':       { icon:'🏠', label:'Início'       },
  'projeto':    { icon:'🏗️', label:'Projeto'       },
  'biblioteca': { icon:'🖼️', label:'Inspirar'      },
  'prompt':     { icon:'⚡', label:'Prompt'        },
  'renders':    { icon:'✨', label:'Renderizar'    },
  'cliente':    { icon:'👤', label:'Apresentar'    },
  'especificacao':{ icon:'📋', label:'Especificar' },
  'ai-review':  { icon:'🔍', label:'AI Review'     },
  'correcoes':  { icon:'🔄', label:'Melhorar'      },
  'memoria':    { icon:'🧠', label:'Memória IA'    },
  'config':     { icon:'⚙️', label:'Config'        },
  'arqhub':     { icon:'🏛️', label:'ARQ HUB'      },
  'ai-intel':   { icon:'🧠', label:'AI Intel'      },
  'ai-enterprise': { icon:'🤖', label:'AI Enterprise' },
  'ai':            { icon:'🤖', label:'AI'            },
  'integracao-legado': { icon:'🔗', label:'Integração (Legado)' },
  'ecosystem':  { icon:'🌐', label:'Parceiros'     },
  'knowledge':  { icon:'🧠', label:'Knowledge'     },
  'office':     { icon:'🏢', label:'Office OS'     },
  'orcamento':  { icon:'💰', label:'Orçamento'     },
  'orcamento-pro': { icon:'📐', label:'Orç. Disciplinas' },
  'ux-alignment': { icon:'🎨', label:'UX Alignment'    },
  'specification': { icon:'📋', label:'Especificar'    },
  'especificacao-produto': { icon:'📦', label:'Spec. Produto' },
  'production': { icon:'🏭', label:'Produção'         },
  'producao':   { icon:'🏭', label:'Produção'         },
  'production-studio': { icon:'🏭', label:'Production Studio' },
  'budget':      { icon:'💰', label:'Orçamento'        },
  'procurement':     { icon:'🛒', label:'Compras'          },
  'compras':         { icon:'🛒', label:'Compras'          },
  'marketplace':     { icon:'🏪', label:'Marketplace'      },
  'arq-marketplace': { icon:'🏪', label:'Marketplace'      },
  'client':          { icon:'👤', label:'Portal Cliente'   },
  'portal-cliente':  { icon:'👤', label:'Portal Cliente'   },
  'operations':        { icon:'⚙️', label:'Operações'        },
  'command-center':    { icon:'⚙️', label:'Command Center'   },
  'operacoes':         { icon:'⚙️', label:'Operações'        },
  'automation-audit':  { icon:'🔐', label:'Automação & Audit' },
  'audit':             { icon:'🔐', label:'Audit'            },
  'automacoes':        { icon:'🔐', label:'Automações'        },
  'ai-command':        { icon:'🧠', label:'AI Command'       },
  'ai-intelligence':   { icon:'🧠', label:'AI Intelligence'  },
  'cerebro-ia':        { icon:'🧠', label:'Cérebro IA'       },
  'executive':         { icon:'🎯', label:'Executive'        },
  'executive-command': { icon:'🎯', label:'Executive Command'},
  'cockpit':           { icon:'🎯', label:'Cockpit'          },
  'bim':               { icon:'🏗️', label:'BIM'              },
  'digital-twin':      { icon:'🏗️', label:'Digital Twin'    },
  'twin':              { icon:'🏗️', label:'Twin'             },
  'construction':      { icon:'🦺', label:'Construction Hub' },
  'obra':              { icon:'🦺', label:'Obra'             },
  'construction-hub':  { icon:'🦺', label:'Construction Hub' },
  'iot':               { icon:'📡', label:'IoT'              },
  'smart-building':    { icon:'📡', label:'Smart Building'   },
  'building':          { icon:'📡', label:'Building'         },
  'facility':           { icon:'🔧', label:'Facility'         },
  'facility-management':{ icon:'🔧', label:'Facility Mgmt'   },
  'manutencao':         { icon:'🔧', label:'Manutenção'       },
  'integration':        { icon:'🔗', label:'Integration Hub'  },
  'integration-hub':    { icon:'🔗', label:'Integration Hub'  },
  'data-sync':          { icon:'🔄', label:'Data Sync'        },
  'api-connectors':     { icon:'🔄', label:'API Connectors'   },
  'event-bus':          { icon:'🔄', label:'Event Bus'        },
  'unified-copilot':    { icon:'🤖', label:'Unified Copilot'  },
  'copilot':            { icon:'🤖', label:'Copilot'          },
  'ai-copilot':         { icon:'🤖', label:'AI Copilot'       },
  'migration':          { icon:'🗺️', label:'Migration'        },
  'migration-audit':    { icon:'🗺️', label:'Migration Audit'  },
  'mock-migration':     { icon:'🗺️', label:'Mock Migration'   },
  'mock-api-inventory': { icon:'📦', label:'Mock/API Inventory'},
  'mock-inventory':     { icon:'📦', label:'Mock Inventory'   },
  'api-inventory':      { icon:'📦', label:'API Inventory'    },
  'release':            { icon:'🚀', label:'Release Candidate' },
  'release-candidate':  { icon:'🚀', label:'Release Candidate' },
  'rc':                 { icon:'🚀', label:'RC'                },
  'launch':             { icon:'🎯', label:'Launch Studio'     },
  'go-to-market':       { icon:'🎯', label:'Go-to-Market'      },
  'gtm':                { icon:'🎯', label:'GTM'               },
  'pilot':              { icon:'🧪', label:'Pilot Operations'  },
  'pilots':             { icon:'🧪', label:'Pilots'            },
  'pilot-operations':   { icon:'🧪', label:'Pilot Ops'        },
  'revenue':            { icon:'💹', label:'Revenue Ops'       },
  'revops':             { icon:'💹', label:'RevOps'            },
  'revenue-operations': { icon:'💹', label:'Revenue Operations'},
  'billing':             { icon:'💳', label:'Billing'            },
  'subscriptions':       { icon:'💳', label:'Subscriptions'      },
  'billing-subscription':{ icon:'💳', label:'Billing & Subscriptions'},
  'tenant-admin':        { icon:'🏢', label:'Tenant Admin'          },
  'provisioning':        { icon:'🏢', label:'Provisioning'          },
  'saas-admin':          { icon:'🏢', label:'SaaS Admin'            },
  'integrations':        { icon:'🔗', label:'Integrations'          },
  'automation':          { icon:'🔗', label:'Automation'            },
  'integration-automation': { icon:'🔗', label:'Integration & Automation' },
  'consolidation':          { icon:'🧩', label:'Consolidation'            },
  'system-consolidation':   { icon:'🧩', label:'System Consolidation'     },
  'real-integration':       { icon:'🧩', label:'Real Integration'         },
  'real-render-gallery':    { icon:'🖼️', label:'Render Gallery'           },
  'render-gallery':         { icon:'🖼️', label:'Render Gallery'           },
  'post-render':            { icon:'🖼️', label:'Post-Render'              },
  'real-specification':  { icon:'📐', label:'Spec Catalog'              },
  'spec-catalog':        { icon:'📐', label:'Spec Catalog'              },
  'spec-objects':        { icon:'📐', label:'SpecObjects'               },
  'real-budget':         { icon:'💰', label:'Budget Engine'             },
  'orcamento-real':      { icon:'💰', label:'Orçamento Real'            },
  'budget-engine':       { icon:'💰', label:'Budget Engine'             },
  'client-portal-approval': { icon:'🤝', label:'Portal Cliente'          },
  'proposal-delivery':   { icon:'🤝', label:'Envio de Proposta'         },
  'portal-aprovacao':    { icon:'🤝', label:'Portal Aprovação'          },
  'execution':           { icon:'⚙️', label:'Execução'                  },
  'production-procurement': { icon:'⚙️', label:'Produção & Compras'      },
  'post-sale':          { icon:'🌟', label:'Pós-Venda'                },
  'pos-venda':          { icon:'🌟', label:'Pós-Venda'                },
  'delivery-success':   { icon:'🌟', label:'Entrega & Sucesso'        },
  'customer-success':   { icon:'🌟', label:'Customer Success'         },
  'success':            { icon:'🌟', label:'Sucesso do Cliente'       },
  'system-consolidation-qa': { icon:'🔬', label:'QA / Release'           },
  'qa':                      { icon:'🔬', label:'QA / Release'           },
  'system-qa':               { icon:'🔬', label:'System QA'              },
  'consolidation-qa':        { icon:'🔬', label:'Consolidation QA'       },
  'theme-system':            { icon:'🎨', label:'Tema do Sistema'         },
  'appearance':              { icon:'🎨', label:'Aparência'               },
  'aparencia':               { icon:'🎨', label:'Aparência'               },
  'dark-mode':               { icon:'🌙', label:'Dark Mode'               },
}

// ─── Legado: Journeys (keyboard shortcuts 1–5) ────────────────────────────────
const JOURNEYS_LEGACY = [
  { id:'create' as JourneyId,    default:'home'          as ModuleId, key:'1' },
  { id:'design' as JourneyId,    default:'renders'       as ModuleId, key:'2' },
  { id:'visualize' as JourneyId, default:'biblioteca'    as ModuleId, key:'3' },
  { id:'deliver' as JourneyId,   default:'especificacao' as ModuleId, key:'4' },
  { id:'business' as JourneyId,  default:'office'        as ModuleId, key:'5' },
]

// ─── Project context (exported for consumer modules) ─────────────────────────
export const ArqProjectContext = createContext<ArqProjectState | null>(null)
export function useArqProjectContext(): ArqProjectState | null {
  return useContext(ArqProjectContext)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getActiveFlowStep(module: ModuleId): FlowStep | null {
  return FLOW_STEPS.find(s => s.primary === module || s.extras.includes(module)) ?? FLOW_STEPS[0]
}

function scoreColor(s: number) {
  if (s >= 85) return '#16a34a'
  if (s >= 70) return PHX.amber
  if (s >= 50) return '#ea580c'
  return PHX.red
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes phx-shell-in  { from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)} }
  @keyframes phx-shell-pulse{ 0%,100%{opacity:1}50%{opacity:0.5} }
  @keyframes phx-spin       { to{transform:rotate(360deg)} }
  @keyframes phx-shell-glow {
    from { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
    to   { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
  }

  /* ─── Flow step navigation ─── */
  .phx-flow-step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease !important;
    white-space: nowrap;
    position: relative;
  }
  .phx-flow-step:hover {
    background: rgba(124,58,237,0.06) !important;
    border-color: rgba(124,58,237,0.15) !important;
  }
  .phx-flow-step.active {
    background: rgba(124,58,237,0.1) !important;
    border-color: rgba(124,58,237,0.2) !important;
  }
  .phx-flow-step .step-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: ${PHX.dim};
    flex-shrink: 0;
    transition: background 0.15s ease !important;
  }
  .phx-flow-step.active .step-dot { background: ${PHX.purple} !important; }
  .phx-flow-step .step-connector {
    width: 10px; height: 1px; background: ${PHX.border};
    flex-shrink: 0;
  }

  /* ─── Render CTA button ─── */
  .phx-cta {
    background: linear-gradient(135deg, ${PHX.purple} 0%, ${PHX.purpleL} 100%) !important;
    border: none !important;
    border-radius: 10px !important;
    color: #fff !important;
    padding: 8px 18px !important;
    font-size: 13px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    gap: 7px !important;
    box-shadow: 0 2px 10px rgba(124,58,237,0.28) !important;
    transition: all 0.18s ease !important;
    flex-shrink: 0;
  }
  .phx-cta:hover {
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(124,58,237,0.40) !important;
    animation: phx-shell-glow 0.4s ease !important;
  }
  .phx-cta:active { transform: translateY(0) !important; }

  /* ─── Top bar buttons ─── */
  .phx-btn {
    transition: all 0.13s ease !important;
    cursor: pointer;
  }
  .phx-btn:hover {
    background: ${PHX.muted} !important;
    border-color: ${PHX.borderM} !important;
  }

  /* ─── Module sub-steps ─── */
  .phx-sub-step {
    transition: all 0.13s ease !important;
    cursor: pointer;
  }
  .phx-sub-step:hover {
    background: rgba(124,58,237,0.06) !important;
    color: ${PHX.purple} !important;
  }
  .phx-sub-step.active {
    background: rgba(124,58,237,0.1) !important;
    color: ${PHX.purple} !important;
    font-weight: 700 !important;
  }

  /* ─── Project selector ─── */
  .phx-proj-btn {
    transition: all 0.13s ease !important;
    cursor: pointer;
  }
  .phx-proj-btn:hover {
    background: ${PHX.muted} !important;
    border-color: ${PHX.borderM} !important;
  }

  /* ─── Module content panel ─── */
  .phx-module-wrap {
    animation: phx-shell-in 0.2s ease both;
  }
`

// ─── Real render route bridge ─────────────────────────────────────────────────
// The experimental SmartRenderEngine still exists in the codebase, but it only
// creates local UI versions. Tenant-facing render actions must use the real
// RenderStudio route until the new Studio is wired to the production engine.
function RenderStudioRouteBridge({ projectId }: { projectId: string | null }) {
  useEffect(() => {
    const params = new URLSearchParams()
    if (projectId) params.set('project_id', projectId)
    const query = params.toString()
    window.location.assign(`/arch/render${query ? `?${query}` : ''}`)
  }, [projectId])

  return (
    <div style={{ minHeight: 360, display: 'grid', placeItems: 'center', color: PHX.textSub }}>
      Abrindo o Studio de Render…
    </div>
  )
}

// ─── Module renderer ──────────────────────────────────────────────────────────
function renderModule(id: ModuleId, arqState: ArqProjectState, setActive: (m: ModuleId) => void) {
  switch (id) {
    case 'home':          return <ProjectHomeV2 arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'projeto':       return <SmartProjectModule arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'biblioteca':    return <LibraryModule/>
    case 'especificacao': return <SmartSpecModule projectId={arqState.projectId} onBack={() => setActive('home')} onOpenRender={() => setActive('renders')} />
    case 'specification':
    case 'especificacao-produto': return <SpecificationStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'prompt':        return <PromptPlaygroundModule/>
    case 'render':
    case 'renders':       return <RenderStudioRouteBridge projectId={arqState.projectId} />
    case 'ai-review':     return <AIReviewModule/>
    case 'correcoes':     return <AICorrectionsModule/>
    case 'memoria':       return <AIMemoryModule/>
    case 'config':        return <SettingsModule/>
    case 'marketplace':
    case 'arq-marketplace': return <MarketplaceEnterprise arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'arqhub':        return <ArqHubView/>
    case 'ai-intel':
    case 'ai-enterprise':
    case 'ai':            return <AIEnterpriseCore arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'integracao-legado': return <IntegrationModule/>
    case 'cliente':
    case 'client':
    case 'portal-cliente': return <ClientExperience arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'operations':
    case 'command-center':
    case 'operacoes':       return <OperationsCenter arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'automation-audit':
    case 'audit':
    case 'automacoes':      return <AutomationAuditCenter onNavigate={m => setActive(m as ModuleId)} />
    case 'ai-command':
    case 'ai-intelligence':
    case 'cerebro-ia':      return <AICommandIntelligence onNavigate={m => setActive(m as ModuleId)} />
    case 'executive':
    case 'executive-command':
    case 'cockpit':         return <ExecutiveCockpit onNavigate={m => setActive(m as ModuleId)} />
    case 'bim':
    case 'digital-twin':
    case 'twin':            return <DigitalTwinCenter arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'construction':
    case 'obra':
    case 'construction-hub': return <ConstructionHub arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'iot':
    case 'smart-building':
    case 'building':         return <SmartBuildingCenter arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'facility':
    case 'facility-management':
    case 'manutencao':       return <FacilityManagementCenter arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'integration':
    case 'integration-hub':  return <IntegrationHub arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'data-sync':
    case 'api-connectors':
    case 'event-bus':        return <DataSyncCenter onNavigate={m => setActive(m as ModuleId)} />
    case 'unified-copilot':
    case 'copilot':
    case 'ai-copilot':       return <UnifiedCopilotCenter onNavigate={m => setActive(m as ModuleId)} />
    case 'migration':
    case 'migration-audit':
    case 'mock-migration':   return <MigrationAuditCenter onNavigate={m => setActive(m as ModuleId)} />
    case 'mock-api-inventory':
    case 'mock-inventory':
    case 'api-inventory':    return <MockApiInventoryCenter onNavigate={m => setActive(m as ModuleId)} />
    case 'release':
    case 'release-candidate':
    case 'rc':               return <ReleaseCandidateCenter arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'launch':
    case 'go-to-market':
    case 'gtm':              return <LaunchStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'pilot':
    case 'pilots':
    case 'pilot-operations': return <PilotOperationsStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'revenue':
    case 'revops':
    case 'revenue-operations': return <RevenueOperationsStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'billing':
    case 'subscriptions':
    case 'billing-subscription': return <BillingSubscriptionStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'tenant-admin':
    case 'provisioning':
    case 'saas-admin': return <TenantAdminProvisioningStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'integrations':
    case 'automation':
    case 'integration-automation': return <IntegrationAutomationStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'consolidation':
    case 'system-consolidation':
    case 'real-integration': return <SystemConsolidationStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'system-consolidation-qa':
    case 'qa':
    case 'system-qa':
    case 'consolidation-qa': return <SystemConsolidationQAStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'real-render-gallery':
    case 'render-gallery':
    case 'post-render': return <RealRenderGalleryStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'real-specification':
    case 'spec-catalog':
    case 'spec-objects': return <RealSpecificationCatalogStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'real-budget':
    case 'orcamento-real':
    case 'budget-engine': return <RealBudgetEngineStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'client-portal-approval':
    case 'proposal-delivery':
    case 'portal-aprovacao': return <ClientPortalApprovalStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'execution':
    case 'production-procurement': return <ProductionProcurementExecutionStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'post-sale':
    case 'pos-venda':
    case 'delivery-success':
    case 'customer-success':
    case 'success': return <PostSaleDeliverySuccessStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'ecosystem':     return <EcosystemModule/>
    case 'knowledge':     return <KnowledgeModule/>
    case 'office':        return <OfficeModule/>
    case 'production':
    case 'producao':
    case 'production-studio': return <ProductionStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'orcamento':
    case 'budget':        return <ExecutiveBudgetStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'procurement':
    case 'compras':       return <ProcurementStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'orcamento-pro': return <BudgetDisciplinesProposal />
    case 'ux-alignment':  return <AlignedStudioShell />
    case 'theme-system':
    case 'appearance':
    case 'aparencia':
    case 'dark-mode':    return <ThemeSystemStudio arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
  }
}

// ─── Project selector compact ────────────────────────────────────────────────
function ProjectSelectorBar({ arqState }: { arqState: ArqProjectState }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const projectName = arqState.loading ? 'Carregando…' : (arqState.projectMeta?.titulo ?? 'Selecionar projeto')

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button
        className="phx-proj-btn"
        onClick={() => setOpen(p => !p)}
        style={{
          display:'flex', alignItems:'center', gap:7, padding:'5px 12px 5px 8px',
          border:`1px solid ${PHX.border}`, borderRadius:8,
          background:PHX.surface, cursor:'pointer', color:PHX.text,
          boxShadow: PHX.shadow,
        }}
      >
        <span style={{ fontSize:14 }}>📁</span>
        <span style={{ fontSize:11, fontWeight:600, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: arqState.projectId ? PHX.text : PHX.textSub }}>
          {projectName}
        </span>
        <span style={{ fontSize:8, color:PHX.dim }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', left:0, width:260, zIndex:600,
          background:PHX.surface, border:`1px solid ${PHX.border}`, borderRadius:12,
          boxShadow:PHX.shadowXL, overflow:'hidden', animation:'phx-shell-in 0.15s ease',
        }}>
          {/* Project list */}
          <div style={{ maxHeight:200, overflowY:'auto' }}>
            {arqState.projects.map(p => (
              <button key={p.id} onClick={() => { arqState.selectProject(p.id); setOpen(false) }} style={{
                width:'100%', textAlign:'left', padding:'9px 14px', border:'none',
                background: p.id === arqState.projectId ? 'rgba(124,58,237,0.06)' : 'transparent',
                cursor:'pointer', display:'block', transition:'background 0.12s',
              }}>
                <p style={{ margin:0, fontSize:11, color: p.id === arqState.projectId ? PHX.purple : PHX.text, fontWeight:p.id === arqState.projectId ? 700 : 500 }}>{p.titulo}</p>
                <p style={{ margin:0, fontSize:9, color:PHX.dim }}>{p.tipoObra ?? p.status ?? ''}</p>
              </button>
            ))}
            {arqState.projects.length === 0 && (
              <p style={{ margin:0, padding:'12px 14px', fontSize:10, color:PHX.dim }}>Nenhum projeto ainda</p>
            )}
          </div>
          {/* Criação canônica: cliente/lead e projeto no mesmo fluxo */}
          <div style={{ borderTop:`1px solid ${PHX.border}`, padding:'10px' }}>
            <button
              onClick={() => window.location.assign('/arch/projetos/novo')}
              style={{
                width:'100%', padding:'8px 12px', borderRadius:8, border:'none',
                background:PHX.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:800,
              }}
            >
              ＋ Novo projeto com cliente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Flow step navigation ────────────────────────────────────────────────────
function FlowNav({
  activeModule, onNavigate,
}: { activeModule:ModuleId; onNavigate:(m:ModuleId)=>void }) {
  const [hoveredStep, setHoveredStep] = useState<string | null>(null)
  const activeFlow = getActiveFlowStep(activeModule)

  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, overflowX:'auto', padding:'0 2px' }}>
      {FLOW_STEPS.map((step, i) => {
        const isActive = activeFlow?.id === step.id
        const isHovered = hoveredStep === step.id

        return (
          <div key={step.id} style={{ display:'flex', alignItems:'center' }}>
            {/* Connector */}
            {i > 0 && (
              <div style={{ width:8, height:1, background:PHX.border, flexShrink:0, margin:'0 1px' }} />
            )}
            {/* Step */}
            <div
              className={`phx-flow-step${isActive ? ' active' : ''}`}
              onClick={() => onNavigate(step.primary)}
              onMouseEnter={() => setHoveredStep(step.id)}
              onMouseLeave={() => setHoveredStep(null)}
            >
              <span style={{ fontSize:12 }}>{step.icon}</span>
              <span style={{ fontSize:11, fontWeight: isActive ? 700 : 500, color: isActive ? PHX.purple : PHX.textSub }}>
                {step.label}
              </span>
              {/* Tooltip sublabel */}
              {isHovered && !isActive && (
                <div style={{
                  position:'absolute', top:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
                  background:PHX.text, color:'#fff', borderRadius:6, padding:'4px 8px',
                  fontSize:9, fontWeight:600, whiteSpace:'nowrap', zIndex:400, pointerEvents:'none',
                  boxShadow:PHX.shadowM,
                }}>
                  {step.sublabel}
                  <div style={{ position:'absolute', top:-3, left:'50%', transform:'translateX(-50%)', width:6, height:6, background:PHX.text, borderRadius:1, rotate:'45deg' }} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Sub-step tabs (when a flow step has extras) ──────────────────────────────
function SubStepNav({
  activeModule, activeFlow, onNavigate,
}: { activeModule:ModuleId; activeFlow:FlowStep|null; onNavigate:(m:ModuleId)=>void }) {
  if (!activeFlow || (activeFlow.extras.length === 0)) return null

  const allModules = [activeFlow.primary, ...activeFlow.extras]
  const icons: Partial<Record<ModuleId, string>> = {
    home:'🏠', projeto:'🏗️', renders:'✨', prompt:'⚡',
    correcoes:'🔄', 'ai-review':'🔍', memoria:'🧠',
    ecosystem:'🌐', knowledge:'🧠', arqhub:'🏛️',
  }

  return (
    <div style={{
      height:32, borderBottom:`1px solid ${PHX.border}`,
      background:PHX.surface, display:'flex', alignItems:'center',
      padding:'0 20px', gap:2, flexShrink:0,
    }}>
      {allModules.map(id => {
        const isActive = activeModule === id
        const label = MODULE_MAP_INTERNAL[id]?.label ?? id
        const icon  = icons[id] ?? '◦'
        return (
          <div
            key={id}
            className={`phx-sub-step${isActive ? ' active' : ''}`}
            onClick={() => onNavigate(id)}
            style={{
              padding:'4px 10px', borderRadius:6, fontSize:11,
              color: isActive ? PHX.purple : PHX.textSub,
              display:'flex', alignItems:'center', gap:5,
            }}
          >
            <span style={{ fontSize:11 }}>{icon}</span>
            {label}
          </div>
        )
      })}
    </div>
  )
}

// ─── Keyboard shortcuts tooltip ───────────────────────────────────────────────
function ShortcutsToast({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div style={{
      position:'fixed', bottom:20, right:20, zIndex:800,
      background:PHX.surface, border:`1px solid ${PHX.border}`, borderRadius:14,
      padding:'16px 20px', boxShadow:PHX.shadowXL,
      animation:'phx-shell-in 0.2s ease',
    }}>
      <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:PHX.purple, letterSpacing:'0.05em' }}>
        ATALHOS DE TECLADO
      </p>
      {[
        ['⌘K',    'Busca rápida'],
        ['G H',   'Início'],
        ['G R',   'Renders'],
        ['G B',   'Biblioteca'],
        ['G S',   'Especificação'],
        ['G P',   'Prompt'],
        ['1–5',   'Trocar fluxo'],
        ['Esc',   'Fechar'],
      ].map(([k, l]) => (
        <div key={k} style={{ display:'flex', gap:12, alignItems:'center', marginBottom:4 }}>
          <kbd style={{
            padding:'2px 7px', borderRadius:5, fontSize:9,
            background:PHX.muted, color:PHX.text, border:`1px solid ${PHX.border}`,
            minWidth:38, textAlign:'center', fontFamily:'monospace',
          }}>{k}</kbd>
          <span style={{ fontSize:10, color:PHX.textSub }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ arqState }: { arqState: ArqProjectState }) {
  if (arqState.saving) {
    return (
      <span style={{ fontSize:10, padding:'3px 9px', borderRadius:20, background:'rgba(124,58,237,0.08)', color:PHX.purple, fontWeight:600, animation:'phx-shell-pulse 1.5s ease infinite', flexShrink:0 }}>
        Salvando…
      </span>
    )
  }
  if (arqState.projectId && !arqState.loading) {
    return (
      <span style={{ fontSize:10, padding:'3px 9px', borderRadius:20, background:'rgba(22,163,74,0.08)', color:PHX.green, fontWeight:600, flexShrink:0 }}>
        ● Salvo
      </span>
    )
  }
  return null
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ArqWorkspace() {
  return (
    <ArqdorThemeProvider>
      <WorkspaceProvider>
        <WorkspaceInner />
      </WorkspaceProvider>
    </ArqdorThemeProvider>
  )
}

// ─── WorkspaceInner ───────────────────────────────────────────────────────────
function WorkspaceInner() {
  const [activeModule,     setActiveModuleRaw]  = useState<ModuleId>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/arch/render') return 'render-gallery'
      const params = new URLSearchParams(window.location.search)
      const requestedProjectId = params.get('project_id')?.trim()
      if (requestedProjectId) localStorage.setItem('arq_last_project_id', requestedProjectId)
      const requestedModule = params.get('module') as ModuleId | null
      if (requestedModule && MODULE_MAP_INTERNAL[requestedModule]) return requestedModule
    }
    return 'home'
  })
  const [copilotCollapsed, setCopilotCollapsed] = useState(true)   // starts collapsed
  const [paletteOpen,      setPaletteOpen]      = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [showRenderProgress, setShowRenderProgress] = useState(false)

  const { setProjectCtx } = useWorkspaceProject()
  const arqState = useArqProject()

  const setActiveModule = useCallback((m: ModuleId) => {
    setActiveModuleRaw(m)
  }, [])

  // AIE score
  const { projectCtx } = useWorkspaceProject()
  const aieResult    = useMemo(() => runAIE(projectCtx), [projectCtx])
  const overallScore = aieResult.scores.overall
  const badgeColor   = scoreColor(overallScore)

  // Sync WorkspaceContext
  useEffect(() => {
    const ctx = arqState.getProjectContext?.()
    if (ctx) setProjectCtx(ctx)
  }, [arqState.projectId, arqState.objects, arqState.materials, arqState.projectMeta])

  // arqdor:navigate — permite módulos filhos navegarem sem prop drilling
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ module: string }>).detail
      if (detail?.module) setActiveModule(detail.module as ModuleId)
    }
    window.addEventListener('arqdor:navigate', handler)
    return () => window.removeEventListener('arqdor:navigate', handler)
  }, [])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout>

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setPaletteOpen(p => !p); return
      }
      if (e.key === 'Escape') { setPaletteOpen(false); setShortcutsVisible(false); return }
      if (e.key === '?' && !editing && !e.ctrlKey) { setShortcutsVisible(p => !p); return }
      if (editing) return

      // 1–5 → flow steps (mapped to primary modules)
      if (['1','2','3','4','5'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        const step = FLOW_STEPS[parseInt(e.key) - 1]
        if (step) setActiveModule(step.primary)
        return
      }

      // G prefix
      if (e.key === 'g') {
        pendingG = true
        clearTimeout(gTimer)
        gTimer = setTimeout(() => { pendingG = false }, 1500)
        return
      }
      if (pendingG && !e.ctrlKey) {
        pendingG = false
        clearTimeout(gTimer)
        const map: Partial<Record<string, ModuleId>> = {
          h:'home', r:'renders', b:'biblioteca', p:'prompt',
          s:'especificacao', d:'cliente', c:'projeto',
        }
        const target = map[e.key]
        if (target) setActiveModule(target)
      }
    }

    document.addEventListener('keydown', handler)
    return () => { document.removeEventListener('keydown', handler); clearTimeout(gTimer) }
  }, [setActiveModule])

  const activeFlow = getActiveFlowStep(activeModule)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <ArqProjectContext.Provider value={arqState}>
      <div style={{
        height:'100vh', display:'flex', flexDirection:'column',
        background:PHX.bg, fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        overflow:'hidden', color:PHX.text,
      }}>
        <style>{CSS}</style>
        {arqState.error && (
          <div role="alert" style={{
            flexShrink:0, padding:'8px 14px', background:'#7f1d1d', color:'#fee2e2',
            fontSize:12, fontWeight:700, borderBottom:'1px solid #991b1b'
          }}>
            Falha de sincronização: {arqState.error}. As alterações locais só devem ser consideradas salvas após a sincronização voltar ao normal.
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TOP BAR — Chrome Premium
            Branco puro, shadow sutil, ✨ CTA sempre visível.
            ════════════════════════════════════════════════════════════ */}
        <div style={{
          height:52, flexShrink:0, display:'flex', alignItems:'center',
          background:PHX.sidebar, borderBottom:`1px solid ${PHX.border}`,
          boxShadow:PHX.shadow, gap:0, zIndex:200, position:'relative',
        }}>

          {/* Logo */}
          <div style={{
            width:136, flexShrink:0, display:'flex', alignItems:'center', gap:8,
            padding:'0 16px', borderRight:`1px solid ${PHX.border}`, height:'100%',
          }}>
            <div style={{
              width:28, height:28, borderRadius:8,
              background:`linear-gradient(135deg, ${PHX.purple} 0%, ${PHX.purpleL} 100%)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:14, color:'#fff', flexShrink:0,
              boxShadow:'0 2px 8px rgba(124,58,237,0.3)',
            }}>🏛️</div>
            <div>
              <p style={{ margin:0, fontSize:13, fontWeight:900, color:PHX.text, letterSpacing:'-0.02em', lineHeight:1 }}>
                arqdor<span style={{ color:PHX.purple }}>.ai</span>
              </p>
              <p style={{ margin:0, fontSize:8, color:PHX.dim, letterSpacing:'0.08em', fontWeight:600 }}>STUDIO</p>
            </div>
          </div>

          {/* Project selector */}
          <div style={{ padding:'0 12px', borderRight:`1px solid ${PHX.border}`, height:'100%', display:'flex', alignItems:'center' }}>
            <ProjectSelectorBar arqState={arqState} />
          </div>

          {/* ── FLOW STEP NAVIGATION ── */}
          <div style={{ flex:1, height:'100%', display:'flex', alignItems:'center', padding:'0 16px', overflow:'hidden' }}>
            <FlowNav activeModule={activeModule} onNavigate={setActiveModule} />
          </div>

          {/* ── RIGHT CONTROLS ── */}
          <div style={{ display:'flex', gap:8, alignItems:'center', padding:'0 14px', borderLeft:`1px solid ${PHX.border}`, height:'100%', flexShrink:0 }}>
            {/* Status */}
            <StatusBadge arqState={arqState} />

            {/* AIE score — subtle */}
            <span style={{
              fontSize:9, padding:'3px 8px', borderRadius:20, fontWeight:700,
              background:`${badgeColor}0f`, color:badgeColor, flexShrink:0,
            }}>
              {overallScore}
            </span>

            {/* Theme toggle */}
            <ArqdorThemeToggle compact />

            {/* ⌘K search */}
            <button
              className="phx-btn"
              onClick={() => setPaletteOpen(true)}
              style={{
                display:'flex', alignItems:'center', gap:6, padding:'5px 11px',
                border:`1px solid ${PHX.border}`, borderRadius:8,
                background:PHX.surface, cursor:'pointer', color:PHX.textSub,
              }}
            >
              <span style={{ fontSize:12 }}>🔍</span>
              <span style={{ fontSize:10 }}>Buscar</span>
              <kbd style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:PHX.muted, color:PHX.dim, border:`1px solid ${PHX.border}`, fontFamily:'monospace' }}>⌘K</kbd>
            </button>

            {/* Copilot toggle */}
            <button
              onClick={() => setCopilotCollapsed(p => !p)}
              title={copilotCollapsed ? 'Abrir assistente' : 'Recolher assistente'}
              style={{
                padding:'5px 11px', borderRadius:8,
                border:`1px solid ${copilotCollapsed ? PHX.border : PHX.purple}`,
                background:copilotCollapsed ? PHX.surface : `rgba(124,58,237,0.08)`,
                color:copilotCollapsed ? PHX.textSub : PHX.purple,
                cursor:'pointer', fontSize:10, fontWeight:600,
                display:'flex', alignItems:'center', gap:5, flexShrink:0,
                transition:'all 0.15s ease',
              }}
            >
              🤖 {copilotCollapsed ? 'Assistente' : '▸'}
            </button>

            {/* ✨ Gerar Render — CTA principal */}
            <button
              className="phx-cta"
              onClick={() => setActiveModule('renders')}
              title="Abrir o fluxo oficial de Render IA"
            >
              <span style={{ fontSize:15 }}>✨</span>
              Gerar Render
            </button>

            {/* Shortcuts hint */}
            <button
              onClick={() => setShortcutsVisible(p => !p)}
              style={{ background:'none', border:'none', cursor:'pointer', color:PHX.dim, fontSize:11, padding:'4px' }}
            >?</button>
          </div>
        </div>

        {/* ── MODULE SUB-STEPS (when step has extras) ── */}
        <SubStepNav activeModule={activeModule} activeFlow={activeFlow} onNavigate={setActiveModule} />

        {/* ══════════════════════════════════════════════════════════
            BODY ROW — content area + copilot sidebar side by side
            ══════════════════════════════════════════════════════════ */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'row', minHeight:0 }}>
          {/* ── module content ── */}
          <div style={{ flex:1, overflow:'hidden', position:'relative', minWidth:0 }}>
            <div key={activeModule} className="phx-module-wrap" style={{ height:'100%', overflow:'hidden' }}>
              <Suspense fallback={
                <div style={{
                  height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                  background:PHX.bg, gap:10, flexDirection:'column',
                }}>
                  <div style={{ width:32, height:32, border:`3px solid ${PHX.border}`, borderTopColor:PHX.purple, borderRadius:'50%', animation:'phx-spin 0.8s linear infinite' }} />
                  <p style={{ margin:0, fontSize:12, color:PHX.dim }}>Carregando…</p>
                </div>
              }>
                {renderModule(activeModule, arqState, setActiveModule)}
              </Suspense>
            </div>
          </div>

          {/* ── ARQ COPILOT sidebar (right, same row as content) ── */}
          <ArqCopilot
            collapsed={copilotCollapsed}
            onToggle={() => setCopilotCollapsed(p => !p)}
            nextAction={computeNextAction(arqState, 0)}
          />
        </div>

        {/* ── COMMAND PALETTE ── */}
        <ArqCommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={m => { setActiveModule(m); setPaletteOpen(false) }}
          onSelectProject={id => { arqState.selectProject(id); setPaletteOpen(false) }}
          projects={arqState.projects}
        />

        {/* ── SHORTCUTS TOAST ── */}
        <ShortcutsToast visible={shortcutsVisible} />

        {/* ── RENDER PROGRESS MODAL ── */}
        {showRenderProgress && (
          <RenderProgressModal onClose={() => { setShowRenderProgress(false); setActiveModule('renders') }} />
        )}
      </div>
    </ArqProjectContext.Provider>
  )
}
