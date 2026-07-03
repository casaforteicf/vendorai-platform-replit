import { useState } from 'react'
import { MOCK_MANUFACTURERS } from '../arqhub-mock-data'
import type { HubManufacturer, ManufacturerStatus } from '../arqhub-types'
import { T } from '../../shared/arqdor-theme'


const STATUS_COLOR: Record<ManufacturerStatus,string> = { OFFICIAL:'#4ade80', COMMUNITY:'#fbbf24', PRIVATE:'#a78bfa' }
const STATUS_LABEL: Record<ManufacturerStatus,string> = { OFFICIAL:'Oficial', COMMUNITY:'Comunidade', PRIVATE:'Privado' }

function MfrCard({ m, selected, onSelect }: { m: HubManufacturer; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14, transition:'border 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ width:42, height:42, borderRadius:8, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
          🏭
        </div>
        <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:`${STATUS_COLOR[m.status]}15`, color:STATUS_COLOR[m.status], fontWeight:700 }}>{STATUS_LABEL[m.status]}</span>
      </div>
      <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:800, color:'#fff' }}>{m.name}</p>
      <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim }}>{m.origin}</p>
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' as const }}>
        {m.categories.slice(0,2).map(c=><span key={c} style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{c}</span>)}
        {m.categories.length > 2 && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>+{m.categories.length-2}</span>}
      </div>
    </div>
  )
}

function MfrDetail({ m }: { m: HubManufacturer }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <div style={{ width:56, height:56, borderRadius:10, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>
          🏭
        </div>
        <div>
          <p style={{ margin:'0 0 3px', fontSize:15, fontWeight:900, color:'#fff' }}>{m.name}</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>{m.origin}</p>
          <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:`${STATUS_COLOR[m.status]}15`, color:STATUS_COLOR[m.status], fontWeight:700 }}>{STATUS_LABEL[m.status]}</span>
        </div>
      </div>

      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{m.description}</p>

      <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:12 }}>
        <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DNA</p>
        <p style={{ margin:0, fontSize:11, color:T.text, fontStyle:'italic' as const }}>{m.dna}</p>
      </div>

      {[
        { label:'CATEGORIAS', items: m.categories },
        { label:'PRODUTOS', items: m.products },
        { label:'COLEÇÕES', items: m.collections },
        { label:'ACABAMENTOS', items: m.finishes },
        { label:'MATERIAIS', items: m.materials },
      ].map(({label, items})=>(
        <div key={label} style={{ marginBottom:10 }}>
          <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>{label}</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {items.map(i=><span key={i} style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,0.04)', color:T.text }}>{i}</span>)}
          </div>
        </div>
      ))}

      <a href={`https://${m.site}`} target='_blank' rel='noreferrer'
        style={{ display:'block', width:'100%', padding:'9px', borderRadius:8, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.04)', color:T.text, textAlign:'center' as const, textDecoration:'none', fontSize:11, marginTop:14 }}>
        🌐 {m.site}
      </a>
    </div>
  )
}

export function ManufacturerHubView() {
  const [status, setStatus] = useState<ManufacturerStatus|''>('')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<HubManufacturer|null>(MOCK_MANUFACTURERS[0])

  const filtered = MOCK_MANUFACTURERS.filter(m => {
    if (status && m.status !== status) return false
    if (query) { const q=query.toLowerCase(); return m.name.toLowerCase().includes(q)||m.categories.some(c=>c.toLowerCase().includes(q)) }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar fabricante…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={status} onChange={e=>setStatus(e.target.value as ManufacturerStatus|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:status?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todos os status</option>
          <option value='OFFICIAL'>Oficial</option>
          <option value='COMMUNITY'>Comunidade</option>
          <option value='PRIVATE'>Privado</option>
        </select>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>+ Novo</button>
        <span style={{ fontSize:10, color:T.dim, whiteSpace:'nowrap' as const }}>{filtered.length} fabricantes</span>
      </div>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
            {filtered.map(m=><MfrCard key={m.id} m={m} selected={sel?.id===m.id} onSelect={()=>setSel(m)}/>)}
          </div>
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><MfrDetail m={sel}/></div>}
      </div>
    </div>
  )
}
