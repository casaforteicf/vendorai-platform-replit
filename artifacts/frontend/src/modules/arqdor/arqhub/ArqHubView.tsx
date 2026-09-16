import { useState } from 'react'
import { MaterialHubView }      from './views/MaterialHubView'
import { ComponentHubView }     from './views/ComponentHubView'
import { ManufacturerHubView }  from './views/ManufacturerHubView'
import { MarketplaceView }      from './views/MarketplaceView'
import type { HubSectionId }    from './arqhub-types'
import { T } from '../shared/arqdor-theme'

interface NavSection {
  id:     HubSectionId
  icon:   string
  label:  string
  desc:   string
}

// Somente seções com fonte real e ação funcional ficam visíveis no ARQ HUB.
// Ambientes/Estilos/Assets/IA permanecem fora da navegação até terem contratos
// próprios, evitando apresentar catálogo genérico ou registry estático como dado real.
const NAV_SECTIONS: NavSection[] = [
  { id:'materiais',   icon:'🪵', label:'Materiais',    desc:'Catálogo real de acabamentos' },
  { id:'componentes', icon:'🧩', label:'Componentes',  desc:'Produtos reais do catálogo' },
  { id:'fabricantes', icon:'🏭', label:'Fabricantes',  desc:'Fornecedores derivados do catálogo' },
  { id:'marketplace', icon:'🛍️', label:'Marketplace', desc:'Itens publicados no marketplace' },
]

const SECTION_LABELS: Partial<Record<HubSectionId, string>> = {
  materiais:'Material Hub',
  componentes:'Component Hub',
  fabricantes:'Manufacturer Hub',
  marketplace:'Marketplace',
}

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
        <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1.25 }}>{s.desc}</p>
      </div>
      {active && <div style={{ position:'absolute', left:0, top:'25%', height:'50%', width:3, borderRadius:'0 2px 2px 0', background:T.purple }}/>} 
    </button>
  )
}

function renderSection(id: HubSectionId) {
  switch (id) {
    case 'materiais':   return <MaterialHubView/>
    case 'componentes': return <ComponentHubView/>
    case 'fabricantes': return <ManufacturerHubView/>
    case 'marketplace': return <MarketplaceView/>
    default: return null
  }
}

export function ArqHubView() {
  const [active, setActive] = useState<HubSectionId>('materiais')
  const section = NAV_SECTIONS.find(s => s.id === active) ?? NAV_SECTIONS[0]!

  return (
    <div style={{ height:'100%', display:'flex', overflow:'hidden', background:T.bg }}>
      <div style={{
        width:210, flexShrink:0, background:T.sidebar,
        borderRight:`1px solid ${T.border}`,
        display:'flex', flexDirection:'column' as const,
        overflow:'hidden',
      }}>
        <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:22 }}>🌐</span>
            <div>
              <p style={{ margin:'0 0 1px', fontSize:13, fontWeight:900, color:'#fff', letterSpacing:'-0.01em' }}>ARQ HUB</p>
              <p style={{ margin:0, fontSize:8, color:T.dim, letterSpacing:'0.08em' }}>DADOS REAIS DO ECOSSISTEMA</p>
            </div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' as const, padding:'8px 8px' }}>
          {NAV_SECTIONS.map(s => (
            <NavItem key={s.id} s={s} active={active===s.id} onClick={()=>setActive(s.id)}/>
          ))}
        </div>

        <div style={{ padding:'10px 14px 12px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ padding:'8px 10px', borderRadius:8, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.12)' }}>
            <p style={{ margin:0, fontSize:9, lineHeight:1.45, color:'#4ade80' }}>
              ● Somente módulos ligados a fontes reais estão visíveis.
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>
        <div style={{
          minHeight:48, flexShrink:0, display:'flex', alignItems:'center',
          borderBottom:`1px solid ${T.border}`, paddingLeft:20, paddingRight:16,
          background:'rgba(255,255,255,0.01)', gap:12,
        }}>
          <span style={{ fontSize:20 }}>{section.icon}</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#fff' }}>{SECTION_LABELS[active] ?? section.label}</p>
          </div>
          <span style={{ fontSize:9, padding:'3px 8px', borderRadius:10, background:'rgba(74,222,128,0.08)', color:'#4ade80' }}>
            Fonte real
          </span>
        </div>

        <div style={{ flex:1, overflow:'hidden' }}>
          {renderSection(active)}
        </div>
      </div>
    </div>
  )
}
