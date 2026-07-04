// ─── ArqWorkspace — Sprint 5: Product Experience 2.0 ─────────────────────────
// Journey-based navigation, Command Palette (⌘K), Favorites, Keyboard shortcuts.
// Qualquer recurso em menos de 3 cliques ou 2 teclas.

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArqCopilot }            from '../copilot/ui/ArqCopilot'
import { WorkspaceProvider, useWorkspaceProject } from './WorkspaceContext'
import { IntegrationModule }     from './modules/IntegrationModule'
import { LibraryModule }         from './modules/LibraryModule'
import { SmartSpecModule }       from './modules/SmartSpecModule'
import { PromptPlaygroundModule } from './modules/PromptPlaygroundModule'
import { RenderHistoryModule }   from './modules/RenderHistoryModule'
import { AIReviewModule }        from './modules/AIReviewModule'
import { AICorrectionsModule }   from './modules/AICorrectionsModule'
import { AIMemoryModule }        from './modules/AIMemoryModule'
import { SettingsModule }        from './modules/SettingsModule'
import { ProjectModule }         from './modules/ProjectModule'
import { ArqHubView }            from '../arqhub/ArqHubView'
import { AIEDashboard }          from '../engines/aie/dashboard/AIEDashboard'
import { useArqProject, type ArqProjectState } from '../hooks/useArqProject'
import { ProjectHome, computeNextAction } from './project-experience/ProjectHome'
import { ArqCommandPalette }     from './ArqCommandPalette'
import { runAIE }                from '../engines/aie/aie-engine'
import { createContext, useContext, useMemo, Suspense } from 'react'
import { T } from '../shared/arqdor-theme'
import type { ProjectContext } from '../engines/aie/aie-types'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ModuleId =
  | 'home'
  | 'projeto' | 'biblioteca' | 'prompt' | 'renders' | 'cliente'
  | 'especificacao'
  | 'ai-review' | 'correcoes' | 'memoria' | 'config'
  | 'arqhub' | 'ai-intel' | 'integracao'

export type JourneyId = 'create' | 'design' | 'visualize' | 'deliver' | 'business'

interface WorkspaceModule {
  id: ModuleId; icon: string; label: string; desc: string
  badge?: string; badgeColor?: string
}

