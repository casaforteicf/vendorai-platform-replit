import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatItem {
  id:            string
  nome:          string
  descricao:     string | null
  categoria:     string | null
  subcategoria:  string | null
  fornecedor:    string | null
  precoBase:     string | null
  imagens:       string[] | null
  especificacoes: Record<string, unknown> | null
  createdAt:     string
}

function CompCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: ()=>void }) {
  const img = item.imagens?.[0]
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:12, transition:'border 0.15s' }}>
      <div style={{ height:56, borderRadius:7, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10, overflow:'hidden' }}>
        {img
          ? <img src={img} alt={item.nome} style={{ width:'100%', height:'100%', objectFit:'cover' as const }}/>
          : <span style={{ fontSize:22 }}>📦</span>
        }
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
      <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{item.fornecedor ?? '—'}</p>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        {item.categoria && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(124,58,237,0.12)', color:T.purpleL }}>{item.categoria}</span>}
        {item.subcategoria && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.dim }}>{item.subcategoria}</span>}
      </div>
    </div>
  )
}

function CompDetail({ item }: { item: CatItem }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      {item.imagens && item.imagens.length > 0 && (
        <div style={{ height:80, borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14, overflow:'hidden' }}>
          <img src={item.imagens[0]} alt={item.nome} style={{ width:'100%', height:'100%', objectFit:'cover' as const }}/>
        </div>
      )}
      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{item.nome}</p>
      <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>{item.fornecedor ?? '—'}</p>
      {item.descricao && <p style={{ margin:'0 0 12px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
        {[['Categoria',item.categoria??'—'],['Subcategoria',item.subcategoria??'—'],['Fornecedor',item.fornecedor??'—'],['Preço',item.precoBase?`R$ ${Number(item.precoBase).toFixed(2)}`:'—']].map(([k,v])=>(
          <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {item.especificacoes && Object.keys(item.especificacoes).length > 0 && (
        <div>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>ESPECIFICAÇÕES</p>
          {Object.entries(item.especificacoes).slice(0, 8).map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:10 }}>
              <span style={{ color:T.dim }}>{k}</span>
              <span style={{ color:T.text }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ComponentHubView() {
  const [items,   setItems]   = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)
  const [cat,   setCat]       = useState('')
  const [forn,  setForn]      = useState('')
  const [query, setQuery]     = useState('')
  const [sel,   setSel]       = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '80' })
      if (cat)   params.set('categoria', cat)
      if (forn)  params.set('fornecedor', forn)
      if (query) params.set('busca', query)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CatItem[] = await res.json()
      setItems(data)
      if (data.length > 0 && !sel) setSel(data[0])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar componentes')
    } finally {
      setLoading(false)
    }
  }, [cat, forn, query, sel])

  useEffect(() => { load() }, [load])

  const categories  = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]
  const fornecedores = [...new Set(items.map(i => i.fornecedor).filter(Boolean))].sort() as string[]

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar componente…"
          style={{ flex:1, minWidth:140, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:cat?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Categoria</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select value={forn} onChange={e=>setForn(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:forn?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Fornecedor</option>
          {fornecedores.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{items.length} itens</span>
      </div>

      {error && <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>⚠ {error}</div>}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12 }}>
              {[1,2,3,4,5,6].map(i=><div key={i} style={{ height:130, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:12 }}>
              <p style={{ margin:'0 0 8px', fontSize:28 }}>🧩</p>
              <p>Nenhum componente encontrado. Adicione itens via Biblioteca.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12 }}>
              {items.map(item=><CompCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)}/>)}
            </div>
          )}
        </div>
        {sel && <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><CompDetail item={sel}/></div>}
      </div>
    </div>
  )
}
