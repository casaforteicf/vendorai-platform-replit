import { useState, useMemo, Suspense, lazy, createContext, useContext, useEffect } from 'react'
import { ArqCopilot }       from '../copilot/ui/ArqCopilot'
import { WorkspaceProvider, useWorkspaceProject, WorkspaceContext } from './WorkspaceContext'
import { IntegrationModule } from './modules/IntegrationModule'
import { LibraryModule }      from './modules/LibraryModule'
import { SmartSpecModule }    from './modules/SmartSpecModule'
import { PromptPlaygroundModule } from './modules/PromptPlaygroundModule'
import { RenderHistoryModule } from './modules/RenderHistoryModule'
import { AIReviewModule }      from './modules/AIReviewModule'
import { AICorrectionsModule } from './modules/AICorrectionsModule'
import { AIMemoryModule }      from './modules/AIMemoryModule'
import { SettingsModule }      from './modules/SettingsModule'
import { ProjectModule }       from './modules/ProjectModule'
import { ArqHubView }         from '../arqhub/ArqHubView'
import { AIEDashboard }       from '../engines/aie/dashboard/AIEDashboard'
import { useArqProject, type ArqProjectState } from '../hooks/useArqProject'
import { ProjectHome, computeNextAction } from './project-experience/ProjectHome'
import type { ProjectContext } from '../engines/aie/aie-types'
import { runAIE }             from '../engines/aie/aie-engine'
import { T } from '../shared/arqdor-theme'

void lazy

function scoreColor(s: number) {
  if (s >= 85) return '#4ade80'
  if (s >= 70) return '#fbbf24'
  if (s >= 50) return '#fb923c'
  return '#f87171'
}

// ─── Project context ──────────────────────────────────────────────────────────
export const ArqProjectContext = createContext<ArqProjectState | null>(null)
export function useArqProjectContext(): ArqProjectState | null {
  return useContext(ArqProjectContext)
}

// ─── Module definitions ───────────────────────────────────────────────────────
// FASE 17 — navegação simplificada: PRIMARY (5 itens visíveis) + SECONDARY (Mais…)
export type ModuleId =
  | 'home'                                                          // Project Experience (new)
  | 'projeto' | 'biblioteca' | 'prompt' | 'renders' | 'cliente'   // PRIMARY nav
  | 'especificacao'                                                 // Sprint 4 — Smart Specification
  | 'ai-review' | 'correcoes' | 'memoria' | 'config'              // SECONDARY
  | 'arqhub' | 'ai-intel' | 'integracao'                          // SECONDARY

interface WorkspaceModule {
  id:      ModuleId
  icon:    string
  label:   string
  desc:    string
  badge?:  string
  badgeColor?: string
}

// Navegação principal simplificada (FASE 17)
const PRIMARY_MODULES: WorkspaceModule[] = [
  { id:'home',          icon:'🏠',  label:'Home',          desc:'Dashboard do projeto'          },
  { id:'renders',       icon:'🎬',  label:'Render',         desc:'Histórico completo'            },
  { id:'biblioteca',    icon:'📚',  label:'Biblioteca',     desc:'Materiais e objetos'           },
  { id:'especificacao', icon:'✨',  label:'Especificação',  desc:'Smart Specification', badge:'NEW', badgeColor:'#a78bfa' },
  { id:'cliente',       icon:'👤',  label:'Portal',         desc:'Portal do Cliente'             },
]
// Ferramentas avançadas (acessíveis via "Mais…")
const SECONDARY_MODULES: WorkspaceModule[] = [
  { id:'projeto',    icon:'🏗️',  label:'Projeto',      desc:'Modelagem inteligente'         },
  { id:'prompt',     icon:'⚡',  label:'Prompt',       desc:'Playground interativo'         },
  { id:'ai-review',  icon:'🔍',  label:'AI Review',    desc:'Análise comparativa',  badge:'1', badgeColor:'#f87171' },
  { id:'correcoes',  icon:'🔄',  label:'Correções',    desc:'Prompts de ajuste',    badge:'4', badgeColor:'#fb923c' },
  { id:'memoria',    icon:'🧠',  label:'Memória IA',   desc:'Preferências aprendidas'       },
  { id:'config',     icon:'⚙️',  label:'Config',       desc:'Providers e plugins'           },
  { id:'arqhub',     icon:'🏛️',  label:'ARQ HUB',      desc:'Ecosystem inteligente', badge:'NEW', badgeColor:'#4ade80' },
  { id:'ai-intel',   icon:'🧠',  label:'AI Intelligence', desc:'Motor de análise AIE', badge:'AIE', badgeColor:'#a78bfa' },
]

