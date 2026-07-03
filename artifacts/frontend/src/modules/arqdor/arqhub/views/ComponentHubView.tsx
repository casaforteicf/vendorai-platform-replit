import { useState } from 'react'
import { MOCK_COMPONENTS } from '../../core/component-library/component-mock-data'
import { COMPONENT_CATEGORY_LABELS, REPLACEMENT_BEHAVIOR_LABELS, REPLACEMENT_BEHAVIOR_ICONS } from '../../core/component-library/component-types'
import type { ComponentItem, ComponentCategory } from '../../core/component-library/component-types'
import { T } from '../../shared/arqdor-theme'


const CAT_ICON: Partial<Record<ComponentCategory,string>> = {
  KITCHEN:'🍳',CABINETRY:'🗄️',BED:'🛏️',MATTRESS:'😴',SOFA:'🛋️',ARMCHAIR:'🪑',
  CHAIR:'🪑',TABLE:'🪵',APPLIANCE:'🔌',COOKTOP:'🔥',OVEN:'♨️',MICROWAVE:'📡',
  REFRIGERATOR:'❄️',WASHER:'🫧',SINK:'🚰',FAUCET:'🚿',HANDLE:'🔩',HARDWARE:'🔧',
  LIGHTING:'💡',FLOORING:'🟫',WALL_COVERING:'🧱',STONE:'🪨',DOOR:'🚪',WINDOW:'🪟',
  FRAME:'🪟',DECOR:'🎨',PLANT:'🌿',CUSTOM:'⚙️',
}

const ALL_CATS = [...new Set(MOCK_COMPONENTS.map(c=>c.category))]
const ALL_MFRS = [...new Set(MOCK_COMPONENTS.map(c=>c.manufacturer))].sort()

function CompCard({ c, selected, onSelect }: { c: ComponentItem; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:12, transition:'border 0.15s' }}>
      <div style={{ height:56, borderRadius:7, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10, fontSize:22 }}>
        {CAT_ICON[c.category]??'📦'}
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{c.name}</p>
      <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{c.manufacturer} · {c.brand}</p>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(124,58,237,0.12)', color:T.purpleL }}>{COMPONENT_CATEGORY_LABELS[c.category]}</span>
        <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.dim }}>{REPLACEMENT_BEHAVIOR_ICONS[c.replacementBehavior]}</span>
      </div>
    </div>
  )
}

function CompDetail({ c }: { c: ComponentItem }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ height:80, borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14, fontSize:40 }}>
        {CAT_ICON[c.category]??'📦'}
      </div>
      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{c.name}</p>
      <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>{c.manufacturer} — {c.brand}</p>
      {c.code && <p style={{ margin:'0 0 12px', fontSize:9, fontFamily:'monospace', color:T.dim }}>{c.code}</p>}
      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{c.description}</p>

      {/* Behavior */}
      <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', marginBottom:14 }}>
        <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>COMPORTAMENTO PADRÃO</p>
        <p style={{ margin:0, fontSize:11, color:T.purpleL }}>
          {REPLACEMENT_BEHAVIOR_ICONS[c.replacementBehavior]} {REPLACEMENT_BEHAVIOR_LABELS[c.replacementBehavior]}
        </p>
      </div>

      {/* Dimensions */}
      {c.dimensions && (
        <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:14 }}>
          <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DIMENSÕES</p>
          <p style={{ margin:0, fontSize:11, color:T.text, fontFamily:'monospace' }}>{c.dimensions.width} × {c.dimensions.height} × {c.dimensions.depth} {c.dimensions.unit}</p>
        </div>
      )}

      {/* Materials */}
      {c.materials.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>MATERIAIS</p>
          {c.materials.map((m,i) => <p key={i} style={{ margin:'0 0 4px', fontSize:10, color:T.text }}>· {m.name} — {m.finish}{m.color?` (${m.color})`:''}</p>)}
        </div>
      )}

      {/* Compatible */}
      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>COMPATÍVEL COM</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {c.compatibleObjectCategories.map(cat=>(
            <span key={cat} style={{ padding:'2px 7px', borderRadius:7, fontSize:9, background:'rgba(74,222,128,0.08)', color:'#4ade80', border:'1px solid rgba(74,222,128,0.15)' }}>
              {CAT_ICON[cat]??'📦'} {COMPONENT_CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        {c.tags.map(t=><span key={t} style={{ padding:'2px 6px', borderRadius:5, fontSize:9, background:'rgba(255,255,255,0.04)', color:T.dim }}>#{t}</span>)}
      </div>
    </div>
  )
}

export function ComponentHubView() {
  const [cat, setCat] = useState<ComponentCategory|''>('')
  const [mfr, setMfr] = useState('')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<ComponentItem|null>(MOCK_COMPONENTS[0])

  const filtered = MOCK_COMPONENTS.filter(c => {
    if (cat && c.category !== cat) return false
    if (mfr && c.manufacturer !== mfr) return false
    if (query) { const q=query.toLowerCase(); return c.name.toLowerCase().includes(q)||c.manufacturer.toLowerCase().includes(q)||c.tags.some(t=>t.includes(q)) }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Toolbar */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar componente…"
          style={{ flex:1, minWidth:140, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={cat} onChange={e=>setCat(e.target.value as ComponentCategory|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:cat?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Categoria</option>
          {ALL_CATS.map(c=><option key={c} value={c}>{COMPONENT_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={mfr} onChange={e=>setMfr(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:mfr?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Fabricante</option>
          {ALL_MFRS.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' as const }}>+ Novo</button>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{filtered.length}/{MOCK_COMPONENTS.length}</span>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12 }}>
            {filtered.map(c=><CompCard key={c.id} c={c} selected={sel?.id===c.id} onSelect={()=>setSel(c)}/>)}
            {filtered.length===0 && <p style={{ gridColumn:'1/-1', textAlign:'center' as const, color:T.dim, padding:40, fontSize:12 }}>Nenhum componente encontrado.</p>}
          </div>
        </div>
        {sel && <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><CompDetail c={sel}/></div>}
      </div>
    </div>
  )
}