interface Journey {
  id:      JourneyId
  label:   string
  icon:    string
  color:   string
  modules: ModuleId[]
  key:     string   // keyboard shortcut (1–5)
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const MODULE_MAP: Record<ModuleId, WorkspaceModule> = {
  'home':       { id:'home',       icon:'🏠', label:'Home',           desc:'Dashboard' },
  'projeto':    { id:'projeto',    icon:'🏗️', label:'Projeto',        desc:'Modelagem' },
  'biblioteca': { id:'biblioteca', icon:'📚', label:'Biblioteca',     desc:'Materiais' },
  'prompt':     { id:'prompt',     icon:'⚡', label:'Prompt',         desc:'Playground' },
  'renders':    { id:'renders',    icon:'🎬', label:'Renders',        desc:'Galeria IA' },
  'cliente':    { id:'cliente',    icon:'👤', label:'Portal',         desc:'Cliente' },
  'especificacao':{ id:'especificacao', icon:'✨', label:'Especificação', desc:'Smart Spec', badge:'NEW', badgeColor:'#a78bfa' },
  'ai-review':  { id:'ai-review',  icon:'🔍', label:'AI Review',      desc:'Análise', badge:'1', badgeColor:'#f87171' },
  'correcoes':  { id:'correcoes',  icon:'🔄', label:'Correções',      desc:'Ajustes', badge:'4', badgeColor:'#fb923c' },
  'memoria':    { id:'memoria',    icon:'🧠', label:'Memória IA',     desc:'Preferências' },
  'config':     { id:'config',     icon:'⚙️', label:'Config',         desc:'Providers' },
  'arqhub':     { id:'arqhub',     icon:'🏛️', label:'ARQ HUB',       desc:'Ecosystem', badge:'NEW', badgeColor:'#4ade80' },
  'ai-intel':   { id:'ai-intel',   icon:'🧠', label:'AI Intel',       desc:'AIE Engine', badge:'AIE', badgeColor:'#a78bfa' },
  'integracao': { id:'integracao', icon:'🔗', label:'Integração',     desc:'Connectors' },
}

const JOURNEYS: Journey[] = [
  { id:'create',    label:'CREATE',    icon:'✦',  color:'#a78bfa', modules:['home','projeto','prompt'],                          key:'1' },
  { id:'design',    label:'DESIGN AI', icon:'🤖', color:'#60a5fa', modules:['renders','ai-review','correcoes','memoria'],         key:'2' },
  { id:'visualize', label:'VISUALIZE', icon:'👁',  color:'#34d399', modules:['renders','biblioteca'],                             key:'3' },
  { id:'deliver',   label:'DELIVER',   icon:'📦', color:'#fb923c', modules:['especificacao','cliente'],                          key:'4' },
  { id:'business',  label:'BUSINESS',  icon:'🏛️', color:'#f472b6', modules:['arqhub','ai-intel','config','integracao'],          key:'5' },
]

// Journey default first module
const JOURNEY_DEFAULT: Record<JourneyId, ModuleId> = {
  create:    'home',
  design:    'renders',
  visualize: 'renders',
  deliver:   'especificacao',
  business:  'arqhub',
}

// Given a module, which journey does it belong to?
function journeyOfModule(id: ModuleId): JourneyId {
  for (const j of JOURNEYS) {
    if (j.modules.includes(id)) return j.id
  }
  return 'create'
}

// ─── Favorites hook ───────────────────────────────────────────────────────────
const DEFAULT_FAVS: ModuleId[] = ['home', 'renders', 'especificacao', 'biblioteca']

function useFavorites() {
  const [favs, setFavs] = useState<ModuleId[]>(() => {
    try {
      const raw = localStorage.getItem('arqdor_favorites')
      if (!raw) return DEFAULT_FAVS
      const parsed = JSON.parse(raw) as ModuleId[]
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_FAVS
    } catch { return DEFAULT_FAVS }
  })

  const toggle = useCallback((id: ModuleId) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id].slice(0, 8)
      localStorage.setItem('arqdor_favorites', JSON.stringify(next))
      return next
    })
  }, [])

  return { favs, toggle }
}

// ─── Project context ──────────────────────────────────────────────────────────
export const ArqProjectContext = createContext<ArqProjectState | null>(null)
export function useArqProjectContext(): ArqProjectState | null {
  return useContext(ArqProjectContext)
}

// ─── Score color ──────────────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 85) return '#4ade80'
  if (s >= 70) return '#fbbf24'
  if (s >= 50) return '#fb923c'
  return '#f87171'
}

