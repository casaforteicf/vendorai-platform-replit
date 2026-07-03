import { useState } from 'react'
import { MOCK_COMPONENTS, MOCK_MANUFACTURERS, MOCK_CATEGORIES } from '../../core/component-library/component-mock-data'
import { filterComponents, compatibilityColor } from '../../core/component-library/component-engine'
import type { ComponentItem, ComponentCategory } from '../../core/component-library/component-types'
import { COMPONENT_CATEGORY_LABELS, REPLACEMENT_BEHAVIOR_LABELS, REPLACEMENT_BEHAVIOR_ICONS } from '../../core/component-library/component-types'

const T = {
  bg:'#0d0b1e', surface:'#13102b', card:'rgba(255,255,255,0.04)',
  border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

const CAT_ICON: Partial<Record<ComponentCategory,string>> = {
  KITCHEN:'🍳', CABINETRY:'🗄️', BED:'🛏️', MATTRESS:'😴', SOFA:'🛋️',
  ARMCHAIR:'🪑', CHAIR:'🪑', TABLE:'🪵', APPLIANCE:'🔌', COOKTOP:'🔥',
  OVEN:'♨️', MICROWAVE:'📡', REFRIGERATOR:'❄️', WASHER:'🫧', SINK:'🚰',
  FAUCET:'🚿', HANDLE:'🔩', HARDWARE:'🔧', LIGHTING:'💡', FLOORING:'🟫',
  WALL_COVERING:'🧱', STONE:'🪨', DOOR:'🚪', WINDOW:'🪟', FRAME:'🪟',
  DECOR:'🎨', PLANT:'🌿', CUSTOM:'⚙️',
}

function ComponentCard({
  component, selected, onSelect,
}: { component: ComponentItem; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius:10, padding:'12px', cursor:'pointer',
        background: selected ? 'rgba(124,58,237,0.1)' : T.card,
        border:`1px solid ${selected ? 'rgba(124,58,237,0.4)' : T.border}`,
        transition:'border-color 0.15s',
      }}
    >
      {/* Thumbnail placeholder */}
      <div style={{ height:72, borderRadius:7, background:'rgba(255,255,255,0.04)', marginBottom:10,
        display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${T.border}`,
        fontSize:24 }}>
        {CAT_ICON[component.category] ?? '📦'}
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>
        {component.name}
      </p>
      <p style={{ margin:'0 0 6px', fontSize:10, color:T.dim }}>{component.manufacturer} · {component.brand}</p>
      {component.line && <p style={{ margin:'0 0 6px', fontSize:10, color:T.dim }}>Linha {component.line}</p>}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:'rgba(124,58,237,0.15)', color:T.purpleL }}>
          {COMPONENT_CATEGORY_LABELS[component.category]}
        </span>
        <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:'rgba(255,255,255,0.05)', color:T.dim }}>
          {REPLACEMENT_BEHAVIOR_ICONS[component.replacementBehavior]}
        </span>
      </div>
    </div>
  )
}

function ComponentDetail({ component, onAssign }: { component: ComponentItem; onAssign?: (c: ComponentItem) => void }) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:'14px' }}>
      {/* Header */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
          <span style={{ fontSize:32 }}>{CAT_ICON[component.category]??'📦'}</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:800, color:'#fff', lineHeight:1.3 }}>{component.name}</p>
            <p style={{ margin:0, fontSize:11, color:T.dim }}>{component.manufacturer} — {component.brand}</p>
          </div>
        </div>
        {component.code && (
          <p style={{ margin:'8px 0 0', fontSize:10, fontFamily:'ui-monospace,monospace', color:T.dim, letterSpacing:'0.04em' }}>
            {component.code}
          </p>
        )}
      </div>

      {/* Category + behavior */}
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' as const }}>
        <span style={{ padding:'3px 9px', borderRadius:10, fontSize:10, background:'rgba(124,58,237,0.15)', color:T.purpleL }}>
          {COMPONENT_CATEGORY_LABELS[component.category]}
        </span>
        <span style={{ padding:'3px 9px', borderRadius:10, fontSize:10, background:'rgba(255,255,255,0.06)', color:T.dim }}>
          {REPLACEMENT_BEHAVIOR_ICONS[component.replacementBehavior]} {REPLACEMENT_BEHAVIOR_LABELS[component.replacementBehavior]}
        </span>
      </div>

      {/* Description */}
      <p style={{ margin:'0 0 12px', fontSize:11, color:T.text, lineHeight:1.65 }}>{component.description}</p>

      {/* Dimensions */}
      {component.dimensions && (
        <div style={{ marginBottom:12, padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DIMENSÕES</p>
          <p style={{ margin:0, fontSize:11, color:T.text, fontFamily:'ui-monospace,monospace' }}>
            {component.dimensions.width} × {component.dimensions.height} × {component.dimensions.depth} {component.dimensions.unit}
          </p>
        </div>
      )}

      {/* Materials */}
      {component.materials.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>MATERIAIS</p>
          {component.materials.map((m,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <div style={{ width:20, height:20, borderRadius:4, background:'rgba(255,255,255,0.1)', border:`1px solid ${T.border}`, flexShrink:0 }}/>
              <p style={{ margin:0, fontSize:10, color:T.text }}>{m.name} — {m.finish}{m.color?` (${m.color})`:''}</p>
            </div>
          ))}
        </div>
      )}

      {/* Colors */}
      {component.colors.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>ACABAMENTOS DISPONÍVEIS</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {component.colors.map(c => (
              <span key={c} style={{ padding:'2px 8px', borderRadius:8, fontSize:10, background:'rgba(255,255,255,0.06)', color:T.text }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Compatible objects */}
      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>COMPATÍVEL COM</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {component.compatibleObjectCategories.map(c => (
            <span key={c} style={{ padding:'2px 8px', borderRadius:8, fontSize:9, background:'rgba(74,222,128,0.08)', color:'#4ade80', border:'1px solid rgba(74,222,128,0.2)' }}>
              {CAT_ICON[c]??'📦'} {COMPONENT_CATEGORY_LABELS[c]}
            </span>
          ))}
        </div>
      </div>

      {/* Tags */}
      {component.tags.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {component.tags.map(t => (
              <span key={t} style={{ padding:'2px 6px', borderRadius:6, fontSize:9, background:'rgba(255,255,255,0.04)', color:T.dim }}>#{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Thumbnail placeholder */}
      <div style={{ height:100, borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
        <p style={{ margin:0, fontSize:11, color:T.dim }}>📷 Imagens do produto — disponíveis após importação de catálogo</p>
      </div>

      {/* Action */}
      <button
        onClick={()=>setShowForm(true)}
        style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}
      >
        🔗 Vincular a Objeto do Projeto
      </button>

      {showForm && (
        <div style={{ marginTop:12, padding:'12px', borderRadius:8, background:'rgba(124,58,237,0.07)', border:`1px solid rgba(124,58,237,0.2)` }}>
          <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:T.purpleL }}>Vincular a objeto</p>
          <p style={{ margin:'0 0 10px', fontSize:10, color:T.dim, lineHeight:1.6 }}>
            Selecione o objeto no painel <strong style={{ color:T.text }}>Projeto Inteligente</strong> e use a aba Componente no inspector para vincular <em>{component.name}</em>.
          </p>
          <button onClick={()=>setShowForm(false)}
            style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>
            Entendido
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ComponentsPanel ─────────────────────────────────────────────────────

export function ComponentsPanel() {
  const [query, setQuery]     = useState('')
  const [cat, setCat]         = useState<ComponentCategory|''>('')
  const [mfr, setMfr]         = useState('')
  const [sel, setSel]         = useState<ComponentItem|null>(MOCK_COMPONENTS[0])
  const [showForm, setShowForm] = useState(false)

  const filtered = filterComponents(MOCK_COMPONENTS, {
    category: cat || undefined,
    manufacturer: mfr || undefined,
    query: query || undefined,
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Sub-header */}
      <div style={{ padding:'0 0 10px', flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar componente…"
            style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
              color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
          <button onClick={()=>setShowForm(true)} style={{
            padding:'5px 12px', borderRadius:6, border:'none', background:T.purple,
            color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' as const,
          }}>+ Novo</button>
        </div>
        {/* Filters */}
        <div style={{ display:'flex', gap:6, overflowX:'auto' as const }}>
          <select value={cat} onChange={e=>setCat(e.target.value as ComponentCategory|'')}
            style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
              color: cat ? T.text : T.dim, fontSize:10, padding:'4px 8px', cursor:'pointer' }}>
            <option value=''>Categoria</option>
            {MOCK_CATEGORIES.map(c => <option key={c} value={c}>{COMPONENT_CATEGORY_LABELS[c]}</option>)}
          </select>
          <select value={mfr} onChange={e=>setMfr(e.target.value)}
            style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
              color: mfr ? T.text : T.dim, fontSize:10, padding:'4px 8px', cursor:'pointer' }}>
            <option value=''>Fabricante</option>
            {MOCK_MANUFACTURERS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {(cat||mfr||query) && (
            <button onClick={()=>{setCat('');setMfr('');setQuery('')}}
              style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:'#f87171', cursor:'pointer', fontSize:10 }}>
              ✕ Limpar
            </button>
          )}
          <span style={{ fontSize:10, color:T.dim, alignSelf:'center', marginLeft:'auto', flexShrink:0 }}>
            {filtered.length}/{MOCK_COMPONENTS.length}
          </span>
        </div>
      </div>

      {/* Body: grid + detail */}
      <div style={{ flex:1, display:'flex', gap:0, overflow:'hidden', borderTop:`1px solid ${T.border}` }}>
        {/* Grid */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'12px 0 12px 0' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, padding:'0 12px 0 0' }}>
            {filtered.map(c => (
              <ComponentCard key={c.id} component={c} selected={sel?.id===c.id} onSelect={()=>setSel(c)}/>
            ))}
            {filtered.length===0 && (
              <div style={{ gridColumn:'1/-1', padding:'40px', textAlign:'center' as const, color:T.dim, fontSize:12 }}>
                Nenhum componente encontrado.
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {sel && (
          <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}` }}>
            <ComponentDetail component={sel}/>
          </div>
        )}
      </div>
    </div>
  )
}