const ALL_MODULES = [...PRIMARY_MODULES, ...SECONDARY_MODULES]

function renderModule(id: ModuleId, arqState: ArqProjectState, setActive: (m: ModuleId) => void) {
  switch (id) {
    case 'home':       return <ProjectHome arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'projeto':    return <ProjectModule/>
    case 'biblioteca':    return <LibraryModule/>
    case 'especificacao': return <SmartSpecModule/>
    case 'prompt':        return <PromptPlaygroundModule/>
    case 'renders':    return <RenderHistoryModule/>
    case 'ai-review':  return <AIReviewModule/>
    case 'correcoes':  return <AICorrectionsModule/>
    case 'memoria':    return <AIMemoryModule/>
    case 'config':     return <SettingsModule/>
    case 'arqhub':     return <ArqHubView/>
    case 'ai-intel':   return <AIEDashboard/>
    case 'integracao': return <IntegrationModule/>
    case 'cliente':    return <IntegrationModule/>
  }
}

// ─── Sidebar item ─────────────────────────────────────────────────────────────
function SidebarItem({
  module, active, expanded, onClick,
}: {
  module: WorkspaceModule; active: boolean; expanded: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      title={expanded ? undefined : module.label}
      style={{
        display:'flex', alignItems:'center', gap:10,
        padding: expanded ? '9px 14px' : '9px 0',
        justifyContent: expanded ? 'flex-start' : 'center',
        borderRadius:8, cursor:'pointer', marginBottom:2,
        background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
        transition:'background 0.15s',
        position:'relative',
      }}
    >
      {active && (
        <div style={{ position:'absolute', left:0, top:'20%', height:'60%', width:3, borderRadius:'0 2px 2px 0', background:T.purple }}/>
      )}
      <span style={{ fontSize:18, flexShrink:0 }}>{module.icon}</span>
      {expanded && (
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:11, fontWeight:700, color: active ? '#fff' : T.text, lineHeight:1 }}>{module.label}</p>
          <p style={{ margin:'2px 0 0', fontSize:9, color:T.dim, lineHeight:1 }}>{module.desc}</p>
        </div>
      )}
      {module.badge && expanded && (
        <span style={{
          padding:'1px 5px', borderRadius:8, fontSize:9, fontWeight:800, flexShrink:0,
          background: module.badgeColor ? `${module.badgeColor}22` : 'rgba(124,58,237,0.2)',
          color: module.badgeColor ?? T.purpleL,
        }}>{module.badge}</span>
      )}
      {module.badge && !expanded && (
        <div style={{
          position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%',
          background: module.badgeColor ?? T.purpleL,
        }}/>
      )}
    </div>
  )
}

