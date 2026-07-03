import { useState } from 'react'
import { MOCK_MARKETPLACE } from '../arqhub-mock-data'
import type { MarketplaceItem, AssetType } from '../arqhub-types'
import { ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from '../arqhub-types'
import { T } from '../../shared/arqdor-theme'


const ALL_TYPES = [...new Set(MOCK_MARKETPLACE.map(m=>m.type))]

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ fontSize:10 }}>
      {[1,2,3,4,5].map(i=>(
        <span key={i} style={{ color: i<=Math.round(rating)?'#fbbf24':'rgba(255,255,255,0.2)' }}>★</span>
      ))}
      <span style={{ color:T.dim, marginLeft:3 }}>{rating.toFixed(1)}</span>
    </span>
  )
}

function MktCard({ item, selected, onSelect }: { item: MarketplaceItem; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':item.featured?'rgba(251,146,60,0.3)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14, transition:'border 0.15s', position:'relative' as const }}>
      {item.featured && <div style={{ position:'absolute' as const, top:8, right:8, fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(251,146,60,0.15)', color:'#fb923c', fontWeight:700 }}>DESTAQUE</div>}
      <span style={{ fontSize:28, display:'block', marginBottom:10 }}>{ASSET_TYPE_ICONS[item.type]}</span>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3, paddingRight:8 }}>{item.name}</p>
      <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>por {item.author} · {ASSET_TYPE_LABELS[item.type]}</p>
      <StarRating rating={item.rating}/>
      <p style={{ margin:'6px 0 0', fontSize:9, color:T.dim }}>{item.downloads.toLocaleString('pt-BR')} downloads · {item.reviews} reviews</p>
      <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        {item.price === null
          ? <span style={{ fontSize:13, fontWeight:800, color:'#4ade80' }}>Grátis</span>
          : <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>R$ {item.price}</span>
        }
        <button onClick={e=>{e.stopPropagation()}} style={{ padding:'4px 10px', borderRadius:6, border:'none', background:item.price===null?'rgba(74,222,128,0.15)':T.purple, color:item.price===null?'#4ade80':'#fff', cursor:'pointer', fontSize:10, fontWeight:700 }}>
          {item.price===null?'↓ Grátis':'Comprar'}
        </button>
      </div>
    </div>
  )
}

function MktDetail({ item }: { item: MarketplaceItem }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <span style={{ fontSize:40 }}>{ASSET_TYPE_ICONS[item.type]}</span>
        <div style={{ flex:1 }}>
          <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{item.name}</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>por {item.author}</p>
          <StarRating rating={item.rating}/>
        </div>
      </div>

      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.description}</p>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
        {[
          ['Tipo', ASSET_TYPE_LABELS[item.type]],
          ['Downloads', item.downloads.toLocaleString('pt-BR')],
          ['Reviews', item.reviews.toString()],
          ['Licença', item.license],
          ['Versão', `v${item.version}`],
          ['Visibilidade', item.visibility],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {item.designIntent.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DESIGN INTENT</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {item.designIntent.map(d=><span key={d} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(167,139,250,0.1)', color:T.purpleL }}>{d}</span>)}
          </div>
        </div>
      )}

      <div style={{ marginBottom:14, display:'flex', gap:4, flexWrap:'wrap' as const }}>
        {item.tags.map(t=><span key={t} style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.04)', color:T.dim }}>#{t}</span>)}
      </div>

      {/* Price action */}
      <div style={{ padding:'14px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, textAlign:'center' as const }}>
        <p style={{ margin:'0 0 8px', fontSize:22, fontWeight:900, color: item.price===null?'#4ade80':'#fff' }}>
          {item.price===null?'Grátis':`R$ ${item.price}`}
        </p>
        <button style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:item.price===null?'rgba(74,222,128,0.2)':T.purple, color:item.price===null?'#4ade80':'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
          {item.price===null?'📥 Download Gratuito':'🛍️ Comprar Agora'}
        </button>
        {item.price !== null && <p style={{ margin:'6px 0 0', fontSize:9, color:T.dim }}>Marketplace · Sem integração de pagamento ainda</p>}
      </div>
    </div>
  )
}

export function MarketplaceView() {
  const [typeFilter, setTypeFilter] = useState<AssetType|''>('')
  const [priceFilter, setPriceFilter] = useState<'all'|'free'|'paid'>('all')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<MarketplaceItem|null>(MOCK_MARKETPLACE[0])

  const filtered = MOCK_MARKETPLACE.filter(m => {
    if (typeFilter && m.type !== typeFilter) return false
    if (priceFilter==='free' && m.price !== null) return false
    if (priceFilter==='paid' && m.price === null) return false
    if (query) { const q=query.toLowerCase(); return m.name.toLowerCase().includes(q)||m.tags.some(t=>t.includes(q)) }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Notice banner */}
      <div style={{ padding:'8px 16px', background:'rgba(96,165,250,0.05)', borderBottom:`1px solid rgba(96,165,250,0.15)`, flexShrink:0 }}>
        <p style={{ margin:0, fontSize:10, color:'#60a5fa' }}>
          🛍️ <strong>Marketplace em desenvolvimento</strong> — Estrutura sem backend. Pagamentos e downloads não estão conectados ainda.
        </p>
      </div>

      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar no marketplace…"
          style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as AssetType|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:typeFilter?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Categoria</option>
          {ALL_TYPES.map(t=><option key={t} value={t}>{ASSET_TYPE_ICONS[t]} {ASSET_TYPE_LABELS[t]}</option>)}
        </select>
        <div style={{ display:'flex', gap:3 }}>
          {(['all','free','paid'] as const).map(p=>(
            <button key={p} onClick={()=>setPriceFilter(p)} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${priceFilter===p?T.purple:T.border}`, background:priceFilter===p?'rgba(124,58,237,0.15)':'transparent', color:priceFilter===p?T.purpleL:T.dim, cursor:'pointer', fontSize:10 }}>
              {p==='all'?'Todos':p==='free'?'Grátis':'Pagos'}
            </button>
          ))}
        </div>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{filtered.length} itens</span>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {filtered.map(m=><MktCard key={m.id} item={m} selected={sel?.id===m.id} onSelect={()=>setSel(m)}/>)}
            {filtered.length===0 && <p style={{ gridColumn:'1/-1', textAlign:'center' as const, color:T.dim, padding:40, fontSize:12 }}>Nenhum item encontrado.</p>}
          </div>
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><MktDetail item={sel}/></div>}
      </div>
    </div>
  )
}
