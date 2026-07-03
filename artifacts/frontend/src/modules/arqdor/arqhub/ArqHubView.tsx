import { useState } from 'react'
import { MaterialHubView }      from './views/MaterialHubView'
import { ComponentHubView }     from './views/ComponentHubView'
import { SpaceHubView }         from './views/SpaceHubView'
import { StyleHubView }         from './views/StyleHubView'
import { ManufacturerHubView }  from './views/ManufacturerHubView'
import { AssetLibraryView }     from './views/AssetLibraryView'
import { MarketplaceView }      from './views/MarketplaceView'
import { AiHubView }            from './views/AiHubView'
import type { HubSectionId }    from './arqhub-types'
import { T } from '../shared/arqdor-theme'


// ─── Nav sections ─────────────────────────────────────────────────────────────

interface NavSection {
  id:     HubSectionId
  icon:   string
  label:  string
  desc:   string
  badge?: string
  badgeColor?: string
}

const NAV_SECTIONS: NavSection[] = [
  { id:'materiais',   icon:'🪵', label:'Materiais',    desc:'Biblioteca de acabamentos'    },
  { id:'componentes', icon:'🧩', label:'Componentes',  desc:'Catálogo de produtos reais'   },
  { id:'ambientes',   icon:'🏠', label:'Ambientes',    desc:'Templates de espaços'         },
  { id:'estilos',     icon:'🎨', label:'Estilos',      desc:'DNA visual de projetos'       },
  { id:'fabricantes', icon:'🏭', label:'Fabricantes',  desc:'Marcas e catálogos'           },
  { id:'assets',      icon:'📦', label:'Assets',       desc:'Biblioteca de ativos'         },
  { id:'marketplace', icon:'🛍️', label:'Marketplace',  desc:'Comprar e compartilhar', badge:'6', badgeColor:'#fb923c' },
  { id:'ia',          icon:'🤖', label:'IA',           desc:'Tradutores e engines'         },
]

const SECTION_LABELS: Record<HubSectionId, string> = {
  materiais:'Material Hub', componentes:'Component Hub', ambientes:'Space Hub',
  estilos:'Style Hub', fabricantes:'Manufacturer Hub', assets:'Asset Library',
  marketplace:'Marketplace', ia:'AI Hub',
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({ s, active, onClick }: { s: NavSection; active: boolean; onClick: ()=>void }) {
  return (
    <button
      onClick={onClick}
      title={s.label}
      style={{
        width:'100%', display:'flex', alignItems:'center', gap:10,
        padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
        background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
        color: active ? '#fff' : T.dim,
        textAlign:'left' as const,
        marginBottom:2,
        transition:'background 0.15s',
        position:'relative' as const,
      }}
    >
      <span style={{ fontSize:18, flexShrink:0 }}>{s.icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:'0 0 1px', fontSize:11, fontWeight:700, color:active?'#fff':T.text, lineHeight:1 }}>{s.label}</p>
        <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1 }}>{s.desc}</p>
      </div>
      {s.badge && (
        <span style={{
          fontSize:9, padding:'2px 6px', borderRadius:8, fontWeight:700,
          background: s.badgeColor ? `${s.badgeColor}25` : 'rgba(124,58,237,0.2)',
          color: s.badgeColor ?? T.purpleL,
        }}>{s.badge}</span>
      )}
      {active && <div style={{ position:'absolute', left:0, top:'25%', height:'50%', width:3, borderRadius:'0 2px 2px 0', background:T.purple }}/>}
    </button>
  )
}

// ─── View router ──────────────────────────────────────────────────────────────

function renderSection(id: HubSectionId) {
  switch (id) {
    case 'materiais':   return <MaterialHubView/>
    case 'componentes': return <ComponentHubView/>
    case 'ambientes':   return <SpaceHubView/>
    case 'estilos':     return <StyleHubView/>
    case 'fabricantes': return <ManufacturerHubView/>
    case 'assets':      return <AssetLibraryView/>
    case 'marketplace': return <MarketplaceView/>
    case 'ia':          return <AiHubView/>
  }
}

// ─── ARQ HUB View ─────────────────────────────────────────────────────────────

export function ArqHubView() {
  const [active, setActive] = useState<HubSectionId>('materiais')
  const section = NAV_SECTIONS.find(s => s.id === active)!

  return (
    <div style={{ height:'100%', display:'flex', overflow:'hidden', background:T.bg }}>

      {/* Left sidebar */}
      <div style={{
        width:200, flexShrink:0, background:T.sidebar,
        borderRight:`1px solid ${T.border}`,
        display:'flex', flexDirection:'column' as const,
        overflow:'hidden',
      }}>
        {/* Hub header */}
        <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:22 }}>🌐</span>
            <div>
              <p style={{ margin:'0 0 1px', fontSize:13, fontWeight:900, color:'#fff', letterSpacing:'-0.01em' }}>ARQ HUB</p>
              <p style={{ margin:0, fontSize:8, color:T.dim, letterSpacing:'0.08em' }}>INTELLIGENCE ECOSYSTEM</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'8px 8px' }}>
          {NAV_SECTIONS.map(s => (
            <NavItem key={s.id} s={s} active={active===s.id} onClick={()=>setActive(s.id)}/>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 14px 12px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.08em' }}>ECOSYSTEM STATUS</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {['Mock Data','Sem API','Preparado'].map(s=>(
              <span key={s} style={{ fontSize:8, padding:'2px 5px', borderRadius:4, background:'rgba(74,222,128,0.08)', color:'#4ade80' }}>● {s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>

        {/* Section header */}
        <div style={{
          height:44, flexShrink:0, display:'flex', alignItems:'center',
          borderBottom:`1px solid ${T.border}`, paddingLeft:20, paddingRight:16,
          background:'rgba(255,255,255,0.01)', gap:12,
        }}>
          <span style={{ fontSize:20 }}>{section.icon}</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#fff' }}>{SECTION_LABELS[active]}</p>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(124,58,237,0.12)', color:T.purpleL }}>
              {section.desc}
            </span>
            <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(251,146,60,0.1)', color:'#fb923c' }}>
              BETA
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflow:'hidden' }}>
          {renderSection(active)}
        </div>
      </div>
    </div>
  )
}
