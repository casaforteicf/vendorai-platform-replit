import { useState, Suspense, lazy } from 'react'
import { LibraryModule }      from './modules/LibraryModule'
import { PromptPlaygroundModule } from './modules/PromptPlaygroundModule'
import { RenderHistoryModule } from './modules/RenderHistoryModule'
import { AIReviewModule }      from './modules/AIReviewModule'
import { AICorrectionsModule } from './modules/AICorrectionsModule'
import { AIMemoryModule }      from './modules/AIMemoryModule'
import { SettingsModule }      from './modules/SettingsModule'
import { ProjectModule }       from './modules/ProjectModule'
import { ArqHubView }         from '../arqhub/ArqHubView'

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:      '#0d0b1e',
  surface: '#100e26',
  sidebar: '#0a0819',
  border:  'rgba(255,255,255,0.07)',
  purple:  '#7c3aed',
  purpleL: '#a78bfa',
  text:    'rgba(255,255,255,0.88)',
  dim:     'rgba(255,255,255,0.38)',
} as const

// ─── Module definitions ───────────────────────────────────────────────────────
type ModuleId = 'projeto' | 'biblioteca' | 'prompt' | 'renders' | 'ai-review' | 'correcoes' | 'memoria' | 'config' | 'arqhub'

interface WorkspaceModule {
  id:      ModuleId
  icon:    string
  label:   string
  desc:    string
  badge?:  string
  badgeColor?: string
}

const MODULES: WorkspaceModule[] = [
  { id:'projeto',    icon:'🏗️',  label:'Projeto',      desc:'Modelagem inteligente'    },
  { id:'biblioteca', icon:'📚',  label:'Biblioteca',   desc:'Materiais e objetos'       },
  { id:'prompt',     icon:'⚡',  label:'Prompt',        desc:'Playground interativo'    },
  { id:'renders',    icon:'🎬',  label:'Renders',       desc:'Histórico completo',  badge:'5' },
  { id:'ai-review',  icon:'🔍',  label:'AI Review',     desc:'Análise comparativa',  badge:'1', badgeColor:'#f87171' },
  { id:'correcoes',  icon:'🔄',  label:'Correções',     desc:'Prompts de ajuste',    badge:'4', badgeColor:'#fb923c' },
  { id:'memoria',    icon:'🧠',  label:'Memória IA',    desc:'Preferências aprendidas'  },
  { id:'config',     icon:'⚙️',  label:'Config',        desc:'Providers e plugins'      },
  { id:'arqhub',     icon:'🌐',  label:'ARQ HUB',       desc:'Ecosystem inteligente',   badge:'NEW', badgeColor:'#4ade80' },
]

function renderModule(id: ModuleId) {
  switch (id) {
    case 'projeto':    return <ProjectModule/>
    case 'biblioteca': return <LibraryModule/>
    case 'prompt':     return <PromptPlaygroundModule/>
    case 'renders':    return <RenderHistoryModule/>
    case 'ai-review':  return <AIReviewModule/>
    case 'correcoes':  return <AICorrectionsModule/>
    case 'memoria':    return <AIMemoryModule/>
    case 'config':     return <SettingsModule/>
    case 'arqhub':     return <ArqHubView/>
  }
}

// ─── Sidebar item ─────────────────────────────────────────────────────────────
function SidebarItem({
  module, active, expanded, onClick,
}: {
  module: WorkspaceModule; active: boolean; expanded: boolean; onClick: ()=>void
}) {
  return (
    <div
      onClick={onClick}
      title={expanded ? undefined : module.label}
      style={{
        display:'flex', alignItems:'center', gap:10, padding: expanded ? '9px 14px' : '9px 0',
        justifyContent: expanded ? 'flex-start' : 'center',
        borderRadius:8, cursor:'pointer', marginBottom:2,
        background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
        transition:'background 0.15s',
        position:'relative',
      }}
    >
      {/* Active indicator */}
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
          background: module.badgeColor ? `rgba(${module.badgeColor === '#f87171' ? '248,113,113' : '251,146,60'},0.15)` : 'rgba(124,58,237,0.2)',
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

// ─── ArqWorkspace ─────────────────────────────────────────────────────────────
export default function ArqWorkspace() {
  const [activeModule, setActiveModule] = useState<ModuleId>('projeto')
  const [expanded, setExpanded]         = useState(true)

  const sidebarW = expanded ? 220 : 56

  return (
    <div style={{
      height:'100vh', display:'flex', flexDirection:'column',
      background:T.bg, color:T.text, fontFamily:'system-ui,sans-serif', overflow:'hidden',
    }}>

      {/* ══ TOP BAR ══ */}
      <div style={{
        height:44, flexShrink:0, display:'flex', alignItems:'center',
        borderBottom:`1px solid ${T.border}`, background:T.sidebar, paddingRight:16, gap:0,
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
          <span style={{ fontSize:11, color:T.dim }}>Apartamento Alpha</span>
          <span style={{ fontSize:11, color:T.dim }}>›</span>
          <span style={{ fontSize:11, color:'#fff', fontWeight:600 }}>
            {MODULES.find(m=>m.id===activeModule)?.icon} {MODULES.find(m=>m.id===activeModule)?.label}
          </span>
        </div>

        {/* Badges */}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(74,222,128,0.1)', color:'#4ade80', fontWeight:700 }}>DEMO</span>
          <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(124,58,237,0.15)', color:T.purpleL }}>Mock Providers</span>
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
            <button onClick={()=>setExpanded(p=>!p)} style={{
              width:'100%', padding:'6px', borderRadius:6, border:`1px solid ${T.border}`,
              background:'rgba(255,255,255,0.04)', color:T.dim, cursor:'pointer', fontSize:11,
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            }}>
              {expanded ? '◂ Recolher' : '▸'}
            </button>
          </div>

          {/* Module nav */}
          <div style={{ flex:1, overflowY:'auto', padding:expanded?'4px 10px':'4px 6px' }}>
            {MODULES.map(m => (
              <SidebarItem
                key={m.id}
                module={m}
                active={activeModule===m.id}
                expanded={expanded}
                onClick={()=>setActiveModule(m.id)}
              />
            ))}
          </div>

          {/* Bottom info */}
          {expanded && (
            <div style={{ padding:'10px 14px 12px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
              <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1.5 }}>
                Plugin System Ativo<br/>
                <span style={{ color:'#4ade80' }}>● Mock Providers</span>
              </p>
            </div>
          )}
        </div>

        {/* ── MODULE CONTENT ── */}
        <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
          <Suspense fallback={
            <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:12 }}>
              Carregando módulo…
            </div>
          }>
            {renderModule(activeModule)}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
