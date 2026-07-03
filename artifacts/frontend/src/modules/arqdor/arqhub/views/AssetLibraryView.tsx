import { useState } from 'react'
import { MOCK_ASSETS } from '../arqhub-mock-data'
import type { Asset, AssetType, AssetVisibility, AssetLicense } from '../arqhub-types'
import { ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from '../arqhub-types'
import { T } from '../../shared/arqdor-theme'


const LICENSE_COLOR: Record<AssetLicense,string> = { FREE:'#4ade80', PREMIUM:'#fbbf24', COMMERCIAL:'#60a5fa', OPEN:'#a78bfa' }
const VISIBILITY_COLOR: Record<AssetVisibility,string> = { PRIVATE:'#f87171', COMPANY:'#fbbf24', COMMUNITY:'#4ade80', MARKETPLACE:'#60a5fa' }

const ALL_TYPES = [...new Set(MOCK_ASSETS.map(a=>a.type))]

function AssetCard({ a, selected, onSelect }: { a: Asset; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14, transition:'border 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <span style={{ fontSize:26 }}>{ASSET_TYPE_ICONS[a.type]}</span>
        <div style={{ display:'flex', flexDirection:'column' as const, gap:3, alignItems:'flex-end' }}>
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:`${LICENSE_COLOR[a.license]}15`, color:LICENSE_COLOR[a.license], fontWeight:700 }}>{a.license}</span>
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:`${VISIBILITY_COLOR[a.visibility]}12`, color:VISIBILITY_COLOR[a.visibility] }}>{a.visibility}</span>
        </div>
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{a.name}</p>
      <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{ASSET_TYPE_LABELS[a.type]} · v{a.version}</p>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1, height:3, borderRadius:2, background:'rgba(255,255,255,0.08)' }}>
          <div style={{ height:'100%', width:`${a.visualWeight}%`, borderRadius:2, background:T.purpleL }}/>
        </div>
        <span style={{ fontSize:8, color:T.dim }}>VW {a.visualWeight}</span>
      </div>
    </div>
  )
}

function AssetDetail({ a }: { a: Asset }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <span style={{ fontSize:42 }}>{ASSET_TYPE_ICONS[a.type]}</span>
        <div>
          <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{a.name}</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>por {a.author}</p>
          <div style={{ display:'flex', gap:4 }}>
            <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:`${LICENSE_COLOR[a.license]}15`, color:LICENSE_COLOR[a.license], fontWeight:700 }}>{a.license}</span>
            <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:`${VISIBILITY_COLOR[a.visibility]}12`, color:VISIBILITY_COLOR[a.visibility] }}>{a.visibility}</span>
          </div>
        </div>
      </div>

      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{a.description}</p>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
        {[
          ['Tipo', ASSET_TYPE_LABELS[a.type]], ['Versão', `v${a.version}`],
          ['Categoria', a.category], ['Peso Visual', `${a.visualWeight}`],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {a.designIntent.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DESIGN INTENT</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {a.designIntent.map(d=><span key={d} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(167,139,250,0.1)', color:T.purpleL }}>{d}</span>)}
          </div>
        </div>
      )}

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>VERSÕES ({a.versions.length})</p>
        {a.versions.map(v=>(
          <div key={v.version} style={{ padding:'6px 10px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:4, display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:10, fontFamily:'monospace', color:T.purpleL }}>v{v.version}</span>
            <span style={{ fontSize:9, color:T.dim }}>{v.description}</span>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const, marginBottom:14 }}>
        {a.tags.map(t=><span key={t} style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.04)', color:T.dim }}>#{t}</span>)}
      </div>

      <div style={{ display:'flex', gap:6 }}>
        <button style={{ flex:1, padding:'9px', borderRadius:7, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>📥 Usar Asset</button>
        <button style={{ padding:'9px 12px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:11 }}>✏️</button>
      </div>
    </div>
  )
}

export function AssetLibraryView() {
  const [typeFilter, setTypeFilter] = useState<AssetType|''>('')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<Asset|null>(MOCK_ASSETS[0])

  const filtered = MOCK_ASSETS.filter(a => {
    if (typeFilter && a.type !== typeFilter) return false
    if (query) { const q=query.toLowerCase(); return a.name.toLowerCase().includes(q)||a.tags.some(t=>t.includes(q)) }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar asset…"
          style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as AssetType|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:typeFilter?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todos os tipos</option>
          {ALL_TYPES.map(t=><option key={t} value={t}>{ASSET_TYPE_ICONS[t]} {ASSET_TYPE_LABELS[t]}</option>)}
        </select>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>+ Novo Asset</button>
        <span style={{ fontSize:10, color:T.dim }}>{filtered.length} assets</span>
      </div>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {filtered.map(a=><AssetCard key={a.id} a={a} selected={sel?.id===a.id} onSelect={()=>setSel(a)}/>)}
            {filtered.length===0 && <p style={{ gridColumn:'1/-1', textAlign:'center' as const, color:T.dim, padding:40, fontSize:12 }}>Nenhum asset encontrado.</p>}
          </div>
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><AssetDetail a={sel}/></div>}
      </div>
    </div>
  )
}