// ─── Module renderer ──────────────────────────────────────────────────────────
function renderModule(id: ModuleId, arqState: ArqProjectState, setActive: (m: ModuleId) => void) {
  switch (id) {
    case 'home':          return <ProjectHome arqState={arqState} onNavigate={m => setActive(m as ModuleId)} />
    case 'projeto':       return <ProjectModule/>
    case 'biblioteca':    return <LibraryModule/>
    case 'especificacao': return <SmartSpecModule/>
    case 'prompt':        return <PromptPlaygroundModule/>
    case 'renders':       return <RenderHistoryModule/>
    case 'ai-review':     return <AIReviewModule/>
    case 'correcoes':     return <AICorrectionsModule/>
    case 'memoria':       return <AIMemoryModule/>
    case 'config':        return <SettingsModule/>
    case 'arqhub':        return <ArqHubView/>
    case 'ai-intel':      return <AIEDashboard/>
    case 'integracao':    return <IntegrationModule/>
    case 'cliente':       return <IntegrationModule/>
  }
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes aw-fadeIn { from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)} }
  @keyframes aw-pulse  { 0%,100%{opacity:1}50%{opacity:0.5} }
  .aw-journey-tab {
    transition: color 0.15s, background 0.15s, border-color 0.15s !important;
    cursor: pointer;
    position: relative;
  }
  .aw-journey-tab:hover { color: #fff !important; }
  .aw-mod-tab {
    transition: background 0.13s, color 0.13s !important;
    cursor: pointer;
    white-space: nowrap;
  }
  .aw-mod-tab:hover { background: rgba(255,255,255,0.06) !important; color: #fff !important; }
  .aw-fav-btn {
    transition: background 0.13s, transform 0.13s !important;
    cursor: pointer;
  }
  .aw-fav-btn:hover { background: rgba(124,58,237,0.2) !important; transform: scale(1.08) !important; }
  .aw-fav-btn.active { background: rgba(124,58,237,0.22) !important; }
  .aw-cmd-btn {
    transition: background 0.13s, border-color 0.13s !important;
    cursor: pointer;
  }
  .aw-cmd-btn:hover { background: rgba(124,58,237,0.15) !important; border-color: rgba(124,58,237,0.4) !important; }
`

// ─── Favorites Rail ───────────────────────────────────────────────────────────
function FavoritesRail({
  favs, activeModule, onNavigate, onToggle,
}: {
  favs: ModuleId[]; activeModule: ModuleId; onNavigate: (m: ModuleId) => void; onToggle: (m: ModuleId) => void
}) {
  const [showHint, setShowHint] = useState<ModuleId | null>(null)

  return (
    <div style={{
      width:44, flexShrink:0, display:'flex', flexDirection:'column',
      alignItems:'center', gap:2, padding:'8px 0',
      background:T.sidebar, borderRight:`1px solid ${T.border}`,
    }}>
      {/* Star header */}
      <div style={{ padding:'2px 0 6px', borderBottom:`1px solid ${T.border}`, width:'100%', display:'flex', justifyContent:'center', marginBottom:4 }}>
        <span style={{ fontSize:10, color:T.dim }}>★</span>
      </div>

      {favs.map(id => {
        const m = MODULE_MAP[id]
        if (!m) return null
        const isActive = activeModule === id
        return (
          <div key={id} style={{ position:'relative', width:'100%', display:'flex', justifyContent:'center' }}>
            <div
              className={`aw-fav-btn${isActive ? ' active' : ''}`}
              onClick={() => onNavigate(id)}
              onMouseEnter={() => setShowHint(id)}
              onMouseLeave={() => setShowHint(null)}
              style={{
                width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
                background: isActive ? 'rgba(124,58,237,0.22)' : 'transparent',
                fontSize:16, position:'relative',
              }}
            >
              {m.icon}
              {isActive && (
                <div style={{ position:'absolute', left:-4, top:'20%', height:'60%', width:2, borderRadius:'0 1px 1px 0', background:T.purple }}/>
              )}
              {m.badge && (
                <div style={{ position:'absolute', top:0, right:0, width:6, height:6, borderRadius:'50%', background:m.badgeColor ?? T.purpleL }}/>
              )}
            </div>
            {showHint === id && (
              <div style={{
                position:'absolute', left:40, top:'50%', transform:'translateY(-50%)',
                background:'#1a1730', border:`1px solid ${T.border}`, borderRadius:6,
                padding:'4px 10px', whiteSpace:'nowrap', zIndex:100,
                fontSize:11, fontWeight:700, color:'#fff',
                boxShadow:'0 4px 16px rgba(0,0,0,0.5)',
                pointerEvents:'none',
              }}>
                {m.label}
                <div style={{ fontSize:9, color:T.dim, fontWeight:400 }}>clique ★ p/ remover</div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add hint */}
      {favs.length < 8 && (
        <div style={{ marginTop:4, fontSize:9, color:T.dim, textAlign:'center', lineHeight:1.3, padding:'2px 4px' }}>
          ★<br/>pin
        </div>
      )}
    </div>
  )
}

// ─── Journey tabs ──────────────────────────────────────────────────────────────
function JourneyTabs({
  activeJourney, onChange,
}: {
  activeJourney: JourneyId; onChange: (j: JourneyId) => void
}) {
  return (
    <div style={{ display:'flex', alignItems:'stretch', gap:0, height:'100%' }}>
      {JOURNEYS.map(j => {
        const isActive = activeJourney === j.id
        return (
          <div
            key={j.id}
            className="aw-journey-tab"
            onClick={() => onChange(j.id)}
            style={{
              display:'flex', alignItems:'center', gap:6, padding:'0 14px',
              color: isActive ? j.color : T.textSub,
              fontWeight: isActive ? 800 : 600,
              fontSize:11, letterSpacing:'0.05em',
              borderBottom: isActive ? `2px solid ${j.color}` : '2px solid transparent',
              background: isActive ? `${j.color}0d` : 'transparent',
            }}
          >
            <span style={{ fontSize:12 }}>{j.icon}</span>
            {j.label}
            <kbd style={{
              fontSize:8, padding:'1px 4px', borderRadius:3,
              background:'rgba(255,255,255,0.06)', color:T.dim,
              border:`1px solid ${T.border}`,
            }}>{j.key}</kbd>
          </div>
        )
      })}
    </div>
  )
}

// ─── Module sub-nav ────────────────────────────────────────────────────────────
function ModuleSubNav({
  journey, activeModule, onSelect, favs, onToggleFav,
}: {
  journey: Journey; activeModule: ModuleId; onSelect: (m: ModuleId) => void
  favs: ModuleId[]; onToggleFav: (m: ModuleId) => void
}) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:2,
      padding:'0 8px', height:'100%', overflowX:'auto',
    }}>
      {journey.modules.map(id => {
        const m = MODULE_MAP[id]
        if (!m) return null
        const isActive = activeModule === id
        const isFav    = favs.includes(id)
        return (
          <div key={id} style={{ display:'flex', alignItems:'center', gap:0, position:'relative' }}>
            <div
              className="aw-mod-tab"
              onClick={() => onSelect(id)}
              style={{
                display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
                borderRadius:7, fontSize:11, fontWeight: isActive ? 700 : 500,
                background: isActive ? `${journey.color}18` : 'transparent',
                color: isActive ? journey.color : T.textSub,
                border: isActive ? `1px solid ${journey.color}33` : '1px solid transparent',
              }}
            >
              <span style={{ fontSize:13 }}>{m.icon}</span>
              {m.label}
              {m.badge && (
                <span style={{
                  fontSize:8, padding:'1px 4px', borderRadius:8, fontWeight:800,
                  background: m.badgeColor ? `${m.badgeColor}22` : 'rgba(124,58,237,0.2)',
                  color: m.badgeColor ?? T.purpleL,
                }}>{m.badge}</span>
              )}
            </div>
            {/* Pin/unpin star */}
            <button
              onClick={() => onToggleFav(id)}
              title={isFav ? 'Remover dos favoritos' : 'Fixar nos favoritos'}
              style={{
                background:'none', border:'none', cursor:'pointer', padding:'2px 3px',
                fontSize:9, color: isFav ? T.amber : T.dim, opacity: isFav ? 1 : 0.5,
                transition:'opacity 0.15s, color 0.15s',
              }}
            >
              ★
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Project Selector (top bar) ───────────────────────────────────────────────
function ProjectSelectorCompact({ arqState }: { arqState: ArqProjectState }) {
  const [open, setOpen]       = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    try { await arqState.createProject(newTitle.trim()); setNewTitle(''); setOpen(false) }
    finally { setCreating(false) }
  }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        className="aw-cmd-btn"
        onClick={() => setOpen(p => !p)}
        style={{
          display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
          border:`1px solid ${T.border}`, borderRadius:7, background:'rgba(255,255,255,0.04)',
          cursor:'pointer', maxWidth:200,
        }}
      >
        <span style={{ fontSize:10 }}>📁</span>
        <span style={{ fontSize:10, color:'#fff', fontWeight:600, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {arqState.loading ? 'Carregando…' : (arqState.projectMeta?.titulo ?? 'Selecionar projeto')}
        </span>
        <span style={{ fontSize:8, color:T.dim, flexShrink:0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', left:0, width:240, zIndex:500,
          background:'#13112a', border:`1px solid ${T.border}`, borderRadius:10,
          boxShadow:'0 12px 40px rgba(0,0,0,0.6)', overflow:'hidden',
          animation:'aw-fadeIn 0.15s ease',
        }}>
          <div style={{ maxHeight:200, overflowY:'auto' }}>
            {arqState.projects.map(p => (
              <button key={p.id} onClick={() => { arqState.selectProject(p.id); setOpen(false) }} style={{
                width:'100%', textAlign:'left', padding:'8px 12px', border:'none',
                background: p.id === arqState.projectId ? 'rgba(124,58,237,0.18)' : 'transparent',
                cursor:'pointer', display:'block',
              }}>
                <p style={{ margin:0, fontSize:11, color:'#fff', fontWeight:600 }}>{p.titulo}</p>
                <p style={{ margin:0, fontSize:9, color:T.dim }}>{p.tipoObra ?? p.status ?? ''}</p>
              </button>
            ))}
            {arqState.projects.length === 0 && (
              <p style={{ margin:0, padding:'10px 12px', fontSize:10, color:T.dim }}>Nenhum projeto ainda</p>
            )}
          </div>
          <div style={{ borderTop:`1px solid ${T.border}`, padding:'8px' }}>
            <div style={{ display:'flex', gap:4 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Novo projeto…"
                style={{ flex:1, padding:'5px 8px', borderRadius:5, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.06)', color:'#fff', fontSize:10, outline:'none' }}
              />
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()} style={{
                padding:'5px 10px', borderRadius:5, border:'none', background:T.purple,
                color:'#fff', cursor:'pointer', fontSize:10, fontWeight:700, opacity:creating||!newTitle.trim()?0.5:1,
              }}>
                {creating ? '…' : '+'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Keyboard shortcuts tooltip ───────────────────────────────────────────────
function ShortcutsToast({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div style={{
      position:'fixed', bottom:20, right:20, zIndex:800,
      background:'#13112a', border:`1px solid ${T.border}`, borderRadius:10,
      padding:'12px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
      animation:'aw-fadeIn 0.2s ease',
    }}>
      <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:800, color:T.purpleL, letterSpacing:'0.05em' }}>
        ATALHOS DE TECLADO
      </p>
      {[
        ['⌘K',    'Command Palette'],
        ['G H',   'Ir para Home'],
        ['G R',   'Ir para Renders'],
        ['G B',   'Ir para Biblioteca'],
        ['G S',   'Especificação'],
        ['G D',   'Portal do Cliente'],
        ['G P',   'Prompt Playground'],
        ['G C',   'Modelagem'],
        ['1 – 5', 'Trocar jornada'],
        ['Esc',   'Fechar overlays'],
      ].map(([k, l]) => (
        <div key={k} style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
          <kbd style={{ padding:'2px 6px', borderRadius:4, fontSize:9, background:'rgba(255,255,255,0.08)', color:T.textSub, border:`1px solid ${T.border}`, minWidth:36, textAlign:'center' }}>{k}</kbd>
          <span style={{ fontSize:10, color:T.textSub }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ArqWorkspace() {
  return (
    <WorkspaceProvider>
      <WorkspaceInner />
    </WorkspaceProvider>
  )
}

// ─── WorkspaceInner ───────────────────────────────────────────────────────────
function WorkspaceInner() {
  const [activeModule,     setActiveModuleRaw]  = useState<ModuleId>('home')
  const [activeJourney,    setActiveJourneyRaw] = useState<JourneyId>('create')
  const [copilotCollapsed, setCopilotCollapsed] = useState(false)
  const [paletteOpen,      setPaletteOpen]      = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)

  const { projectCtx, setProjectCtx } = useWorkspaceProject()
  const arqState = useArqProject()
  const { favs, toggle: toggleFav } = useFavorites()

  // Wrapped setActive: also updates journey when switching to a module
  const setActiveModule = useCallback((m: ModuleId) => {
    setActiveModuleRaw(m)
    setActiveJourneyRaw(journeyOfModule(m))
  }, [])

  const setActiveJourney = useCallback((j: JourneyId) => {
    setActiveJourneyRaw(j)
    setActiveModuleRaw(JOURNEY_DEFAULT[j])
  }, [])

  // AIE score
  const aieResult    = useMemo(() => runAIE(projectCtx), [projectCtx])
  const overallScore = aieResult.scores.overall
  const badgeColor   = scoreColor(overallScore)

  // Sync WorkspaceContext
  useEffect(() => {
    const ctx = arqState.getProjectContext?.()
    if (ctx) setProjectCtx(ctx)
  }, [arqState.projectId, arqState.objects, arqState.materials, arqState.projectMeta])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout>

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      // ⌘K / Ctrl+K → Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(p => !p)
        return
      }

      // Esc → close overlays
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setShortcutsVisible(false)
        return
      }

      // ? → toggle shortcuts tooltip
      if (e.key === '?' && !editing && !e.ctrlKey) {
        setShortcutsVisible(p => !p)
        return
      }

      if (editing) return

      // 1–5 → switch journey
      if (['1','2','3','4','5'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        const j = JOURNEYS[parseInt(e.key) - 1]
        if (j) setActiveJourney(j.id)
        return
      }

      // G prefix for "Go to" shortcuts
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
    return () => {
      document.removeEventListener('keydown', handler)
      clearTimeout(gTimer)
    }
  }, [setActiveModule, setActiveJourney])

  const activeJourneyDef = JOURNEYS.find(j => j.id === activeJourney) ?? JOURNEYS[0]

  return (
    <ArqProjectContext.Provider value={arqState}>
      <div style={{
        height:'100vh', display:'flex', flexDirection:'column',
        background:T.bg, color:T.text, fontFamily:'system-ui,sans-serif', overflow:'hidden',
      }}>
        <style>{CSS}</style>

        {/* ══ TOP BAR ══ */}
        <div style={{
          height:44, flexShrink:0, display:'flex', alignItems:'center',
          borderBottom:`1px solid ${T.border}`, background:T.sidebar, gap:0,
        }}>
          {/* Logo */}
          <div style={{ width:130, flexShrink:0, display:'flex', alignItems:'center', gap:8, padding:'0 14px', borderRight:`1px solid ${T.border}` }}>
            <span style={{ fontSize:17 }}>🏛️</span>
            <div>
              <p style={{ margin:0, fontSize:12, fontWeight:900, color:'#fff', letterSpacing:'-0.01em', lineHeight:1 }}>
                arqdor<span style={{ color:T.purpleL }}>.ai</span>
              </p>
              <p style={{ margin:0, fontSize:7, color:T.dim, letterSpacing:'0.08em' }}>AI WORKSPACE</p>
            </div>
          </div>

          {/* Project selector */}
          <div style={{ padding:'0 10px', borderRight:`1px solid ${T.border}` }}>
            <ProjectSelectorCompact arqState={arqState} />
          </div>

          {/* Journey tabs */}
          <div style={{ flex:1, height:'100%', display:'flex', alignItems:'stretch', overflow:'hidden' }}>
            <JourneyTabs activeJourney={activeJourney} onChange={setActiveJourney} />
          </div>

          {/* Right controls */}
          <div style={{ display:'flex', gap:6, alignItems:'center', padding:'0 10px', borderLeft:`1px solid ${T.border}` }}>
            {/* Shortcuts hint */}
            <button
              onClick={() => setShortcutsVisible(p => !p)}
              title="Atalhos de teclado (?)"
              style={{ background:'none', border:'none', cursor:'pointer', color:T.dim, fontSize:12, padding:'4px' }}
            >
              ?
            </button>

            {/* AIE score */}
            <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, fontWeight:700, background:`${badgeColor}18`, color:badgeColor, flexShrink:0 }}>
              AIE {overallScore}
            </span>

            {/* Status */}
            {arqState.saving && (
              <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(167,139,250,0.12)', color:T.purpleL, animation:'aw-pulse 1.5s ease infinite' }}>Salvando…</span>
            )}
            {arqState.projectId && !arqState.saving && (
              <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(74,222,128,0.08)', color:'#4ade80', fontWeight:700 }}>● Sync</span>
            )}
            {!arqState.projectId && !arqState.loading && (
              <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(251,146,60,0.1)', color:'#fb923c', fontWeight:700 }}>Sem projeto</span>
            )}

            {/* ⌘K button */}
            <button
              className="aw-cmd-btn"
              onClick={() => setPaletteOpen(true)}
              style={{
                display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
                border:`1px solid ${T.border}`, borderRadius:7, background:'rgba(255,255,255,0.03)',
                cursor:'pointer', flexShrink:0,
              }}
            >
              <span style={{ fontSize:10, color:T.textSub }}>🔍</span>
              <span style={{ fontSize:9, color:T.dim }}>Pesquisar</span>
              <kbd style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:'rgba(255,255,255,0.08)', color:T.dim, border:`1px solid ${T.border}` }}>⌘K</kbd>
            </button>

            {/* Copilot toggle */}
            <button
              onClick={() => setCopilotCollapsed(p => !p)}
              title={copilotCollapsed ? 'Abrir Copilot' : 'Recolher Copilot'}
              style={{
                padding:'4px 10px', borderRadius:7, border:`1px solid ${copilotCollapsed ? T.border : T.purple}`,
                background:copilotCollapsed?'transparent':'rgba(124,58,237,0.15)', color:copilotCollapsed?T.dim:T.purpleL,
                cursor:'pointer', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:5, flexShrink:0,
              }}
            >
              🤖 {copilotCollapsed ? '' : '▸'}
            </button>
          </div>
        </div>

        {/* ══ MODULE SUB-NAV ══ */}
        <div style={{
          height:36, flexShrink:0, display:'flex', alignItems:'center',
          borderBottom:`1px solid ${T.border}`,
          background:`linear-gradient(180deg, ${activeJourneyDef.color}08 0%, transparent 100%)`,
          paddingLeft:44, // offset for favorites rail
        }}>
          <ModuleSubNav
            journey={activeJourneyDef}
            activeModule={activeModule}
            onSelect={setActiveModule}
            favs={favs}
            onToggleFav={toggleFav}
          />
        </div>

        {/* ══ BODY ══ */}
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* Favorites rail */}
          <FavoritesRail
            favs={favs}
            activeModule={activeModule}
            onNavigate={setActiveModule}
            onToggle={toggleFav}
          />

          {/* Module content */}
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

        {/* ── ARQ COPILOT ── */}
        <ArqCopilot
          collapsed={copilotCollapsed}
          onToggle={() => setCopilotCollapsed(p => !p)}
          nextAction={computeNextAction(arqState, 0)}
        />

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
      </div>
    </ArqProjectContext.Provider>
  )
}