// ─── Project selector ─────────────────────────────────────────────────────────
function ProjectSelector({ arqState, expanded }: { arqState: ArqProjectState; expanded: boolean }) {
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  if (!expanded) return null

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await arqState.createProject(newTitle.trim())
      setNewTitle('')
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ padding:'6px 10px 4px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 8px', borderRadius:6, border:`1px solid ${T.border}`,
          background:'rgba(255,255,255,0.04)', cursor:'pointer', gap:6,
        }}
      >
        <div style={{ flex:1, textAlign:'left' as const, minWidth:0 }}>
          <p style={{ margin:0, fontSize:9, color:T.dim, fontWeight:700, letterSpacing:'0.05em' }}>PROJETO ATIVO</p>
          <p style={{ margin:'1px 0 0', fontSize:10, color:'#fff', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
            {arqState.loading ? 'Carregando…' : (arqState.projectMeta?.titulo ?? 'Nenhum')}
          </p>
        </div>
        <span style={{ fontSize:9, color:T.dim }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop:4, borderRadius:6, border:`1px solid ${T.border}`, background:T.sidebar, overflow:'hidden' }}>
          <div style={{ maxHeight:160, overflowY:'auto' as const }}>
            {arqState.projectsLoading && (
              <p style={{ margin:0, padding:'8px 10px', fontSize:10, color:T.dim }}>Carregando…</p>
            )}
            {arqState.projects.map(p => (
              <button
                key={p.id}
                onClick={() => { arqState.selectProject(p.id); setOpen(false) }}
                style={{
                  width:'100%', textAlign:'left' as const, padding:'7px 10px', border:'none',
                  background: p.id === arqState.projectId ? 'rgba(124,58,237,0.18)' : 'transparent',
                  cursor:'pointer', display:'block',
                }}
              >
                <p style={{ margin:0, fontSize:10, color:'#fff', fontWeight:600 }}>{p.titulo}</p>
                <p style={{ margin:0, fontSize:9, color:T.dim }}>{p.tipoObra ?? p.status ?? ''}</p>
              </button>
            ))}
            {!arqState.projectsLoading && arqState.projects.length === 0 && (
              <p style={{ margin:0, padding:'8px 10px', fontSize:10, color:T.dim }}>Nenhum projeto ainda</p>
            )}
          </div>
          <div style={{ borderTop:`1px solid ${T.border}`, padding:'6px 8px' }}>
            <div style={{ display:'flex', gap:4 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Nome do novo projeto…"
                style={{
                  flex:1, padding:'5px 8px', borderRadius:5, border:`1px solid ${T.border}`,
                  background:'rgba(255,255,255,0.06)', color:'#fff', fontSize:10, outline:'none',
                }}
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                style={{
                  padding:'5px 10px', borderRadius:5, border:'none', background:T.purple,
                  color:'#fff', cursor:'pointer', fontSize:10, fontWeight:700, flexShrink:0,
                  opacity: creating || !newTitle.trim() ? 0.5 : 1,
                }}
              >
                {creating ? '…' : '+'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar — FASE 17 simplified nav ────────────────────────────────────────
function Sidebar({
  activeModule, expanded, arqState, onSelect,
}: {
  activeModule: ModuleId; expanded: boolean; arqState: ArqProjectState; onSelect: (m: ModuleId) => void
}) {
  const [maisOpen, setMaisOpen] = useState(false)

  return (
    <>
      {/* Project selector */}
      <ProjectSelector arqState={arqState} expanded={expanded} />

      {/* Primary navigation */}
      <div style={{ padding: expanded ? '8px 10px 4px' : '8px 6px 4px', flexShrink:0 }}>
        {expanded && (
          <p style={{ margin:'0 0 4px 4px', fontSize:8, fontWeight:700, color:T.dim, letterSpacing:'0.08em' }}>NAVEGAÇÃO</p>
        )}
        {PRIMARY_MODULES.map(m => (
          <SidebarItem
            key={m.id}
            module={m}
            active={activeModule === m.id}
            expanded={expanded}
            onClick={() => onSelect(m.id)}
          />
        ))}
      </div>

      {/* Separator */}
      <div style={{ height:1, background:T.border, margin: expanded ? '0 10px' : '0 8px', flexShrink:0 }}/>

      {/* Mais… toggle */}
      <div style={{ padding: expanded ? '4px 10px' : '4px 6px', flexShrink:0 }}>
        <div
          onClick={() => setMaisOpen(p => !p)}
          title={expanded ? undefined : 'Mais ferramentas'}
          style={{
            display:'flex', alignItems:'center', gap:10,
            padding: expanded ? '9px 14px' : '9px 0',
            justifyContent: expanded ? 'flex-start' : 'center',
            borderRadius:8, cursor:'pointer', marginBottom:2,
            background:'transparent', transition:'background 0.15s',
          }}
        >
          <span style={{ fontSize:18 }}>⋯</span>
          {expanded && (
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:11, fontWeight:700, color:T.dim, lineHeight:1 }}>Mais ferramentas</p>
              <p style={{ margin:'2px 0 0', fontSize:9, color:T.dim, lineHeight:1 }}>Engines, Config, Hubs</p>
            </div>
          )}
          {expanded && (
            <span style={{ fontSize:9, color:T.dim }}>{maisOpen ? '▴' : '▾'}</span>
          )}
        </div>

        {/* Secondary modules (collapsed by default) */}
        {maisOpen && (
          <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:4 }}>
            {SECONDARY_MODULES.map(m => (
              <SidebarItem
                key={m.id}
                module={m}
                active={activeModule === m.id}
                expanded={expanded}
                onClick={() => onSelect(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex:1 }}/>

      {/* Bottom info */}
      {expanded && (
        <div style={{ padding:'10px 14px 12px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1.5 }}>
            {arqState.projectId
              ? <>Objetos: <span style={{ color:'#fff' }}>{arqState.objects.length}</span> · Materiais: <span style={{ color:'#fff' }}>{arqState.materials.length}</span></>
              : 'Crie ou selecione um projeto'
            }
          </p>
        </div>
      )}
    </>
  )
}

export default function ArqWorkspace() {
  return (
    <WorkspaceProvider>
      <WorkspaceInner />
    </WorkspaceProvider>
  )
}

// ─── Inner workspace (reads from context) ─────────────────────────────────────
function WorkspaceInner() {
  const [activeModule,     setActiveModule]     = useState<ModuleId>('home')
  const [expanded,         setExpanded]         = useState(true)
  const [copilotCollapsed, setCopilotCollapsed] = useState(false)

  const { projectCtx, setProjectCtx } = useWorkspaceProject()
  const arqState = useArqProject()

  const sidebarW   = expanded ? 220 : 56
  const projectName = arqState.projectMeta?.titulo ?? projectCtx.name ?? 'Sem projeto'
  const activeLabel = activeModule === 'home'
    ? '🏠 Home'
    : (ALL_MODULES.find(m => m.id === activeModule)?.icon ?? '') + ' ' + (ALL_MODULES.find(m => m.id === activeModule)?.label ?? '')

  // Run AIE against the live project to get the overall score for the badge
  const aieResult    = useMemo(() => runAIE(projectCtx), [projectCtx])
  const overallScore = aieResult.scores.overall
  const badgeColor   = scoreColor(overallScore)

  // Sync WorkspaceContext (used by PromptPlaygroundModule + AIEDashboard) from arqState
  useEffect(() => {
    const ctx = arqState.getProjectContext?.()
    if (ctx) setProjectCtx(ctx)
  }, [arqState.projectId, arqState.objects, arqState.materials, arqState.projectMeta])

  return (
    <ArqProjectContext.Provider value={arqState}>
      <div style={{
        height:'100vh', display:'flex', flexDirection:'column',
        background:T.bg, color:T.text, fontFamily:'system-ui,sans-serif', overflow:'hidden',
      }}>

          {/* ══ TOP BAR ══ */}
          <div style={{
            height:44, flexShrink:0, display:'flex', alignItems:'center',
            borderBottom:`1px solid ${T.border}`, background:T.sidebar, paddingRight:12, gap:0,
          }}>
            {/* Logo area */}
            <div style={{ width:sidebarW, flexShrink:0, display:'flex', alignItems:'center', gap:expanded?10:0, justifyContent:expanded?'flex-start':'center', padding:expanded?'0 14px':'0', transition:'width 0.2s', overflow:'hidden' }}>
              <span style={{ fontSize:18, flexShrink:0 }}>🏛️</span>
              {expanded && (
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:900, color:'#fff', letterSpacing:'-0.01em' }}>arqdor<span style={{ color:T.purpleL }}>.ai</span></p>
                  <p style={{ margin:0, fontSize:8, color:T.dim, letterSpacing:'0.06em' }}>AI WORKSPACE</p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ width:1, height:24, background:T.border, flexShrink:0 }}/>

            {/* Breadcrumb */}
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, paddingLeft:16 }}>
              <span style={{ fontSize:11, color:T.dim }}>{projectName}</span>
              <span style={{ fontSize:11, color:T.dim }}>›</span>
              <span style={{ fontSize:11, color:'#fff', fontWeight:600 }}>{activeLabel}</span>
            </div>

            {/* Status badges + Copilot toggle */}
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {/* Live AIE score chip */}
              <span style={{
                fontSize:9, padding:'3px 8px', borderRadius:10, fontWeight:700,
                background: `${badgeColor}18`, color: badgeColor,
              }}>
                AIE {overallScore}
              </span>

              {arqState.saving && (
                <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(167,139,250,0.12)', color:T.purpleL }}>Salvando…</span>
              )}
              {arqState.projectId && !arqState.saving && (
                <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(74,222,128,0.08)', color:'#4ade80', fontWeight:700 }}>● Sincronizado</span>
              )}
              {!arqState.projectId && !arqState.loading && (
                <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(251,146,60,0.1)', color:'#fb923c', fontWeight:700 }}>Sem projeto</span>
              )}

              <button
                onClick={()=>setCopilotCollapsed(p=>!p)}
                title={copilotCollapsed ? 'Abrir Copilot' : 'Recolher Copilot'}
                style={{
                  padding:'4px 10px', borderRadius:7, border:`1px solid ${copilotCollapsed ? T.border : T.purple}`,
                  background:copilotCollapsed?'transparent':'rgba(124,58,237,0.15)', color:copilotCollapsed?T.dim:T.purpleL,
                  cursor:'pointer', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:5, marginLeft:8
                }}
              >
                🤖 {copilotCollapsed ? 'Copilot' : 'Copilot ▸'}
              </button>
            </div>
          </div>

          {/* ══ BODY ══ */}
          <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

            {/* ── SIDEBAR ── */}
            <div style={{
              width:sidebarW, flexShrink:0, background:T.sidebar,
              borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column',
              transition:'width 0.2s', overflow:'hidden',
            }}>
              {/* Toggle */}
              <div style={{ padding:expanded?'10px 10px 6px':'10px 6px 6px', flexShrink:0 }}>
                <button onClick={() => setExpanded(p => !p)} style={{
                  width:'100%', padding:'6px', borderRadius:6, border:`1px solid ${T.border}`,
                  background:'rgba(255,255,255,0.04)', color:T.dim, cursor:'pointer', fontSize:11,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                }}>
                  {expanded ? '◂ Recolher' : '▸'}
                </button>
              </div>

              <Sidebar
                activeModule={activeModule}
                expanded={expanded}
                arqState={arqState}
                onSelect={setActiveModule}
              />
            </div>

            {/* ── MODULE CONTENT ── */}
            <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
              <Suspense fallback={
                <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:12 }}>
                  Carregando módulo…
                </div>
              }>
                {renderModule(activeModule, arqState, setActiveModule)}
              </Suspense>
            </div>
          </div>

          {/* ── ARQ COPILOT PANEL ── */}
          <ArqCopilot
            collapsed={copilotCollapsed}
            onToggle={() => setCopilotCollapsed(p => !p)}
            nextAction={computeNextAction(arqState, 0)}
          />
      </div>
    </ArqProjectContext.Provider>
  )
}
