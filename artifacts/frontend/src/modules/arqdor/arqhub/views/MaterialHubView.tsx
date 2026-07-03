import { useState } from 'react'
import { MOCK_HUB_MATERIALS } from '../arqhub-mock-data'
import type { HubMaterial, MaterialCategory } from '../arqhub-types'
import { MATERIAL_CATEGORY_LABELS, MATERIAL_CATEGORY_ICONS } from '../arqhub-types'

const T = {
  bg:'#0d0b1e', surface:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)',
  purple:'#7c3aed', purpleL:'#a78bfa', text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

const ALL_CATS = [...new Set(MOCK_HUB_MATERIALS.map(m=>m.category))]

function MatCard({ m, selected, onSelect }: { m: HubMaterial; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, overflow:'hidden',
      border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`,
      background: selected?'rgba(124,58,237,0.07)':T.surface, transition:'border 0.15s' }}>
      {/* Color swatch */}
      <div style={{ height:64, display:'flex' }}>
        {m.palette.map((c,i) => <div key={i} style={{ flex:1, background:c }}/>)}
      </div>
      <div style={{ padding:'10px 10px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{m.name}</p>
        <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{m.manufacturer} · {m.line}</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(124,58,237,0.12)', color:T.purpleL }}>
            {MATERIAL_CATEGORY_ICONS[m.category]} {MATERIAL_CATEGORY_LABELS[m.category]}
          </span>
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.dim }}>
            {m.finish}
          </span>
        </div>
      </div>
    </div>
  )
}

function MatDetail({ m }: { m: HubMaterial }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      {/* Palette */}
      <div style={{ height:80, display:'flex', borderRadius:8, overflow:'hidden', marginBottom:14, border:`1px solid ${T.border}` }}>
        {m.palette.map((c,i) => <div key={i} style={{ flex:1, background:c, position:'relative' as const }}>
          <span style={{ position:'absolute' as const, bottom:4, left:'50%', transform:'translateX(-50%)', fontSize:8, color:'rgba(255,255,255,0.6)', fontFamily:'monospace' }}>{c}</span>
        </div>)}
      </div>

      <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:800, color:'#fff' }}>{m.name}</p>
      <p style={{ margin:'0 0 12px', fontSize:10, color:T.dim }}>{m.manufacturer} · {m.brand} · {m.line}</p>

      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{m.description}</p>

      {/* Specs grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
        {[
          ['Acabamento', m.finish], ['Textura', m.texture],
          ['Veio', m.grain?'Sim':'Não'], ['Brilho', `${m.gloss}%`],
          ['Código', m.code], ['Visibilidade', m.visibility],
        ].map(([k,v]) => (
          <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <div style={{ flex:1, padding:'8px', borderRadius:6, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.15)', textAlign:'center' as const }}>
          <p style={{ margin:'0 0 2px', fontSize:18, fontWeight:800, color:'#4ade80' }}>{m.projectsUsing}</p>
          <p style={{ margin:0, fontSize:9, color:T.dim }}>projetos</p>
        </div>
        <div style={{ flex:1, padding:'8px', borderRadius:6, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.15)', textAlign:'center' as const }}>
          <p style={{ margin:'0 0 2px', fontSize:18, fontWeight:800, color:T.purpleL }}>{m.visualWeight}</p>
          <p style={{ margin:0, fontSize:9, color:T.dim }}>peso visual</p>
        </div>
      </div>

      {/* Design Intent */}
      {m.designIntent.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DESIGN INTENT</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {m.designIntent.map(d => <span key={d} style={{ padding:'3px 8px', borderRadius:8, fontSize:10, background:'rgba(167,139,250,0.1)', color:T.purpleL }}>{d}</span>)}
          </div>
        </div>
      )}

      {/* Tags */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        {m.tags.map(t => <span key={t} style={{ padding:'2px 6px', borderRadius:5, fontSize:9, background:'rgba(255,255,255,0.04)', color:T.dim }}>#{t}</span>)}
      </div>
    </div>
  )
}

export function MaterialHubView() {
  const [cat, setCat] = useState<MaterialCategory|''>('')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<HubMaterial|null>(MOCK_HUB_MATERIALS[0])

  const filtered = MOCK_HUB_MATERIALS.filter(m => {
    if (cat && m.category !== cat) return false
    if (query && !m.name.toLowerCase().includes(query.toLowerCase()) &&
        !m.manufacturer.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Toolbar */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar material…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
            color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={cat} onChange={e=>setCat(e.target.value as MaterialCategory|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
            color:cat?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todas as categorias</option>
          {ALL_CATS.map(c=><option key={c} value={c}>{MATERIAL_CATEGORY_ICONS[c]} {MATERIAL_CATEGORY_LABELS[c]}</option>)}
        </select>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' as const }}>+ Novo</button>
        <span style={{ fontSize:10, color:T.dim, whiteSpace:'nowrap' as const }}>{filtered.length} materiais</span>
      </div>

      {/* Category pills */}
      <div style={{ padding:'8px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:4, overflowX:'auto' as const }}>
        <button onClick={()=>setCat('')} style={{ padding:'3px 10px', borderRadius:10, border:`1px solid ${!cat?T.purple:T.border}`, background:!cat?'rgba(124,58,237,0.15)':'transparent', color:!cat?T.purpleL:T.dim, fontSize:10, cursor:'pointer', whiteSpace:'nowrap' as const }}>Todos</button>
        {ALL_CATS.map(c=>(
          <button key={c} onClick={()=>setCat(c===cat?'':c)} style={{ padding:'3px 10px', borderRadius:10, border:`1px solid ${cat===c?T.purple:T.border}`, background:cat===c?'rgba(124,58,237,0.15)':'transparent', color:cat===c?T.purpleL:T.dim, fontSize:10, cursor:'pointer', whiteSpace:'nowrap' as const }}>
            {MATERIAL_CATEGORY_ICONS[c]} {MATERIAL_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
            {filtered.map(m=><MatCard key={m.id} m={m} selected={sel?.id===m.id} onSelect={()=>setSel(m)}/>)}
            {filtered.length===0 && <p style={{ gridColumn:'1/-1', textAlign:'center' as const, color:T.dim, padding:40, fontSize:12 }}>Nenhum material encontrado.</p>}
          </div>
        </div>
        {sel && <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><MatDetail m={sel}/></div>}
      </div>
    </div>
  )
}
